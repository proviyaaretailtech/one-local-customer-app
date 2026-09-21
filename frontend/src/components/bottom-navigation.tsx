import { usePathname, useRouter } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@react-native-vector-icons/ionicons';
import { colors } from '../theme';
import { OneButton } from './one-button';
import { usePageColors } from '../use-page-colors';

const tabs = [
  { id: 'home', label: 'Home', path: '/', icon: 'home-outline' },
  { id: 'categories', label: 'Categories', path: '/categories', icon: 'grid-outline' },
  { id: 'discover', label: 'Discover', path: '/discover', icon: 'play-outline' },
  { id: 'food', label: 'Food', path: '/food', icon: 'fast-food-outline' },
  { id: 'book-it', label: 'Book It', path: '/book-it', icon: 'ticket-outline' },
];
export function BottomNavigation() {
  const insets = useSafeAreaInsets(); const path = usePathname(); const router = useRouter();
  const palette = usePageColors();
  const dark = path === '/reels';
  const selected = (id: string, route: string) => path === route || (id === 'categories' && (path.startsWith('/collection/') || path.startsWith('/category/')));
  // The address flow is full-screen, like a checkout step.
  if (['/location', '/address-map', '/address-form'].includes(path)) return null;
  return <View testID="bottom-navigation" style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 9) }, dark && styles.dark]}>
    {tabs.map(t => t.id === 'discover' ? <View key={t.id} style={styles.item}><View style={[styles.center, dark && styles.darkCenter]}><OneButton selected={path === '/discover' || dark} onDiscover={() => router.navigate('/(tabs)/discover')} onAssistant={() => router.push('/assistant')} /></View><Text testID="discover-tab-label" style={[styles.label, dark && styles.light]}>Discover</Text></View> : <Pressable key={t.id} testID={`tab-${t.id}`} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: selected(t.id, t.path) }} onPress={() => router.navigate((t.id === 'home' ? '/(tabs)' : `/(tabs)/${t.id}`) as any)} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <Icon name={t.icon as any} size={20} color={selected(t.id, t.path) ? palette.forest : dark ? colors.surface : colors.muted} /><Text testID={`tab-label-${t.id}`} style={[styles.label, selected(t.id, t.path) && styles.active, selected(t.id, t.path) && { color: palette.forest }, dark && styles.light]}>{t.label}</Text>{selected(t.id, t.path) && <View style={[styles.dot, { backgroundColor: palette.forest }]} />}
    </Pressable>)}
  </View>;
}
const styles = StyleSheet.create({
  bar: { flexDirection: 'row', paddingTop: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 28, marginHorizontal: 10, marginBottom: 5, zIndex: 50, boxShadow: [{ offsetX: 0, offsetY: -3, blurRadius: 20, color: colors.shadow }] },
  item: { flex: 1, minHeight: 45, alignItems: 'center', gap: 5 }, label: { fontSize: 9, fontWeight: '500', color: colors.muted }, active: { color: colors.forest, fontWeight: '700' },
  center: { marginTop: -30, marginBottom: -5, borderWidth: 6, borderColor: colors.surface, borderRadius: 40, backgroundColor: colors.surface }, dot: { position: 'absolute', bottom: -2, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.forest }, dark: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }, darkCenter: { borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimary }, light: { color: colors.surface }, pressed: { opacity: 0.6 },
});