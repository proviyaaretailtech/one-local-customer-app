// Home's first screen: the brand header (src/components/brand-header.tsx) over a carousel that moves on by itself
// (src/use-auto-pager.ts). Its first page is the five services; the marketing banners (GET /banners) follow. The header
// stays put while the pages slide beneath it, and the backdrop behind it all cross-fades with them: the festive picture for
// the services, each banner's own picture for its page. Bars below show which page is up and fill while it waits; a bar
// takes you to its page. The services page waits longest. The page's white sheet, with rounded top corners, begins below.
import { Tap } from './tap';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Animated, Easing, View, StyleSheet, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Text } from '@/src/ui/text';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { setStatusBarStyle } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, popBase, radius } from '../theme';
import { IconTile } from '../ui/icon-tile';
import { PageDot } from '../ui/page-dot';
import { BrandHeader, HEADER_COMPACT_AT } from './brand-header';
import type { Banner } from '../api';
import { departmentArt, departments, departmentName, type DepartmentId } from '../departments';
import { nativeDriver, useCityScroll } from '../motion';
import { useAutoPager } from '../use-auto-pager';
import { useTranslation } from '../i18n';
import { useAppDimensions } from '../layout';

const SIDE = 20;
const TILE_GAP = 12;
// Room left below the pages, for the bars; the page's white sheet covers the lower part of it (HOME_HERO_OVERLAP).
const TAIL = 56;
/** How far the white sheet after the hero rises over its bottom edge, its rounded top corners drawn on the backdrop. */
export const HOME_HERO_OVERLAP = 28;
const SERVICES_WAIT = 6000; // the services are how Home is used, so their page stays longest
const BANNER_WAIT = 4200;

// Bundled with the app, so it is there at once and offline. It is drawn from its top edge; what the hero is shorter than
// it is cut off at the bottom. s.hero is its own top colour, for the moment before it decodes.
const BACKDROP = require('../../assets/images/home/hero-backdrop.webp');

// The five services, all one size: two centred on top, three below (departments lists them in that order). `copy` is the
// copy of this page after the last banner: no test ids, and hidden from screen readers.
function Services({ width, copy = false }: { width: number; copy?: boolean }) {
  const router = useRouter(); const { t } = useTranslation();
  const names: Partial<Record<DepartmentId, string>> = { care: t('home.services.care'), 'book-it': t('home.services.bookIt') };
  const tile = (width - SIDE * 2 - TILE_GAP * 2) / 3;
  return <View testID={copy ? undefined : 'department-strip'} accessibilityElementsHidden={copy} importantForAccessibility={copy ? 'no-hide-descendants' : 'auto'} style={[s.services, { width }]}>
    {[departments.slice(0, 2), departments.slice(2)].map((row, r) => <View key={r} style={s.serviceRow}>
      {row.map(d => {
        const name = names[d.id] ?? departmentName(t, d.id);
        // A short wait before the press shows, so a swipe across the pages doesn't sink the tile under the finger.
        return <Tap key={d.id} testID={copy ? undefined : `department-${d.id}`} accessibilityRole="button" accessibilityLabel={name} unstable_pressDelay={120} onPress={() => router.navigate(d.route)} style={[s.service, { width: tile }]}>
          <IconTile testID={copy ? undefined : `department-icon-${d.id}`} source={departmentArt[d.id]} />
          <Text testID={copy ? undefined : `department-label-${d.id}`} numberOfLines={2} style={s.serviceName}>{name}</Text>
        </Tap>;
      })}
    </View>)}
  </View>;
}

// A banner's page: its line on a lime sticker over its headline, low on the page where the backdrop darkens.
function BannerPage({ banner, width }: { banner: Banner; width: number }) {
  return <View testID={`home-banner-${banner.id}`} accessible accessibilityLabel={[banner.title, banner.subtitle].filter(Boolean).join(', ')} style={[s.banner, { width }]}>
    {!!banner.subtitle && <View style={s.sticker}><Text numberOfLines={1} style={s.stickerText}>{banner.subtitle}</Text></View>}
    <Text numberOfLines={2} style={s.headline}>{banner.title}</Text>
  </View>;
}

// Behind everything: the festive picture, then each banner's picture fading in over the one before as its page arrives (and
// out again going back), then a copy of the festive picture fading in last, with the copy of the services page.
const Backdrops = memo(function Backdrops({ banners, x, width }: { banners: Banner[]; x: Animated.Value; width: number }) {
  const fade = (page: number) => x.interpolate({ inputRange: [(page - 1) * width, page * width], outputRange: [0, 1], extrapolate: 'clamp' });
  const festive = <Image source={BACKDROP} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" />;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {festive}
    {banners.map((banner, n) => <Animated.View key={banner.id} style={[StyleSheet.absoluteFill, s.bannerBack, { opacity: fade(n + 1) }]}>
      <Image source={banner.image} style={StyleSheet.absoluteFill} contentFit="cover" />
      {/* Shaded evenly under the whole header and again under the headline, so the white on top reads on any picture,
          however busy; the picture shows clearest in between. */}
      <LinearGradient colors={[colors.overlay, colors.overlay, 'transparent', colors.overlay]} locations={[0, 0.42, 0.62, 1]} style={StyleSheet.absoluteFill} />
    </Animated.View>)}
    {banners.length > 0 && <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade(banners.length + 1) }]}>{festive}</Animated.View>}
  </View>;
});

