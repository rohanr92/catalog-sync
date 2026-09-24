import sharp from 'sharp';
import { db } from './db';

async function cfg() {
  const s = await db.setting.findUnique({ where: { key: 'shopify' } });
  const v = (s?.value as { domain?: string; token?: string }) ?? {};
  if (!v.domain || !v.token) throw new Error('Shopify is not connected. Add it under Connections.');
  return { domain: v.domain, token: v.token };
}

async function gql(domain: string, token: string, query: string, variables: unknown) {
  const res = await fetch(`https://${domain}/admin/api/2025-07/graphql.json`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  const j = await res.json();
  if (j.errors) throw new Error(j.errors.map((e: { message: string }) => e.message).join('; '));
  return j.data;
}

export async function uploadToShopify(input: Buffer, filename: string, format: 'jpeg' | 'png'): Promise<string> {
  const { domain, token } = await cfg();

  const img = sharp(input);
  const out = format === 'jpeg'
    ? await img.flatten({ background: '#ffffff' }).jpeg({ quality: 92, mozjpeg: true }).toBuffer()
    : await img.png({ compressionLevel: 8 }).toBuffer();
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const name = filename.replace(/\.[^.]+$/, '') + (format === 'jpeg' ? '.jpg' : '.png');

  const staged = await gql(domain, token,
    `mutation($input:[StagedUploadInput!]!){ stagedUploadsCreate(input:$input){ stagedTargets{ url resourceUrl parameters{ name value } } userErrors{ message } } }`,
    { input: [{ filename: name, mimeType: mime, resource: 'IMAGE', httpMethod: 'POST', fileSize: String(out.length) }] });
  const t = staged.stagedUploadsCreate.stagedTargets[0];
  if (!t) throw new Error(staged.stagedUploadsCreate.userErrors.map((e: { message: string }) => e.message).join('; ') || 'No staged target');

  const form = new FormData();
  for (const p of t.parameters) form.append(p.name, p.value);
  form.append('file', new Blob([out], { type: mime }), name);
  const up = await fetch(t.url, { method: 'POST', body: form });
  if (!up.ok) throw new Error(`Staged upload failed: ${up.status}`);

  const created = await gql(domain, token,
    `mutation($files:[FileCreateInput!]!){ fileCreate(files:$files){ files{ id } userErrors{ message } } }`,
    { files: [{ originalSource: t.resourceUrl, contentType: 'IMAGE', alt: name }] });
  const id = created.fileCreate.files?.[0]?.id;
  if (!id) throw new Error(created.fileCreate.userErrors.map((e: { message: string }) => e.message).join('; ') || 'fileCreate failed');

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const q = await gql(domain, token, `query($id:ID!){ node(id:$id){ ... on MediaImage { fileStatus image { url } } } }`, { id });
    const n = q.node;
    if (n?.fileStatus === 'READY' && n.image?.url) return n.image.url;
    if (n?.fileStatus === 'FAILED') throw new Error('Shopify could not process the image');
  }
  throw new Error('Timed out waiting for Shopify to process the image');
}
