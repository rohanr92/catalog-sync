import { buildGroups } from './groups';
import { cached } from './cache';
import type { Group } from './types';

export function getGroups(channel: string): Promise<Group[]> {
  return cached(`groups:${channel}`, 10 * 60_000, async () => {
    const groups = await buildGroups(channel);
    for (const g of groups) for (const s of g.sizes) for (const k of Object.keys(s.outputRow)) if (!s.outputRow[k]) delete s.outputRow[k];
    return groups;
  });
}
