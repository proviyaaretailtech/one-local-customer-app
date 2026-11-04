// A catalogue category: its header, other categories down the side (the open one a white card), filter pills, and the
// items as the app's product cards, two to a row. Opened for a shop (?store=, from the shop picker) it is that shop's: a
// banner names it, the sidebar is its categories and the items its own. Otherwise it is the department's, from every shop.
import { useEffect, useRef, useState } from 'react';
import { useAppDimensions } from '@/src/layout';
import { Animated, View, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { Text } from '@/src/ui/text';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCustomer } from '@/src/customer';
import Icon from '@react-native-vector-icons/ionicons';
import { colors, neu, neuWell, radius, soft } from '@/src/theme';
import type { Store } from '@/src/api';
import { useBrowseCatalog } from '@/src/use-catalog';
import { useStores } from '@/src/use-stores';
import { useScreenPalette } from '@/src/use-screen-path';
import { LoadState } from '@/src/components/catalog-sections';
import { ProductCard } from '@/src/components/product-card';
import { Tap } from '@/src/components/tap';
import { CategoryNotice, SubcategoryHeader } from '@/src/components/subcategory-header';
import { CategoryOption, SubcategoryOptions } from '@/src/components/subcategory-options';
import { useMotionAllowed } from '@/src/motion';
import { useFormat, useTranslation } from '@/src/i18n';

