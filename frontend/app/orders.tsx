// My Orders. Orders placed together (one per store, paid once) show as one checkout card with a
// row per store; older orders and single-store checkouts look as they always did.
import { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing } from "@/src/theme";
import { api, Order } from "@/src/api";
import { useCart } from "@/src/cart";

const r2 = (n: number) => Math.round(n * 100) / 100;

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addMany } = useCart();
  const [orders, setOrders] = useState<Order[]>([]);
  // Newest checkout first; its store orders in the order they were in the cart.
  const checkouts = useMemo(() => {
    const groups: { key: string; orders: Order[] }[] = [];
    for (const o of orders) {
      const key = o.checkout_id ?? o.id;
      const group = groups.find(g => g.key === key);
      if (group) group.orders.push(o); else groups.push({ key, orders: [o] });
    }
    for (const g of groups) g.orders.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return groups;
  }, [orders]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [reordered, setReordered] = useState<string | null>(null);

  const fetchOrders = useCallback(() => {
    setRefreshing(true);
    setError('');
    api<Order[]>("/orders")
      .then(setOrders)
      .catch(() => setError('Could not load your orders. Please try again.'))
      .finally(() => setRefreshing(false));
  }, []);

  useFocusEffect(useCallback(() => { fetchOrders(); }, [fetchOrders]));

  // Everything from the checkout, into the right cart (food from another restaurant asks first).
  const reorder = (key: string, list: Order[]) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addMany(list.flatMap(o => o.items.map(it => ({ product: { id: it.id, name: it.name, weight: it.weight, price: it.price, mrp: it.mrp, image: it.image, store_id: o.store_id ?? undefined }, qty: it.qty }))));
    setReordered(key);
    setTimeout(() => setReordered(null), 1500);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="orders-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.backBtn} testID="orders-back-btn">
          <Icon name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>My Orders</Text>
          <Text style={styles.sub}>{checkouts.length} order{checkouts.length === 1 ? "" : "s"}</Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchOrders} />}
      >
        {!!error && <View style={styles.empty} testID="orders-error"><Text style={styles.emptySub}>{error}</Text><TouchableOpacity testID="orders-retry" style={styles.shopBtn} onPress={fetchOrders}><Text style={styles.shopBtnText}>Try again</Text></TouchableOpacity></View>}
        {orders.length === 0 && !error ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📦</Text>
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptySub}>Your past orders will appear here</Text>
            <TouchableOpacity style={styles.shopBtn} onPress={() => router.replace("/(tabs)" as any)}>
              <Text style={styles.shopBtnText}>Start shopping</Text>
            </TouchableOpacity>
          </View>
        ) : (
          checkouts.map(({ key, orders: list }) => {
            const first = list[0]; const many = list.length > 1;
            const track = (o: Order) => <TouchableOpacity style={styles.trackBtn} onPress={() => router.push(`/order/${o.id}` as any)} testID={`track-${o.id}`}>
              <Icon name="location-outline" size={14} color={colors.onSurface} />
              <Text style={styles.trackText}>Track</Text>
            </TouchableOpacity>;
            return <View key={key} style={styles.card} testID={many ? `checkout-${key}` : `order-${first.id}`}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderId} numberOfLines={1}>#{key.slice(0, 8).toUpperCase()}{many ? ` · ${list.length} stores` : first.store_name ? ` · ${first.store_name}` : ''}</Text>
                  <Text style={styles.orderDate}>{new Date(first.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: colors.pastelGreen }]}>
                  <Text style={styles.statusText}>{first.status}</Text>
                </View>
              </View>

              {list.map(o => <View key={o.id} style={many ? styles.storePart : undefined} testID={many ? `order-${o.id}` : undefined}>
                {many && <View style={styles.storeHead}>
                  <View style={{ flex: 1 }}><Text style={styles.storeName} numberOfLines={1}>{o.store_name || 'Store'}</Text><Text style={styles.footerMeta}>₹{o.total} · {o.items.length} items</Text></View>
                  {track(o)}
                </View>}
                <View style={styles.imgRow}>
                  {o.items.slice(0, 4).map((i) => (
                    <Image key={i.id} source={i.image} style={styles.itemImg} contentFit="cover" />
                  ))}
                  {o.items.length > 4 && (
                    <View style={styles.moreBadge}>
                      <Text style={styles.moreText}>+{o.items.length - 4}</Text>
                    </View>
                  )}
                </View>
              </View>)}

              <View style={styles.footer}>
                <View>
                  <Text style={styles.total}>₹{r2(list.reduce((s, o) => s + o.total, 0))}</Text>
                  <Text style={styles.footerMeta}>{list.reduce((n, o) => n + o.items.length, 0)} items{many ? ' · paid together' : ''}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  {!many && track(first)}
                  <TouchableOpacity style={styles.reorderBtn} onPress={() => reorder(key, list)} testID={`reorder-${first.id}`}>
                    <Icon name={reordered === key ? "checkmark" : "repeat"} size={14} color={colors.onBrandPrimary} />
                    <Text style={styles.reorderText}>{reordered === key ? "Added" : "Reorder"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>;
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", gap: spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  empty: { alignItems: "center", padding: spacing.xl },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  emptySub: { fontSize: 13, color: colors.muted, marginTop: 4 },
  shopBtn: { marginTop: spacing.lg, backgroundColor: colors.brandPrimary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.pill },
  shopBtnText: { color: colors.onBrandPrimary, fontWeight: "800" },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderId: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  orderDate: { fontSize: 11, color: colors.muted, marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  statusText: { fontSize: 11, fontWeight: "800", color: colors.onSuccess, textTransform: "capitalize" },
  imgRow: { flexDirection: "row", gap: 6, marginTop: spacing.md },
  storePart: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  storeHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  storeName: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  itemImg: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary },
  moreBadge: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  moreText: { fontSize: 12, fontWeight: "800", color: colors.onSurface },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },
  total: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  footerMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  trackBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  trackText: { fontSize: 12, fontWeight: "800", color: colors.onSurface },
  reorderBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.brandPrimary },
  reorderText: { fontSize: 12, fontWeight: "800", color: colors.onBrandPrimary },
});
