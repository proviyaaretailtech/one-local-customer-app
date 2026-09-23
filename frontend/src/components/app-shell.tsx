import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from '@react-native-vector-icons/ionicons';
import { colors } from '../theme';
import { mediaUrl } from '../api';
import { paletteFor } from '../departments';
import { useCart } from '../cart';
import { DepartmentStrip } from './department-strip';
import { useCityScroll } from '../motion';
import { FloatingCart } from './floating-cart';
import { BottomNavigation } from './bottom-navigation';
import { CartCelebration } from './cart-celebration';
import { DeliveryLocationContext, Point } from '../delivery-location';
import { useAuth } from '../auth';

const BARE = ['/sign-in'];
const IMMERSIVE = ['/product/', '/brand/'];
const WELCOME_KEY = 'onecity.welcome-seen.v1';

// First launch only: after the intro, offer sign-in once. Skipping is remembered, and browsing
// never requires an account.
function useWelcomeGate() {
  const { ready, session } = useAuth(); const router = useRouter();
  useEffect(() => {
    if (!ready || session) return;
    AsyncStorage.getItem(WELCOME_KEY).then(seen => {
      if (seen) return;
      void AsyncStorage.setItem(WELCOME_KEY, '1');
      router.push('/sign-in?welcome=1' as never);
    }).catch(() => {});
  }, [ready, session, router]);
}

