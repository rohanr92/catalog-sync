export type ChangeType = 'new' | 'updated';

export interface FieldDiff { field: string; label: string; before: string | null; after: string }

export interface SizeRow {
  changeId: string;
  gtin: string;
  sku: string;
  size: string;
  channelSize: string;
  sizeSource: "manual" | "siblings" | "default" | "list" | "none";
  changeType: ChangeType;
  outputRow: Record<string, string>;
  note?: string;
  issues?: string[];
}

export interface Group {
  key: string;
  styleCode: string;
  color: string;
  title: string;
  category: string;
  thumb: string;
  images: string[];
  changeType: ChangeType;
  validation: 'valid' | 'blocked';
  blockedReason?: string;
  basis: 'same-colour' | 'other-colour' | 'same-category' | 'none';
  basisSku?: string;
  swatchUrl?: string;
  swatchSource?: string;
  newOnNordstrom?: boolean;
  nordstromProcessing?: boolean;
  possibleDuplicates?: { size: string; upc: string; sku: string; nordstromUpc: string }[];
  sizes: SizeRow[];
  diffs: FieldDiff[];
}

export interface ChannelSummary { key: string; name: string; pending: number; blocked: number }
