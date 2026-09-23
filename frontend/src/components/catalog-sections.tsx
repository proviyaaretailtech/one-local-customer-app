import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { gridColumns, useAppDimensions } from '../layout';
import { Image } from 'expo-image';
import Icon from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { colors } from '../theme';
import { Brand, Category, EventListing, Product } from '../api';
import { ProductCard } from './product-card';

export function SectionTitle({ title, subtitle, onPress, id }: { title: string; subtitle?: string; onPress?: () => void; id: string }) {
  return <View style={styles.heading}><View style={styles.headingText}><Text testID={`${id}-heading`} style={styles.title}>{title}</Text>{subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}</View>{onPress && <Pressable testID={`${id}-see-all`} accessibilityLabel={`See all ${title}`} onPress={onPress} style={styles.seeAll}><Text style={styles.seeText}>See all</Text><Icon name="arrow-forward" size={14} color={colors.forest} /></Pressable>}</View>;
}
export function ProductRail({ products, scope }: { products: Product[]; scope: string }) {
  return <ScrollView horizontal testID={`${scope}-rail`} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>{products.map(p => <ProductCard key={p.id} product={p} scope={scope} />)}</ScrollView>;
}
export function ProductGrid({ products, scope }: { products: Product[]; scope: string }) {
  const { width } = useAppDimensions(); const cols = gridColumns(width); const cardWidth = (width - 32 - 8 * (cols - 1)) / cols;
  return <View testID={`${scope}-grid`} style={gridStyles.grid}>{products.map(p => <ProductCard key={p.id} product={p} scope={scope} width={cardWidth} />)}</View>;
}
const gridStyles = StyleSheet.create({ grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, rowGap: 16 } });
// Brands without a logo image get a monogram (one or two initials) instead of their full name
// squeezed into the tile — long names like "Himalaya" otherwise break mid-word.
const monogram = (name: string) => name.split(/[\s'’&-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
export function BrandRail({ brands, scope, onSelect, active }: { brands: Brand[]; scope: string; onSelect?: (id: string) => void; active?: string }) {
  const router = useRouter();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.brandRail}>
    {brands.map(b => <Pressable testID={`${scope}-brand-${b.id}`} key={b.id} onPress={() => onSelect ? onSelect(b.id) : router.push(`/brand/${b.id}` as any)} style={styles.brandItem}>
      <View style={[styles.brandCircle, !b.logo && { backgroundColor: b.department === 'beauty' ? colors.beautySoft : colors.pharmacySoft, borderColor: 'transparent' }, active === b.id && styles.selectedBrand]}>{b.logo ? <Image testID={`${scope}-brand-logo-${b.id}`} source={b.logo} contentFit="contain" style={styles.brandLogo} /> : <Text testID={`${scope}-brand-wordmark-${b.id}`} style={[styles.brandMonogram, { color: b.department === 'beauty' ? colors.beauty : colors.pharmacy }]} numberOfLines={1} accessibilityLabel={b.name}>{monogram(b.name)}</Text>}</View><Text testID={`${scope}-brand-name-${b.id}`} style={styles.brandName} numberOfLines={1}>{b.name}</Text>
    </Pressable>)}
  </ScrollView>;
}
export function CategoryRail({ categories, scope }: { categories: Category[]; scope: string }) {
  const router = useRouter();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>{categories.map(c => <Pressable key={c.id} testID={`${scope}-category-${c.id}`} onPress={() => router.push(`/category/${c.id}` as any)} style={styles.category}><Image source={c.image} style={styles.categoryImage} contentFit="cover" /><Text style={styles.categoryName}>{c.name}</Text></Pressable>)}</ScrollView>;
}
export function EventRail({ events, scope }: { events: EventListing[]; scope: string }) {
  const router = useRouter();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>{events.map(e => <Pressable key={e.id} testID={`${scope}-event-${e.id}`} style={styles.event} onPress={() => router.push(`/booking/${e.id}` as any)}>
    <Image source={e.image} style={styles.eventImage} contentFit="cover" /><View style={styles.eventTag}><Text style={styles.eventTagText}>{e.kind.toUpperCase()}</Text></View><View style={styles.eventContent}><Text style={styles.eventTitle}>{e.title}</Text><Text style={styles.subtitle}>{e.subtitle}</Text><View style={styles.eventBottom}><Text style={styles.eventPrice}>From ₹{e.price}</Text><Icon name="arrow-forward" size={18} color={colors.book} /></View></View>
  </Pressable>)}</ScrollView>;
}
export function LoadState({ error, retry }: { error?: boolean; retry?: () => void }) {
  return <View style={styles.loading} testID={error ? 'catalog-error' : 'catalog-loading'}>{error ? <><Icon name="cloud-offline-outline" size={32} color={colors.muted} /><Text style={styles.title}>Couldn’t load this right now</Text><Pressable testID="catalog-retry" style={styles.retry} onPress={retry}><Text style={styles.seeText}>Try again</Text></Pressable></> : <ActivityIndicator color={colors.forest} size="large" />}</View>;
}
const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 26, marginBottom: 13, gap: 8 }, headingText: { flex: 1 },
  title: { fontSize: 18, letterSpacing: -0.4, fontWeight: '600', color: colors.onSurface }, subtitle: { fontSize: 10, color: colors.muted, lineHeight: 16, marginTop: 3 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44 }, seeText: { color: colors.forest, fontSize: 11, fontWeight: '700' }, rail: { paddingHorizontal: 20, gap: 12 },
  brandRail: { paddingHorizontal: 20, gap: 12 }, brandItem: { width: 68, alignItems: 'center', gap: 8 }, brandCircle: { height: 66, width: 66, borderRadius: 23, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, brandLogo: { width: 43, height: 43 }, brandMonogram: { fontSize: 26, fontWeight: '800', letterSpacing: -1, textAlign: 'center' }, selectedBrand: { borderColor: colors.forest, borderWidth: 2, backgroundColor: colors.limeSoft }, brandName: { fontSize: 10, color: colors.onSurface, fontWeight: '600' },
  category: { width: 94, gap: 8 }, categoryImage: { width: 94, height: 91, borderRadius: 20, backgroundColor: colors.cream }, categoryName: { color: colors.onSurface, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  event: { width: 230, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, overflow: 'hidden' }, eventImage: { height: 142, width: '100%' }, eventTag: { position: 'absolute', top: 12, left: 12, borderRadius: 5, backgroundColor: colors.surface, paddingHorizontal: 7, paddingVertical: 4 }, eventTagText: { color: colors.book, fontSize: 9, fontWeight: '800', letterSpacing: 1 }, eventContent: { padding: 14 }, eventTitle: { fontSize: 17, fontWeight: '700', color: colors.onSurface }, eventBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }, eventPrice: { color: colors.book, fontWeight: '700', fontSize: 12 },
  loading: { flex: 1, padding: 30, alignItems: 'center', justifyContent: 'center', gap: 20 }, retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 24, backgroundColor: colors.limeSoft, borderRadius: 12 },
});