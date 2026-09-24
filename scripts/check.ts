import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const runs = await db.importRun.findMany({ orderBy: { createdAt: 'asc' } });
  console.log('IMPORT RUNS (oldest first):');
  for (const r of runs) console.log(' ', r.createdAt.toISOString().slice(11, 19), r.channelKey.padEnd(10), 'rows', r.rowCount, r.fileName);
  const kohls = await db.channelProduct.count({ where: { channelKey: 'kohls' } });
  const products = await db.product.count();
  const pending = await db.pendingChange.groupBy({ by: ['changeType'], _count: { _all: true } });
  console.log('\nChannelProduct kohls:', kohls, '| Product:', products, '| Pending:', pending.map((p) => `${p.changeType}=${p._count._all}`).join(', '));
}
main().finally(() => db.$disconnect());
