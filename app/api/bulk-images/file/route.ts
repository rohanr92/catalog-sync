import { db } from '@/lib/db';

// Preview of a processed image (only for logged-in users — the full size is made again on approval).
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const r = await db.bulkImage.findUnique({ where: { id }, select: { data: true } });
  if (!r?.data) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(r.data as Uint8Array), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' } });
}
