export function short(e: unknown): string {
  const lines = String((e as Error)?.message ?? e).split('\n').map((s) => s.trim()).filter(Boolean);
  return lines.find((x) => /can't reach|timed out|P\d{4}|ECONN/i.test(x)) ?? lines[lines.length - 1] ?? 'Unknown error';
}
