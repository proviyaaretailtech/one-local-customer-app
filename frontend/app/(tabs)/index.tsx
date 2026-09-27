import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Icon from '@react-native-vector-icons/ionicons';
import { colors } from '@/src/theme';
import { api, Store } from '@/src/api';
import { useCatalog } from '@/src/use-catalog';
import { useFollowedStores } from '@/src/followed';
import { BrandSpotlight } from '@/src/components/brand-spotlight';
import { StoreRail } from '@/src/components/store-rail';
import { CityScroll } from '@/src/motion';
import { BrandRail, CategoryRail, EventRail, LoadState, ProductGrid as ProductRail, SectionTitle } from '@/src/components/catalog-sections';
import { ExploreTown } from '@/src/components/explore-town';
import { useDeliveryLocation } from '@/src/delivery-location';

export default function HomeScreen() {
  // Outside our delivery cities, home becomes the town's real local places.
  const { coverage } = useDeliveryLocation();
  if (coverage && coverage.level !== 'live') return <ExploreTown />;
  return <LiveHome />;
}

function LiveHome() {
  const { data, isLoading, isError, refetch } = useCatalog();
  const router = useRouter();
  const { isFollowing } = useFollowedStores();
  const [stores, setStores] = useState<Store[]>([]);
  useEffect(() => { api<Store[]>('/stores').then(setStores).catch(() => {}); }, []);
  if (isLoading || !data) return <LoadState error={isError} retry={refetch} />;
  const followed = stores.filter(s => isFollowing(s.id));
  const go = (route: string) => () => router.navigate(route as any);
  const selected = (ids: string[]) => ids.flatMap(id => data.products.filter(p => p.id === id));
  return <CityScroll testID="home-screen" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
    {followed.length > 0 && <><SectionTitle id="followed" title="Your local favourites" subtitle="The stores you follow, always first." /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stores}>{followed.map(s => <Pressable testID={`followed-store-${s.id}`} key={s.id} style={styles.store} onPress={go(`/store/${s.id}`)}><Image source={s.logo} style={styles.storeImage} /><Text style={styles.storeName}>{s.name}</Text><Icon name="heart" size={13} color={colors.forest} /></Pressable>)}</ScrollView></>}
    <BrandSpotlight switchable />
    <View style={styles.sheet}>
    <SectionTitle id="home-shop-by-store" title="A little world for every mood" subtitle="SHOP BY STORE · Five edits, made for you." onPress={go('/categories')} />
    <StoreRail stores={data.themed_stores || []} scope="home" />
    <SectionTitle id="trending" title="Trending in Latur" subtitle="Good finds. Everyone’s talking." onPress={go('/search?collection=trending')} />
    <ProductRail products={selected(['f1', 'f5', 'b1', 'f3', 'p3', 'a1'])} scope="trending-home" />
    <SectionTitle id="top-picks" title="Top picks for you" subtitle="A few things we think you’ll love." onPress={go('/search?collection=picks')} />
    <ProductRail products={selected(['p3', 'f3', 'b1', 'p4', 'f6', 'a1'])} scope="picks" />
    <View style={styles.rule} />
    <SectionTitle id="home-food" title="What are you craving?" subtitle="FOOD · The names you know. The bites you love." onPress={go('/food')} />
    <BrandRail brands={data.brands.filter(b => b.department === 'food')} scope="home-food" />
    <View style={styles.railSpace}><ProductRail products={selected(['f4', 'f2', 'f5'])} scope="food-home" /></View>
    <SectionTitle id="home-grocery" title="A fresh start, every day" subtitle="GROCERY SHOP · Your everyday essentials." onPress={go('/grocery')} />
    <CategoryRail categories={data.categories.filter(c => c.department === 'grocery').slice(0, 6)} scope="grocery-home" />
    <SectionTitle id="home-shops" title="A little city shopping" subtitle="SHOPS · Style, sound & lovely little spaces." onPress={go('/shops')} />
    <BrandRail brands={data.brands.filter(b => b.department === 'shops')} scope="home-shops" />
    <View style={styles.railSpace}><ProductRail products={selected(['sneak1', 'audio1', 'home1'])} scope="shops-home" /></View>
    <SectionTitle id="home-pharmacy" title="A little care goes a long way" subtitle="PHARMACY & BEAUTY · Feel good, inside and out." onPress={go('/care')} />
    <BrandRail brands={data.brands.filter(b => b.department === 'pharmacy')} scope="home-pharmacy" />
    <View style={styles.railSpace}><ProductRail products={selected(['h2', 'h1', 'h3'])} scope="pharmacy-home" /></View>
    <SectionTitle id="home-beauty" title="Find your everyday glow" subtitle="Your next little obsession." onPress={go('/care')} />
    <BrandRail brands={data.brands.filter(b => b.department === 'beauty')} scope="home-beauty" />
    <View style={styles.railSpace}><ProductRail products={selected(['b2', 'b3', 'b4'])} scope="beauty-home" /></View>
    <SectionTitle id="home-book" title="Make room for good times" subtitle="BOOK IT · Movies, events & little adventures." onPress={go('/book-it')} />
    <EventRail events={data.events} scope="home-book" />
    <SectionTitle id="home-stores" title="Meet your neighbourhood" subtitle="Independent stores. A little closer to home." />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stores}>{stores.filter(s => s.id.startsWith('s')).map(s => <Pressable testID={`store-card-${s.id}`} key={s.id} style={styles.store} onPress={go(`/store/${s.id}`)}><Image source={s.logo} style={styles.storeImage} /><View><Text style={styles.storeName}>{s.name}</Text><Text style={styles.meta}>{s.delivery_time} · {s.rating} rating</Text></View></Pressable>)}</ScrollView>
    <SectionTitle id="home-budget" title="Little prices. Lots to love." subtitle="Everything here under ₹99" onPress={go('/search?collection=budget')} /><ProductRail products={data.products.filter(p => p.price < 99).slice(-10)} scope="home-budget" />
    <SectionTitle id="home-brand-discovery" title="Meet your next favourite brand" subtitle={`${data.brands.length} demo brands, one little city`} /><BrandRail brands={data.brands.slice(16)} scope="home-new-brands" />
    <View style={styles.footer}><Text style={styles.footerTitle}>One city. Endless possibilities.</Text><Text style={styles.footerSub}>Made for Latur. Made for you.</Text><Text testID="sample-catalog-notice" style={styles.notice}>Explore our sample catalogue. Brand listings, prices and booking experiences are for demonstration.</Text></View>
    </View>
  </CityScroll>;
}
const styles = StyleSheet.create({
  content: { paddingBottom: 20 }, sheet: { backgroundColor: colors.glassBright, borderTopLeftRadius: 34, borderTopRightRadius: 34, paddingTop: 1, overflow: 'hidden' }, rule: { height: 7, backgroundColor: colors.cream, marginTop: 26 }, railSpace: { marginTop: 18 },
  stores: { paddingHorizontal: 20, gap: 12 }, store: { padding: 12, borderRadius: 16, backgroundColor: colors.cream, flexDirection: 'row', alignItems: 'center', gap: 10 },
  storeImage: { width: 42, height: 42, borderRadius: 13 }, storeName: { color: colors.onSurface, fontSize: 12, fontWeight: '700' }, meta: { color: colors.muted, fontSize: 10, marginTop: 4 },
  footer: { marginTop: 38, paddingHorizontal: 24, paddingVertical: 30, backgroundColor: colors.limeSoft }, footerTitle: { color: colors.forest, fontSize: 25, letterSpacing: -1, fontWeight: '700', maxWidth: 250 },
  footerSub: { color: colors.forest, fontSize: 12, marginTop: 10 }, notice: { color: colors.muted, fontSize: 9, lineHeight: 15, marginTop: 22 },
});