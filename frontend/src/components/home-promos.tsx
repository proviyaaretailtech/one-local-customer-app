import { useRef, useState } from 'react';
import { useAppDimensions } from '../layout';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Icon from '@react-native-vector-icons/ionicons';
import { colors } from '../theme';
import { mediaUrl, Product } from '../api';

const promos = [
  { id: 'fresh', tag: 'FRESH FINDS. LITTLE PRICES.', title: 'Good things.\nAt your doorstep.', subtitle: 'Fresh groceries. Everyday happiness.', cta: 'Fill your basket', route: '/grocery', color: colors.forest, image: 'fresh' },
  { id: 'food', tag: 'HAPPINESS, SERVED HOT.', title: 'Big cravings.\nBigger flavours.', subtitle: 'Your favourite bites, all in one place.', cta: 'Explore food', route: '/food', color: colors.food, image: 'burger' },
  { id: 'beauty', tag: 'A LITTLE EVERYDAY LUXURY.', title: 'Meet your\nnew favourites.', subtitle: 'Beauty essentials you’ll love.', cta: 'Find your glow', route: '/beauty', color: colors.beauty, image: 'beauty' },
];
export function HomePromos() {
  const router = useRouter();
  const { width } = useAppDimensions();
  const cardWidth = Math.min(width - 40, 500);
  const [active, setActive] = useState(0);
  const scroll = useRef<ScrollView>(null);
  return <View testID="home-ads" style={styles.wrap}>
    <View style={styles.adHeading}><Text style={styles.eyebrow}>A LITTLE LOCAL. A LOT TO LOVE.</Text><Text style={styles.adLabel}>FEATURED</Text></View>
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardWidth + 12} decelerationRate="fast" contentContainerStyle={styles.carousel} onMomentumScrollEnd={e => setActive(Math.min(2, Math.round(e.nativeEvent.contentOffset.x / (cardWidth + 12))))}>
      {promos.map(p => <Pressable key={p.id} testID={`promo-${p.id}`} onPress={() => router.navigate(p.route as any)} style={[styles.promo, { width: cardWidth, backgroundColor: p.color }]}>
        <Image source={mediaUrl(p.image)} style={styles.promoImage} contentFit="cover" />
        <LinearGradient colors={[p.color, p.color, colors.transparent]} locations={[0, 0.38, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        <View style={styles.promoText}><Text style={styles.tag}>{p.tag}</Text><Text testID={`promo-title-${p.id}`} style={styles.title}>{p.title}</Text><Text style={styles.sub}>{p.subtitle}</Text><View style={styles.cta}><Text style={styles.ctaText}>{p.cta}</Text><Icon name="arrow-forward" size={12} color={colors.onSurface} /></View></View>
      </Pressable>)}
    </ScrollView>
    <View style={styles.dots}>{promos.map((p, index) => <Pressable accessibilityLabel={`Show ${p.id} offer`} testID={`promo-dot-${index}`} key={p.id} style={styles.dotButton} onPress={() => { scroll.current?.scrollTo({ x: index * (cardWidth + 12), animated: true }); setActive(index); }}><View style={[styles.dot, active === index && styles.activeDot]} /></Pressable>)}</View>
  </View>;
}
export function TrendingCards({ products }: { products: Product[] }) {
  const router = useRouter();
  const width = Math.min((useAppDimensions().width - 52) / 2, 230);
  return <ScrollView testID="trending-rail" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
    {products.map((p, i) => <Pressable key={p.id} testID={`trending-product-${p.id}`} style={[styles.trend, { width }]} onPress={() => router.push(`/product/${p.id}` as any)}>
      <Image source={p.image} style={StyleSheet.absoluteFill} contentFit="cover" /><LinearGradient colors={[colors.transparent, colors.overlayDeep]} style={StyleSheet.absoluteFill} />
      <View style={styles.trendBadge}><Icon name={i === 0 ? 'flame' : 'sparkles'} size={10} color={colors.onSurface} /><Text style={styles.trendBadgeText}>{i === 0 ? 'MOST LOVED' : 'LOCAL FAVOURITE'}</Text></View>
      <View style={styles.trendBottom}><Text style={styles.trendName} numberOfLines={1}>{p.name}</Text><Text style={styles.trendPrice}>From ₹{p.price}<Text style={styles.trendArrow}>  ↗</Text></Text></View>
    </Pressable>)}
  </ScrollView>;
}
const styles = StyleSheet.create({
  wrap: { paddingTop: 17 }, adHeading: { paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 13 }, eyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.1, color: colors.muted }, adLabel: { fontSize: 8, color: colors.muted, letterSpacing: 0.5 },
  carousel: { paddingHorizontal: 20, gap: 12 }, promo: { height: 181, borderRadius: 20, overflow: 'hidden' }, promoImage: { position: 'absolute', right: 0, width: '62%', height: '100%' }, promoText: { padding: 19, flex: 1 },
  tag: { color: colors.limeSoft, fontSize: 7, letterSpacing: 1.2, fontWeight: '700' }, title: { color: colors.surface, fontSize: 26, lineHeight: 29, fontWeight: '700', letterSpacing: -0.7, marginTop: 9 }, sub: { color: colors.onSurfaceInverse, fontSize: 9, marginTop: 7 },
  cta: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 13, paddingHorizontal: 12, height: 29, borderRadius: 8, backgroundColor: colors.lime }, ctaText: { fontSize: 9, fontWeight: '800', color: colors.onSurface },
  dots: { flexDirection: 'row', justifyContent: 'center', height: 20, alignItems: 'center', marginBottom: -10 }, dotButton: { width: 30, height: 44, alignItems: 'center', justifyContent: 'center' }, dot: { width: 4, height: 4, borderRadius: 3, backgroundColor: colors.borderStrong }, activeDot: { width: 16, backgroundColor: colors.forest },
  trend: { height: 151, borderRadius: 17, overflow: 'hidden', backgroundColor: colors.cream }, trendBadge: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.lime, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 }, trendBadgeText: { fontSize: 6, color: colors.onSurface, fontWeight: '800', letterSpacing: 0.5 }, trendBottom: { position: 'absolute', bottom: 12, left: 12, right: 8 }, trendName: { color: colors.surface, fontSize: 13, fontWeight: '700' }, trendPrice: { color: colors.surface, fontSize: 10, marginTop: 5 }, trendArrow: { fontSize: 17, color: colors.lime },
});