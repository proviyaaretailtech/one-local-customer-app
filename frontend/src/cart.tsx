// The bag holds two carts (founder, 27 Sep 2026), paid for separately:
//   * Food — dishes from ONE restaurant, like Swiggy Food. A dish from another restaurant asks first
//     ("Replace cart?", ReplaceCartSheet); the server refuses a two-restaurant food checkout too.
//   * Shopping — groceries, shops, pharmacy and beauty from any number of stores. The cart screen
//     groups it by store, and at checkout the server makes one order per store, paid together.
// The cart screen shows one cart at a time (`kind`, the one last added to) with a switch when both
// have items. `items` and the totals cover both carts, for the bag badge and the floating cart.
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, mediaUrl, Store } from './api';
import { ReplaceCartSheet } from './components/replace-cart-sheet';

export type CartKind = 'food' | 'shopping';
// Same rule as the server (server/pricing.ts cartKindOf).
export const cartKindOf = (p: { department?: string }): CartKind => (p.department === 'food' ? 'food' : 'shopping');

export type CartProduct = {
  id: string;
  name: string;
  weight: string;
  price: number;
  mrp: number;
  image: string;
  department?: string;
  category_id?: string;
  brand_id?: string;
  store_id?: string;
};

export type CartItem = CartProduct & { qty: number };
type Origin = { x: number; y: number };
type Line = { product: CartProduct; qty: number };
type Carts = Record<CartKind, CartItem[]>;

type CartContextType = {
  items: CartItem[];
  carts: Carts;
  kind: CartKind;
  setKind: (kind: CartKind) => void;
  add: (p: CartProduct, origin?: Origin) => void;
  addMany: (lines: Line[]) => void;
  lastAdded: { product: CartProduct; origin?: Origin; revision: number } | null;
  remove: (id: string) => void;
  clear: (kind?: CartKind) => void;
  qtyOf: (id: string) => number;
  totalItems: number;
  totalPrice: number;
  totalMrp: number;
};

const CartContext = createContext<CartContextType | null>(null);
const KEY = "onelatur.cart.v2";
const OLD_KEY = "onelatur.cart.v1"; // one list, before the two carts
const EMPTY: Carts = { food: [], shopping: [] };

