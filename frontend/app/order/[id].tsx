import { useEffect, useState } from "react";
import { MAX_APP_WIDTH } from '@/src/layout';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/ionicons";
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing, cancelAnimation } from "react-native-reanimated";
import Svg, { Path, Circle } from "react-native-svg";
import { colors, radius, spacing } from "@/src/theme";
import { api, Checkout, Order } from "@/src/api";
import { VendorNote } from '@/src/components/vendor-note';
import { useMotionAllowed } from '@/src/motion';
import { paymentLabel } from '@/src/components/payment-options';
import { ORDER_TOTAL_S, stageAt, syncOrderActivity, updateOrderWidget } from '@/src/native/ios-extras';
import { OneLottie } from '@/src/components/one-lottie';

const AnimatedView = Animated.View;
// Capped to the app column so the layout holds on tablets and desktop (src/layout.tsx).
const SCREEN_W = Math.min(Dimensions.get("window").width, MAX_APP_WIDTH);
const MAP_W = SCREEN_W - spacing.lg * 2;
const MAP_H = 240;

// SVG path for rider route (cubic-bezier feel)
const ROUTE_D = `M 30 ${MAP_H - 30} Q ${MAP_W * 0.25} ${MAP_H * 0.2} ${MAP_W * 0.55} ${MAP_H * 0.45} T ${MAP_W - 30} 30`;

// Sample points along the route for the rider position (approx)
function pointOnRoute(t: number) {
  'worklet';
  // Use a set of points approximating the cubic path
  const start = { x: 30, y: MAP_H - 30 };
  const c1 = { x: MAP_W * 0.25, y: MAP_H * 0.2 };
  const mid = { x: MAP_W * 0.55, y: MAP_H * 0.45 };
  const c2 = { x: MAP_W * 0.85, y: MAP_H * 0.7 };
  const end = { x: MAP_W - 30, y: 30 };
  const pts = [start, c1, mid, c2, end];
  const seg = Math.min(Math.floor(t * (pts.length - 1)), pts.length - 2);
  const localT = t * (pts.length - 1) - seg;
  const p0 = pts[seg];
  const p1 = pts[seg + 1];
  return { x: p0.x + (p1.x - p0.x) * localT, y: p0.y + (p1.y - p0.y) * localT };
}

// Cash orders keep the old wording; online orders say what Razorpay confirmed (server/payments.ts).
const PAYMENT_NOTE: Record<string, string> = {
  not_charged: 'sample order, not charged', paid: 'paid online', pending: 'payment being confirmed',
  failed: 'payment did not go through', refunded: 'refunded',
};

const TIMELINE = [
  { key: "placed", label: "Order placed", icon: "checkmark-circle" as const },
  { key: "packed", label: "Packed at store", icon: "cube" as const },
  { key: "out", label: "Out for delivery", icon: "bicycle" as const },
  { key: "delivered", label: "Delivered", icon: "home" as const },
];

