import type { ComponentProps } from 'react';
import type { ParseKeys } from 'i18next';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '@/src/ui/text';
import Icon from '@react-native-vector-icons/ionicons';
import { PaymentMethod, UpiApp } from '../customer';
import { colors, radius, soft } from '../theme';
import { useFeatures } from '../features';
import { paymentMethodKey, t as translate, useTranslation } from '@/src/i18n';
// The option rows hold catalogue KEYS, not words: the words are looked up while rendering, in the current language.
export const paymentOptions: { id: PaymentMethod; title: ParseKeys; subtitle: ParseKeys; icon: ComponentProps<typeof Icon>['name']; onlineOnly?: boolean }[] = [
  { id: 'upi', title: 'payment.upi.title', subtitle: 'payment.upi.sub', icon: 'phone-portrait-outline' },
  { id: 'card', title: 'payment.card.title', subtitle: 'payment.card.sub', icon: 'card-outline' },
  { id: 'netbanking', title: 'payment.netbanking.title', subtitle: 'payment.netbanking.sub', icon: 'business-outline' },
  // Only listed once online payments are live, so the cash-only screens look exactly as before.
  { id: 'wallet', title: 'payment.wallet.title', subtitle: 'payment.wallet.sub', icon: 'wallet-outline', onlineOnly: true },
  { id: 'paylater', title: 'payment.paylater.title', subtitle: 'payment.paylater.sub', icon: 'calendar-outline', onlineOnly: true },
  { id: 'cod', title: 'payment.cod.title', subtitle: 'payment.cod.sub', icon: 'cash-outline' },
];
export const UPI_APPS: { id: UpiApp; title: string; tint: string }[] = [
  // i18n-ignore: UPI app names are brand names
  { id: 'google_pay', title: 'Google Pay', tint: '#E6F0FF' }, { id: 'phonepe', title: 'PhonePe', tint: '#F0E6FF' },
  { id: 'paytm', title: 'Paytm', tint: '#E6F5FB' }, { id: 'bhim', title: 'BHIM', tint: '#FFEDD6' }, { id: 'whatsapp', title: 'WhatsApp', tint: '#DDF5EA' },
];
// The method's name in the current language. A plain function (call it while rendering, in a component that uses
// useTranslation so it redraws on a language change). Razorpay can also report 'emi' / 'cardless_emi' for a paid
// order (server/payments.ts): paymentMethodKey folds those spellings into one code.
export const paymentLabel = (id: string, app?: UpiApp) => {
  if (id === 'upi' && app) return app === 'id' ? translate('payment.upiId') : translate('payment.upiWithApp', { app: UPI_APPS.find(a => a.id === app)?.title ?? translate(paymentMethodKey('upi')) });
  return translate(paymentMethodKey(id));
};
// Online methods stay visible but can't be picked until online payments are live (src/features.ts);
// until then every order is cash on delivery, and the server enforces the same rule.
export function PaymentOptions({ value, onChange, scope, disabled }: { value: PaymentMethod; onChange: (id: PaymentMethod) => void; scope: string; disabled?: boolean }) {
  const { online_payments } = useFeatures();
  const { t } = useTranslation();
  const shown = online_payments || value === 'cod' ? value : 'cod';
  return <View testID={`${scope}-options`} style={s.options}>{paymentOptions.filter(p => online_payments || !p.onlineOnly).map(p => { const soon = p.id !== 'cod' && !online_payments; return <Pressable key={p.id} testID={`${scope}-method-${p.id}`} accessibilityRole="radio" accessibilityState={{ checked: shown === p.id, disabled: soon }} disabled={disabled || soon} onPress={() => onChange(p.id)} style={({ pressed }) => [s.option, shown === p.id && s.selected, soon && s.soonOption, pressed && s.pressed]}><View style={s.icon}><Icon name={p.icon} size={22} color={colors.forest} /></View><View style={s.copy}><Text testID={`${scope}-label-${p.id}`} style={s.title}>{t(p.title)}</Text><Text style={s.sub}>{soon ? t('payment.comingSoon') : t(p.subtitle)}</Text></View>{soon ? <View style={s.soon}><Text style={s.soonText}>{t('payment.soonBadge')}</Text></View> : <Icon name={shown === p.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={colors.forest} />}</Pressable>; })}</View>;
}
const s = StyleSheet.create({ options: { gap: 12 }, option: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, borderWidth: 1.5, borderColor: colors.surface, boxShadow: soft.lifted }, selected: { borderColor: colors.forest, backgroundColor: colors.limeSoft }, soonOption: { opacity: 0.6 }, soon: { backgroundColor: colors.surfaceSecondary, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }, soonText: { fontSize: 9, fontWeight: '800', color: colors.muted, letterSpacing: 1 }, icon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintTile }, copy: { flex: 1 }, title: { fontSize: 15, fontWeight: '700', color: colors.onSurface }, sub: { fontSize: 12, color: colors.muted, lineHeight: 17, marginTop: 2 }, pressed: { opacity: 0.65 } });
