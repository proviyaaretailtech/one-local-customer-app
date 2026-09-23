import { useEffect, useState } from 'react';
import { useAppDimensions } from '@/src/layout';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Icon from '@react-native-vector-icons/ionicons';
import { colors } from '@/src/theme';
import { useCatalog } from '@/src/use-catalog';
import { ProductCard } from '@/src/components/product-card';
import { LoadState } from '@/src/components/catalog-sections';
import { departments, inDepartment } from '@/src/departments';
import { matchesProductQuery } from '@/src/catalog-search';
export default function Search() {
  const { collection, q } = useLocalSearchParams<{ collection?: string; q?: string }>();
  const { data, isError, refetch } = useCatalog();
  const [query, setQuery] = useState(q || '');
  useEffect(() => { if (q !== undefined) setQuery(q); }, [q]);
  const [department, setDepartment] = useState('all');
  const router = useRouter();
  const width = useAppDimensions().width;
  const cols = width > 600 ? 3 : 2;
  if (!data) return <LoadState error={isError} retry={refetch} />;
  const collectionIds = collection === 'trending' ? ['f1', 'f5', 'b1', 'f3'] : collection === 'picks' ? ['p3', 'f3', 'b1', 'p4', 'f6'] : null;
  const products = data.products.filter(p => (collection !== 'budget' || p.price < 99) && (!collectionIds || query || collectionIds.includes(p.id)) && (department === 'all' || inDepartment(p.department, department)) && matchesProductQuery(p, query, data));
  return <KeyboardAvoidingView testID="search-screen" behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
    <View style={styles.titleRow}><Pressable testID="search-back" accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)' as any)} style={styles.back}><Icon name="arrow-back" size={22} color={colors.onSurface} /></Pressable><Text style={styles.title}>{collection === 'budget' ? 'Little finds under ₹99' : collection === 'trending' ? 'Trending in Latur' : collection === 'picks' ? 'Top picks for you' : 'Find your next favourite'}</Text></View>
    <View style={styles.inputWrap}><Icon name="search" size={20} color={colors.muted} /><TextInput testID="search-input" value={query} onChangeText={setQuery} placeholder="Try pizza, milk, skincare…" placeholderTextColor={colors.muted} style={styles.input} autoFocus={!collection} returnKeyType="search" />{!!query && <Pressable testID="clear-search" onPress={() => setQuery('')} style={styles.back}><Icon name="close" size={20} color={colors.muted} /></Pressable>}</View>
    <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{[{ id: 'all', label: 'Everything' }, ...departments.filter(d => d.id !== 'book-it')].map(d => <Pressable testID={`search-filter-${d.id}`} key={d.id} onPress={() => setDepartment(d.id)} style={[styles.chip, department === d.id && styles.active]}><Text style={[styles.chipText, department === d.id && styles.activeText]}>{d.label}</Text></Pressable>)}</ScrollView></View>
    <Text testID="search-result-count" style={styles.count}>{products.length} finds for you</Text>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.grid}>{products.map(p => <ProductCard key={p.id} product={p} scope="search" width={(width - 40 - 12 * (cols - 1)) / cols} />)}{!products.length && <View testID="search-no-results" style={styles.empty}><Icon name="search-outline" size={36} color={colors.muted} /><Text style={styles.title}>No finds just yet</Text><Text style={styles.count}>Try another word or department.</Text></View>}</ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface }, titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, gap: 5 },
  back: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }, title: { fontSize: 20, fontWeight: '700', color: colors.onSurface, letterSpacing: -0.5 },
  inputWrap: { margin: 20, marginTop: 12, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingLeft: 14 }, input: { flex: 1, minHeight: 50, fontSize: 14, paddingHorizontal: 10, color: colors.onSurface },
  filters: { paddingHorizontal: 20, gap: 8 }, chip: { paddingHorizontal: 14, minHeight: 44, borderRadius: 24, justifyContent: 'center', backgroundColor: colors.cream }, active: { backgroundColor: colors.forest }, chipText: { fontSize: 11, fontWeight: '600', color: colors.onSurface }, activeText: { color: colors.surface },
  count: { margin: 20, color: colors.muted, fontSize: 12 }, grid: { paddingHorizontal: 20, paddingBottom: 140, gap: 12, flexDirection: 'row', flexWrap: 'wrap' }, empty: { width: '100%', alignItems: 'center', paddingTop: 25, gap: 15 },
});