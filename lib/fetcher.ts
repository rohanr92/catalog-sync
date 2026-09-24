async function parse(r: Response) {
  const text = await r.text();
  let j: { error?: string } | null = null;
  try { j = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!r.ok) throw new Error(j?.error ?? `Server error ${r.status}`);
  return j;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fetcher = async (url: string): Promise<any> => parse(await fetch(url));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const postJson = async (url: string, body: unknown): Promise<any> =>
  parse(await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
