// The full "Payment Options" screen shown when online payments are live (features.online_payments).
// Laid out the way Indian shoppers already know from delivery apps: preferred method first, then
// UPI apps, cards, and more options. Tapping a row only selects it; the selected row opens with its
// own Pay button, so the last-used method is one tap. Card numbers, UPI ids and bank logins are all
// entered on Razorpay's page afterwards (razorpay-checkout.tsx) — this screen never asks for them.
import { useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, Switch, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@react-native-vector-icons/ionicons';
import { PaymentMethod, UpiApp } from '../customer';
import { colors } from '../theme';
import { useFeatures } from '../features';
import { useDeliveryLocation } from '../delivery-location';
import { paymentLabel, UPI_APPS } from './payment-options';

export type PaymentChoice = { method: PaymentMethod; app?: UpiApp };
const same = (a: PaymentChoice, b: PaymentChoice) => a.method === b.method && (a.method !== 'upi' || (a.app ?? '') === (b.app ?? ''));

type Props = {
  onClose: () => void; choice: PaymentChoice; onPay: (choice: PaymentChoice) => void; paying: boolean;
  itemCount: number; total: number; savings: number;
};

const MORE: { method: PaymentMethod; title: string; sub: string; icon: string }[] = [
  { method: 'paylater', title: 'Pay Later', sub: 'Simpl, LazyPay, card EMI & more, where you are eligible', icon: 'calendar-outline' },
  { method: 'wallet', title: 'Wallets', sub: 'PhonePe, Amazon Pay & more', icon: 'wallet-outline' },
  { method: 'netbanking', title: 'Netbanking', sub: 'Select from a list of banks', icon: 'business-outline' },
  { method: 'cod', title: 'Pay on Delivery', sub: 'Pay in cash when your order arrives', icon: 'cash-outline' },
];

// Mounted only while open, so it always starts on the customer's last-used method.
export function PaymentSheet({ onClose, choice, onPay, paying, itemCount, total, savings }: Props) {
  const insets = useSafeAreaInsets();
  const { wallet, coins } = useFeatures();
  const { location } = useDeliveryLocation();
  const [picked, setPicked] = useState<PaymentChoice>(choice);
  const [offers, setOffers] = useState(false);
  const rupees = (n: number) => `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;

  // One row; when it is the selected one it opens with its own Pay button. A plain render function
  // (not a component), so rows keep their identity between renders.
  const row = ({ c, title, sub, icon, badge, testID }: { c: PaymentChoice; title: string; sub?: string; icon?: string; badge?: { text: string; tint: string }; testID: string }) => {
    const on = same(picked, c);
    // The last-used method also appears in its own section; only the Preferred row opens there.
    const showPay = on && (testID === 'payment-preferred' || !same(c, choice));
    return <View key={testID} style={[s.row, on && s.rowOn]}>
      <Pressable testID={testID} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setPicked(c)} style={s.rowHead}>
        {badge ? <View style={[s.badge, { backgroundColor: badge.tint }]}><Text style={s.badgeText}>{badge.text}</Text></View>
          : <View style={s.badge}><Icon name={(icon ?? 'card-outline') as any} size={20} color={colors.forest} /></View>}
        <View style={s.copy}><Text style={s.rowTitle}>{title}</Text>{!!sub && <Text style={s.rowSub}>{sub}</Text>}</View>
        <Icon name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={colors.forest} />
      </Pressable>
      {showPay && <View style={s.payWrap}>
        <Pressable testID="payment-sheet-pay" accessibilityRole="button" disabled={paying} onPress={() => onPay(picked)} style={({ pressed }) => [s.payBtn, (pressed || paying) && s.pressed]}>
          {paying ? <ActivityIndicator color={colors.onBrandSecondary} /> : <Text style={s.payText}>{c.method === 'cod' ? `Place order · ${rupees(total)}` : `Pay ${rupees(total)}`}</Text>}
        </Pressable>
        <Text style={s.payNote}>{c.method === 'cod' ? 'Keep cash ready for the delivery partner.' : 'You finish paying on Razorpay’s secure page. We never see your card, UPI PIN or bank login.'}</Text>
      </View>}
    </View>;
  };

  const initials = (t: string) => t.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <View testID="payment-options-screen" style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Pressable testID="payment-options-back" accessibilityLabel="Back to cart" onPress={onClose} style={s.back}><Icon name="chevron-back" size={22} color={colors.onSurface} /></Pressable>
        <View style={s.copy}>
          <Text style={s.title}>Payment Options</Text>
          <Text testID="payment-options-summary" style={s.subline}>{itemCount} item{itemCount === 1 ? '' : 's'} · Total: {rupees(total)}{savings > 0 ? <Text style={s.save}> · Savings of {rupees(savings)}</Text> : null}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}>
        <View style={s.route}>
          <View style={s.routeDot}><Icon name="storefront" size={14} color={colors.surface} /></View>
          <View style={s.copy}><Text style={s.routeTitle}>One Local</Text><Text style={s.routeSub}>Delivery in 10–15 mins</Text></View>
          <Icon name="arrow-forward" size={16} color={colors.muted} />
          <View style={[s.copy, { alignItems: 'flex-end' }]}><Text style={s.routeTitle}>Deliver to</Text><Text numberOfLines={1} style={s.routeSub}>{location}</Text></View>
        </View>

        <Pressable testID="payment-offers" onPress={() => setOffers(v => !v)} style={s.offers}>
          <Icon name="pricetags" size={16} color={colors.onSuccess} /><Text style={s.offersText}>Save more with payment offers</Text><Icon name={offers ? 'chevron-up' : 'chevron-forward'} size={16} color={colors.onSuccess} />
        </Pressable>
        {offers && <Text testID="payment-offers-list" style={s.offersNote}>No bank or UPI offers are running right now. Any offer set up with Razorpay shows on the payment page automatically.</Text>}

        {(wallet || coins) && <View style={[s.row, s.walletRow]}>
          <View style={s.badge}><Icon name="wallet" size={20} color={colors.forest} /></View>
          <View style={s.copy}><Text style={s.rowTitle}>{wallet ? 'OneCity Wallet' : 'OneLocal Coins'}</Text><Text style={s.rowSub}>Can’t be used at checkout yet</Text></View>
          <Switch value={false} disabled accessibilityLabel="Use wallet balance (not available yet)" />
        </View>}

        <Text style={s.section}>Preferred Payment</Text>
        {row({ testID: "payment-preferred", c: choice, title: paymentLabel(choice.method, choice.method === 'upi' ? choice.app : undefined), sub: "Last used", icon: MORE.find(m => m.method === choice.method)?.icon ?? (choice.method === 'card' ? 'card-outline' : 'phone-portrait-outline') })}

        <Text style={s.section}>Pay by any UPI App</Text>
        {UPI_APPS.map(a => row({ testID: `payment-upi-${a.id}`, c: { method: 'upi', app: a.id }, title: a.title, badge: { text: initials(a.title), tint: a.tint } }))}
        {row({ testID: "payment-upi-id", c: { method: 'upi', app: 'id' }, title: "Add UPI ID", sub: "You’ll enter it on the secure payment page", icon: "add-circle-outline" })}

        <Text style={s.section}>Credit & Debit Cards</Text>
        {row({ testID: "payment-card", c: { method: 'card' }, title: "Add New Card", sub: "Save and pay via cards", icon: "add-circle-outline" })}

        <Text style={s.section}>More Payment Options</Text>
        {MORE.map(m => row({ testID: `payment-more-${m.method}`, c: { method: m.method }, title: m.title, sub: m.sub, icon: m.icon }))}
      </ScrollView>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingBottom: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: colors.onSurface },
  subline: { fontSize: 12, color: colors.muted, marginTop: 2 }, save: { color: colors.onSuccess, fontWeight: '700' },
  scroll: { padding: 16, gap: 10 },
  route: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 18, padding: 14 },
  routeDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  routeTitle: { fontSize: 13, fontWeight: '700', color: colors.onSurface }, routeSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  offers: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.pastelGreen, borderRadius: 14, paddingHorizontal: 14, minHeight: 44 },
  offersText: { flex: 1, color: colors.onSuccess, fontWeight: '700', fontSize: 13 },
  offersNote: { fontSize: 12, color: colors.onSurfaceTertiary, lineHeight: 18, paddingHorizontal: 4 },
  section: { fontSize: 12, fontWeight: '800', color: colors.onSurfaceTertiary, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 14, marginLeft: 4 },
  row: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  rowOn: { borderColor: colors.forest },
  walletRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 56 },
  badge: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.limeSoft, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, fontWeight: '800', color: colors.onSurface },
  copy: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.onSurface }, rowSub: { fontSize: 11, color: colors.muted, marginTop: 3, lineHeight: 16 },
  payWrap: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
  payBtn: { backgroundColor: colors.brandSecondary, borderRadius: 999, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  payText: { color: colors.onBrandSecondary, fontSize: 16, fontWeight: '800' },
  payNote: { fontSize: 11, color: colors.muted, lineHeight: 16, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
