import { PrismaClient, Prisma } from '@prisma/client';
import { bumpVersion } from './cache';
import { encryptSecret, decryptSecret } from './crypto';

const WRITES = new Set(['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function transient(e: unknown) {
  const code = (e as { code?: string })?.code ?? '';
  const msg = String((e as Error)?.message ?? '');
  return e instanceof Prisma.PrismaClientInitializationError || ['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(code) || /can't reach database|ECONNRESET|Connection reset|Timed out fetching/i.test(msg);
}

// Secrets are encrypted before they reach the database.
function encryptArgs(model: string, args: Any) {
  const parts = [args?.data, args?.create, args?.update].filter(Boolean) as Any[];
  if (model === 'ChannelConnection') for (const d of parts) if (typeof d.apiKey === 'string' && d.apiKey) d.apiKey = encryptSecret(d.apiKey);
  if (model === 'Setting') {
    const isShopify = args?.where?.key === 'shopify' || args?.data?.key === 'shopify' || args?.create?.key === 'shopify';
    if (isShopify) for (const d of parts) if (d.value && typeof d.value === 'object' && typeof d.value.token === 'string') d.value = { ...d.value, token: encryptSecret(d.value.token) };
  }
}

function make() {
  return new PrismaClient().$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (WRITES.has(operation)) encryptArgs(model, args as Any);
          let last: unknown;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const result = await query(args);
              if (WRITES.has(operation) && model !== 'ActivityLog') bumpVersion(model);
              return result;
            } catch (e) {
              last = e;
              if (!transient(e)) throw e;
              await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            }
          }
          throw last;
        },
      },
    },
    // ...and decrypted when the server reads them. They never leave the server.
    result: {
      channelConnection: {
        apiKey: { needs: { apiKey: true }, compute: (c) => decryptSecret(c.apiKey) ?? null },
      },
      setting: {
        value: {
          needs: { key: true, value: true },
          compute: (s) => {
            const v = s.value as Any | null;
            return s.key === 'shopify' && v && typeof v === 'object' && typeof v.token === 'string' ? { ...v, token: decryptSecret(v.token) } : s.value;
          },
        },
      },
    },
  });
}

type Db = ReturnType<typeof make>;
const g = globalThis as unknown as { __db?: Db };
export const db: Db = g.__db ?? make();
if (process.env.NODE_ENV !== 'production') g.__db = db;
