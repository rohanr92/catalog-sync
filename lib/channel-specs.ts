export interface ChannelColumns {
  upc: string;
  altUpc?: string;
  sku: string;
  style: string;
  color: string;
  size: string | null;
  category: string;
  title: string;
  images: string[];
  swatch: string | null;
}

export const channelColumns: Record<string, ChannelColumns> = {
  nordstrom: {
    upc: 'upc',
    sku: 'shop-sku',
    style: 'variant-group-code',
    color: 'color-description',
    size: 'size-description',
    category: 'npt',
    title: 'product-title',
    images: Array.from({ length: 10 }, (_, i) => `product-image-${i + 1}-url`),
    swatch: null,
  },
  macys: {
    upc: 'UPC',
    sku: 'shopSku',
    style: 'pid',
    color: 'siteColorDesc',
    size: 'nrfSizeCode',
    category: 'categoryCode',
    title: 'productName',
    images: ['mainImage', 'secondImage', 'thirdImage', ...Array.from({ length: 8 }, (_, i) => `images_media:image${i + 3}`)],
    swatch: 'swatchImage',
  },
  kohls: {
    upc: 'upc_number',
    altUpc: 'uid_code',
    sku: 'uid_code',
    style: 'style_number',
    color: 'display_color',
    size: null,
    category: 'product_category',
    title: 'title',
    images: ['main_image', 'alt_image_1', 'alt_image_2', 'alt_image_3', 'alt_image_4'],
    swatch: null,
  },
  jcpenney: {
    upc: 'upc',
    sku: 'SHOP_SKU',
    style: 'VARIANT_GROUP_CODE',
    color: 'color',
    size: 'hPrimarySize',
    category: 'category',
    title: 'name',
    images: ['Main_Image', ...Array.from({ length: 5 }, (_, i) => `mirakl_image_${i + 1}`)],
    swatch: 'swatch_image_1',
  },
  debenhams: {
    upc: 'ean',
    sku: 'product_id',
    style: 'parent_product_id',
    color: 'colour',
    size: 'size_footwear_us',
    category: 'product_category',
    title: 'product_title_us',
    images: ['main_image', ...Array.from({ length: 11 }, (_, i) => `image_(additional_${i + 1})`)],
    swatch: 'swatch',
  },
};

export function kohlsSizeFor(row: Record<string, string>): string | null {
  const key = Object.keys(row).find((k) => k.startsWith('nrf_size-') && row[k]);
  return key ? row[key] : null;
}

// Attribute(s) whose ReferenceData list defines the allowed shoe sizes.
export const sizeListAttributes: Record<string, string[]> = {
  macys: ['nrfSizeCode'],
  kohls: ['nrf_size-*'],
  jcpenney: ['hPrimarySize', 'hShoeSize', 'hOneSizeSize', 'hBottomsSize', 'hDressShirtsSize', 'hnecksize'],
  debenhams: ['size_footwear_us', 'size_womens_us', 'size_wtrousersjeans_us', 'size_lingerieswim_us', 'size_fancydress_us'],
};

// Where each marketplace keeps description and brand, for building rows from Nordstrom when no sibling exists.
export const textColumns: Record<string, { description: string; brand: string }> = {
  macys: { description: 'productLongDescription', brand: 'brand' },
  kohls: { description: 'meta_description', brand: 'brand' },
  jcpenney: { description: 'product_description', brand: 'brand' },
  debenhams: { description: 'long_description_us', brand: 'collection' },
};

// Every size column each marketplace uses; the one required for a category is chosen from its Columns tab.
export const sizeColumns: Record<string, (code: string) => boolean> = {
  kohls: (c) => /^nrf_size(-|$)/.test(c),
  macys: (c) => c === 'nrfSizeCode',
  jcpenney: (c) => ['hPrimarySize', 'hShoeSize', 'hOneSizeSize', 'hBottomsSize', 'hDressShirtsSize', 'hnecksize'].includes(c),
  debenhams: (c) => /^size_(footwear|womens|wtrousersjeans|lingerieswim|fancydress)_us$/.test(c),
};

export function channelSizeOf(channelKey: string, row: Record<string, string>): string | null {
  const isSize = sizeColumns[channelKey];
  if (!isSize) return null;
  for (const [k, v] of Object.entries(row)) if (v && isSize(k)) return v;
  return null;
}

// Mirakl offer-import columns found appended to the combined product+offer templates. Not part of the product sheet.
export const OFFER_COLUMNS = new Set([
  'sku', 'product-id', 'product-id-type', 'description', 'internal-description', 'price', 'price-additional-info',
  'quantity', 'min-quantity-alert', 'state', 'available-start-date', 'available-end-date', 'logistic-class',
  'discount-price', 'discount-start-date', 'discount-end-date', 'leadtime-to-ship', 'update-delete', 'seller-internal-sku',
]);
