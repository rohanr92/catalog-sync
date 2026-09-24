import { PrismaClient } from '@prisma/client';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const PREFIX = 'enc:v1:';
const oldKey = Buffer.from(process.env.OLD_ENCRYPTION_KEY ?? '', 'base64');
const newKey = Buffer.from(process.env.NEW_ENCRYPTION_KEY ?? '', 'base64');
if (oldKey.length !== 32 || newKey.length !== 32) throw new Error('OLD_ENCRYPTION_KEY / NEW_ENCRYPTION_KEY missing');

const dec = (v: string) => { const [iv, tag, ct] = v.slice(PREFIX.length).split(':').map((s) => Buffer.from(s, 'base64')); const d = createDecipheriv('aes-256-gcm', oldKey, iv); d.setAuthTag(tag); return Buffer.concat([d.update(ct), d.final()]).toString('utf8'); };
const enc = (p: string) => { const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', newKey, iv); const ct = Buffer.concat([c.update(p, 'utf8'), c.final()]); return PREFIX + [iv, c.getAuthTag(), ct].map((b) => b.toString('base64')).join(':'); };

const db = new PrismaClient();
(async () => {
  let n = 0;
  for (const c of await db.channelConnection.findMany({ select: { channelKey: true, apiKey: true } })) {
    if (c.apiKey?.startsWith(PREFIX)) { await db.channelConnection.update({ where: { channelKey: c.channelKey }, data: { apiKey: enc(dec(c.apiKey)) } }); n++; }
  }
  const s = await db.setting.findUnique({ where: { key: 'shopify' } });
  const v = s?.value as { token?: string } | null;
  if (v?.token?.startsWith(PREFIX)) { await db.setting.update({ where: { key: 'shopify' }, data: { value: { ...v, token: enc(dec(v.token)) } } }); n++; }
  console.log(`Re-encrypted ${n} secret(s) with the new key.`);
  await db.$disconnect();
})().catch((e) => { console.error('Stopped, nothing half-done:', e.message); process.exit(1); });
