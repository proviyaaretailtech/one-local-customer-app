// Side-by-side comparison of up to three products. "Best value" goes to the lowest unit price when
// the packs can be compared (same unit), otherwise to the lowest price.
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Icon from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '@/src/theme';
import { useCompare } from '@/src/compare';
import { useCart } from '@/src/cart';
import { unitPrice } from '@/src/unit-price';

const INK = '#050605';

export default function CompareScreen() {
  const { items, toggle, clear } = useCompare(); const { add, qtyOf } = useCart(); const router = useRouter();
  const { width } = useWindowDimensions();
  // Two items fit on any phone; three scroll sideways past a comfortable minimum width.
  const col = Math.max(Math.min((width - 32 - 84 - 8 * Math.max(items.length, 1)) / Math.max(items.length, 1), 170), 104);

  if (items.length < 2) return <View testID="compare-screen" style={s.empty}>
    <View style={s.emptyIcon}><Icon name="git-compare-outline" size={30} color={colors.electricLime} /></View>
    <Text style={s.emptyTitle}>{items.length === 0 ? 'Nothing to compare yet' : 'Add one more item'}</Text>
    <Text style={s.emptySub}>Open any product and tap “Add to compare”. Put up to three side by side — price, pack size, price per 100 g, rating and delivery time.</Text>
    <Pressable testID="compare-browse" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.emptyBtn}><Text style={s.emptyBtnText}>{items.length === 0 ? 'Browse products' : 'Pick another'}</Text></Pressable>
  </View>;

  const units = items.map(p => unitPrice(p.price, p.weight));
  const sameBase = units.every(u => u && u.base === units[0]?.base);
  const score = items.map((p, i) => sameBase ? units[i]!.perBase : p.price);
  const best = score.indexOf(Math.min(...score));
  const maxRating = Math.max(...items.map(p => p.rating)); const fastest = Math.min(...items.map(p => p.delivery_min));

  const rows: { label: string; cell: (i: number) => React.ReactNode }[] = [
    { label: 'Price', cell: i => <Text style={s.big}>₹{items[i].price}</Text> },
    { label: 'MRP', cell: i => <Text style={s.val}>{items[i].mrp > items[i].price ? <Text style={s.strike}>₹{items[i].mrp}</Text> : `₹${items[i].mrp}`}{items[i].mrp > items[i].price ? <Text style={s.off}>  {Math.round((1 - items[i].price / items[i].mrp) * 100)}% off</Text> : null}</Text> },
    { label: 'Pack', cell: i => <Text style={s.val} numberOfLines={2}>{items[i].weight}</Text> },
    { label: 'Unit price', cell: i => <Text style={[s.val, i === best && sameBase && s.win]}>{units[i]?.label ?? '—'}</Text> },
    { label: 'Rating', cell: i => <Text style={[s.val, items[i].rating === maxRating && s.win]}>★ {items[i].rating.toFixed(1)}</Text> },
    { label: 'Delivery', cell: i => <Text style={[s.val, items[i].delivery_min === fastest && s.win]}>{items[i].delivery_min} min</Text> },
  ];

  return <ScrollView testID="compare-screen" style={s.screen} contentContainerStyle={s.content}>
    <View style={s.head}><Pressable testID="compare-back" accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.back}><Icon name="chevron-back" size={22} color={colors.onSurface} /></Pressable><Text style={s.title}>Compare</Text><Pressable testID="compare-clear" onPress={clear} hitSlop={10} style={s.clear}><Text style={s.clearText}>Clear all</Text></Pressable></View>
    <Text style={s.sub}>{sameBase ? 'Best value is the lowest price for the same amount.' : 'These come in different units, so best value goes to the lowest price.'}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ paddingTop: 12 }}>
        <View style={s.row}>
          <View style={s.labelCol} />
          {items.map((p, i) => <View key={p.id} style={[s.card, { width: col }, i === best && s.cardBest]}>
            {i === best && <View style={s.bestTag}><Text style={s.bestTagText}>BEST VALUE</Text></View>}
            <Pressable testID={`compare-remove-${p.id}`} accessibilityLabel={`Remove ${p.name}`} onPress={() => toggle(p)} style={s.remove}><Icon name="close" size={14} color={colors.muted} /></Pressable>
            <Pressable onPress={() => router.push(`/product/${p.id}` as any)}><Image source={p.image} style={s.img} contentFit="contain" /><Text style={s.name} numberOfLines={2}>{p.name}</Text></Pressable>
          </View>)}
        </View>
        {rows.map(r => <View key={r.label} style={[s.row, s.dataRow]}>
          <Text style={s.label}>{r.label}</Text>
          {items.map((p, i) => <View key={p.id} style={[s.cell, { width: col }]}>{r.cell(i)}</View>)}
        </View>)}
        <View style={s.row}>
          <View style={s.labelCol} />
          {items.map(p => <Pressable key={p.id} testID={`compare-add-${p.id}`} onPress={() => { add(p); void Haptics.selectionAsync().catch(() => {}); }} style={[s.add, { width: col }]}>
            <Text style={s.addText}>{qtyOf(p.id) ? `${qtyOf(p.id)} in bag · add` : 'Add to bag'}</Text>
          </Pressable>)}
        </View>
      </View>
    </ScrollView>
  </ScrollView>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceSecondary }, content: { padding: 16, paddingBottom: 120 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 26, fontWeight: '800', color: colors.onSurface, letterSpacing: -0.6 },
  clear: { minHeight: 44, justifyContent: 'center' }, clearText: { color: colors.onError, fontWeight: '700', fontSize: 13 },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  dataRow: { borderTopWidth: 1, borderTopColor: colors.divider, paddingVertical: 12 },
  labelCol: { width: 84 },
  label: { width: 84, fontSize: 11, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 2 },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 10, marginBottom: 12, borderWidth: 2, borderColor: 'transparent' },
  cardBest: { borderColor: colors.electricLime },
  bestTag: { position: 'absolute', top: -9, left: 10, zIndex: 2, backgroundColor: INK, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  bestTagText: { color: colors.electricLime, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  remove: { position: 'absolute', top: 4, right: 4, zIndex: 2, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  img: { width: '100%', height: 96, marginTop: 8 },
  name: { fontSize: 12, fontWeight: '700', color: colors.onSurface, marginTop: 8, minHeight: 32 },
  cell: { justifyContent: 'center' },
  big: { fontSize: 18, fontWeight: '800', color: colors.onSurface },
  val: { fontSize: 13, color: colors.onSurface, fontWeight: '600' },
  strike: { textDecorationLine: 'line-through', color: colors.muted },
  off: { color: colors.onSuccess, fontWeight: '800', fontSize: 11 },
  win: { color: colors.forest, fontWeight: '800' },
  add: { minHeight: 46, borderRadius: 16, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  addText: { color: colors.electricLime, fontSize: 12, fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.surfaceSecondary, gap: 10 },
  emptyIcon: { width: 72, height: 72, borderRadius: 26, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.onSurface },
  emptySub: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { marginTop: 10, minHeight: 48, paddingHorizontal: 22, borderRadius: 16, backgroundColor: colors.electricLime, justifyContent: 'center' },
  emptyBtnText: { color: INK, fontWeight: '800' },
});
