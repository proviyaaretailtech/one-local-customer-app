// "You" tab: identity, quick stats, OneLocal Coins (coming soon), preferences that save as you tap,
// and everything account-related grouped so it can be scanned in one glance.
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import Icon from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '@/src/theme';
import { Diet, Language, useCustomer } from '@/src/customer';
import { useAuth } from '@/src/auth';
import { apiGet, Order } from '@/src/api';
import { OneGlyph } from '@/src/components/one-button';
import { CornerGlow } from '@/src/components/corner-glow';
import { Tap } from '@/src/components/tap';

const INK = '#050605';
type Row = { icon: string; label: string; sub: string; id: string; route: string; soon?: boolean };
const GROUPS: { title: string; rows: Row[] }[] = [
  { title: 'Orders & bookings', rows: [
    { icon: 'receipt-outline', label: 'My Orders', sub: 'Track a delivery or order again', id: 'orders', route: '/orders' },
    { icon: 'ticket-outline', label: 'My Bookings', sub: 'Your movie and event requests', id: 'bookings', route: '/enquiries' },
    { icon: 'heart-outline', label: 'Wishlist', sub: 'All your little favourites', id: 'wishlist', route: '/wishlist' },
  ] },
  { title: 'Account', rows: [
    { icon: 'person-circle-outline', label: 'Edit profile', sub: 'Photo, name, birthday and contact', id: 'profile', route: '/profile-edit' },
    { icon: 'location-outline', label: 'Saved Addresses', sub: 'Home, work and everywhere in between', id: 'addresses', route: '/addresses' },
    { icon: 'card-outline', label: 'Payment Preferences', sub: 'Choose how you prefer to pay', id: 'payments', route: '/payments' },
  ] },
  { title: 'Rewards', rows: [
    { icon: 'gift-outline', label: 'Refer & Earn', sub: 'Good things are better shared', id: 'refer', route: '/refer' },
    { icon: 'wallet-outline', label: 'OneCity Wallet', sub: 'Store credit and refunds, in one place', id: 'wallet', route: '/wallet', soon: true },
  ] },
  { title: 'Help', rows: [
    { icon: 'help-circle-outline', label: 'Help & Support', sub: 'Find answers and save a request', id: 'help', route: '/help' },
    { icon: 'information-circle-outline', label: 'About OneCity', sub: 'A little closer to your city', id: 'about', route: '/about' },
  ] },
];
const DIETS: { id: Diet; label: string; dot?: string }[] = [{ id: '', label: 'Anything' }, { id: 'veg', label: 'Veg', dot: '#1B8A3A' }, { id: 'egg', label: 'Egg', dot: '#D99A00' }, { id: 'nonveg', label: 'Non-veg', dot: '#B3261E' }];
const LANGUAGES: { id: Language; label: string; soon?: boolean }[] = [{ id: 'en', label: 'English' }, { id: 'mr', label: 'मराठी', soon: true }, { id: 'hi', label: 'हिन्दी', soon: true }];
// Sample earning rule for the teaser only — the real rule is decided with the Coins design (docs/ONELOCAL_COINS_PLAN.md).
const COINS_PER_RUPEE = 1 / 10;

