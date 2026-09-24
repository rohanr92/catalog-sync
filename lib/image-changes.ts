// The set to send: the marketplace's current images, with only the changed slots taken from Nordstrom.
export function proposedImages(oldImages: string[], newImages: string[], positions: number[], slots: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < slots; i++) out.push(positions.includes(i + 1) ? newImages[i] ?? '' : oldImages[i] ?? newImages[i] ?? '');
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

export function finalImages(it: { images: unknown; oldImages: unknown; newImages: unknown; positions: unknown }, slots: number): string[] {
  const edited = (it.images as string[]) ?? [];
  return edited.length ? edited : proposedImages(it.oldImages as string[], it.newImages as string[], it.positions as number[], slots);
}