export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [elapsedS, setElapsedS] = useState(0);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [help, setHelp] = useState(false);
  const motion = useMotionAllowed();

  // Rider animation: 0..1 over the delivery duration
  const progress = useSharedValue(0);
  const TOTAL_S = 10 * 60; // 10 min

  useEffect(() => {
    if (!id) return;
    setError('');
    api<Order>(`/orders/${id}`).then(setOrder).catch(() => setError('Could not load this order. Please try again.'));
  }, [id, retry]);

  // The other store orders paid for in the same checkout (a shopping cart split by store).
  const [siblings, setSiblings] = useState<Order[]>([]);
  useEffect(() => {
    setSiblings([]);
    if (!order?.checkout_id) return;
    api<Checkout>(`/checkouts/${order.checkout_id}`).then(c => setSiblings(c.orders.filter(o => o.id !== order.id))).catch(() => {});
  }, [order?.id, order?.checkout_id]);

  useEffect(() => {
    // For a delightful preview we animate the rider across the route in 24s (loops after)
    progress.value = 0;
    if (motion) progress.value = withTiming(1, { duration: 24000, easing: Easing.inOut(Easing.ease) });
    return () => { cancelAnimation(progress); };
  }, [progress, motion]);

  // The sample journey is timed from when the order was placed, so reopening an order (and the
  // Live Activity, widget and notifications) all agree on where it is.
  const placedAt = order ? new Date(order.created_at).getTime() : 0;
  useEffect(() => {
    if (!placedAt) return;
    const tick = () => setElapsedS(Math.max(0, Math.floor((Date.now() - placedAt) / 1000)));
    tick(); const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [placedAt]);

  // iOS add-in layer: keep the Live Activity (lock screen / Dynamic Island) and the home-screen
  // widget in step with the order. No-ops outside an iOS development build.
  const stage = stageAt(elapsedS);
  useEffect(() => {
    if (!order) return;
    const count = order.items.reduce((n, i) => n + i.qty, 0);
    const summary = `${order.items[0]?.name ?? 'Your order'}${order.items.length > 1 ? ` + ${order.items.length - 1} more` : ''} · ₹${order.total}`;
    syncOrderActivity(order.id, stage, summary, placedAt);
    updateOrderWidget({ orderId: order.id, step: stage, etaMinutes: Math.max(0, Math.ceil((ORDER_TOTAL_S - elapsedS) / 60)), itemCount: count, total: `₹${order.total}`, firstItem: order.items[0]?.name ?? 'Your order' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, stage]);

  const riderStyle = useAnimatedStyle(() => {
    const p = pointOnRoute(progress.value);
    return { transform: [{ translateX: p.x - 18 }, { translateY: p.y - 18 }] };
  });

  const etaLeft = Math.max(TOTAL_S - elapsedS, 0);
  const mins = Math.floor(etaLeft / 60);
  const secs = etaLeft % 60;
  const stagePct = stage;

  if (!order) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        {error ? <><Text testID="tracking-error" style={{ color: colors.onError }}>{error}</Text><TouchableOpacity testID="tracking-retry" style={styles.homeBtn} onPress={() => setRetry(v => v + 1)}><Text style={styles.homeBtnText}>Try again</Text></TouchableOpacity></> : <ActivityIndicator testID="tracking-loading" color={colors.forest} />}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="order-tracking">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.backBtn} testID="track-back-btn">
          <Icon name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text testID="tracking-title" style={styles.title}>Your delivery story</Text>
          <Text testID="tracking-sample-notice" style={styles.sub} numberOfLines={1}>Sample tracking · #{order.id.slice(0, 8).toUpperCase()}{order.store_name ? ` · ${order.store_name}` : ''}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <Text testID="order-payment-method" style={styles.riderMeta}>{paymentLabel(order.payment_method || 'cod')} · {PAYMENT_NOTE[order.payment_status ?? 'not_charged'] ?? PAYMENT_NOTE.not_charged}</Text>
        {elapsedS < 12 && <View testID="order-placed-moment" style={styles.placed}>
          <OneLottie name="order-success" size={72} />
          <View style={{ flex: 1 }}><Text style={styles.placedTitle}>Order placed!</Text><Text style={styles.placedSub}>₹{order.total} · the store has your order</Text></View>
        </View>}
        {!!order.address && <View testID="order-address" style={styles.addressCard}>
          <Icon name="location" size={20} color={colors.forest} />
          <View style={{ flex: 1 }}>
            <Text style={styles.addressTitle}>Delivering to{order.address.label ? `: ${order.address.label}` : ''}</Text>
            <Text style={styles.addressText}>{order.address.text}</Text>
            {!!order.address.notes && <Text testID="order-address-notes" style={styles.addressNotes}>Note for the delivery partner: {order.address.notes}</Text>}
          </View>
        </View>}
        {siblings.length > 0 && <View testID="order-checkout-siblings" style={styles.addressCard}>
          <Icon name="storefront-outline" size={20} color={colors.forest} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.addressTitle}>Paid together with {siblings.length} more store order{siblings.length === 1 ? '' : 's'}</Text>
            {siblings.map(o => <TouchableOpacity key={o.id} testID={`order-sibling-${o.id}`} onPress={() => router.push(`/order/${o.id}` as any)} style={styles.siblingRow}>
              <Text style={styles.addressText} numberOfLines={1}>{o.store_name || 'Store'} · {o.items.length} items · ₹{o.total}</Text>
              <Icon name="chevron-forward" size={16} color={colors.muted} />
            </TouchableOpacity>)}
          </View>
        </View>}
        <VendorNote items={order.items} status={order.status} />
        {/* ETA hero */}
        <View style={styles.etaCard}>
          <View style={styles.etaLeft}>
            <Text style={styles.etaLabel}>SAMPLE DELIVERY COUNTDOWN</Text>
            <Text style={styles.etaTime} testID="eta-time">{mins}:{secs.toString().padStart(2, "0")}</Text>
            <Text testID="tracking-animation-notice" style={styles.etaHint}>Illustrative route · not live GPS</Text>
          </View>
          <View style={styles.dispatchDot}>
            <Icon name="bicycle-outline" size={36} color={colors.forestDeep} />
          </View>
        </View>

        {/* Map illustration */}
        <View style={styles.mapCard} testID="tracking-map">
          <Svg width={MAP_W} height={MAP_H}>
            {/* faux streets background */}
            <Path d={`M 0 ${MAP_H * 0.35} L ${MAP_W} ${MAP_H * 0.35}`} stroke={colors.border} strokeWidth={1} />
            <Path d={`M 0 ${MAP_H * 0.7} L ${MAP_W} ${MAP_H * 0.7}`} stroke={colors.border} strokeWidth={1} />
            <Path d={`M ${MAP_W * 0.3} 0 L ${MAP_W * 0.3} ${MAP_H}`} stroke={colors.border} strokeWidth={1} />
            <Path d={`M ${MAP_W * 0.7} 0 L ${MAP_W * 0.7} ${MAP_H}`} stroke={colors.border} strokeWidth={1} />
            {/* route */}
            <Path d={ROUTE_D} stroke={colors.brandPrimary} strokeWidth={3} strokeDasharray="6 6" fill="none" strokeLinecap="round" />
            {/* store marker */}
            <Circle cx={30} cy={MAP_H - 30} r={10} fill={colors.brandSecondary} />
            <Circle cx={30} cy={MAP_H - 30} r={4} fill={colors.brandPrimary} />
            {/* home marker */}
            <Circle cx={MAP_W - 30} cy={30} r={10} fill={colors.pastelGreen} />
            <Circle cx={MAP_W - 30} cy={30} r={4} fill={colors.onSuccess} />
          </Svg>
          <View style={styles.storeLabel}><Text style={styles.markerText}>Store</Text></View>
          <View style={styles.homeLabel}><Text style={styles.markerText}>You</Text></View>
          {/* rider */}
          <AnimatedView style={[styles.rider, riderStyle]} testID="rider-marker">
            <Icon name="bicycle" size={24} color={colors.forest} />
          </AnimatedView>
        </View>

        {/* Rider card */}
        <View style={styles.riderCard}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{order.rider_name[0]}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.riderName}>{order.rider_name}</Text>
            <Text style={styles.riderMeta}>Your sample delivery partner</Text>
          </View>
          <TouchableOpacity style={styles.callBtn} testID="call-rider-btn" accessibilityLabel="Delivery information" onPress={() => setHelp(!help)}>
            <Icon name="information-circle-outline" size={20} color={colors.onBrandPrimary} />
          </TouchableOpacity>
        </View>
        {help && <Text testID="delivery-help" style={styles.riderMeta}>This is a sample order. No real rider is assigned or available to call.</Text>}

        {/* Timeline */}
        <View style={styles.timeline}>
          <Text style={styles.timelineTitle}>Order status</Text>
          {TIMELINE.map((t, i) => {
            const active = i <= stagePct;
            return (
              <View key={t.key} style={styles.timelineRow}>
                <View style={[styles.timelineDot, active && { backgroundColor: colors.brandPrimary }]}>
                  <Icon name={t.icon} size={14} color={active ? colors.onBrandPrimary : colors.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.timelineLabel, active && { color: colors.onSurface, fontWeight: "800" }]}>{t.label}</Text>
                  {i === stagePct && <Text style={styles.timelineNow}>In progress · just now</Text>}
                </View>
                {i < TIMELINE.length - 1 && <View style={[styles.timelineLine, active && { backgroundColor: colors.brandPrimary }]} />}
              </View>
            );
          })}
        </View>

        {/* Order items */}
        <View style={styles.itemsCard}>
          <Text style={styles.timelineTitle}>Your order · {order.items.length} items</Text>
          {order.items.slice(0, 4).map((i) => (
            <View key={i.id} style={styles.itemRow}>
              <Image source={i.image} style={styles.itemImg} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>{i.name}</Text>
                <Text style={styles.itemMeta}>{i.weight} · x{i.qty}</Text>
              </View>
              <Text style={styles.itemPrice}>₹{i.price * i.qty}</Text>
            </View>
          ))}
          {order.items.length > 4 && (
            <Text style={styles.moreText}>+ {order.items.length - 4} more items</Text>
          )}
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Grand total</Text>
            <Text style={styles.totalValue}>₹{order.total}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace("/(tabs)" as any)} testID="continue-shopping">
          <Text style={styles.homeBtnText}>Continue shopping</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", gap: spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  placed: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: '#050605', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  placedTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  addressCard: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  addressTitle: { fontSize: 14, fontWeight: '800', color: colors.onSurface },
  addressText: { fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 2, flex: 1 },
  addressNotes: { fontSize: 12, color: colors.muted, marginTop: 4 },
  siblingRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  placedSub: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 },
  etaCard: { backgroundColor: colors.brandPrimary, borderRadius: radius.lg, padding: spacing.lg, flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  etaLeft: { flex: 1 },
  etaLabel: { color: "#B8B8B8", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  etaTime: { color: colors.onBrandPrimary, fontSize: 42, fontWeight: "800", marginTop: 4 },
  etaHint: { color: colors.brandSecondary, fontSize: 12, fontWeight: "700", marginTop: 4 },
  dispatchDot: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  dispatchEmoji: { fontSize: 34 },
  mapCard: { width: MAP_W, height: MAP_H, backgroundColor: colors.surface, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  rider: { position: "absolute", width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  storeLabel: { position: "absolute", left: 44, bottom: 20, backgroundColor: colors.brandSecondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  homeLabel: { position: "absolute", right: 44, top: 20, backgroundColor: colors.pastelGreen, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  markerText: { fontSize: 11, fontWeight: "800", color: colors.onSurface },
  riderCard: { marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.pastelYellow, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  riderName: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  riderMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  callBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  timeline: { marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  timelineTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.md },
  timelineRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: 8, position: "relative" },
  timelineDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  timelineLine: { position: "absolute", left: 13, top: 32, width: 2, height: 20, backgroundColor: colors.border },
  timelineLabel: { fontSize: 13, color: colors.muted, marginTop: 4 },
  timelineNow: { fontSize: 11, color: colors.brandPrimary, marginTop: 2, fontWeight: "700" },
  itemsCard: { marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  itemImg: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary },
  itemName: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  itemMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  itemPrice: { fontSize: 13, fontWeight: "800", color: colors.onSurface },
  moreText: { fontSize: 12, color: colors.muted, marginTop: 8 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  totalValue: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  homeBtn: { marginTop: spacing.lg, height: 52, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  homeBtnText: { color: colors.onSurface, fontWeight: "800" },
});
