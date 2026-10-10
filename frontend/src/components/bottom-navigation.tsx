import { usePathname, useRouter } from 'expo-router';
import { Tap } from './tap';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { House, LayoutGrid, Play, Ticket, UtensilsCrossed, type LucideIcon } from 'lucide-react-native';
import { colors } from '../theme';
import { OneButton } from './one-button';
import { usePageColors } from '../use-page-colors';
import { useTranslation } from '../i18n';
import { departmentName } from '../departments';

const tabs = [
  { id: 'home', path: '/', icon: House },
  { id: 'categories', path: '/categories', icon: LayoutGrid },
  { id: 'discover', path: '/discover', icon: Play },
  { id: 'food', path: '/food', icon: UtensilsCrossed },
  { id: 'book-it', path: '/book-it', icon: Ticket },
] satisfies { id: string; path: string; icon: LucideIcon }[];
export function BottomNavigation() {
  const insets = useSafeAreaInsets(); const path = usePathname(); const router = useRouter(); const { t } = useTranslation();
  const labels: Record<string, string> = { home: t('nav.home'), categories: t('nav.categories'), discover: t('nav.discover'), food: departmentName(t, 'food'), 'book-it': departmentName(t, 'book-it') };
  const palette = usePageColors();
  const dark = path === '/reels';
  const selected = (id: string, route: string) => path === route || (id === 'categories' && (path.startsWith('/collection/') || path.startsWith('/category/')));
  // Full-screen flows, and product pages (they carry their own sticky add-to-bag bar).
  if (['/location', '/address-map', '/address-form', '/sign-in'].includes(path) || path.startsWith('/product/')) return null;
  return <View testID="bottom-navigation" style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 9) }, dark && styles.dark]}>
    {tabs.map(tab => tab.id === 'discover' ? <View key={tab.id} style={styles.item}><View style={[styles.center, dark && styles.darkCenter]}><OneButton selected={path === '/discover' || dark} onDiscover={() => router.navigate('/(tabs)/discover')} onAssistant={() => router.push('/assistant')} /></View><Text testID="discover-tab-label" style={[styles.label, dark && styles.light]}>{labels.discover}</Text></View> : <Tap key={tab.id} testID={`tab-${tab.id}`} accessibilityRole="tab" accessibilityLabel={labels[tab.id]} accessibilityState={{ selected: selected(tab.id, tab.path) }} onPress={() => router.navigate((tab.id === 'home' ? '/(tabs)' : `/(tabs)/${tab.id}`) as any)} style={[styles.item]}>
      <tab.icon size={21} strokeWidth={selected(tab.id, tab.path) ? 2.2 : 1.7} color={selected(tab.id, tab.path) ? palette.forest : dark ? colors.surface : colors.muted} /><Text testID={`tab-label-${tab.id}`} style={[styles.label, selected(tab.id, tab.path) && styles.active, selected(tab.id, tab.path) && { color: palette.forest }, dark && styles.light]}>{labels[tab.id]}</Text>{selected(tab.id, tab.path) && <View style={[styles.dot, { backgroundColor: palette.forest }]} />}
    </Tap>)}
  </View>;
}
const styles = StyleSheet.create({
  bar: { flexDirection: 'row', paddingTop: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 28, marginHorizontal: 10, marginBottom: 5, zIndex: 50, boxShadow: [{ offsetX: 0, offsetY: -3, blurRadius: 20, color: colors.shadow }] },
  item: { flex: 1, minHeight: 45, alignItems: 'center', gap: 5 }, label: { fontSize: 9, fontWeight: '500', color: colors.muted }, active: { color: colors.forest, fontWeight: '700' },
  center: { marginTop: -30, marginBottom: -5, borderWidth: 6, borderColor: colors.surface, borderRadius: 40, backgroundColor: colors.surface }, dot: { position: 'absolute', bottom: -2, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.forest }, dark: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }, darkCenter: { borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimary }, light: { color: colors.surface }, pressed: { opacity: 0.6 },
});