export default function AccountScreen() {
  const router = useRouter(); const { profile, saved, addresses, ready, error, update } = useCustomer();
  const auth = useAuth(); const user = auth.session?.user;
  const [orders, setOrders] = useState<Order[] | null>(null);
  useEffect(() => { apiGet<Order[]>('/orders').then(setOrders).catch(() => setOrders([])); }, [user?.id]);
  const delivered = (orders ?? []).filter(o => o.status !== 'cancelled');
  const wouldEarn = Math.floor(delivered.reduce((s, o) => s + o.total, 0) * COINS_PER_RUPEE);
  const initials = (profile.name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const save = (patch: Partial<typeof profile>) => { void Haptics.selectionAsync().catch(() => {}); void update({ profile: { ...profile, ...patch } }).catch(() => {}); };

  return <ScrollView testID="account-screen" style={s.screen} contentContainerStyle={s.content}>
    {/* Identity */}
    <View testID="account-auth-card" style={s.identity}>
      <View style={s.glow} />
      <View style={s.identityTop}>
        <Pressable testID="account-avatar" accessibilityLabel="Change profile photo" onPress={() => router.push('/profile-edit')} style={s.avatar}>
          {profile.photo ? <Image source={profile.photo} style={s.photo} contentFit="cover" /> : initials ? <Text style={s.initials}>{initials}</Text> : <Icon name={`${profile.avatar}-outline` as any} size={30} color={INK} />}
          <View style={s.cam}><Icon name="camera" size={11} color={INK} /></View>
        </Pressable>
        <View style={s.flex}>
          <Text testID="account-name" style={s.name} numberOfLines={1}>{profile.name || 'Hello, neighbour'}</Text>
          <Text testID="account-email" style={s.email} numberOfLines={1}>{user?.email || profile.email || 'Browsing as a guest'}</Text>
        </View>
        <Pressable testID="edit-profile-btn" accessibilityLabel="Edit profile" onPress={() => router.push('/profile-edit')} style={s.editBtn}><Icon name="create-outline" size={18} color={colors.electricLime} /></Pressable>
      </View>
      {user ? <View style={s.authRow}>
        <View style={s.pill}><View style={s.onlineDot} /><Text testID="account-auth-email" style={s.pillText} numberOfLines={1}>Signed in · orders follow you to any phone</Text></View>
      </View> : <Pressable testID="account-sign-in-btn" accessibilityRole="button" onPress={() => router.push('/sign-in?next=/account' as never)} style={s.signIn}>
        <Text style={s.signInText}>Sign in or create an account</Text><Icon name="arrow-forward" size={16} color={INK} />
      </Pressable>}
    </View>

    {/* Stats */}
    <View style={s.stats}>
      <Stat id="account-orders-summary" value={orders ? String(orders.length) : '–'} label="Orders" onPress={() => router.push('/orders')} />
      <Stat id="account-wishlist-summary" countId="account-wishlist-count" value={String(saved.length)} label="Saved" onPress={() => router.push('/wishlist')} />
      <Stat id="account-address-summary" countId="account-address-count" value={String(addresses.length)} label="Addresses" onPress={() => router.push('/addresses')} />
    </View>

    {/* OneLocal Coins — coming soon */}
    <View testID="account-coins-card" style={s.coins}>
      <View style={s.coinRow}>
        <View style={s.coinBadge}><OneGlyph size={22} /></View>
        <View style={s.flex}><Text style={s.coinTitle}>OneLocal Coins</Text><Text style={s.coinSub}>Earn on every order. Spend on movie nights, events and treats around Latur.</Text></View>
        <View style={s.soonDark}><Text style={s.soonDarkText}>SOON</Text></View>
      </View>
      {wouldEarn > 0 && <Text testID="account-coins-teaser" style={s.coinTeaser}>Your {delivered.length} order{delivered.length === 1 ? '' : 's'} so far would have earned about <Text style={s.coinStrong}>{wouldEarn} coins</Text>.</Text>}
    </View>

    {/* Preferences — save on tap */}
    <Text style={s.groupTitle}>Your preferences</Text>
    <View style={s.card}>
      <CornerGlow color={colors.lime} corner="top-right" size={220} strength={0.18} />
      <Text style={s.prefLabel}>Food preference</Text>
      <View style={s.chips}>{DIETS.map(d => <Pressable key={d.id || 'any'} testID={`pref-diet-${d.id || 'any'}`} accessibilityRole="radio" accessibilityState={{ selected: profile.diet === d.id }} onPress={() => save({ diet: d.id })} style={[s.chip, profile.diet === d.id && s.chipOn]}>
        {!!d.dot && <View style={[s.vegDot, { borderColor: d.dot }]}><View style={[s.vegInner, { backgroundColor: d.dot }]} /></View>}<Text style={[s.chipText, profile.diet === d.id && s.chipTextOn]}>{d.label}</Text>
      </Pressable>)}</View>
      <View style={s.hr} />
      <Text style={s.prefLabel}>Language</Text>
      <View style={s.chips}>{LANGUAGES.map(l => <Pressable key={l.id} testID={`pref-lang-${l.id}`} disabled={l.soon} accessibilityState={{ selected: profile.language === l.id, disabled: l.soon }} onPress={() => save({ language: l.id })} style={[s.chip, profile.language === l.id && s.chipOn, l.soon && s.chipOff]}>
        <Text style={[s.chipText, profile.language === l.id && s.chipTextOn]}>{l.label}</Text>{l.soon && <Text style={s.chipSoon}>soon</Text>}
      </Pressable>)}</View>
      <View style={s.hr} />
      <Text style={s.prefLabel}>Notify me about</Text>
      {([['orders', 'Order updates', 'Packed, on the way, delivered'], ['offers', 'Offers near me', 'Deals from Latur stores you follow'], ['bookings', 'Booking reminders', 'Movie and event reminders']] as const).map(([key, label, sub]) => <View key={key} style={s.toggleRow}>
        <View style={s.flex}><Text style={s.toggleLabel}>{label}</Text><Text style={s.sub}>{sub}</Text></View>
        <Switch testID={`pref-notify-${key}`} value={profile.notifications[key]} onValueChange={v => save({ notifications: { ...profile.notifications, [key]: v } })} trackColor={{ true: colors.forest, false: colors.borderStrong }} thumbColor={colors.surface} />
      </View>)}
    </View>

    {!ready && <ActivityIndicator testID="account-loading" color={colors.forest} />}{!!error && <Text testID="account-storage-error" style={s.error}>{error}</Text>}

    {GROUPS.map(g => <View key={g.title}>
      <Text style={s.groupTitle}>{g.title}</Text>
      <View style={s.rows}><CornerGlow color={colors.lime} corner="bottom-left" size={200} strength={0.12} />{g.rows.map((r, i) => <Tap key={r.id} testID={`acc-${r.id}`} onPress={() => router.push(r.route as any)} glow={false} style={[s.row, i === g.rows.length - 1 && s.rowLast]}>
        <View style={s.icon}><Icon name={r.icon as any} size={20} color={colors.forest} /></View>
        <View style={s.flex}><Text testID={`acc-${r.id}-label`} style={s.label}>{r.label}</Text><Text style={s.sub}>{r.sub}</Text></View>
        {r.soon ? <View style={s.soon}><Text style={s.soonText}>SOON</Text></View> : <Icon name="chevron-forward" size={18} color={colors.muted} />}
      </Tap>)}</View>
    </View>)}

    {user && <Pressable testID="sign-out-btn" onPress={() => auth.signOut()} style={s.signOut}><Icon name="log-out-outline" size={18} color={colors.onError} /><Text style={s.signOutText}>Sign out</Text></Pressable>}
    <Text testID="account-device-notice" style={s.notice}>{user ? 'Your orders are linked to your account. Profile and preferences are saved on this device for now.' : 'Your profile and preferences are saved on this device.'}</Text>
    <Text style={s.tag}>OneCity · Made in Latur</Text>
  </ScrollView>;
}

function Stat({ id, countId, value, label, onPress }: { id: string; countId?: string; value: string; label: string; onPress: () => void }) {
  return <Tap testID={id} onPress={onPress} radius={20} style={s.stat}><Text testID={countId} style={s.number}>{value}</Text><Text style={s.statLabel}>{label}</Text></Tap>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceSecondary }, content: { padding: 16, paddingBottom: 120 }, flex: { flex: 1 },
  identity: { backgroundColor: INK, borderRadius: 28, padding: 18, overflow: 'hidden' },
  glow: { position: 'absolute', right: -50, top: -70, width: 180, height: 180, borderRadius: 90, backgroundColor: colors.lime, opacity: 0.14 },
  identityTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 24, backgroundColor: colors.electricLime, alignItems: 'center', justifyContent: 'center' },
  photo: { width: 64, height: 64, borderRadius: 24 },
  initials: { color: INK, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  cam: { position: 'absolute', right: -3, bottom: -3, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: INK },
  name: { color: '#fff', fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  email: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 3 },
  editBtn: { width: 44, height: 44, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  authRow: { marginTop: 16 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)' },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.electricLime },
  pillText: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },
  signIn: { marginTop: 16, minHeight: 48, borderRadius: 16, backgroundColor: colors.electricLime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  signInText: { color: INK, fontSize: 14, fontWeight: '800' },
  stats: { flexDirection: 'row', gap: 10, marginTop: 12 },
  stat: { flex: 1, minHeight: 72, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  number: { fontSize: 22, fontWeight: '800', color: colors.onSurface },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 2, fontWeight: '600' },
  coins: { marginTop: 12, borderRadius: 22, padding: 16, backgroundColor: colors.limeSoft, borderWidth: 1, borderColor: colors.cityMid },
  coinRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coinBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  coinTitle: { fontSize: 15, fontWeight: '800', color: colors.onSurface },
  coinSub: { fontSize: 11, color: colors.inkSoft, marginTop: 2, lineHeight: 16 },
  coinTeaser: { fontSize: 12, color: colors.inkSoft, marginTop: 12, lineHeight: 18 },
  coinStrong: { fontWeight: '800', color: colors.forest },
  soonDark: { backgroundColor: INK, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  soonDarkText: { color: colors.electricLime, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  groupTitle: { fontSize: 12, fontWeight: '800', color: colors.muted, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 22, marginBottom: 8, marginLeft: 6 },
  card: { backgroundColor: colors.surface, borderRadius: 22, padding: 16, overflow: 'hidden' },
  prefLabel: { fontSize: 13, fontWeight: '700', color: colors.onSurface, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface },
  chipOn: { backgroundColor: INK, borderColor: INK },
  chipOff: { opacity: 0.55 },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.onSurface },
  chipTextOn: { color: colors.electricLime },
  chipSoon: { fontSize: 9, fontWeight: '800', color: colors.muted, textTransform: 'uppercase' },
  vegDot: { width: 12, height: 12, borderWidth: 1.5, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  vegInner: { width: 5, height: 5, borderRadius: 3 },
  hr: { height: 1, backgroundColor: colors.divider, marginVertical: 16 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: colors.onSurface },
  rows: { backgroundColor: colors.surface, borderRadius: 22, paddingHorizontal: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowLast: { borderBottomWidth: 0 },
  icon: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.limeSoft, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '600', color: colors.onSurface },
  sub: { fontSize: 11, color: colors.muted, lineHeight: 16, marginTop: 2 },
  soon: { backgroundColor: colors.surfaceSecondary, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  soonText: { fontSize: 9, fontWeight: '800', color: colors.muted, letterSpacing: 1 },
  signOut: { marginTop: 22, minHeight: 50, borderRadius: 18, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  signOutText: { color: colors.onError, fontSize: 14, fontWeight: '700' },
  notice: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 18, lineHeight: 16 },
  tag: { color: colors.forest, fontSize: 11, textAlign: 'center', marginTop: 8, fontWeight: '600' },
  error: { color: colors.onError, margin: 16 }, pressed: { opacity: 0.6 },
});
