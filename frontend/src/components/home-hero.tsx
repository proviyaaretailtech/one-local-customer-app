// Home's first screen: the brand header (src/components/brand-header.tsx) and the five services, drawn on a backdrop image;
// the page's white sheet, with rounded top corners, begins just below the services.
import { Tap } from './tap';
import { memo, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/ui/text';
import { Image } from 'expo-image';
import { setStatusBarStyle } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors } from '../theme';
import { IconTile } from '../ui/icon-tile';
import { BrandHeader, HEADER_COMPACT_AT } from './brand-header';
import { mediaUrl } from '../api';
import { departments, departmentName, type DepartmentId } from '../departments';
import { useCityScroll } from '../motion';
import { useTranslation } from '../i18n';
import { useAppDimensions } from '../layout';

const SIDE = 20;
const TILE_GAP = 12;
// Room left below the services; the page's white sheet covers the lower part of it (HOME_HERO_OVERLAP).
const TAIL = 56;
/** How far the white sheet after the hero rises over its bottom edge, its rounded top corners drawn on the backdrop. */
export const HOME_HERO_OVERLAP = 28;

// Bundled with the app, so it is there at once and offline. It is drawn from its top edge; what the hero is shorter than
// it is cut off at the bottom. s.hero is its own top colour, for the moment before it decodes.
const BACKDROP = require('../../assets/images/home/hero-backdrop.webp');

// The five services, all one size: two centred on top, three below (departments lists them in that order).
function Services() {
  const router = useRouter(); const { t } = useTranslation(); const { width } = useAppDimensions();
  const names: Partial<Record<DepartmentId, string>> = { care: t('home.services.care'), 'book-it': t('home.services.bookIt') };
  const tile = (width - SIDE * 2 - TILE_GAP * 2) / 3;
  return <View testID="department-strip" style={s.services}>
    {[departments.slice(0, 2), departments.slice(2)].map((row, r) => <View key={r} style={s.serviceRow}>
      {row.map(d => {
        const name = names[d.id] ?? departmentName(t, d.id);
        return <Tap key={d.id} testID={`department-${d.id}`} accessibilityRole="button" accessibilityLabel={name} onPress={() => router.navigate(d.route as never)} style={[s.service, { width: tile }]}>
          <IconTile testID={`department-icon-${d.id}`} source={mediaUrl(`icon-${d.id}-v4`)} />
          <Text testID={`department-label-${d.id}`} numberOfLines={2} style={s.serviceName}>{name}</Text>
        </Tap>;
      })}
    </View>)}
  </View>;
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

export const HomeHero = memo(function HomeHero() {
  useHeroStatusBar();
  return <View testID="home-hero" style={s.hero}>
    <Image source={BACKDROP} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" />
    <BrandHeader tone="photo" />
    <Services />
  </View>;
});

const s = StyleSheet.create({
  hero: { width: '100%', overflow: 'hidden', backgroundColor: colors.festiveDeep, paddingBottom: TAIL },
  services: { marginTop: 24, gap: 16, paddingHorizontal: SIDE },
  serviceRow: { flexDirection: 'row', justifyContent: 'center', gap: TILE_GAP },
  service: { alignItems: 'center', gap: 8 },
  serviceName: { color: colors.surface, fontSize: 13, lineHeight: 16, fontWeight: '700', textAlign: 'center', textShadowColor: colors.overlay, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
});
