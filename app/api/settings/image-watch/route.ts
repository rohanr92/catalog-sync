import { log } from "@/lib/log";
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

type W = { enabled?: boolean; since?: string | null };

export async function GET() {
  const v = ((await db.setting.findUnique({ where: { key: 'imageWatch' } }))?.value as W) ?? {};
  return NextResponse.json({ enabled: !!v.enabled, since: v.since ?? null });
}

export async function POST(req: Request) {
  const { enabled } = await req.json();
  const cur = ((await db.setting.findUnique({ where: { key: 'imageWatch' } }))?.value as W) ?? {};
  const value = { enabled: !!enabled, since: enabled ? (cur.enabled ? cur.since : new Date().toISOString()) : cur.since ?? null };
  await db.setting.upsert({ where: { key: 'imageWatch' }, update: { value }, create: { key: 'imageWatch', value } });
  await log("settings", "Watch Nordstrom image changes " + (value.enabled ? "on" : "off"));
  return NextResponse.json(value);
}
