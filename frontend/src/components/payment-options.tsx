import { View, Text, Pressable, StyleSheet } from 'react-native';
import Icon from '@react-native-vector-icons/ionicons';
import { PaymentMethod, UpiApp } from '../customer';
import { colors } from '../theme';
import { useFeatures } from '../features';
export const paymentOptions: { id: PaymentMethod; title: string; subtitle: string; icon: string; onlineOnly?: boolean }[] = [
  { id: 'upi', title: 'UPI', subtitle: 'Google Pay, PhonePe, Paytm & other UPI apps', icon: 'phone-portrait-outline' },
  { id: 'card', title: 'Credit / Debit card', subtitle: 'Visa, Mastercard, RuPay & more', icon: 'card-outline' },
  { id: 'netbanking', title: 'Net banking', subtitle: 'Pay using your preferred bank', icon: 'business-outline' },
  // Only listed once online payments are live, so the cash-only screens look exactly as before.
  { id: 'wallet', title: 'Wallets', subtitle: 'PhonePe, Amazon Pay & more', icon: 'wallet-outline', onlineOnly: true },
  { id: 'paylater', title: 'Pay Later & EMI', subtitle: 'Where your bank or card offers it', icon: 'calendar-outline', onlineOnly: true },
  { id: 'cod', title: 'Cash on delivery', subtitle: 'Pay when your order arrives', icon: 'cash-outline' },
];
export const UPI_APPS: { id: UpiApp; title: string; tint: string }[] = [
  { id: 'google_pay', title: 'Google Pay', tint: '#E6F0FF' }, { id: 'phonepe', title: 'PhonePe', tint: '#F0E6FF' },
  { id: 'paytm', title: 'Paytm', tint: '#E6F5FB' }, { id: 'bhim', title: 'BHIM', tint: '#FFEDD6' }, { id: 'whatsapp', title: 'WhatsApp', tint: '#DDF5EA' },
];
// Razorpay can also report 'emi' / 'cardless_emi' for a paid order (server/payments.ts).
export const paymentLabel = (id: string, app?: UpiApp) => {
  if (id === 'upi' && app) return app === 'id' ? 'UPI ID' : `${UPI_APPS.find(a => a.id === app)?.title ?? 'UPI'} UPI`;
  if (id === 'emi' || id === 'cardless_emi') return 'EMI';
  return paymentOptions.find(p => p.id === id)?.title || 'Cash on delivery';
};
// Online methods stay visible but can't be picked until online payments are live (src/features.ts);
// until then every order is cash on delivery, and the server enforces the same rule.
export function PaymentOptions({ value, onChange, scope, disabled }: { value: PaymentMethod; onChange: (id: PaymentMethod) => void; scope: string; disabled?: boolean }) {
  const { online_payments } = useFeatures();
  const shown = online_payments || value === 'cod' ? value : 'cod';
  return <View testID={`${scope}-options`} style={s.options}>{paymentOptions.filter(p => online_payments || !p.onlineOnly).map(p => { const soon = p.id !== 'cod' && !online_payments; return <Pressable key={p.id} testID={`${scope}-method-${p.id}`} accessibilityRole="radio" accessibilityState={{ checked: shown === p.id, disabled: soon }} disabled={disabled || soon} onPress={() => onChange(p.id)} style={({ pressed }) => [s.option, shown === p.id && s.selected, soon && s.soonOption, pressed && s.pressed]}><View style={s.icon}><Icon name={p.icon as any} size={24} color={colors.forest} /></View><View style={s.copy}><Text testID={`${scope}-label-${p.id}`} style={s.title}>{p.title}</Text><Text style={s.sub}>{soon ? 'Coming soon — pay cash on delivery for now' : p.subtitle}</Text></View>{soon ? <View style={s.soon}><Text style={s.soonText}>SOON</Text></View> : <Icon name={shown === p.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={colors.forest} />}</Pressable>; })}</View>;
}
const s = StyleSheet.create({ options: { gap: 12 }, option: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border }, selected: { borderColor: colors.forest, backgroundColor: colors.limeSoft }, soonOption: { opacity: 0.6 }, soon: { backgroundColor: colors.surfaceSecondary, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }, soonText: { fontSize: 9, fontWeight: '800', color: colors.muted, letterSpacing: 1 }, icon: { width: 40, height: 44, justifyContent: 'center' }, copy: { flex: 1 }, title: { fontSize: 14, fontWeight: '700', color: colors.onSurface }, sub: { fontSize: 11, color: colors.muted, lineHeight: 17, marginTop: 4 }, pressed: { opacity: 0.65 } });
