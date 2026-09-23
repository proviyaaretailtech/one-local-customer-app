import { useState } from 'react';
import { useAppDimensions } from '../layout';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from '@react-native-vector-icons/ionicons';
import { colors } from '../theme';
import { departments, DepartmentId, inDepartment } from '../departments';
import { useCatalog } from '../use-catalog';
import { BrandRail, CategoryRail, LoadState, SectionTitle } from './catalog-sections';
import { ProductCard } from './product-card';
import { BrandSpotlight } from './brand-spotlight';
import { CityScroll } from '../motion';
export function DepartmentScreen({ id }: { id: DepartmentId }) {
  const d = departments.find(x => x.id === id)!; const { data, isError, refetch } = useCatalog(); const [filter, setFilter] = useState('All'); const [brand, setBrand] = useState(''); const router = useRouter(); const width = useAppDimensions().width;
  if (!data) return <LoadState error={isError} retry={refetch} />;
  const brands = data.brands.filter(b => inDepartment(b.department, id)); const categories = data.categories.filter(c => inDepartment(c.department, id));
  const products = data.products.filter(p => inDepartment(p.department, id) && (!brand || p.brand_id === brand) && (filter === 'All' || data.categories.find(c => c.id === p.category_id)?.name.toLowerCase().includes(filter.toLowerCase())));
  // 2 columns on phones, 3 on small tablets, 4 from iPad portrait up.
  const columns = width >= 760 ? 4 : width > 600 ? 3 : 2; const cardWidth = (width - 40 - 12 * (columns - 1)) / columns;
  return <CityScroll testID={`department-screen-${id}`} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
    <BrandSpotlight variant={id} />
    <View style={styles.sheet}><SectionTitle title={id === 'shops' ? 'A few names you’ll love' : 'Good brands. Lovely finds.'} id={`${id}-brands`} subtitle="Tap a brand to find your favourites" /><BrandRail brands={brands} scope={`${id}-page`} onSelect={value => setBrand(brand === value ? '' : value)} active={brand} />
      {id === 'grocery' && <View style={styles.space}><CategoryRail categories={categories} scope="grocery-page" /></View>}
      <SectionTitle id={`${id}-products`} title={brand ? brands.find(b => b.id === brand)?.name || 'Picked for you' : id === 'care' ? 'Your daily dose of feel-good' : id === 'shops' ? 'A little something for you' : id === 'food' ? 'Made for your cravings' : 'Fresh in your neighbourhood'} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{d.filters.map(f => <Pressable key={f} testID={`${id}-filter-${f.toLowerCase().replaceAll(' ', '-')}`} onPress={() => setFilter(f)} style={[styles.filter, filter === f && { backgroundColor: d.soft }]}><Text style={[styles.filterText, filter === f && { color: d.color }]}>{f}</Text></Pressable>)}</ScrollView>
      {!!brand && <View style={styles.brandActions}><Pressable testID={`${id}-clear-brand`} onPress={() => setBrand('')} style={styles.clear}><Icon name="close-circle-outline" size={15} color={d.color} /><Text style={styles.filterText}>Clear brand</Text></Pressable><Pressable testID={`${id}-visit-store`} onPress={() => router.push(`/brand/${brand}` as any)} style={styles.clear}><Text style={styles.filterText}>Explore brand</Text><Icon name="arrow-forward" size={15} color={d.color} /></Pressable></View>}
      <View style={styles.grid}>{products.map(p => <ProductCard key={p.id} product={p} width={cardWidth} scope={id} />)}</View>
      {!products.length && <View testID={`${id}-empty-results`} style={styles.empty}><Text style={styles.noteText}>No finds with these filters, just yet.</Text><Pressable testID={`${id}-reset-filters`} onPress={() => { setFilter('All'); setBrand(''); }} style={styles.clear}><Text style={styles.filterText}>Show all products</Text></Pressable></View>}
      <Text testID={`${id}-sample-notice`} style={styles.note}>{id === 'care' ? 'Sample wellness and beauty catalogue. Not medical advice. No prescription medicines are dispensed.' : 'Sample brand listings, prices and illustrative photography.'}</Text>
    </View>
  </CityScroll>;
}
const styles = StyleSheet.create({ content: { paddingBottom: 20 }, sheet: { backgroundColor: colors.glassBright, borderTopLeftRadius: 34, borderTopRightRadius: 34, paddingTop: 1 }, space: { marginTop: 23 }, filters: { paddingHorizontal: 20, gap: 7, marginBottom: 18 }, filter: { minHeight: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: colors.cream }, filterText: { fontSize: 10, fontWeight: '500', color: colors.onSurface }, grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 12 }, brandActions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 10 }, clear: { minHeight: 44, alignItems: 'center', flexDirection: 'row', gap: 6 }, empty: { alignItems: 'center', padding: 20 }, noteText: { color: colors.muted, fontSize: 11 }, note: { color: colors.muted, fontSize: 9, lineHeight: 15, margin: 25 } });