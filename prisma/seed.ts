import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const channels = [
  { key: 'nordstrom', name: 'Nordstrom', isSource: true, imageSpec: {} },
  { key: 'macys', name: "Macy's", isSource: false, imageSpec: { w: 2000, h: 2000, ratio: '1:1', max: 8, format: 'jpg' } },
  { key: 'kohls', name: "Kohl's", isSource: false, imageSpec: { w: 1500, h: 1500, ratio: '1:1', max: 6, format: 'jpg' } },
  { key: 'jcpenney', name: 'JCPenney', isSource: false, imageSpec: { w: 2000, h: 2667, ratio: '3:4', max: 10, format: 'jpg' } },
  { key: 'debenhams', name: 'Debenhams', isSource: false, imageSpec: { w: 1600, h: 2133, ratio: '3:4', max: 6, format: 'jpg' } },
  { key: 'targetplus', name: 'Target Plus', isSource: false, imageSpec: { w: 2400, h: 2400, ratio: '1:1', max: 8, format: 'jpg' } },
];

async function main() {
  for (const c of channels) {
    await db.channel.upsert({
      where: { key: c.key },
      update: { name: c.name, isSource: c.isSource, imageSpec: c.imageSpec },
      create: c,
    });
  }
  console.log(`Seeded ${channels.length} channels`);
}

main().finally(() => db.$disconnect());