type Sheet = 'filters' | 'sort' | 'brand' | 'type' | null;
const BUDGET_MAX = 99; // the "Under ₹99" filter
const NOTICE_TEXT = { linkCopied: 'category.linkCopied', shareFailed: 'category.shareFailed' } as const;
const SIDE_ITEM = 106; // a sidebar row's height with its margins, for scrolling the open one into view
const PAD = 12; const GAP = 10; // around and between the product cards
export default function CategoryScreen() {
  const { id, store: storeId } = useLocalSearchParams<{ id: string; store?: string }>(); const router = useRouter(); const { data, isError, refetch } = useBrowseCatalog(); const palette = useScreenPalette();
  const shop = useStores().find(s => s.id === storeId);
  const [query, setQuery] = useState(''); const [sort, setSort] = useState('recommended'); const [budget, setBudget] = useState(false); const [brand, setBrand] = useState(''); const [pack, setPack] = useState(''); const [offers, setOffers] = useState(false); const [savedOnly, setSavedOnly] = useState(false); const [sheet, setSheet] = useState<Sheet>(null);
  const { saved } = useCustomer(); const [notice, setNotice] = useState<CategoryNotice | ''>(''); const { t } = useTranslation(); const fmt = useFormat();
  const sidebar = useRef<ScrollView>(null); const list = useRef<ScrollView>(null); const y = useRef(new Animated.Value(0)).current;
  const motion = useMotionAllowed(); const { width } = useAppDimensions(); const railWidth = Math.max(80, Math.min(108, Math.round(width*0.23)));
  const itemWidth = (width-railWidth-PAD*2-GAP)/2;
  useEffect(() => { setQuery(''); setBrand(''); setPack(''); setSheet(null); setBudget(false); setOffers(false); setSavedOnly(false); setSort('recommended'); y.setValue(0); list.current?.scrollTo({ y: 0, animated: false }); }, [id, y]);
  useEffect(() => { list.current?.scrollTo({ y: 0, animated: false }); y.setValue(0); }, [query, y]);
  const shopItems = storeId ? data?.products.filter(p => p.store_id === storeId) : undefined;
  const categories = data?.categories.filter(c => shopItems ? shopItems.some(p => p.category_id === c.id) : c.department === data.categories.find(c => c.id === id)?.department) || [];
  const activeIndex = categories.findIndex(c => c.id === id);
  const revealSelected = () => sidebar.current?.scrollTo({ y: Math.max(0, activeIndex*SIDE_ITEM-2*SIDE_ITEM), animated: motion });
  useEffect(() => { sidebar.current?.scrollTo({ y: Math.max(0, activeIndex*SIDE_ITEM-2*SIDE_ITEM), animated: motion }); }, [activeIndex, motion]);
  if (!data) return <LoadState error={isError} retry={refetch} />;
  const cat = data.categories.find(c => c.id === id); const original = (shopItems ?? data.products).filter(p => p.category_id === id);
  const products = original.filter(p => (!budget || p.price < BUDGET_MAX) && (!brand || p.brand_id === brand) && (!pack || p.weight === pack) && (!offers || p.price < p.mrp) && (!savedOnly || saved.includes(p.id)) && p.name.toLowerCase().includes(query.toLowerCase())).sort((a,b) => sort === 'low' ? a.price-b.price : sort === 'high' ? b.price-a.price : sort === 'rating' ? b.rating-a.rating : 0);
  const brands = data.brands.filter(b => original.some(p => p.brand_id === b.id)); const packs = [...new Set(original.map(p => p.weight))];
  const reset = () => { setQuery(''); setBudget(false); setBrand(''); setPack(''); setOffers(false); setSavedOnly(false); setSort('recommended'); };
  const filterCount = Number(budget)+Number(offers)+Number(savedOnly);
  const options: CategoryOption[] = sheet === 'filters' ? [
    { id: 'category-budget', label: t('category.filterBudget', { price: fmt.money(BUDGET_MAX) }), selected: budget, onPress: () => setBudget(!budget) },
    { id: 'category-offers-only', label: t('category.filterOffers'), selected: offers, onPress: () => setOffers(!offers) },
    { id: 'category-saved-only', label: t('category.filterSaved'), selected: savedOnly, onPress: () => setSavedOnly(!savedOnly) },
  ] : sheet === 'sort' ? [['recommended', t('category.sortRecommended')], ['low', t('category.sortLow')], ['high', t('category.sortHigh')], ['rating', t('category.sortRating')]].map(([value,label]) => ({ id: `category-sort-${value}`, label, selected: sort === value, onPress: () => setSort(value) })) : sheet === 'brand' ? [{ id: 'category-brand-all', label: t('category.allBrands'), selected: !brand, onPress: () => setBrand('') }, ...brands.map(b => ({ id: `category-brand-${b.id}`, label: b.name, selected: brand === b.id, onPress: () => setBrand(b.id) }))] : [{ id: 'category-pack-all', label: t('category.allPacks'), selected: !pack, onPress: () => setPack('') }, ...packs.map((p,i) => ({ id: `category-pack-${i}`, label: p, selected: pack === p, onPress: () => setPack(p) }))];
  return <KeyboardAvoidingView testID="category-screen" behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
    <SubcategoryHeader id={id} title={cat?.name || t('category.notFound')} query={query} setQuery={setQuery} scroll={y} onNotice={setNotice} />
    {!!notice && <View testID="subcategory-notice" accessibilityLiveRegion="polite" style={styles.notice}><Text style={styles.noticeText}>{t(NOTICE_TEXT[notice])}</Text><Pressable testID="subcategory-notice-dismiss" accessibilityLabel={t('category.dismissMessage')} onPress={() => setNotice('')} style={styles.dismiss}><Icon name="close" size={18} color={colors.forest} /></Pressable></View>}
    {!!shop && <ShopBanner store={shop} band={palette.mid} accent={palette.color} back={() => router.canGoBack() ? router.back() : router.replace(`/category/shops/${id}` as never)} />}
    {/* The header's wash carries on down the sidebar, wrapping the products' white sheet. */}
    <View style={[styles.body, { backgroundColor: palette.mid }]}>
      <ScrollView ref={sidebar} testID="category-sidebar" style={[styles.sidebar, { width: railWidth }]} contentContainerStyle={styles.sidebarContent} onContentSizeChange={revealSelected} showsVerticalScrollIndicator={false}>{categories.map(c => {
        const on = c.id === id;
        return <Tap key={c.id} testID={`sidebar-${c.id}`} accessibilityRole="button" accessibilityLabel={c.name} accessibilityState={{ selected: on }} onPress={() => router.setParams({ id: c.id })} style={[styles.sideItem, on && styles.sideItemOn]}>
          <View style={[styles.sideTile, on && { borderColor: palette.color }]}><Image testID={`sidebar-image-${c.id}`} source={c.image} contentFit="cover" style={styles.sideImage} /></View>
          <Text testID={`sidebar-label-${c.id}`} numberOfLines={2} style={[styles.sideText, on && { color: palette.color, fontWeight: '700' }]}>{c.name}</Text>
        </Tap>;
      })}</ScrollView>
      <View style={styles.products}>
        <ScrollView horizontal testID="subcategory-filter-row" showsHorizontalScrollIndicator={false} style={styles.filters} contentContainerStyle={styles.filterContent}>{[{ id: 'filters', test: 'category-filters', icon: 'options-outline', label: filterCount ? t('category.filtersCount', { n: fmt.number(filterCount) }) : t('category.filters'), active: !!filterCount, a11y: t('category.chooseFilters') }, { id: 'sort', test: 'category-sort', icon: 'swap-vertical-outline', label: t('category.sort'), active: sort !== 'recommended', a11y: t('category.chooseSort') }, { id: 'brand', test: 'category-brand-filter', label: t('category.brand'), active: !!brand, a11y: t('category.chooseBrand') }, { id: 'type', test: 'category-type-filter', label: t('category.type'), active: !!pack, a11y: t('category.chooseType') }].map(f => {
          const ink = f.active ? colors.surface : colors.onSurface;
          return <Tap key={f.id} testID={f.test} accessibilityRole="button" accessibilityLabel={f.a11y} accessibilityState={{ selected: f.active }} onPress={() => setSheet(f.id as Sheet)} style={[styles.filter, f.active && { backgroundColor: palette.color, borderColor: palette.color }]}>{f.icon && <Icon name={f.icon as any} size={14} color={ink} />}<Text style={[styles.filterText, { color: ink }]}>{f.label}</Text><Icon name="chevron-down" size={11} color={ink} /></Tap>;
        })}</ScrollView>
        <Animated.ScrollView ref={list} testID="category-products-scroll" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" scrollEventThrottle={16} onScroll={Animated.event([{ nativeEvent: { contentOffset: { y } } }], { useNativeDriver: false })} contentContainerStyle={styles.productContent}>
          <View style={styles.grid}>{products.map(p => <ProductCard key={p.id} product={p} scope="category" width={itemWidth} />)}</View>
          {!products.length && <View testID="category-empty" style={styles.empty}><View style={styles.emptyIcon}><Icon name="search-outline" size={24} color={palette.color} /></View><Text style={styles.emptyTitle}>{t('category.empty')}</Text><Tap testID="category-clear-filters" accessibilityRole="button" onPress={reset} style={[styles.clear, { backgroundColor: palette.color }]}><Text style={styles.clearText}>{t('category.clearFilters')}</Text></Tap>{!cat && <Tap testID="category-all" accessibilityRole="button" onPress={() => router.replace('/categories')} style={[styles.clear, { backgroundColor: palette.color }]}><Text style={styles.clearText}>{t('category.browse')}</Text></Tap>}</View>}
          <Text testID="category-count" style={styles.footnote}>{t('category.count', { count: products.length, value: fmt.number(products.length) })}</Text><Text testID="subcategory-estimate-note" style={styles.footnote}>{t('category.estimateNote')}</Text>
        </Animated.ScrollView>
      </View>
    </View>
    {!!sheet && <SubcategoryOptions title={sheet === 'filters' ? t('category.filters') : sheet === 'sort' ? t('category.sortBy') : sheet === 'brand' ? t('category.chooseABrand') : t('category.packSize')} options={options} close={() => { setSheet(null); list.current?.scrollTo({ y: 0, animated: motion }); }} reset={reset} />}
  </KeyboardAvoidingView>;
}
// Names the shop the page is showing, in soft neumorphism on the page's own wash (`band`): a raised strip with the shop's
// logo pressed into a well, and a raised button back to the shop picker, in the page's colour (`accent`).
function ShopBanner({ store, band, accent, back }: { store: Store; band: string; accent: string; back: () => void }) {
  const { t } = useTranslation();
  return <View style={[styles.shopBand, { backgroundColor: band }]}>
    <View testID="category-shop-banner" style={[styles.shopBanner, { backgroundColor: band }]}>
      <View style={[styles.shopWell, { backgroundColor: band }]}>{!!store.logo && <Image source={store.logo} style={styles.shopLogo} contentFit="cover" />}</View>
      <View style={styles.shopCopy}>
        <Text style={[styles.shopLabel, { color: accent }]}>{t('categoryShops.shoppingAt')}</Text>
        <Text testID="category-shop-name" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.shopName}>{store.name}</Text>
      </View>
      <Tap testID="category-change-shop" accessibilityRole="button" accessibilityLabel={t('categoryShops.changeShop')} onPress={back} style={[styles.change, { backgroundColor: band }]}>
        <Icon name="swap-horizontal" size={14} color={accent} /><Text style={[styles.changeText, { color: accent }]}>{t('categoryShops.change')}</Text>
      </Tap>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  // Room around the banner for its soft shadows.
  shopBand: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 18 },
  shopBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, paddingRight: 10, borderRadius: radius.pill, boxShadow: neu(5) },
  shopWell: { width: 46, height: 46, borderRadius: 23, padding: 5, boxShadow: neuWell },
  shopLogo: { flex: 1, borderRadius: 18 },
  shopCopy: { flex: 1, minWidth: 0, gap: 1 },
  shopLabel: { fontSize: 11, fontWeight: '700' },
  shopName: { fontSize: 15, lineHeight: 19, fontWeight: '800', color: colors.onSurface },
  change: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 34, paddingHorizontal: 13, borderRadius: radius.pill, boxShadow: neu(3) },
  changeText: { fontSize: 12, fontWeight: '800' }, body: { flex: 1, flexDirection: 'row' },
  sidebar: { flexGrow: 0 }, sidebarContent: { paddingTop: 6, paddingBottom: 110 },
  // The open category is a white tab, rounded on its outer side and flush with the white product area.
  // The open category is a white card centred in the sidebar, inset from the rows around it.
  sideItem: { height: SIDE_ITEM - 6, marginVertical: 3, marginHorizontal: 6, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.sm },
  sideItemOn: { backgroundColor: colors.surface },
  // The same size picked or not: the photo fills it edge to edge, and picking rings it, a thin white gap inside the ring.
  sideTile: { width: 56, height: 56, padding: 2, borderRadius: 18, borderWidth: 2, borderColor: 'transparent', backgroundColor: colors.surface, boxShadow: soft.lifted },
  sideImage: { flex: 1, borderRadius: 13 },
  sideText: { color: colors.muted, fontSize: 11, lineHeight: 13, textAlign: 'center' },
  products: { flex: 1, minWidth: 0, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, overflow: 'hidden' },
  filters: { maxHeight: 56, minHeight: 56, flexGrow: 0 }, filterContent: { paddingHorizontal: PAD, gap: 8, alignItems: 'center' },
  filter: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterText: { fontSize: 12, fontWeight: '600' },
  productContent: { paddingHorizontal: PAD, paddingTop: 4, paddingBottom: 130 }, grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: 20 },
  empty: { alignItems: 'center', paddingVertical: 36, gap: 14 }, emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: colors.onSurface, textAlign: 'center' },
  clear: { minHeight: 40, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill }, clearText: { color: colors.surface, fontSize: 12, fontWeight: '700' },
  footnote: { fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 18 },
  notice: { paddingLeft: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.limeSoft }, noticeText: { flex: 1, color: colors.forest, fontSize: 11 }, dismiss: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
});
