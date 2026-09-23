// "₹6/100 g" style unit prices from the pack-size text ("500 g", "1 kg", "350 ml", "1 dozen",
// "Pack of 6"…). Used on the product page and in Compare so different pack sizes can be weighed up
// fairly. Returns null when the size can't be read, rather than guessing.
export type UnitPrice = { label: string; perBase: number; base: 'g' | 'ml' | 'pc' };

export function unitPrice(price: number, weight: string): UnitPrice | null {
  const text = weight.toLowerCase().replace(/,/g, '');
  const m = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|gm|grams?|l|ltr|litres?|ml|dozen|pcs?|pieces?)\b/);
  const pack = text.match(/(?:pack of|x)\s*(\d+)/);
  if (m) {
    const n = parseFloat(m[1]); const unit = m[2];
    const count = pack ? parseInt(pack[1], 10) : 1;
    if (!n) return null;
    if (/^(kg|g|gm|grams?)$/.test(unit)) {
      const grams = (unit === 'kg' ? n * 1000 : n) * count;
      return { label: `₹${fmt(price / grams * 100)}/100 g`, perBase: price / grams, base: 'g' };
    }
    if (/^(l|ltr|litres?|ml)$/.test(unit)) {
      const ml = (unit === 'ml' ? n : n * 1000) * count;
      return { label: `₹${fmt(price / ml * 100)}/100 ml`, perBase: price / ml, base: 'ml' };
    }
    const pieces = (unit === 'dozen' ? n * 12 : n) * count;
    return { label: `₹${fmt(price / pieces)}/piece`, perBase: price / pieces, base: 'pc' };
  }
  if (pack) { const pieces = parseInt(pack[1], 10); return pieces ? { label: `₹${fmt(price / pieces)}/piece`, perBase: price / pieces, base: 'pc' } : null; }
  return null;
}

const fmt = (n: number) => (n >= 10 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ''));
