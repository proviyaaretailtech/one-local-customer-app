import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius } from '@/src/theme';
import { useBrowseCatalog } from '@/src/use-catalog';
import { useStores } from '@/src/use-stores';
import { useRevealed } from '@/src/use-revealed';
import { HOME_HERO_OVERLAP, HomeHero } from '@/src/components/home-hero';
import { CityScroll } from '@/src/motion';
import { LoadState, ProductRail, SectionTitle } from '@/src/components/catalog-sections';
import { ShopList } from '@/src/components/shop-section';
import { ExploreTown } from '@/src/components/explore-town';
import { byShop } from '@/src/shop-categories';
import { useDeliveryLocation } from '@/src/delivery-location';
import { useTranslation } from '@/src/i18n';

// Sponsored placements. Products carry no sponsored flag yet, so this hand-picked list stands in until the server sends them.
const SPOTLIGHT = ['audio1', 'b2', 'f5', 'sneak1', 'sp1', 'sc3', 'f2', 'sf6', 'sn2', 'home1', 'sp6', 'se6'];
// Shops drawn with the page; the rest follow just after, so opening Home stays quick.
const FIRST_SHOPS = 3;

export default function HomeScreen() {
  // Outside our delivery cities, home becomes the town's real local places.
  const { coverage } = useDeliveryLocation();
  if (coverage && coverage.level !== 'live') return <ExploreTown />;
  return <LiveHome />;
}

function LiveHome() {
  const { data, isLoading, isError, refetch } = useBrowseCatalog(); const stores = useStores(); const { t } = useTranslation(); const revealed = useRevealed();
  // Worked out only when the catalogue or the shops change, so a re-render of the page (a tab switch, fresh data
  // elsewhere) hands the memoised sections the same arrays.
  const spotlight = useMemo(() => data ? SPOTLIGHT.flatMap(id => data.products.filter(p => p.id === id)) : [], [data]);
  // Each shop's items best rated first (products carry no order counts yet); its card shows the first few of what is picked.
  const shops = useMemo(() => data ? byShop([...data.products].sort((a, b) => b.rating - a.rating), stores) : [], [data, stores]);
  if (isLoading || !data) return <LoadState error={isError} retry={refetch} />;
  // A delivery city with no stores in the catalogue yet: show what's around instead of empty rails.
  if (!data.products.length) return <ExploreTown empty />;
  return <CityScroll testID="home-screen" bleed showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
    <HomeHero />
    {/* Solid white, rising over the hero's bottom edge so its rounded top corners are drawn on the backdrop. */}
    <View style={styles.sheet}>
      <SectionTitle id="home-spotlight" title={t('home.spotlight.title')} subtitle={t('home.spotlight.subtitle')} />
      <ProductRail products={spotlight} scope="spotlight" rows={2} />
      <ShopList shops={revealed ? shops : shops.slice(0, FIRST_SHOPS)} categories={data.categories} scope="home-shop" />
    </View>
  </CityScroll>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 20 }, sheet: { marginTop: -HOME_HERO_OVERLAP, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: 1, overflow: 'hidden' },
});
