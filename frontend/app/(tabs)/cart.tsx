import { useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing } from "@/src/theme";
import { useCart } from "@/src/cart";
import { apiPost, Coupon, CouponResult, Order, randomId } from "@/src/api";
import { VendorNote } from '@/src/components/vendor-note';
import { OneSaver } from '@/src/components/one-saver';
import { CheckoutPayment } from '@/src/components/checkout-payment';
import { useCustomer } from '@/src/customer';

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items, add, remove, clear, totalItems, totalPrice, totalMrp } = useCart();
  const { payment } = useCustomer();

  const [couponCode, setCouponCode] = useState("");
  const [applied, setApplied] = useState<Coupon | null>(null);
  const couponDiscount = applied && totalPrice >= applied.min_order ? Math.min(totalPrice, applied.kind === 'flat' ? applied.value : Math.round(totalPrice * applied.value / 100)) : 0;
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [placing, setPlacing] = useState(false);
  const checkoutKey = useRef<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [tab, setTab] = useState<'cart' | 'saver'>('cart');

  const savings = totalMrp - totalPrice;
  const deliveryFee = totalPrice >= 199 || totalPrice === 0 ? 0 : 15;
  const grand = Math.max(totalPrice + deliveryFee - couponDiscount, 0);

  const runCoupon = async (code: string) => {
    if (!code.trim() || applying) return;
    setApplying(true);
    try {
      const res = await apiPost<CouponResult>("/coupons/apply", { code, subtotal: totalPrice });
      if (res.ok && res.coupon) {
        setApplied(res.coupon);
        setCouponCode(code);
        setTab('cart');
        setCouponMsg({ ok: true, text: res.message });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setApplied(null);
        setCouponMsg({ ok: false, text: res.message || "Invalid coupon" });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch {
      setCouponMsg({ ok: false, text: "Could not apply coupon" });
    } finally {
      setApplying(false);
    }
  };
  const applyCoupon = () => runCoupon(couponCode);

  const removeCoupon = () => {
    setApplied(null);
    setCouponCode("");
    setCouponMsg(null);
  };

  const handleCheckout = async () => {
    if (placing || items.length === 0) return;
    setPlacing(true);
    setCheckoutError('');
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // One key per checkout attempt: a retry or double-tap returns the same order.
      checkoutKey.current ??= randomId(16);
      const order = await apiPost<Order>("/orders", {
        items: items.map((i) => ({
          id: i.id, name: i.name, weight: i.weight, price: i.price, mrp: i.mrp, image: i.image, qty: i.qty,
        })),
        subtotal: totalPrice,
        discount: couponDiscount,
        delivery_fee: deliveryFee,
        total: grand,
        coupon_code: couponDiscount > 0 ? applied?.code ?? null : null,
        payment_method: payment,
      }, { "Idempotency-Key": checkoutKey.current });
      checkoutKey.current = null;
      clear();
      setApplied(null);
      setCouponCode("");
      setCouponMsg(null);
      router.replace(`/order/${order.id}` as any);
    } catch {
      setCheckoutError('Could not place your order. Please try again.');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="cart-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.cartTop}><Pressable testID="cart-back" accessibilityLabel="Go back" style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}><Icon name="chevron-back" size={20} color={colors.onSurface} /></Pressable><Text testID="cart-title" style={styles.title}>Your little bag</Text><Text testID="cart-total-items" style={styles.subtitle}>{totalItems} items</Text></View>
        <View testID="cart-tabs" style={styles.tabs}>{[{ id: 'cart', label: 'Cart', icon: 'bag-handle-outline' }, { id: 'saver', label: 'One Saver', icon: 'sparkles-outline' }].map(t => <Pressable key={t.id} testID={`cart-tab-${t.id}`} accessibilityRole="tab" accessibilityState={{ selected: tab === t.id }} onPress={() => setTab(t.id as 'cart' | 'saver')} style={[styles.tab, tab === t.id && styles.selectedTab]}><Icon name={t.icon as any} size={15} color={tab === t.id ? colors.surface : colors.forest} /><Text style={[styles.tabText, tab === t.id && styles.selectedTabText]}>{t.label}</Text></Pressable>)}</View>
      </View>

      {tab === 'saver' ? <OneSaver onApply={code => void runCoupon(code)} applying={applying} /> : items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Icon name="bag-handle-outline" size={64} color={colors.forest} />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySub}>Add fresh items to get started</Text>
          <TouchableOpacity style={styles.browseBtn} onPress={() => router.replace("/(tabs)" as any)} testID="browse-btn">
            <Text style={styles.browseText}>Browse products</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView testID="cart-scroll" style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, paddingBottom: 24 }}>
            <View style={styles.deliveryCard}>
              <Icon name="flash" size={22} color={colors.onSurface} />
              <View style={{ flex: 1 }}>
                <Text testID="cart-delivery-title" style={styles.deliveryTitle}>Your city, at your doorstep</Text>
                <Text testID="cart-delivery-notice" style={styles.deliverySub}>Sample order · estimated 10 min · Latur</Text>
              </View>
            </View>

            {deliveryFee > 0 && (
              <View style={styles.freeHint} testID="free-delivery-hint">
                <Icon name="rocket-outline" size={18} color={colors.onSuccess} />
                <Text style={styles.freeHintText}>Add ₹{Math.max(199 - totalPrice, 0)} more for FREE delivery</Text>
              </View>
            )}

            {/* Items */}
            <View style={styles.card}>
              {items.map((it) => (
                <View key={it.id} style={styles.row}>
                  <Image source={it.image} style={styles.itemImg} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName} numberOfLines={2}>{it.name}</Text>
                    <Text style={styles.itemWeight}>{it.weight}</Text>
                    <Text style={styles.itemPrice}>₹{it.price}</Text>
                  </View>
                  <View style={styles.stepper}>
                    <TouchableOpacity onPress={() => remove(it.id)} style={styles.stepBtn} testID={`cart-dec-${it.id}`}>
                      <Text style={styles.stepText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.stepQty}>{it.qty}</Text>
                    <TouchableOpacity onPress={() => add(it)} style={styles.stepBtn} testID={`cart-inc-${it.id}`}>
                      <Text style={styles.stepText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            {/* Coupon */}
            <View style={[styles.card, { marginTop: spacing.md }]}>
              <View style={styles.couponHead}>
                <Icon name="pricetag-outline" size={18} color={colors.onSurface} />
                <Text style={styles.billTitle}>Apply Coupon</Text>
              </View>
              {applied ? (
                <View style={styles.appliedRow} testID="applied-coupon">
                  <View style={styles.appliedPill}>
                    <Icon name="checkmark-circle" size={16} color={colors.onSuccess} />
                    <Text style={styles.appliedText}>{applied.code} · {applied.label}</Text>
                  </View>
                  <TouchableOpacity onPress={removeCoupon} testID="remove-coupon">
                    <Text style={styles.removeCoupon}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.couponRow}>
                  <TextInput
                    value={couponCode}
                    onChangeText={setCouponCode}
                    placeholder="Enter code (try LATUR10)"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="characters"
                    onSubmitEditing={applyCoupon}
                    returnKeyType="done"
                    style={styles.couponInput}
                    testID="coupon-input"
                  />
                  <TouchableOpacity style={styles.applyBtn} onPress={applyCoupon} disabled={applying} testID="apply-coupon-btn">
                    <Text style={styles.applyText}>{applying ? 'Applying…' : 'Apply'}</Text>
                  </TouchableOpacity>
                </View>
              )}
              {couponMsg && (
                <Text style={[styles.couponMsg, { color: couponMsg.ok ? colors.onSuccess : colors.onError }]} testID="coupon-msg">
                  {couponMsg.text}
                </Text>
              )}
              {applied && totalPrice < applied.min_order && <Text testID="coupon-minimum-warning" style={styles.couponMsg}>Add ₹{applied.min_order - totalPrice} more to reactivate this coupon.</Text>}
              <View style={{ marginTop: spacing.sm, gap: 6 }}>
                <TouchableOpacity testID="coupon-suggestion-latur10" onPress={() => setCouponCode("LATUR10")}>
                  <Text style={styles.hint}>LATUR10 — 10% off above ₹99</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="coupon-suggestion-fresh50" onPress={() => setCouponCode("FRESH50")}>
                  <Text style={styles.hint}>FRESH50 — ₹50 off above ₹199</Text>
                </TouchableOpacity>
              </View>
            </View>

            <CheckoutPayment />
            {/* Bill details */}
            <View style={[styles.card, { marginTop: spacing.md }]}>
              <Text style={styles.billTitle}>Bill Details</Text>
              <BillRow label="Items total" value={`₹${totalMrp}`} strike />
              <BillRow label="MRP savings" value={`− ₹${savings}`} success />
              {couponDiscount > 0 && (
                <BillRow label={`Coupon ${applied?.code ?? ""}`} value={`− ₹${couponDiscount}`} success />
              )}
              <BillRow label="Delivery fee" value={deliveryFee === 0 ? "FREE" : `₹${deliveryFee}`} success={deliveryFee === 0} />
              <View style={styles.divider} />
              <BillRow label="Grand total" value={`₹${grand}`} strong />
              {(savings + couponDiscount) > 0 && (
                <View style={styles.savings}>
                  <Text testID="cart-order-savings" style={styles.savingsText}>You save ₹{savings + couponDiscount} on this order</Text>
                </View>
              )}
            </View>
          </ScrollView>

          {!!checkoutError && <Text testID="checkout-error" style={{ color: colors.onError, padding: 12 }}>{checkoutError}</Text>}
          <VendorNote items={items} />
          <View testID="checkout-footer" style={[styles.checkoutBar, { marginBottom: 12, marginHorizontal: spacing.lg }]}>
            <View style={{ flex: 1 }}>
              <Text testID="checkout-total" style={styles.checkoutTotal}>₹{grand}</Text>
              <Text testID="checkout-payment-notice" style={styles.checkoutMeta}>Sample order · no charge</Text>
            </View>
            <TouchableOpacity style={styles.checkoutBtn} onPress={handleCheckout} testID="checkout-btn" disabled={placing}>
              {placing && <ActivityIndicator color={colors.forest} />}<Text style={styles.checkoutText}>{placing ? "Placing..." : "Place sample order"}</Text>
              {!placing && <Icon name="arrow-forward" size={16} color={colors.onBrandSecondary} />}
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

function BillRow({ label, value, strong, success, strike }: { label: string; value: string; strong?: boolean; success?: boolean; strike?: boolean }) {
  return (
    <View style={billStyles.row}>
      <Text style={[billStyles.label, strong && billStyles.strong]}>{label}</Text>
      <Text style={[
        billStyles.value,
        strong && billStyles.strong,
        success && { color: colors.onSuccess },
        strike && { textDecorationLine: "line-through", color: colors.muted },
      ]}>{value}</Text>
    </View>
  );
}

const billStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  label: { fontSize: 13, color: colors.onSurfaceSecondary },
  value: { fontSize: 13, color: colors.onSurface, fontWeight: "600" },
  strong: { fontWeight: "800", fontSize: 15, color: colors.onSurface },
});

const styles = StyleSheet.create({
  cartTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream }, tabs: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, padding: 4, borderRadius: 28, marginTop: 10 }, tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, borderRadius: 24 }, selectedTab: { backgroundColor: colors.forestDeep }, tabText: { color: colors.forest, fontSize: 12, fontWeight: '600' }, selectedTabText: { color: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 20, fontWeight: "700", color: colors.onSurface, flex: 1 },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyEmoji: { fontSize: 64, marginBottom: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  emptySub: { fontSize: 13, color: colors.muted, marginTop: 4 },
  browseBtn: { marginTop: spacing.lg, backgroundColor: colors.brandPrimary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.pill },
  browseText: { color: colors.onBrandPrimary, fontWeight: "700" },
  deliveryCard: { backgroundColor: colors.limeSoft, borderRadius: radius.md, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  deliveryTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  deliverySub: { fontSize: 12, color: colors.onSurfaceSecondary, marginTop: 2 },
  freeHint: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.pastelGreen, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md },
  freeHintText: { color: colors.onSuccess, fontSize: 13, fontWeight: "700" },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "center", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  itemImg: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary },
  itemName: { fontSize: 13, fontWeight: "600", color: colors.onSurface },
  itemWeight: { fontSize: 11, color: colors.muted, marginTop: 2 },
  itemPrice: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginTop: 4 },
  stepper: { flexDirection: "row", alignItems: "center", backgroundColor: colors.brandPrimary, borderRadius: radius.sm, overflow: "hidden" },
  stepBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 14 },
  stepQty: { color: colors.onBrandPrimary, fontWeight: "700", minWidth: 18, textAlign: "center" },
  billTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm },
  savings: { marginTop: spacing.sm, backgroundColor: colors.pastelGreen, padding: spacing.sm, borderRadius: radius.sm },
  savingsText: { color: colors.onSuccess, fontSize: 12, fontWeight: "700" },
  couponHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  couponRow: { flexDirection: "row", gap: spacing.sm },
  couponInput: { flex: 1, height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
  applyBtn: { paddingHorizontal: 18, height: 48, borderRadius: radius.sm, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  applyText: { color: colors.onBrandPrimary, fontWeight: "800" },
  couponMsg: { marginTop: spacing.sm, fontSize: 12, fontWeight: "700" },
  appliedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.sm, backgroundColor: colors.pastelGreen, borderRadius: radius.sm },
  appliedPill: { flexDirection: "row", alignItems: "center", gap: 6 },
  appliedText: { color: colors.onSuccess, fontWeight: "800", fontSize: 13 },
  removeCoupon: { color: colors.onError, fontWeight: "700", fontSize: 12 },
  hint: { color: colors.muted, fontSize: 11 },
  checkoutBar: { backgroundColor: colors.brandPrimary, borderRadius: radius.lg, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md },
  checkoutTotal: { color: colors.onBrandPrimary, fontSize: 18, fontWeight: "800" },
  checkoutMeta: { color: colors.onSurfaceInverse, fontSize: 8, marginTop: 2 },
  checkoutBtn: { backgroundColor: colors.brandSecondary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", gap: 6 },
  checkoutText: { color: colors.onBrandSecondary, fontWeight: "700", fontSize: 11 },
});
