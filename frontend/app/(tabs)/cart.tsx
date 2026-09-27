// The cart. Two carts share this screen (src/cart.tsx): Food (one restaurant) and Shopping (any
// stores, shown grouped by store and split by the server into one order per store). When both have
// items a switch at the top picks which one to pay for; they are paid separately.
// Pay needs, in this order: where to deliver (the address row at the top), a signed-in customer
// (sign-in opens and then brings them back here to carry on paying), and how to pay. Browsing and
// filling the cart never need an account.
import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useIsFocused, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing } from "@/src/theme";
import { CartKind, useCart } from "@/src/cart";
import { apiGet, apiPost, Bill, Checkout, Coupon, CouponResult, PaymentResult, PaymentStart, randomId } from "@/src/api";
import { VendorNote } from '@/src/components/vendor-note';
import { OneSaver } from '@/src/components/one-saver';
import { CheckoutPayment } from '@/src/components/checkout-payment';
import { PaymentChoice, PaymentSheet } from '@/src/components/payment-sheet';
import { RazorpayCheckout } from '@/src/components/razorpay-checkout';
import { paymentLabel } from '@/src/components/payment-options';
import { useFeatures } from '@/src/features';
import { useCustomer } from '@/src/customer';
import { useDeliveryLocation } from '@/src/delivery-location';
import { addressText } from '@/src/places';
import { accessToken, supabase } from '@/src/lib/supabase';
import { scheduleOrderJourney } from '@/src/native/ios-extras';
import { CornerGlow } from '@/src/components/corner-glow';
import { OneLottie } from '@/src/components/one-lottie';

