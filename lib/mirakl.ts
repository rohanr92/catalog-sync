import { db } from './db';

async function conn(channelKey: string) {
  const c = await db.channelConnection.findUnique({ where: { channelKey } });
  if (!c?.apiUrl || !c.apiKey) throw new Error(`${channelKey} has no API URL / key under Connections`);
  return { base: c.apiUrl.replace(/\/+$/, ''), key: c.apiKey, shop: c.shopId ? `?shop_id=${encodeURIComponent(c.shopId)}` : '' };
}

export class RateLimited extends Error {}

// P41 — upload a product file.
export async function uploadProducts(channelKey: string, file: Buffer, fileName: string): Promise<string> {
  const { base, key, shop } = await conn(channelKey);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(file)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
  const res = await fetch(`${base}/api/products/imports${shop}`, { method: 'POST', headers: { Authorization: key, Accept: 'application/json' }, body: form });
  if (res.status === 429) throw new RateLimited(`${channelKey} is rate-limiting product imports — retry in ${res.headers.get('Retry-After') ?? '900'}s`);
  const text = await res.text();
  if (!res.ok) throw new Error(`${channelKey} refused the file (${res.status}): ${text.slice(0, 400)}`);
  const j = JSON.parse(text);
  if (!j.import_id) throw new Error(`${channelKey} returned no import id`);
  return String(j.import_id);
}

export interface ImportStatus {
  import_status: string; reason_status?: string;
  has_error_report?: boolean; has_transformation_error_report?: boolean; has_new_product_report?: boolean;
  transform_lines_in_error?: number; transform_lines_in_success?: number;
}

// P42 — status of one import.
export async function importStatus(channelKey: string, importId: string): Promise<ImportStatus> {
  const { base, key, shop } = await conn(channelKey);
  const res = await fetch(`${base}/api/products/imports/${importId}${shop}`, { headers: { Authorization: key, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Status check failed (${res.status})`);
  return res.json();
}

// P44 / P47 — error report files.
export async function importReport(channelKey: string, importId: string, kind: 'error_report' | 'transformation_error_report') {
  const { base, key, shop } = await conn(channelKey);
  const res = await fetch(`${base}/api/products/imports/${importId}/${kind}${shop}`, { headers: { Authorization: key, Accept: '*/*' } });
  if (!res.ok) throw new Error(`${kind} download failed (${res.status})`);
  return { buffer: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') ?? '' };
}
