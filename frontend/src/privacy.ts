// Privacy on the phone (DPDP Act; docs/DPDP.md): consent choices, what the app keeps on this phone,
// and the "Download my data" file.
//
// Consent choices are recorded here first, each with the time and the notice version shown, so a
// guest's choices count too. Once signed in they are sent to the server (POST /api/privacy/consents),
// which keeps them append-only; until the server confirms, they stay marked unsent and are sent
// again. Optional purposes are OFF until the person switches them on.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Platform, Share } from 'react-native';
import { apiGet, apiPost, forgetCustomerKey } from './api';
import { accessToken } from './lib/supabase';
import { ConsentPurpose, ConsentSource, OPTIONAL_PURPOSES, OptionalPurpose, PRIVACY } from '../constants/privacy';

const KEY = 'onecity.privacy.v1';
export type Choice = { purpose: ConsentPurpose; granted: boolean; notice_version: string; source: ConsentSource; at: string; synced: boolean };
type State = { choices: Choice[] };
const EMPTY: State = { choices: [] };
const KEEP = 200; // newest choices kept on the phone; the server keeps the full history

let state: State | null = null;
let loading: Promise<State> | null = null;
let queue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

async function load(): Promise<State> {
  if (state) return state;
  return (loading ??= AsyncStorage.getItem(KEY).then(raw => {
    const parsed = raw ? JSON.parse(raw) : null;
    state = parsed && Array.isArray(parsed.choices) ? { choices: parsed.choices } : EMPTY;
    return state!;
  }).catch(() => (state = EMPTY)));
}

// Writes go one at a time, so two quick taps can never lose one of them.
function serial<T>(action: () => Promise<T>): Promise<T> {
  const result = queue.catch(() => {}).then(action);
  queue = result.catch(() => {});
  return result;
}

async function save(next: State) {
  state = { choices: next.choices.slice(-KEEP) };
  notify();
  await AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
}

const newest = (s: State, purpose: ConsentPurpose) => [...s.choices].reverse().find(c => c.purpose === purpose);
export const granted = (s: State, purpose: ConsentPurpose) => newest(s, purpose)?.granted ?? false;

// Whether an optional purpose is switched on (off until the person says yes).
export async function consentGranted(purpose: OptionalPurpose): Promise<boolean> {
  return granted(await load(), purpose);
}

// Records choices on the phone, then sends them if signed in. Never throws: a failed send is retried.
export function recordChoices(items: { purpose: ConsentPurpose; granted: boolean }[], source: ConsentSource) {
  return serial(async () => {
    const s = await load();
    const at = new Date().toISOString();
    await save({ choices: [...s.choices, ...items.map(i => ({ ...i, notice_version: PRIVACY.noticeVersion, source, at, synced: false }))] });
  }).then(() => syncConsents());
}

// Sends unsent choices to the server. Only when signed in; the server needs to know whose they are.
export function syncConsents() {
  return serial(async () => {
    if (!(await accessToken().catch(() => null))) return;
    const s = await load();
    const unsent = s.choices.filter(c => !c.synced).slice(0, 20);
    if (!unsent.length) return;
    try {
      const reply = await apiPost<{ recorded: number; stored: string }>('/privacy/consents', {
        consents: unsent.map(({ purpose, granted, notice_version, source, at }) => ({ purpose, granted, notice_version, source, at })),
      });
      // 'phone_only' = the server's consent table is not there yet: keep them unsent, try later.
      if (reply.stored === 'phone_only') return;
      const sent = new Set(unsent);
      await save({ choices: s.choices.map(c => (sent.has(c) ? { ...c, synced: true } : c)) });
    } catch {} // offline or signed out: they stay unsent and go next time
  });
}

// On a phone the person has just signed in on: adopt choices made on another phone when newer.
export function pullConsents() {
  return serial(async () => {
    if (!(await accessToken().catch(() => null))) return;
    try {
      const reply = await apiGet<{ consents: { purpose: ConsentPurpose; granted: boolean; notice_version: string; at: string }[] }>('/privacy/consents');
      const s = await load();
      const adopt = reply.consents.filter(r => {
        const local = newest(s, r.purpose);
        return !local || (local.synced && local.granted !== r.granted && r.at > local.at);
      });
      if (adopt.length) await save({ choices: [...s.choices, ...adopt.map(r => ({ ...r, source: 'privacy_screen' as const, synced: true }))] });
    } catch {}
  });
}

// After sign-in (auth.tsx): send what this phone recorded, then pick up choices from other phones.
export async function afterSignIn() {
  await syncConsents();
  await pullConsents();
  await syncConsents();
}

// For screens: the current optional choices, live.
export function usePrivacyChoices() {
  const [snapshot, setSnapshot] = useState<State | null>(state);
  useEffect(() => {
    const update = () => setSnapshot(state);
    listeners.add(update);
    void load().then(update);
    return () => { listeners.delete(update); };
  }, []);
  const current = Object.fromEntries(OPTIONAL_PURPOSES.map(p => [p, snapshot ? granted(snapshot, p) : false])) as Record<OptionalPurpose, boolean>;
  return {
    ready: !!snapshot, current,
    ageConfirmed: !!snapshot && granted(snapshot, 'age_18_plus'),
    unsent: snapshot?.choices.filter(c => !c.synced).length ?? 0,
    history: snapshot?.choices ?? [],
    set: (purpose: OptionalPurpose, value: boolean) => recordChoices([{ purpose, granted: value }], 'privacy_screen'),
  };
}