// Which page is up: a dot for each, the current one stretched into a bar that fills while its page waits (and stays full
// while held).
function Steps({ labels, index, running, wait, go }: { labels: string[]; index: number; running: boolean; wait: number; go: (n: number) => void }) {
  const [fill] = useState(() => new Animated.Value(0));
  // Before the frame is drawn, so a page's bar never shows the last page's full fill for a moment.
  useLayoutEffect(() => {
    fill.setValue(running ? 0 : 1);
    if (!running) return;
    const run = Animated.timing(fill, { toValue: 1, duration: wait, easing: Easing.linear, useNativeDriver: nativeDriver });
    run.start(); return () => run.stop();
  }, [fill, index, running, wait]);
  return <View style={s.steps}>{labels.map((label, n) => <Tap key={n} testID={`home-hero-step-${n}`} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: n === index }} haptic={false} hitSlop={8} onPress={() => go(n)} style={s.stepHit}>
    <PageDot on={n === index} size={6} wide={22} color={colors.glass} onColor={colors.whiteGlassLine}>{n === index && <Animated.View style={[s.barFill, { transform: [{ scaleX: fill }] }]} />}</PageDot>
  </Tap>)}</View>;
}

// Light status bar over the backdrop; dark once the white compact header has taken over.
function useHeroStatusBar() {
  const { y } = useCityScroll();
  useFocusEffect(useCallback(() => {
    let dark = false; setStatusBarStyle('light');
    const id = y.addListener(({ value }) => { const next = value > HEADER_COMPACT_AT - 40; if (next !== dark) { dark = next; setStatusBarStyle(next ? 'dark' : 'light'); } });
    return () => { y.removeListener(id); setStatusBarStyle('dark'); };
  }, [y]));
  useEffect(() => () => setStatusBarStyle('dark'), []);
}

export const HomeHero = memo(function HomeHero({ banners }: { banners: Banner[] }) {
  useHeroStatusBar();
  const { t } = useTranslation(); const { width } = useAppDimensions();
  const { list, index, loops, running, wait, go, onScroll, touch } = useAutoPager(banners.length + 1, width, n => (n === 0 ? SERVICES_WAIT : BANNER_WAIT));
  const [x] = useState(() => new Animated.Value(0));
  const scrolled = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { x } } }], {
    useNativeDriver: nativeDriver, listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => onScroll(e.nativeEvent.contentOffset.x),
  }), [x, onScroll]);
  return <View testID="home-hero" style={s.hero}>
    <Backdrops banners={banners} x={x} width={width} />
    <BrandHeader tone="photo" />
    <Animated.ScrollView ref={list} horizontal showsHorizontalScrollIndicator={false} snapToInterval={width} decelerationRate="fast" disableIntervalMomentum scrollEnabled={loops} scrollEventThrottle={16} onScroll={scrolled} {...touch}>
      <Services width={width} />
      {banners.map(banner => <BannerPage key={banner.id} banner={banner} width={width} />)}
      {loops && <Services width={width} copy />}
    </Animated.ScrollView>
    {loops && <Steps labels={[t('home.hero.services'), ...banners.map(banner => banner.title)]} index={index} running={running} wait={wait} go={go} />}
  </View>;
});

const s = StyleSheet.create({
  hero: { width: '100%', overflow: 'hidden', backgroundColor: colors.festiveDeep, paddingBottom: TAIL },
  services: { paddingTop: 24, gap: 16, paddingHorizontal: SIDE },
  serviceRow: { flexDirection: 'row', justifyContent: 'center', gap: TILE_GAP },
  service: { alignItems: 'center', gap: 8 },
  serviceName: { color: colors.surface, fontSize: 13, lineHeight: 16, fontWeight: '700', textAlign: 'center', textShadowColor: colors.overlay, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  banner: { justifyContent: 'flex-end', alignItems: 'flex-start', gap: 10, paddingHorizontal: SIDE, paddingBottom: 6 },
  bannerBack: { backgroundColor: colors.forestDeep },
  sticker: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.electricLime, boxShadow: popBase(3) },
  stickerText: { fontSize: 13, fontWeight: '800', color: colors.forestDeep },
  headline: { fontSize: 32, lineHeight: 44, fontWeight: '800', letterSpacing: -0.6, color: colors.surface },
  steps: { position: 'absolute', left: 0, right: 0, bottom: HOME_HERO_OVERLAP + 3, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  // Each step sits in a comfortable tap area of its own.
  stepHit: { paddingHorizontal: 3, paddingVertical: 8 },
  barFill: { flex: 1, backgroundColor: colors.surface, transformOrigin: 'left' },
});
