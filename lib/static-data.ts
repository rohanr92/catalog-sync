import { db } from './db';
import { cachedBy } from './cache';

const DAY = 24 * 3600_000;

export const getProducts = () => cachedBy('static:products', ['Product', 'ProductImage'], DAY, () =>
  db.product.findMany({ select: { id: true, gtin: true, sku: true, title: true, color: true, categoryRaw: true, attrs: true, firstSeenAt: true, images: { orderBy: { position: 'asc' }, select: { sourceUrl: true } } } }));

export const getChannelProducts = (channelKey: string) => cachedBy(`static:cp:${channelKey}`, ['ChannelProduct'], DAY, () =>
  db.channelProduct.findMany({ where: { channelKey }, select: { upc: true, channelSku: true, styleCode: true, title: true, color: true, size: true, category: true, raw: true } }));

export const getColumnSpecs = (channelKey: string) => cachedBy(`static:cs:${channelKey}`, ['ColumnSpec'], DAY, () =>
  db.columnSpec.findMany({ where: { channelKey } }));

export const getValueLists = (channelKey: string) => cachedBy(`static:vl:${channelKey}`, ['ValueList'], DAY, () =>
  db.valueList.findMany({ where: { channelKey } }));
