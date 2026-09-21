import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from '@react-native-vector-icons/ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/src/theme';
import { useCustomer } from '@/src/customer';
import { useAuth } from '@/src/auth';
import { useState } from 'react';
const ROWS = [
  { icon: 'receipt-outline', label: 'My Orders', sub: 'Track a delivery or order again', id: 'orders', route: '/orders' },
  { icon: 'location-outline', label: 'Saved Addresses', sub: 'Home, work and everywhere in between', id: 'addresses', route: '/addresses' },
  { icon: 'heart-outline', label: 'Wishlist', sub: 'All your little favourites', id: 'wishlist', route: '/wishlist' },
  { icon: 'card-outline', label: 'Payment Preferences', sub: 'Choose how you prefer to pay', id: 'payments', route: '/payments' },
  { icon: 'gift-outline', label: 'Refer & Earn', sub: 'Good things are better shared', id: 'refer', route: '/refer' },
  { icon: 'ticket-outline', label: 'My Bookings', sub: 'Your saved event enquiries', id: 'bookings', route: '/enquiries' },
  { icon: 'wallet-outline', label: 'OneCity Wallet', sub: 'Explore your demo wallet', id: 'wallet', route: '/wallet' },
  { icon: 'help-circle-outline', label: 'Help & Support', sub: 'Find answers and save a request', id: 'help', route: '/help' },
  { icon: 'information-circle-outline', label: 'About OneCity', sub: 'A little closer to your city', id: 'about', route: '/about' },
];
export default function AccountScreen() {
  const router = useRouter(); const { profile, saved, addresses, ready, error } = useCustomer();
  const auth = useAuth(); const [signing, setSigning] = useState(false); const [authError, setAuthError] = useState('');
  const user = auth.session?.user;
  const signIn = async () => { setAuthError(''); setSigning(true); try { await auth.signInWithGoogle(); } catch (e) { setAuthError((e as Error).message); } finally { setSigning(false); } };
  return <ScrollView testID="account-screen" style={s.screen} contentContainerStyle={s.content}>
    <LinearGradient colors={[colors.shopsTop, colors.shopsFade]} style={s.hero}><Text testID="account-eyebrow" style={s.eyebrow}>YOUR LITTLE CORNER</Text><View style={s.identity}><View style={s.avatar}><Icon name={`${profile.avatar}-outline` as any} size={32} color={colors.shops} /></View><View style={s.flex}><Text testID="account-name" style={s.name}>{profile.name || 'Hello, neighbour'}</Text><Text testID="account-email" style={s.meta}>{profile.email || 'Let’s make OneCity feel like you.'}</Text></View></View><Pressable testID="edit-profile-btn" onPress={() => router.push('/profile-edit')} style={s.edit}><Text style={s.editText}>Edit profile</Text><Icon name="arrow-forward" size={16} color={colors.shops} /></Pressable>
    <View style={s.stats}><Pressable testID="account-wishlist-summary" onPress={() => router.push('/wishlist')} style={s.stat}><Text testID="account-wishlist-count" style={s.number}>{saved.length}</Text><Text style={s.meta}>Saved favourites</Text></Pressable><View style={s.divider} /><Pressable testID="account-address-summary" onPress={() => router.push('/addresses')} style={s.stat}><Text testID="account-address-count" style={s.number}>{addresses.length}</Text><Text style={s.meta}>Saved addresses</Text></Pressable></View></LinearGradient>
    <View testID="account-auth-card" style={s.authCard}>{user ? <>
      <View style={s.flex}><Text style={s.authTitle}>Signed in with Google</Text><Text testID="account-auth-email" style={s.sub}>{user.email}</Text></View>
      <Pressable testID="sign-out-btn" onPress={() => auth.signOut()} style={s.authGhost}><Text style={s.authGhostText}>Sign out</Text></Pressable>
    </> : <>
      <View style={s.flex}><Text style={s.authTitle}>Keep your orders everywhere</Text><Text style={s.sub}>Sign in to see your orders and addresses on any phone or computer.</Text></View>
      <Pressable testID="google-sign-in-btn" disabled={signing || !auth.ready} onPress={signIn} style={[s.authButton, (signing || !auth.ready) && { opacity: 0.6 }]}>{signing ? <ActivityIndicator color={colors.surface} /> : <><Icon name="logo-google" size={16} color={colors.surface} /><Text style={s.authButtonText}>Continue with Google</Text></>}</Pressable>
    </>}</View>
    {!!authError && <Text testID="account-auth-error" style={s.error}>{authError}</Text>}
    {!ready && <ActivityIndicator testID="account-loading" color={colors.shops} />}{!!error && <Text testID="account-storage-error" style={s.error}>{error}</Text>}
    <View style={s.rows}>{ROWS.map(r => <Pressable key={r.id} testID={`acc-${r.id}`} onPress={() => router.push(r.route as any)} style={({ pressed }) => [s.row, pressed && s.pressed]}><View style={s.icon}><Icon name={r.icon as any} size={21} color={colors.shops} /></View><View style={s.flex}><Text testID={`acc-${r.id}-label`} style={s.label}>{r.label}</Text><Text style={s.sub}>{r.sub}</Text></View><Icon name="chevron-forward" size={17} color={colors.muted} /></Pressable>)}</View>
    <Text testID="account-device-notice" style={s.notice}>{user ? 'Your orders are linked to your Google account. Your profile and addresses stay on this device for now.' : 'Your profile and preferences stay on this device.'}</Text><Text style={s.tag}>OneCity · Made in Latur</Text>
  </ScrollView>;
}
const s = StyleSheet.create({ authCard: { marginHorizontal: 20, marginTop: 14, padding: 16, borderRadius: 20, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, authTitle: { fontSize: 15, fontWeight: '700', color: colors.onSurface }, authButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.forest, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, authButtonText: { color: colors.surface, fontSize: 13, fontWeight: '700' }, authGhost: { minHeight: 44, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, authGhostText: { fontSize: 13, fontWeight: '600', color: colors.onSurface }, screen: { flex: 1, backgroundColor: colors.shopsFade }, content: { paddingBottom: 30 }, hero: { padding: 24, paddingBottom: 16 }, eyebrow: { color: colors.shops, fontSize: 10, letterSpacing: 2, fontWeight: '700', marginBottom: 22 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 15 }, avatar: { width: 66, height: 66, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, flex: { flex: 1 }, name: { fontSize: 23, color: colors.onSurface, fontWeight: '700' }, meta: { fontSize: 11, color: colors.muted, marginTop: 5 }, edit: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'flex-start', marginLeft: 81 }, editText: { fontSize: 12, fontWeight: '700', color: colors.shops }, stats: { flexDirection: 'row', backgroundColor: colors.glassBright, borderRadius: 23, paddingVertical: 15, marginTop: 18 }, stat: { flex: 1, alignItems: 'center', minHeight: 48 }, number: { fontSize: 23, fontWeight: '700', color: colors.shops }, divider: { width: 1, backgroundColor: colors.shopsMid }, rows: { backgroundColor: colors.surface, margin: 16, borderRadius: 26, paddingHorizontal: 15 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 81, borderBottomWidth: 1, borderBottomColor: colors.divider }, icon: { width: 42, height: 42, borderRadius: 15, backgroundColor: colors.shopsFade, alignItems: 'center', justifyContent: 'center' }, label: { fontSize: 14, fontWeight: '600', color: colors.onSurface }, sub: { fontSize: 10, color: colors.muted, lineHeight: 16, marginTop: 4 }, notice: { color: colors.muted, fontSize: 11, textAlign: 'center' }, tag: { color: colors.shops, fontSize: 11, textAlign: 'center', marginTop: 12 }, error: { color: colors.onError, margin: 16 }, pressed: { opacity: 0.6 } });