import { NextResponse } from 'next/server';
import { uploadToShopify } from '@/lib/shopify-upload';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  const form = await req.formData();
  const format = form.get('format') === 'png' ? 'png' : 'jpeg';
  const files = form.getAll("files") as File[];
  const names = form.getAll("names").map(String);
  if (!files.length) return NextResponse.json({ error: "no files" }, { status: 400 });
  try {
    const urls: string[] = [];
    for (let i = 0; i < files.length; i++) urls.push(await uploadToShopify(Buffer.from(await files[i].arrayBuffer()), names[i] || files[i].name, format));
    return NextResponse.json({ urls });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
