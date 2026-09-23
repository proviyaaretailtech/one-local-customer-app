// Shown in place of a feature that isn't live yet (see src/features.ts) — a clear, branded promise
// instead of an error or a half-working screen.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@react-native-vector-icons/ionicons';
import { colors } from '../theme';
import { OneGlyph } from './one-button';

const INK = '#050605';
const COPY: Record<string, { icon: string; title: string; body: string; points: string[] }> = {
  ai_search: { icon: 'scan-outline', title: 'Photo & voice search', body: 'Snap a product or just say it — in English, Hindi or Marathi — and we’ll find it in Latur stores.', points: ['Point your camera at anything', 'Speak a whole shopping list', 'Matches from real local stock'] },
  assistant: { icon: 'sparkles-outline', title: 'One AI, your shopping helper', body: 'Ask for “a birthday party for 10 under ₹2,000” and get a ready basket from stores near you.', points: ['Plans baskets and parties', 'Knows what’s in stock nearby', 'Adds everything in one tap'] },
  wallet: { icon: 'wallet-outline', title: 'OneCity Wallet', body: 'Refunds, store credit and OneLocal Coins in one place, spendable at checkout.', points: ['Instant refunds to your wallet', 'Pay with one tap', 'Works across every store'] },
};

export function ComingSoon({ feature }: { feature: keyof typeof COPY }) {
  const router = useRouter(); const insets = useSafeAreaInsets(); const c = COPY[feature];
  return <View testID={`coming-soon-${feature}`} style={[s.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 110 }]}>
    <Pressable testID="coming-soon-back" accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.back}><Icon name="chevron-back" size={22} color="#fff" /></Pressable>
    <View style={s.body}>
      <View style={s.badgeRow}><OneGlyph size={22} /><View style={s.pill}><Text style={s.pillText}>COMING SOON</Text></View></View>
      <View style={s.iconWrap}><Icon name={c.icon as any} size={34} color={colors.electricLime} /></View>
      <Text style={s.title}>{c.title}</Text>
      <Text style={s.text}>{c.body}</Text>
      <View style={s.points}>{c.points.map(p => <View key={p} style={s.point}><Icon name="checkmark-circle" size={16} color={colors.electricLime} /><Text style={s.pointText}>{p}</Text></View>)}</View>
      <Pressable testID="coming-soon-search" onPress={() => router.replace('/search' as any)} style={s.cta}><Icon name="search" size={16} color={INK} /><Text style={s.ctaText}>Use text search for now</Text></Pressable>
    </View>
  </View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: INK, paddingHorizontal: 22 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, justifyContent: 'center', maxWidth: 480, alignSelf: 'center', width: '100%' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: { borderWidth: 1, borderColor: colors.electricLime, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { color: colors.electricLime, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  iconWrap: { marginTop: 28, width: 72, height: 72, borderRadius: 24, backgroundColor: 'rgba(179,244,0,0.1)', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginTop: 20 },
  text: { color: 'rgba(255,255,255,0.68)', fontSize: 14, lineHeight: 21, marginTop: 10 },
  points: { marginTop: 22, gap: 12 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pointText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  cta: { marginTop: 32, minHeight: 52, borderRadius: 18, backgroundColor: colors.electricLime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { color: INK, fontSize: 15, fontWeight: '800' },
});