const freshImage = (item: CartItem): CartItem => { const key = item.image?.split('/api/media/')[1]; return { ...item, image: item.id === 'p6' ? mediaUrl('snacks') : key ? mediaUrl(key) : item.image }; };
// Every item in the cart its department says.
const sorted = (all: CartItem[]): Carts => ({ food: all.filter(i => cartKindOf(i) === 'food'), shopping: all.filter(i => cartKindOf(i) === 'shopping') });

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [carts, setCarts] = useState<Carts>(EMPTY);
  const [kind, setKind] = useState<CartKind>('shopping');
  const [hydrated, setHydrated] = useState(false);
  const [lastAdded, setLastAdded] = useState<CartContextType['lastAdded']>(null);
  // A food add that would mix restaurants waits here for the customer's answer.
  const [pending, setPending] = useState<{ lines: Line[]; origin?: Origin; from: string; to: string } | null>(null);
  const [storeNames, setStoreNames] = useState<Map<string, string>>(new Map());
  const catalog = useRef(new Map<string, CartProduct>()); // fills in store and department when a caller leaves them out
  const current = useRef(carts); current.current = carts;

  useEffect(() => {
    AsyncStorage.multiGet([KEY, OLD_KEY]).then(([[, saved], [, old]]) => {
      try {
        if (saved) {
          const s = JSON.parse(saved);
          setCarts({ food: (s.food ?? []).map(freshImage), shopping: (s.shopping ?? []).map(freshImage) });
          if (s.kind === 'food' || s.kind === 'shopping') setKind(s.kind);
        } else if (old) {
          setCarts(sorted(JSON.parse(old).map(freshImage)));
          AsyncStorage.removeItem(OLD_KEY).catch(() => {});
        }
      } catch {}
      setHydrated(true);
      // Refresh image links, and fill in store and department for items saved without them (older
      // carts, reorders) — moving any that turn out to belong in the other cart.
      api<CartProduct[]>('/products').then(products => {
        catalog.current = new Map(products.map(p => [p.id, p]));
        setCarts(c => sorted([...c.food, ...c.shopping].map(item => {
          const p = catalog.current.get(item.id);
          return p ? { ...item, image: p.image || item.image, store_id: p.store_id, department: p.department } : item;
        })));
      }).catch(() => {});
      api<Store[]>('/stores').then(list => setStoreNames(new Map(list.map(s => [s.id, s.name])))).catch(() => {});
    }).catch(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(KEY, JSON.stringify({ ...carts, kind })).catch(() => {});
  }, [carts, kind, hydrated]);

  const put = (k: CartKind, lines: Line[], origin?: Origin) => {
    setCarts(prev => {
      let list = prev[k];
      for (const { product, qty } of lines) {
        list = list.some(i => i.id === product.id) ? list.map(i => (i.id === product.id ? { ...i, qty: i.qty + qty } : i)) : [...list, { ...product, qty }];
      }
      return { ...prev, [k]: list };
    });
    setKind(k);
    setLastAdded(prev => ({ product: lines[lines.length - 1].product, origin, revision: (prev?.revision || 0) + 1 }));
  };

  // Adds to the right cart; a reorder can hold both kinds. Food from a second restaurant asks first.
  const addMany = (raw: Line[], origin?: Origin) => {
    const lines = raw.filter(l => l.qty > 0).map(l => {
      const known = catalog.current.get(l.product.id);
      return { ...l, product: { ...l.product, store_id: l.product.store_id ?? known?.store_id, department: l.product.department ?? known?.department } };
    });
    const shopping = lines.filter(l => cartKindOf(l.product) === 'shopping');
    const food = lines.filter(l => cartKindOf(l.product) === 'food');
    if (shopping.length) put('shopping', shopping, origin);
    if (!food.length) return;
    const to = food[0].product.store_id;
    const from = current.current.food.find(i => i.store_id && to && i.store_id !== to)?.store_id;
    if (from) setPending({ lines: food, origin, from: storeNames.get(from) ?? 'another restaurant', to: storeNames.get(to!) ?? 'this restaurant' });
    else put('food', food, origin);
  };
  const add = (p: CartProduct, origin?: Origin) => addMany([{ product: p, qty: 1 }], origin);
  const replaceFood = () => {
    if (!pending) return;
    setCarts(prev => ({ ...prev, food: [] }));
    put('food', pending.lines, pending.origin);
    setPending(null);
  };

  const remove = (id: string) => {
    setCarts(prev => {
      const k: CartKind = prev.food.some(i => i.id === id) ? 'food' : 'shopping';
      const ex = prev[k].find(i => i.id === id);
      if (!ex) return prev;
      return { ...prev, [k]: ex.qty <= 1 ? prev[k].filter(i => i.id !== id) : prev[k].map(i => (i.id === id ? { ...i, qty: i.qty - 1 } : i)) };
    });
  };
  const clear = (k?: CartKind) => setCarts(prev => (k ? { ...prev, [k]: [] } : EMPTY));
  const items = [...carts.food, ...carts.shopping];
  const qtyOf = (id: string) => items.find((i) => i.id === id)?.qty ?? 0;
  const totalItems = items.reduce((a, b) => a + b.qty, 0);
  const totalPrice = items.reduce((a, b) => a + b.qty * b.price, 0);
  const totalMrp = items.reduce((a, b) => a + b.qty * b.mrp, 0);

  return (
    <CartContext.Provider value={{ items, carts, kind, setKind, add, addMany, remove, clear, qtyOf, totalItems, totalPrice, totalMrp, lastAdded }}>
      {children}
      {pending && <ReplaceCartSheet from={pending.from} to={pending.to} onKeep={() => setPending(null)} onReplace={replaceFood} />}
    </CartContext.Provider>
  );
}

export function useCart() {
  const c = useContext(CartContext);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}
