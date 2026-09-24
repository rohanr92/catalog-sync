export interface ImageSpec {
  w: number;
  h: number;
  ratio: string;
  max: number;
  format: 'jpg' | 'png';
  alt?: { w: number; h: number }[];
}

export const imageSpecs: Record<string, ImageSpec> = {
  macys: { w: 1600, h: 2000, ratio: "4:5", max: 8, format: "jpg" },
  kohls: { w: 2500, h: 2500, ratio: "1:1", max: 5, format: "jpg", alt: [{ w: 1500, h: 1500 }] },
  jcpenney: { w: 2000, h: 2000, ratio: "1:1", max: 10, format: "jpg", alt: [{ w: 2660, h: 4000 }] },
  debenhams: { w: 1600, h: 2400, ratio: "2:3", max: 12, format: "jpg", alt: [{ w: 1500, h: 1500 }] },
  targetplus: { w: 2400, h: 2400, ratio: '1:1', max: 8, format: 'jpg' },
};

export function studioUrl(changeId: string, channel: string) {
  const spec = imageSpecs[channel];
  const q = new URLSearchParams({ changeId });
  if (spec) {
    q.set('w', String(spec.w));
    q.set('h', String(spec.h));
  }
  return `/studio/index.html?${q.toString()}`;
}
