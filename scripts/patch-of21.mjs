// Inventory: also read every offer page (OF21). The CSV export can miss offers,
// and OF21 carries the product's own UPC/EAN — so offers are matched by UPC first.
import fs from 'node:fs';
const f = 'lib/inventory.ts';
let s = fs.readFileSync(f, 'utf8');
if (s.includes('OF21 too:')) { console.log('Already done.'); process.exit(0); }
const a = '    await productRefs(ch, base, key, shopQ, items);\n';
if (s.split(a).length !== 2) { console.log('STOPPED — inventory.ts not changed'); process.exit(1); }
const b = `    // OF21 too: the export can miss offers, and OF21 carries the product's own UPC/EAN.
    if (ex.ok) {
      try {
        const bySkuItem = new Map(items.map((i) => [i.sku.toLowerCase(), i]));
        let added = 0;
        for (let offset = 0; offset < 50000; offset += 100) {
          const res = await miraklGet(\`\${base}/api/offers?max=100&offset=\${offset}\${shopQ ? \`&\${shopQ}\` : ''}\`, key);
          if (!res.ok) break;
          const list = ((await res.json()).offers ?? []) as { shop_sku: string; product_sku?: string; product_title?: string; quantity: number; price: number; state_code?: string; product_references?: { reference: string; reference_type: string }[] }[];
          for (const o of list) {
            if (!o.shop_sku) continue;
            const refs = o.product_references ?? [];
            const fromOffer = refs.find((x) => /ean|upc|gtin/i.test(x.reference_type))?.reference ?? refs.map((x) => upcIn(x.reference)).find(Boolean) ?? '';
            const cur = bySkuItem.get(o.shop_sku.toLowerCase());
            if (!cur) {
              const it = make(o.shop_sku, fromOffer, upcIn(o.shop_sku), { qty: Number(o.quantity ?? 0), price: o.price == null ? null : Number(o.price), title: o.product_title, state: o.state_code, pid: o.product_sku }, [o.product_sku ?? '']);
              items.push(it); bySkuItem.set(o.shop_sku.toLowerCase(), it); added++;
            } else {
              const u = normUpc(fromOffer);
              if (u) { cur.upc = u; cur.via = 'upc'; }
              cur.qty = Number(o.quantity ?? cur.qty);
            }
          }
          if (list.length < 100) break;
          await new Promise((r) => setTimeout(r, 1200));
        }
        if (added) await log('pull', \`Inventory: \${nameOf(ch)} — \${added} offer\${added === 1 ? '' : 's'} were missing from the export and were added from the offer list\`);
      } catch (e) { if (!(e instanceof Limited)) throw e; /* busy — keep what the export gave */ }
    }
`;
s = s.replace(a, () => b + a);
fs.copyFileSync(f, f + '.bak');
fs.writeFileSync(f, s);
console.log('OK lib/inventory.ts');