// Pay tapped while signed out: kept outside the screen (so it survives the screen being rebuilt)
// until the customer is back from sign-in, then paid with automatically.
let payAfterSignIn: PaymentChoice | null = null;

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const focused = useIsFocused();
  const { carts, kind, setKind, add, remove, clear } = useCart();
  const items = carts[kind];
  const other: CartKind = kind === 'food' ? 'shopping' : 'food';
  const both = carts.food.length > 0 && carts.shopping.length > 0;
  // An emptied cart gives way to the other one when that has items.
  useEffect(() => { if (!items.length && carts[other].length) setKind(other); }, [items.length, carts, other, setKind]);
  const totalItems = items.reduce((n, i) => n + i.qty, 0);
  const totalPrice = items.reduce((n, i) => n + i.qty * i.price, 0);
  const { payment, upiApp, profile, update, addresses } = useCustomer();
  const { online_payments } = useFeatures();
  // With online payments off, everything below the `online` checks is skipped and checkout is
  // cash on delivery exactly as before.
  const choice: PaymentChoice = { method: online_payments ? payment : 'cod', app: upiApp };
  const [sheet, setSheet] = useState(false);
  type Attempt = { start: PaymentStart; choice: PaymentChoice; basket: string; kind: CartKind };
  const [session, setSession] = useState<Attempt | null>(null);  // Razorpay Checkout is open
  const [unpaid, setUnpaid] = useState<Attempt | null>(null);    // the last online attempt did not go through

  // Where to deliver: the place chosen in the header (useDeliveryLocation). "Home: 12 MG Road, …"
  // splits into its label and address; a saved address also brings its delivery instructions.
  const { location, point, edit } = useDeliveryLocation();
  const saved = addresses.find(a => addressText(a) === location);
  const cut = location.indexOf(': ');
  const label = saved?.label ?? (cut > 0 && cut <= 40 ? location.slice(0, cut) : '');
  const addressLine = cut > 0 && cut <= 40 ? location.slice(cut + 2) : location;
  // Deliverable once there is a map point or a saved address; the starting "Latur, Maharashtra" is neither.
  const hasAddress = !!point || !!saved;
  const [notes, setNotes] = useState('');
  useEffect(() => { setNotes(saved?.instructions ?? ''); }, [location]); // eslint-disable-line react-hooks/exhaustive-deps
  const [needAddress, setNeedAddress] = useState(false);
  useEffect(() => { if (hasAddress) setNeedAddress(false); }, [hasAddress]);

  const [couponCode, setCouponCode] = useState("");
  const [applied, setApplied] = useState<Coupon | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [placing, setPlacing] = useState(false);
  const checkoutKey = useRef<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [tab, setTab] = useState<'cart' | 'saver'>('cart');
  const [showTaxes, setShowTaxes] = useState(false);

  // Every number on this screen comes from the server's bill, so the cart can never show a total
  // that checkout would then refuse. Re-quoted (debounced) whenever the cart or coupon changes.
  const [bill, setBill] = useState<Bill | null>(null);
  const [billError, setBillError] = useState('');
  useEffect(() => { setBill(null); setBillError(''); }, [kind]);
  const cartKey = `${kind}:${items.map(i => `${i.id}x${i.qty}`).join(',')}`;
  useEffect(() => {
    if (!items.length) { setBill(null); return; }
    let live = true;
    const timer = setTimeout(() => {
      apiPost<Bill>('/cart/quote', { items: items.map(i => ({ id: i.id, qty: i.qty })), coupon_code: applied?.code ?? null })
        .then(b => { if (live) { setBill(b); setBillError(''); } })
        .catch(e => { if (live) setBillError(e instanceof Error ? e.message : 'Could not work out your bill.'); });
    }, 200);
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, applied?.code]);
  // A changed cart or address is a new checkout: the old attempt is forgotten (an unpaid one never
  // becomes an order).
  const basket = `${cartKey}|${applied?.code ?? ''}|${location}|${point ? `${point.lat},${point.lng}` : ''}|${notes.trim()}`;
  const checkoutFor = useRef(basket);
  const failed = unpaid?.basket === basket ? unpaid : null;
  const couponDiscount = bill?.discount ?? 0;
  const deliveryFee = bill?.delivery_fee ?? 0;
  const grand = bill?.total ?? totalPrice;
  const rupees = (n: number) => `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;

  // The cart's items by store, in cart order; each store's own bill joins in once the quote is back.
  const groups = useMemo(() => [...new Set(items.map(i => i.store_id ?? ''))].map(id => ({
    id, items: items.filter(i => (i.store_id ?? '') === id), bill: bill?.groups?.find(g => g.store_id === id),
  })), [items, bill]);

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

  const orderBody = (method: string) => ({
    items: items.map((i) => ({
      id: i.id, name: i.name, weight: i.weight, price: i.price, mrp: i.mrp, image: i.image, qty: i.qty,
    })),
    subtotal: bill?.item_total ?? totalPrice,
    discount: couponDiscount,
    delivery_fee: deliveryFee,
    total: grand,
    coupon_code: couponDiscount > 0 ? applied?.code ?? null : null,
    payment_method: method,
    address: { label, text: addressLine, lat: point?.lat ?? null, lng: point?.lng ?? null, notes: notes.trim() },
  });
  // Paid (or placed): that cart empties and the first store order opens (it lists the others).
  const done = (orderId: string, paid: CartKind, placedAt = Date.now()) => {
    checkoutKey.current = null;
    setUnpaid(null);
    // Order updates as notifications (asks permission here, in context). No-op on the web.
    void scheduleOrderJourney(orderId, placedAt);
    clear(paid);
    setApplied(null);
    setCouponCode("");
    setCouponMsg(null);
    router.replace(`/order/${orderId}` as any);
  };
  const say = (e: unknown, fallback: string) => setCheckoutError(e instanceof Error && !e.message.startsWith('API ') ? e.message : fallback);

  const handleCheckout = async (pick: PaymentChoice = choice) => {
    if (placing || items.length === 0 || !bill) return;
    setCheckoutError('');
    // 1. Where to deliver.
    if (!hasAddress) { setSheet(false); setNeedAddress(true); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); return; }
    // 2. A signed-in customer (when this build has sign-in at all). The cart stays saved on the
    //    phone; once they are back from sign-in this screen carries on paying by itself.
    if (supabase && !(await accessToken())) { payAfterSignIn = pick; setSheet(false); router.push('/sign-in?next=checkout' as never); return; }
    setPlacing(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Remember the way they paid, so it is the Preferred Payment next time.
      if (online_payments && (pick.method !== payment || pick.app !== upiApp)) void update({ payment: pick.method, upiApp: pick.app }).catch(() => {});
      setSheet(false);
      // One key per checkout attempt: a retry or double-tap returns the same checkout.
      if (checkoutFor.current !== basket) { checkoutKey.current = null; checkoutFor.current = basket; }
      checkoutKey.current ??= randomId(16);
      if (online_payments && pick.method !== 'cod') {
        // Online: the server saves the checkout as unpaid and opens one Razorpay order for its own total.
        const start = await apiPost<PaymentStart>('/payments/order', {
          ...orderBody(pick.method), upi_app: pick.method === 'upi' ? pick.app ?? null : null,
          prefill: { name: profile.name, email: profile.email, contact: profile.phone },
        }, { "Idempotency-Key": checkoutKey.current });
        if (start.payment_status === 'paid') return done(start.order_id, kind);
        setUnpaid(null);
        setSession({ start, choice: pick, basket, kind });
        return;
      }
      if (online_payments && failed) {
        // "Choose another way to pay" after a failed attempt: the same checkout becomes cash on delivery.
        const r = await apiPost<{ order_id: string }>('/payments/cod', { checkout_id: failed.start.checkout_id });
        return done(r.order_id, failed.kind);
      }
      const checkout = await apiPost<Checkout>("/checkouts", orderBody(payment), { "Idempotency-Key": checkoutKey.current });
      done(checkout.orders[0].id, kind, new Date(checkout.created_at).getTime());
    } catch (e) {
      say(e, 'Could not place your order. Please try again.');
    } finally {
      setPlacing(false);
    }
  };

  // Back from sign-in: carry on paying with what they picked — only on this visit to the screen, and
  // only if they did sign in. The latest handleCheckout is used, so it sees the bill as it is now.
  const pay = useRef(handleCheckout); pay.current = handleCheckout;
  const resume = useRef<PaymentChoice | null>(null);
  useEffect(() => {
    if (!focused) { resume.current = null; return; }
    if (payAfterSignIn) { resume.current = payAfterSignIn; payAfterSignIn = null; }
  }, [focused]);
  useEffect(() => {
    const pick = resume.current;
    if (!focused || !pick || !bill) return;
    resume.current = null;
    void accessToken().then(token => { if (token) void pay.current(pick); });
  }, [focused, bill]);

  // Razorpay answered. Success is only trusted after the server checks Razorpay's signature.
  const onPaymentResult = async (result: PaymentResult) => {
    const current = session;
    setSession(null);
    if (!current) return;
    setPlacing(true);
    setCheckoutError('');
    try {
      if (result.type === 'success') {
        await apiPost('/payments/verify', { checkout_id: current.start.checkout_id, ...result });
        return done(current.start.order_id, current.kind);
      }
      // Closed or failed — but a slow UPI payment may still have landed (the webhook marks it paid).
      const checkout = await apiGet<Checkout>(`/checkouts/${current.start.checkout_id}`).catch(() => null);
      if (checkout?.payment_status === 'paid') return done(current.start.order_id, current.kind);
      setUnpaid(current);
    } catch (e) {
      say(e, 'We could not confirm your payment. If money was taken, it will be matched to your order or refunded.');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.surfaceSecondary }} testID="cart-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.cartTop}><Pressable testID="cart-back" accessibilityLabel="Go back" style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}><Icon name="chevron-back" size={20} color={colors.onSurface} /></Pressable><Text testID="cart-title" style={styles.title}>Your little bag</Text><Text testID="cart-total-items" style={styles.subtitle}>{totalItems} items</Text></View>
        {both && <>
          <View testID="cart-kinds" accessibilityRole="tablist" style={styles.kinds}>
            {(['food', 'shopping'] as const).map(k => <Pressable key={k} testID={`cart-kind-${k}`} accessibilityRole="tab" accessibilityState={{ selected: kind === k }} onPress={() => setKind(k)} style={[styles.kind, kind === k && styles.kindOn]}>
              <Icon name={k === 'food' ? 'restaurant-outline' : 'bag-handle-outline'} size={15} color={kind === k ? colors.surface : colors.forest} />
              <Text style={[styles.kindText, kind === k && styles.kindTextOn]}>{k === 'food' ? 'Food' : 'Shopping'} · {carts[k].reduce((n, i) => n + i.qty, 0)}</Text>
            </Pressable>)}
          </View>
          <Text style={styles.kindNote}>Food and shopping are paid for separately.</Text>
        </>}
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
            {/* Where it goes: tap to change (the location screen) */}
            <Pressable testID="cart-address" accessibilityRole="button" accessibilityLabel={hasAddress ? `Deliver to ${label || ''} ${addressLine}. Change address` : 'Choose where to deliver'} onPress={edit} style={[styles.deliveryCard, needAddress && styles.deliveryCardAsk]}>
              <Icon name={hasAddress ? 'location' : 'location-outline'} size={22} color={colors.onSurface} />
              <View style={{ flex: 1 }}>
                {hasAddress
                  ? <Text testID="cart-delivery-title" style={styles.deliverySub} numberOfLines={2}><Text style={styles.deliveryTitle}>Deliver to{label ? `: ${label}` : ''}</Text> · {addressLine}</Text>
                  : <><Text testID="cart-delivery-title" style={styles.deliveryTitle}>Where should we deliver?</Text><Text style={styles.deliverySub}>Choose your address before you pay</Text></>}
              </View>
              <Icon name="chevron-down" size={18} color={colors.onSurface} />
            </Pressable>
            <TextInput testID="cart-delivery-notes" value={notes} onChangeText={setNotes} maxLength={300} placeholder="Instructions for the delivery partner (optional)" placeholderTextColor={colors.muted} style={styles.notes} />

            {/* One card per store (a food cart is one restaurant) */}
            {groups.map((g, index) => {
              const gb = g.bill;
              const id = (name: string) => (index === 0 ? name : `${name}-${g.id}`);
              return <View key={g.id || 'store'} style={[styles.card, { marginBottom: spacing.md }]} testID={`cart-store-${g.id}`}>
                <View style={styles.storeHead}>
                  {!!gb?.store_logo && <Image source={gb.store_logo} style={styles.storeLogo} contentFit="cover" />}
                  <View style={{ flex: 1 }}>
                    <Text testID={id('cart-store-name')} style={styles.storeName} numberOfLines={1}>{gb?.store_name ?? (kind === 'food' ? 'Your restaurant' : 'Store')}</Text>
                    {!!gb && <Text style={styles.storeMeta}>{gb.delivery_time ? `Delivery in about ${gb.delivery_time} · ` : ''}{gb.delivery_fee === 0 ? 'free delivery' : `delivery ${rupees(gb.delivery_fee)}`}</Text>}
                  </View>
                  {!!gb && groups.length > 1 && <Text testID={id('cart-store-subtotal')} style={styles.storeSubtotal}>{rupees(gb.item_total)}</Text>}
                </View>
                {g.items.map((it) => (
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
                {!!gb && gb.amount_to_free_delivery > 0 && (
                  <View style={styles.topUp} testID={id('free-delivery-hint')}>
                    <View style={styles.topUpHead}>
                      <View style={styles.topUpIcon}><Icon name="rocket" size={16} color="#050605" /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.topUpTitle}>{rupees(gb.amount_to_free_delivery)} away from free delivery{groups.length > 1 ? ` from ${gb.store_name}` : ''}</Text>
                        <Text style={styles.topUpSub}>{gb.top_ups.length ? 'Smart top-up · one tap closes the gap' : `Free on orders above ₹${bill?.free_delivery_from ?? 199} from one store`}</Text>
                      </View>
                    </View>
                    {gb.top_ups.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topUpRail} testID={id('smart-top-up')}>
                      {gb.top_ups.map(p => <View key={p.id} style={styles.topUpCard} testID={`top-up-${p.id}`}>
                        <Image source={p.image} style={styles.topUpImg} contentFit="cover" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.topUpName} numberOfLines={1}>{p.name}</Text>
                          <Text style={styles.topUpPrice}>₹{p.price} <Text style={styles.topUpNet}>· ₹{p.net} net</Text></Text>
                        </View>
                        <Pressable testID={`top-up-add-${p.id}`} accessibilityLabel={`Add ${p.name} for ₹${p.price} and unlock free delivery`} onPress={() => { add(p); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }} style={styles.topUpAdd}><Icon name="add" size={18} color={colors.electricLime} /></Pressable>
                      </View>)}
                    </ScrollView>}
                  </View>
                )}
                {!!gb && gb.amount_to_free_delivery === 0 && gb.delivery_fee === 0 && (
                  <View style={styles.freeHint} testID={id('free-delivery-unlocked')}>
                    <Icon name="checkmark-circle" size={18} color={colors.onSuccess} />
                    <Text style={styles.freeHintText}>Free delivery unlocked · you save ₹{gb.delivery_fee_before_waiver}</Text>
                  </View>
                )}
              </View>;
            })}

            {/* Coupon */}
            <View style={styles.card}>
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
              {applied && totalPrice >= applied.min_order && bill?.coupon && !bill.coupon.ok && <Text testID="coupon-not-usable" style={[styles.couponMsg, { color: colors.onError }]}>{bill.coupon.message}</Text>}
              <View style={{ marginTop: spacing.sm, gap: 6 }}>
                <TouchableOpacity testID="coupon-suggestion-latur10" onPress={() => setCouponCode("LATUR10")}>
                  <Text style={styles.hint}>LATUR10 — 10% off above ₹99</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="coupon-suggestion-fresh50" onPress={() => setCouponCode("FRESH50")}>
                  <Text style={styles.hint}>FRESH50 — ₹50 off above ₹199</Text>
                </TouchableOpacity>
              </View>
            </View>

            {!online_payments && <CheckoutPayment />}
            {/* Bill details — straight from the server's quote (server/pricing.ts) */}
            <View style={[styles.card, { marginTop: spacing.md, overflow: 'hidden' }]} testID="bill-details">
              <CornerGlow color={colors.lime} corner="top-right" size={240} strength={0.2} />
              <Text style={styles.billTitle}>Bill details</Text>
              {!bill ? (
                billError ? <Text testID="bill-error" style={[styles.couponMsg, { color: colors.onError }]}>{billError}</Text>
                  : <OneLottie testID="bill-loading" name="neon-loader" size={56} loop style={{ alignSelf: 'center' }} />
              ) : <>
                <BillRow testID="bill-items" label="Item total" value={rupees(bill.item_total)} was={bill.mrp_savings > 0 ? rupees(bill.item_mrp_total) : undefined} />
                {bill.groups.length > 1
                  ? <BillRow testID="bill-delivery" label={`Delivery fee · ${bill.groups.length} stores`} value={bill.delivery_fee === 0 ? 'FREE' : rupees(bill.delivery_fee)} success={bill.delivery_fee === 0}
                      note={`Each store delivers on its own · ${bill.groups.map(g => `${g.store_name} ${g.delivery_fee ? rupees(g.delivery_fee) : 'free'}`).join(' · ')}`} />
                  : <BillRow testID="bill-delivery" label="Delivery fee" value={bill.delivery_fee === 0 ? 'FREE' : rupees(bill.delivery_fee)} was={bill.delivery_fee === 0 ? rupees(bill.delivery_fee_before_waiver) : undefined} success={bill.delivery_fee === 0}
                      note={bill.delivery_fee === 0 ? `Free on orders above ₹${bill.free_delivery_from}` : `Free above ₹${bill.free_delivery_from}`} />}
                {bill.handling_fee > 0 && <BillRow testID="bill-handling" label="Handling fee" value={rupees(bill.handling_fee)} />}
                {bill.platform_fee > 0 && <BillRow testID="bill-platform" label="Platform fee" value={rupees(bill.platform_fee)} />}
                {bill.gst_added.total > 0 && <>
                  <Pressable testID="bill-gst-toggle" accessibilityRole="button" accessibilityState={{ expanded: showTaxes }} onPress={() => setShowTaxes(v => !v)}>
                    <BillRow label={`GST on food (${bill.gst_added.rate}%)`} value={rupees(bill.gst_added.total)} note={showTaxes ? 'Hide breakdown' : 'CGST + SGST · tap for breakdown'} />
                  </Pressable>
                  {showTaxes && <View style={styles.taxBox} testID="bill-gst-breakdown">
                    <BillRow small label={`CGST ${bill.gst_added.rate / 2}% on ${rupees(bill.gst_added.taxable)}`} value={rupees(bill.gst_added.cgst)} />
                    <BillRow small label={`SGST ${bill.gst_added.rate / 2}% on ${rupees(bill.gst_added.taxable)}`} value={rupees(bill.gst_added.sgst)} />
                  </View>}
                </>}
                {bill.discount > 0 && <BillRow testID="bill-coupon" label={`Coupon ${bill.coupon?.code ?? ''}`} value={`− ${rupees(bill.discount)}`} success />}
                <View style={styles.divider} />
                <BillRow testID="bill-total" label="To pay" value={rupees(bill.total)} strong note={bill.groups.length > 1 ? `One payment · ${bill.groups.length} store orders` : undefined} />
                {bill.gst_included.length > 0 && <Pressable testID="bill-included-toggle" onPress={() => setShowTaxes(v => !v)} style={{ marginTop: spacing.sm }}>
                  <Text style={styles.hint}>Item prices include GST{showTaxes ? ':' : ' · tap to see how much'}</Text>
                  {showTaxes && bill.gst_included.map(t => <BillRow small key={t.rate} label={`${t.rate}% items — CGST ${t.rate / 2}% + SGST ${t.rate / 2}%`} value={rupees(t.cgst + t.sgst)} />)}
                </Pressable>}
                {bill.total_savings > 0 && (
                  <View style={styles.savings}>
                    <Text testID="cart-order-savings" style={styles.savingsText}>You save {rupees(bill.total_savings)} on this order</Text>
                  </View>
                )}
              </>}
            </View>
          </ScrollView>

          {!!checkoutError && <Text testID="checkout-error" style={{ color: colors.onError, padding: 12 }}>{checkoutError}</Text>}
          {needAddress && <View testID="checkout-need-address" style={styles.ask}>
            <Icon name="location" size={20} color={colors.forest} />
            <View style={{ flex: 1 }}>
              <Text style={styles.askTitle}>Where should we deliver?</Text>
              <Text style={styles.askText}>Choose your address first, so the store knows where to send your order.</Text>
            </View>
            <TouchableOpacity testID="checkout-choose-address" onPress={edit} style={styles.askBtn}><Text style={styles.askBtnText}>Choose</Text></TouchableOpacity>
          </View>}
          {!!failed && !placing && <View testID="payment-retry" style={styles.retry}>
            <Icon name="alert-circle" size={20} color={colors.onError} />
            <View style={{ flex: 1 }}>
              <Text style={styles.retryText}>Payment didn’t go through. No money was taken. Try again or choose another way to pay.</Text>
              <View style={styles.retryActions}>
                <TouchableOpacity testID="payment-retry-again" onPress={() => handleCheckout(failed.choice)} style={styles.retryBtn}><Text style={styles.retryBtnText}>Try again</Text></TouchableOpacity>
                <TouchableOpacity testID="payment-retry-other" onPress={() => setSheet(true)} style={[styles.retryBtn, styles.retryBtnGhost]}><Text style={[styles.retryBtnText, { color: colors.forest }]}>Another way to pay</Text></TouchableOpacity>
              </View>
            </View>
          </View>}
          <VendorNote items={items} />
          {online_payments ? (
            // Online payments live: "PAY USING" opens Payment Options; the big button pays with it.
            <View testID="checkout-footer" style={[styles.payBar, { marginBottom: 12, marginHorizontal: spacing.lg }]}>
              <Pressable testID="checkout-pay-using" accessibilityRole="button" accessibilityLabel="Choose how to pay" onPress={() => setSheet(true)} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
                <Text style={styles.payUsing}>PAY USING <Icon name="caret-up" size={10} color={colors.muted} /></Text>
                <Text testID="checkout-selected-payment" numberOfLines={1} style={styles.payMethod}>{paymentLabel(choice.method, choice.method === 'upi' ? choice.app : undefined)}</Text>
              </Pressable>
              <TouchableOpacity style={styles.payNow} onPress={() => handleCheckout()} testID="checkout-btn" disabled={placing || !bill || !!session}>
                {placing ? <ActivityIndicator color={colors.onBrandSecondary} /> : <Text style={styles.payNowText}>{choice.method === 'cod' ? `Place order · ₹${grand}` : `Pay ₹${grand}`}</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <View testID="checkout-footer" style={[styles.checkoutBar, { marginBottom: 12, marginHorizontal: spacing.lg }]}>
              <View style={{ flex: 1 }}>
                <Text testID="checkout-total" style={styles.checkoutTotal}>₹{grand}</Text>
                <Text testID="checkout-payment-notice" style={styles.checkoutMeta}>Sample order · no charge</Text>
              </View>
              <TouchableOpacity style={styles.checkoutBtn} onPress={() => handleCheckout()} testID="checkout-btn" disabled={placing}>
                {placing && <ActivityIndicator color={colors.forest} />}<Text style={styles.checkoutText}>{placing ? "Placing..." : "Place sample order"}</Text>
                {!placing && <Icon name="arrow-forward" size={16} color={colors.onBrandSecondary} />}
              </TouchableOpacity>
            </View>
          )}
          {online_payments && sheet && <PaymentSheet onClose={() => setSheet(false)} choice={choice} onPay={pick => handleCheckout(pick)} paying={placing}
            itemCount={totalItems} total={grand} savings={bill?.total_savings ?? 0} />}
          {!!session && <RazorpayCheckout session={session.start} method={session.choice.method} app={session.choice.app} onResult={onPaymentResult} />}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

function BillRow({ label, value, strong, success, was, note, small, testID }: { label: string; value: string; strong?: boolean; success?: boolean; was?: string; note?: string; small?: boolean; testID?: string }) {
  return (
    <View style={billStyles.row} testID={testID}>
      <View style={{ flex: 1 }}>
        <Text style={[billStyles.label, strong && billStyles.strong, small && billStyles.small]}>{label}</Text>
        {!!note && <Text style={billStyles.note}>{note}</Text>}
      </View>
      <View style={billStyles.values}>
        {!!was && <Text style={billStyles.was}>{was}</Text>}
        <Text style={[billStyles.value, strong && billStyles.strong, small && billStyles.small, success && { color: colors.onSuccess }]}>{value}</Text>
      </View>
    </View>
  );
}

const billStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: 'flex-start', marginTop: spacing.sm, gap: spacing.md },
  label: { fontSize: 13, color: colors.onSurfaceSecondary },
  note: { fontSize: 11, color: colors.muted, marginTop: 1 },
  values: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  was: { fontSize: 11, color: colors.muted, textDecorationLine: 'line-through' },
  value: { fontSize: 13, color: colors.onSurface, fontWeight: "600" },
  small: { fontSize: 11 },
  strong: { fontWeight: "800", fontSize: 15, color: colors.onSurface },
});

const styles = StyleSheet.create({
  cartTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream }, tabs: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, padding: 4, borderRadius: 28, marginTop: 10 }, tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, borderRadius: 24 }, selectedTab: { backgroundColor: colors.forestDeep }, tabText: { color: colors.forest, fontSize: 12, fontWeight: '600' }, selectedTabText: { color: colors.surface },
  kinds: { flexDirection: 'row', gap: spacing.sm, marginTop: 10 },
  kind: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.forest },
  kindOn: { backgroundColor: colors.forest },
  kindText: { color: colors.forest, fontSize: 13, fontWeight: '700' },
  kindTextOn: { color: colors.surface },
  kindNote: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 6 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 20, fontWeight: "700", color: colors.onSurface, flex: 1 },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 2 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyEmoji: { fontSize: 64, marginBottom: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  emptySub: { fontSize: 13, color: colors.muted, marginTop: 4 },
  browseBtn: { marginTop: spacing.lg, backgroundColor: colors.brandPrimary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.pill },
  browseText: { color: colors.onBrandPrimary, fontWeight: "700" },
  deliveryCard: { backgroundColor: colors.limeSoft, borderRadius: radius.md, padding: spacing.md, minHeight: 56, flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: colors.limeSoft },
  deliveryCardAsk: { borderColor: colors.forest },
  deliveryTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  deliverySub: { fontSize: 13, color: colors.onSurfaceSecondary, marginTop: 2, lineHeight: 19 },
  notes: { minHeight: 44, marginTop: spacing.sm, marginBottom: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.onSurface, fontSize: 13 },
  storeHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  storeLogo: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSecondary },
  storeName: { fontSize: 15, fontWeight: '800', color: colors.onSurface },
  storeMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  storeSubtotal: { fontSize: 14, fontWeight: '800', color: colors.onSurface },
  freeHint: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.pastelGreen, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.md },
  topUp: { backgroundColor: '#050605', borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  topUpHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  topUpIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.electricLime, alignItems: 'center', justifyContent: 'center' },
  topUpTitle: { color: colors.surface, fontSize: 14, fontWeight: '800' },
  topUpSub: { color: colors.electricLime, fontSize: 11, fontWeight: '600', marginTop: 2 },
  topUpRail: { gap: 8, marginTop: spacing.md },
  topUpCard: { width: 236, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)' },
  topUpImg: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surface },
  topUpName: { color: colors.surface, fontSize: 12, fontWeight: '700' },
  topUpPrice: { color: colors.surface, fontSize: 12, fontWeight: '800', marginTop: 2 },
  topUpNet: { color: 'rgba(255,255,255,0.6)', fontWeight: '600', fontSize: 11 },
  topUpAdd: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: colors.electricLime, alignItems: 'center', justifyContent: 'center' },
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
  taxBox: { marginTop: 4, marginLeft: spacing.md, paddingLeft: spacing.sm, borderLeftWidth: 2, borderLeftColor: colors.divider },
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
  payBar: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.sm, paddingLeft: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  payUsing: { fontSize: 10, fontWeight: "800", color: colors.muted, letterSpacing: 0.8 },
  payMethod: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  payNow: { flex: 1.3, minHeight: 52, backgroundColor: colors.brandSecondary, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  payNowText: { color: colors.onBrandSecondary, fontWeight: "800", fontSize: 16 },
  ask: { flexDirection: "row", alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.limeSoft, borderWidth: 1, borderColor: colors.forest },
  askTitle: { color: colors.onSurface, fontSize: 14, fontWeight: '800' },
  askText: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  askBtn: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  askBtnText: { color: colors.surface, fontWeight: '800', fontSize: 13 },
  retry: { flexDirection: "row", gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.error },
  retryText: { color: colors.onSurface, fontSize: 13, fontWeight: "600", lineHeight: 19 },
  retryActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  retryBtn: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center" },
  retryBtnGhost: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.forest },
  retryBtnText: { color: colors.surface, fontWeight: "700", fontSize: 12 },
});
