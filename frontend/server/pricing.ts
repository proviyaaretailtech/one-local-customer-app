// Every rule that turns a cart into a bill lives here, so the cart screen, checkout and the stored
// order can never disagree. The cart asks POST /api/cart/quote; createOrder calls quote() again
// and refuses a checkout whose total no longer matches.
//
// Source of the rules: the founder's notebook (2026-09-24) —
//   * packaged goods are sold at MRP, which already includes GST (rate varies by item);
//   * restaurant food carries 5% GST on top, shown as CGST 2.5% + SGST 2.5%;
//   * handling and platform fees are separate bill lines whose amounts are not decided yet;
//   * GST on the delivery fee is not decided yet.
// Undecided amounts are 0 here and show nothing on the bill until someone sets them.
import { applyCoupon, findProduct } from './catalog';
import { HttpError } from './http';

export const PRICING = {
  deliveryFee: 15,        // ₹ below the free-delivery threshold
  freeDeliveryFrom: 199,  // ₹ item total at which delivery becomes free
  handlingFee: 0,         // ₹ per order — undecided
  platformFee: 0,         // ₹ per order — undecided
  foodGstPct: 5,          // % added on restaurant food
  deliveryGstPct: 0,      // % on the delivery fee — undecided
};

// GST already inside the MRP of packaged goods, by category. Display only: it never changes what
// the customer pays. SAMPLE RATES — confirm each with the CA before launch; a product can later
// carry its own rate (HSN-specific) instead of its category's.
const INCLUDED_GST_BY_CATEGORY: Record<string, number> = {
  c1: 0,                                              // fresh fruits & vegetables
  c2: 5, c3: 5, c5: 5, c6: 5, c21: 5, c23: 5, c24: 5, // dairy, snacks, bakery, instant, sweets, dry fruits, cereals
  c25: 5, c26: 5, c29: 5, c32: 5,                     // atta/rice/dal, oils & ghee, tea & coffee, chocolates
  c7: 5, c13: 5, c14: 5, c17: 5, c31: 5, c22: 5, c28: 5, c18: 5, // personal care, wellness, hygiene, haircare, bath, puja, sports, fashion
  c8: 18, c15: 18, c16: 18, c19: 18, c20: 18, c27: 18, c30: 18,  // home needs, skincare, makeup, electronics, homeware, protein, cleaning
  c4: 40,                                             // aerated cold drinks
};
const DEFAULT_INCLUDED_GST = 5;

const r2 = (n: number) => Math.round(n * 100) / 100;

export type BillLine = {
  id: string; name: string; weight: string; image: string; qty: number; price: number; mrp: number;
  department: string; gst_pct: number; gst_mode: 'included' | 'added'; line_total: number;
};
export type TaxSplit = { rate: number; taxable: number; cgst: number; sgst: number };
export type Bill = {
  lines: BillLine[];
  item_mrp_total: number; item_total: number; mrp_savings: number;
  delivery_fee: number; delivery_fee_before_waiver: number; free_delivery_from: number; amount_to_free_delivery: number;
  handling_fee: number; platform_fee: number;
  gst_added: TaxSplit & { total: number };   // restaurant food: part of the total
  gst_included: TaxSplit[];                  // packaged goods: already inside item prices
  coupon: { code: string; label: string; ok: boolean; message: string } | null;
  discount: number;
  total: number;
  total_savings: number;
};

export async function quote(city: string, rawLines: unknown, rawCoupon: unknown): Promise<Bill> {
  if (!Array.isArray(rawLines) || rawLines.length === 0 || rawLines.length > 50) throw new HttpError(400, 'Your cart is empty or too large.');
  const lines: BillLine[] = await Promise.all(rawLines.map(async (raw: unknown) => {
    const line = raw as { id?: unknown; qty?: unknown };
    const product = typeof line.id === 'string' ? await findProduct(city, line.id) : undefined;
    if (!product) throw new HttpError(400, 'An item in your cart is no longer available. Please review your cart.');
    const qty = line.qty as number;
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new HttpError(400, 'Please check the quantities in your cart.');
    const food = product.department === 'food';
    const gst = food ? PRICING.foodGstPct : INCLUDED_GST_BY_CATEGORY[product.category_id] ?? DEFAULT_INCLUDED_GST;
    return {
      id: product.id, name: product.name, weight: product.weight, image: product.image, qty,
      price: product.price, mrp: product.mrp, department: product.department,
      gst_pct: gst, gst_mode: food ? 'added' : 'included', line_total: r2(product.price * qty),
    };
  }));

  const item_total = r2(lines.reduce((s, l) => s + l.line_total, 0));
  const item_mrp_total = r2(lines.reduce((s, l) => s + l.mrp * l.qty, 0));

  const free = item_total >= PRICING.freeDeliveryFrom;
  const delivery_fee = free ? 0 : PRICING.deliveryFee;
  const deliveryGst = r2(delivery_fee * PRICING.deliveryGstPct / 100);

  // Restaurant food: 5% on the food subtotal, split evenly between CGST and SGST.
  const foodTaxable = r2(lines.filter(l => l.gst_mode === 'added').reduce((s, l) => s + l.line_total, 0));
  const foodGst = r2(foodTaxable * PRICING.foodGstPct / 100);
  const gst_added = { rate: PRICING.foodGstPct, taxable: foodTaxable, cgst: r2(foodGst / 2), sgst: r2(foodGst - r2(foodGst / 2)), total: r2(foodGst + deliveryGst) };

  // Packaged goods: back the tax out of the inclusive price, grouped by rate.
  const byRate = new Map<number, number>();
  for (const l of lines) if (l.gst_mode === 'included' && l.gst_pct > 0) byRate.set(l.gst_pct, (byRate.get(l.gst_pct) ?? 0) + l.line_total);
  const gst_included: TaxSplit[] = [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, gross]) => {
    const tax = r2(gross * rate / (100 + rate));
    return { rate, taxable: r2(gross - tax), cgst: r2(tax / 2), sgst: r2(tax - r2(tax / 2)) };
  });

  let coupon: Bill['coupon'] = null; let discount = 0;
  const code = typeof rawCoupon === 'string' ? rawCoupon.trim().slice(0, 30) : '';
  if (code) {
    const result = await applyCoupon(code, item_total);
    coupon = { code: code.toUpperCase(), label: result.coupon?.label ?? '', ok: result.ok, message: result.message };
    discount = result.ok ? r2(result.discount) : 0;
  }

  const total = Math.max(r2(item_total + delivery_fee + PRICING.handlingFee + PRICING.platformFee + gst_added.total - discount), 0);
  return {
    lines, item_mrp_total, item_total, mrp_savings: r2(item_mrp_total - item_total),
    delivery_fee, delivery_fee_before_waiver: PRICING.deliveryFee, free_delivery_from: PRICING.freeDeliveryFrom,
    amount_to_free_delivery: free ? 0 : r2(PRICING.freeDeliveryFrom - item_total),
    handling_fee: PRICING.handlingFee, platform_fee: PRICING.platformFee,
    gst_added, gst_included, coupon, discount, total,
    total_savings: r2(item_mrp_total - item_total + discount + (free ? PRICING.deliveryFee : 0)),
  };
}
