import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get('id') ?? '';
  const n = u.searchParams.get('n');
  const s = await db.submission.findUnique({ where: { id }, select: { reportFile: true, reportName: true, reports: true } });
  const list = (s?.reports as { kind: string; name: string; file: string }[] | null) ?? [];
  const pick = n !== null && list[Number(n)] ? list[Number(n)] : s?.reportFile ? { name: s.reportName ?? 'report.xlsx', file: s.reportFile } : null;
  if (!pick) return NextResponse.json({ error: 'No report for this send' }, { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(pick.file, "base64")), {
    headers: { 'Content-Type': pick.name.endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${pick.name}"` },
  });
}