export function BrandMark({ large = false }: { large?: boolean }) { return <View style={[styles.mark, large && styles.largeMark]}><Text style={[styles.one, large && styles.largeOne]}>1</Text></View>; }
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname(); const router = useRouter(); const insets = useSafeAreaInsets(); const { totalItems } = useCart();
  const scrolling = ['/', '/food', '/grocery', '/shops', '/care', '/pharmacy', '/beauty', '/book-it', '/categories'].includes(path);
  const reels = !scrolling; const palette = paletteFor(path);
  const utility = ['/discover', '/reels', '/account', '/enquiries'].includes(path);
  const back = () => router.canGoBack() ? router.back() : router.replace('/(tabs)');
  const isHome = path === '/';
  // Photo-led pages draw edge to edge under the status bar and place their own buttons below it.
  const immersive = IMMERSIVE.some(p => path.startsWith(p));
  const { y, headerHeight, setHeaderHeight, scrollRef } = useCityScroll();
  const [compact, setCompact] = useState(false);
  useEffect(() => { const id = y.addListener(({ value }) => setCompact(value > headerHeight - 50)); return () => y.removeListener(id); }, [y, headerHeight]);
  const [location, setLocationText] = useState('Latur, Maharashtra'); const [point, setPoint] = useState<Point | null>(null);
  useEffect(() => {
    AsyncStorage.multiGet(['one-latur-location', 'one-latur-location-point']).then(([[, text], [, saved]]) => {
      if (text) setLocationText(text);
      try { if (saved) setPoint(JSON.parse(saved)); } catch {}
    }).catch(() => {});
  }, []);
  const setLocation = (value: string, next: Point | null = null) => {
    setLocationText(value); setPoint(next);
    AsyncStorage.multiSet([['one-latur-location', value], ['one-latur-location-point', next ? JSON.stringify(next) : '']]).catch(() => {});
  };
  const openLocation = () => router.push('/location' as never);
  useWelcomeGate();
  // Full-screen takeovers (sign-in) get no header, tab bar or floating cart, and handle their own insets.
  if (BARE.includes(path)) return <DeliveryLocationContext.Provider value={{ location, point, setLocation, edit: openLocation }}><View style={styles.container}>{children}</View></DeliveryLocationContext.Provider>;
  return <DeliveryLocationContext.Provider value={{ location, point, setLocation, edit: openLocation }}><View style={styles.container}>
    {!reels && <Animated.View testID="city-header" onLayout={e => { if (scrolling) setHeaderHeight(e.nativeEvent.layout.height); }} style={scrolling ? [styles.scrollingHeader, { transform: [{ translateY: y.interpolate({ inputRange: [0, headerHeight], outputRange: [0, -headerHeight], extrapolate: 'clamp' }) }] }] : undefined}><LinearGradient testID="city-header-gradient" colors={[palette.top, palette.mid]}>
      <View style={{ paddingTop: insets.top }}><View style={styles.header}>
        <View style={styles.topRow}>{!isHome && <Pressable testID="global-back-button" accessibilityLabel="Go to previous page" onPress={back} style={styles.iconButton}><Icon name="arrow-back" size={20} color={colors.onSurface} /></Pressable>}<Pressable testID="header-brand-home" accessibilityLabel="OneCity home" onPress={() => router.navigate('/(tabs)' as any)} style={styles.brand}><Image testID="company-logo" accessibilityLabel="OneCity" source={mediaUrl('city-logo')} contentFit="contain" style={styles.logo} /></Pressable>
          <View style={styles.topActions}>{[{ id: 'wallet', icon: 'wallet-outline', route: '/wallet' }, { id: 'cart', icon: 'bag-handle-outline', route: '/cart' }, { id: 'profile', icon: 'person-outline', route: '/account' }].map(b => <Pressable testID={b.id === 'profile' ? 'header-profile-btn' : `header-${b.id}-button`} accessibilityLabel={b.id} key={b.id} onPress={() => router.navigate(b.route as any)} style={styles.iconButton}><Icon name={b.icon as any} size={18} color={colors.onSurface} />{b.id === 'cart' && totalItems > 0 && <View style={styles.badge}><Text testID="header-cart-count" style={styles.badgeText}>{totalItems}</Text></View>}</Pressable>)}</View>
        </View>
        <Pressable testID="location-button" accessibilityRole="button" accessibilityLabel="Change location" onPress={openLocation} style={styles.location}><Icon name="location-outline" size={13} color={colors.onSurface} /><Text testID="selected-location" style={styles.address} numberOfLines={1}>{location}</Text><Icon name="chevron-down" size={10} color={colors.onSurface} /></Pressable>
        <View style={styles.searchRow}><Pressable testID="header-search-button" accessibilityLabel="Search products" onPress={() => router.navigate('/search' as any)} style={styles.searchText}><Icon name="search-outline" size={18} color={colors.onSurface} /><Text style={styles.placeholder}>A little search. A lovely find.</Text></Pressable><Pressable testID="header-voice-search" accessibilityLabel="Search with voice" onPress={() => router.push('/smart-search?mode=voice' as any)} style={styles.searchIcon}><Icon name="mic-outline" size={18} color={colors.onSurface} /></Pressable><View style={styles.searchDivider} /><Pressable testID="header-camera-search" accessibilityLabel="Search with a photo" onPress={() => router.push('/smart-search?mode=image' as any)} style={styles.searchIcon}><Icon name="camera-outline" size={19} color={colors.onSurface} /></Pressable></View>
      </View><DepartmentStrip /></View>
    </LinearGradient></Animated.View>}
    {scrolling && compact && <View testID="compact-header" style={[styles.compact, { top: insets.top + 6 }]}>{!isHome && <Pressable testID="compact-back" accessibilityLabel="Go back" style={styles.compactButton} onPress={back}><Icon name="arrow-back" size={19} color={palette.color} /></Pressable>}<Pressable testID="compact-expand-header" accessibilityLabel="Show departments" style={styles.compactButton} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}><Icon name="grid-outline" size={17} color={palette.color} /><Text style={[styles.compactText, { color: palette.color }]}>Explore</Text></Pressable><Pressable testID="compact-search" accessibilityLabel="Search products" style={styles.compactButton} onPress={() => router.push('/search' as any)}><Icon name="search-outline" size={17} color={palette.color} /><Text style={[styles.compactText, { color: palette.color }]}>Search OneCity</Text></Pressable></View>}
    <SafeAreaInsetsContext.Provider value={{ ...insets, top: immersive ? insets.top : 0, bottom: 0 }}><View style={[styles.body, reels && !immersive && { paddingTop: insets.top }]}>{utility && <View style={styles.utility}><Pressable testID="page-back-button" accessibilityLabel="Go back" onPress={back} style={styles.iconButton}><Icon name="arrow-back" size={20} color={colors.forest} /></Pressable><Text testID="page-navigation-label" style={styles.compactText}>OneCity</Text><Pressable testID="page-search-button" accessibilityLabel="Search" onPress={() => router.push('/search')} style={styles.iconButton}><Icon name="search-outline" size={20} color={colors.forest} /></Pressable></View>}{children}</View></SafeAreaInsetsContext.Provider>
    {(scrolling || path === '/discover' || path.startsWith('/category/') || path.startsWith('/collection/') || path.startsWith('/brand/') || path === '/search') && <FloatingCart compact={path.startsWith('/category/')} bottom={Math.max(insets.bottom, 9) + 84} />}
    <BottomNavigation />
    <CartCelebration top={insets.top + 8} />
  </View></DeliveryLocationContext.Provider>;
}
const styles = StyleSheet.create({
  utility: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, paddingHorizontal: 14, height: 44 },
  scrollingHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 }, compact: { position: 'absolute', left: 20, right: 20, zIndex: 25, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.glassBright, borderRadius: 25, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 10, color: colors.shadow }] }, compactButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }, compactText: { color: colors.forest, fontSize: 11, fontWeight: '600' },
  container: { flex: 1, backgroundColor: colors.surface }, body: { flex: 1 }, background: { position: 'absolute', top: 0, left: 0, right: 0, height: 525 }, header: { paddingHorizontal: 20, paddingTop: 9 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, topActions: { flexDirection: 'row', gap: 4 },
  brand: { minHeight: 44, justifyContent: 'center' }, logo: { width: 76, height: 22 }, location: { minHeight: 28, alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -5 }, address: { color: colors.onSurface, fontSize: 10, fontWeight: '500', flexShrink: 1 },
  iconButton: { width: 44, height: 44, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.whiteGlass },
  searchRow: { marginTop: 5, height: 47, borderRadius: 25, paddingLeft: 15, paddingRight: 5, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.glassBright, borderWidth: 1, borderColor: colors.glassLine, boxShadow: [{ offsetX: 0, offsetY: 5, blurRadius: 15, color: colors.shadow }] }, searchText: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }, placeholder: { color: colors.muted, fontSize: 10, flexShrink: 1 }, searchIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, searchDivider: { width: 1, height: 17, backgroundColor: colors.border },
  badge: { position: 'absolute', right: 1, top: 0, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.forest, paddingHorizontal: 3 }, badgeText: { color: colors.surface, fontSize: 8, fontWeight: '700' }, mark: { width: 27, height: 27, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' }, one: { fontSize: 24, lineHeight: 28, fontWeight: '900', color: colors.lime }, largeMark: { width: 54, height: 54, borderRadius: 27 }, largeOne: { fontSize: 48, lineHeight: 54 },
  modal: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }, sheet: { backgroundColor: colors.glassBright, padding: 24, paddingBottom: 40, borderTopLeftRadius: 35, borderTopRightRadius: 35 }, modalTitle: { fontSize: 18, fontWeight: '600', color: colors.onSurface, flex: 1 }, help: { fontSize: 12, color: colors.muted, marginVertical: 14, lineHeight: 19 }, input: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 20, padding: 14, color: colors.onSurface }, save: { backgroundColor: colors.lime, minHeight: 48, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginTop: 16 }, saveText: { color: colors.onSurface, fontWeight: '600', fontSize: 12 }, disabled: { opacity: 0.4 },
});