// ---------- What this app keeps on this phone ----------
// Every key the app writes (grep AsyncStorage in src/ and app/). `secret` values are never shown or
// put in the download: the device key would let someone see this phone's guest orders, and the
// sign-in session would let them act as you.
type PhoneItem = { key: string; label: string; secret?: boolean; prefix?: boolean };
export const PHONE_ITEMS: PhoneItem[] = [
  { key: 'onecity.customer.v1', label: 'Profile, saved addresses, payment preference and invite code' },
  { key: 'onecity.saved-products.v1', label: 'Wishlist' },
  { key: 'onelatur.cart.v2', label: 'Food and shopping carts' },
  { key: 'onelatur.cart.v1', label: 'Cart (older app version)' },
  { key: 'one-latur-location', label: 'The place you shop for' },
  { key: 'one-latur-location-point', label: 'Map point of that place' },
  { key: 'onecity.recent-places.v1', label: 'Places you picked recently' },
  { key: 'onelatur.followed.v1', label: 'Stores you follow' },
  { key: 'onelatur.booking-enquiries', label: 'Your booking requests' },
  { key: 'onecity-demo-wallet', label: 'Demo wallet (no real money)' },
  { key: 'onecity-ai-session', label: 'AI assistant conversation id' },
  { key: 'onecity.location-asked.v1', label: 'Whether we asked where you are' },
  { key: KEY, label: 'Your privacy choices' },
  { key: 'reel-like-', label: 'Reels you liked', prefix: true },
  { key: 'onecity.launch-asked.', label: 'Towns you asked us to launch in', prefix: true },
  { key: 'onecity.customer-key.v1', label: 'Device key (keeps orders placed without an account private to this phone)', secret: true },
  { key: 'sb-', label: 'Sign-in session', secret: true, prefix: true },
];
export type PhoneEntry = { label: string; keys: string[]; bytes: number; secret: boolean };

async function phoneKeys(): Promise<{ item: PhoneItem; keys: string[] }[]> {
  const all = await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]);
  return PHONE_ITEMS.map(item => ({ item, keys: all.filter(k => (item.prefix ? k.startsWith(item.key) : k === item.key)) }));
}

// What is stored here, by label and size (for the screen).
export async function phoneSummary(): Promise<PhoneEntry[]> {
  const found = (await phoneKeys()).filter(f => f.keys.length);
  const pairs = await AsyncStorage.multiGet(found.flatMap(f => f.keys)).catch(() => [] as readonly [string, string | null][]);
  const size = new Map(pairs.map(([k, v]) => [k, v?.length ?? 0]));
  return found.map(({ item, keys }) => ({ label: item.label, keys, bytes: keys.reduce((s, k) => s + (size.get(k) ?? 0), 0), secret: !!item.secret }));
}

// The same, with the values (secrets left out, a photo replaced by a note to keep the file small).
async function phoneValues(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const { item, keys } of await phoneKeys()) {
    if (!keys.length) continue;
    if (item.secret) { out[item.label] = 'Stored on this phone; not included in this file, for your safety.'; continue; }
    const pairs = await AsyncStorage.multiGet(keys).catch(() => [] as readonly [string, string | null][]);
    const values = pairs.map(([k, raw]) => {
      let value: unknown = raw;
      try { value = raw ? JSON.parse(raw) : raw; } catch {}
      const photo = (value as { profile?: { photo?: string } } | null)?.profile?.photo;
      if (photo && photo.length > 200) value = { ...(value as object), profile: { ...(value as { profile: object }).profile, photo: `A photo is saved on this phone (${Math.round(photo.length / 1024)} KB); not included.` } };
      return item.prefix ? { [k.slice(item.key.length)]: value } : value;
    });
    out[item.label] = item.prefix ? Object.assign({}, ...values) : values[0];
  }
  return out;
}

// Removes everything the app keeps on this phone (for a guest, or after an account is deleted).
// The screens that hold some of it in memory are reset by the caller (customer profile, cart).
export async function clearPhone() {
  const keys = (await phoneKeys()).flatMap(f => f.keys);
  await AsyncStorage.multiRemove(keys);
  forgetCustomerKey();
  state = EMPTY; loading = null; notify();
}

// ---------- Download my data ----------
export type ServerExport = Record<string, unknown> & { about: { reference: string } };

// Signed in: everything the server holds plus what is on this phone. A guest: this phone only.
export async function buildDownload(signedIn: boolean) {
  const server = signedIn ? await apiGet<ServerExport>('/privacy/export') : null;
  const phone = await phoneValues();
  const file = server
    ? { ...server, on_this_phone: phone }
    : {
        about: { what: `What ${PRIVACY.brand} keeps on this phone. Nothing about you is on our servers unless you signed in or placed an order.`, generated_at: new Date().toISOString(), notice_version: PRIVACY.noticeVersion, data_fiduciary: PRIVACY.legalEntity },
        on_this_phone: phone,
      };
  return { file, reference: server?.about.reference ?? null };
}

// Web: a .json file download. Phones: the share sheet (save to Files, Drive, or send to yourself).
export async function deliverDownload(file: object) {
  const text = JSON.stringify(file, null, 2);
  const name = `onelocal-my-data-${new Date().toISOString().slice(0, 10)}.json`;
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return name;
  }
  await Share.share({ title: name, message: text });
  return name;
}
