// Address details after the pin: who receives it, building and floor, street, label, directions.
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@react-native-vector-icons/ionicons';
import { randomId } from '@/src/api';
import { Address, useCustomer } from '@/src/customer';
import { useDeliveryLocation } from '@/src/delivery-location';
import { useTranslation } from '@/src/i18n';
import { addressText } from '@/src/places';
import { colors } from '@/src/theme';

type Kind = NonNullable<Address['kind']>;
// The kind is a code that is stored; the chip words come from the catalogue.
const KINDS = [
  { id: 'home', label: 'address.kind.home', icon: 'home-outline' }, { id: 'work', label: 'address.kind.work', icon: 'briefcase-outline' }, { id: 'other', label: 'address.kind.other', icon: 'location-outline' },
] as const satisfies readonly { id: Kind; label: string; icon: string }[];

export default function AddressForm() {
  const router = useRouter(); const insets = useSafeAreaInsets(); const delivery = useDeliveryLocation(); const { t } = useTranslation();
  const { addresses, profile, update } = useCustomer();
  const p = useLocalSearchParams<{ lat?: string; lng?: string; locality?: string; formatted?: string; pincode?: string; id?: string; manual?: string }>();
  const existing = useMemo(() => addresses.find(a => a.id === p.id), [addresses, p.id]);
  const manual = p.manual === '1' || !p.formatted;
  const initialKind: Kind = existing?.kind ?? (existing?.label === 'Work' ? 'work' : existing && existing.label !== 'Home' ? 'other' : 'home');

  const [name, setName] = useState(existing?.name || profile.name); const [phone, setPhone] = useState(existing?.phone || profile.phone);
  const [kind, setKind] = useState<Kind>(initialKind);
  const [building, setBuilding] = useState(existing?.building ?? existing?.line ?? ''); const [street, setStreet] = useState(existing?.street ?? '');
  const [area, setArea] = useState(p.locality || existing?.locality || existing?.area || ''); const [pin, setPin] = useState(p.pincode || existing?.pin || '');
  const [saveAs, setSaveAs] = useState(initialKind === 'other' ? existing?.label ?? '' : ''); const [instructions, setInstructions] = useState(existing?.instructions ?? '');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);

  const save = async () => {
    setError('');
    if (name.trim().length < 2) return setError(t('address.form.errName'));
    if (!/^[6-9]\d{9}$/.test(phone.replace(/\D/g, '').slice(-10))) return setError(t('address.form.errPhone'));
    if (building.trim().length < 2) return setError(t('address.form.errBuilding'));
    if (manual && area.trim().length < 2) return setError(t('address.form.errArea'));
    if (pin && !/^\d{6}$/.test(pin.trim())) return setError(t('address.form.errPin'));
    if (kind === 'other' && saveAs.trim().length < 2) return setError(t('address.form.errSaveAs'));
    const lat = p.lat ? Number(p.lat) : existing?.lat; const lng = p.lng ? Number(p.lng) : existing?.lng;
    const address: Address = {
      id: existing?.id ?? `address-${randomId(6)}`,
      label: kind === 'other' ? saveAs.trim() : kind === 'work' ? 'Work' : 'Home', kind, // i18n-ignore: stored label for the Home/Work code (user data; shown as stored)
      name: name.trim(), phone: phone.replace(/\D/g, '').slice(-10),
      building: building.trim(), street: street.trim(), line: [building.trim(), street.trim()].filter(Boolean).join(', '),
      locality: area.trim(), area: area.trim(), formatted: p.formatted || existing?.formatted, pin: pin.trim(),
      instructions: instructions.trim() || undefined, lat, lng,
    };
    setBusy(true);
    try {
      await update({ addresses: existing ? addresses.map(a => (a.id === existing.id ? address : a)) : [...addresses, address] });
      delivery.setLocation(addressText(address), lat != null && lng != null ? { lat, lng } : null);
      // Back to where shopping was (home), closing the location, map and form screens.
      router.dismissTo('/(tabs)' as never);
    } catch { setError(t('address.form.saveFailed')); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="address-form-back" accessibilityLabel={t('common.goBack')} onPress={() => router.back()} style={styles.back}><Icon name="arrow-back" size={21} color={colors.onSurface} /></Pressable>
        <View style={styles.flex}><Text style={styles.title} numberOfLines={2}>{p.locality || (existing ? t('address.editTitle') : t('address.form.addTitle'))}</Text>{!!p.formatted && <Text style={styles.subtitle} numberOfLines={1}>{p.formatted}</Text>}</View>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>{t('address.form.receiver')}</Text>
        <View style={styles.card}>
          <Field id="receiver-name" label={t('address.form.name')} value={name} onChange={setName} />
          <Field id="receiver-phone" label={t('address.form.mobile')} value={phone} onChange={setPhone} keyboard="phone-pad" />
          <Text style={styles.help}>{t('address.form.mobileHelp')}</Text>
        </View>

        <Text style={styles.section}>{t('address.form.addressSection')}</Text>
        <View style={styles.card}>
          <View style={styles.kinds}>{KINDS.map(k => (
            <Pressable key={k.id} testID={`address-kind-${k.id}`} onPress={() => setKind(k.id)} style={[styles.kind, kind === k.id && styles.kindOn]}>
              <Icon name={k.icon as never} size={15} color={kind === k.id ? colors.surface : colors.onSurface} /><Text style={[styles.kindText, kind === k.id && styles.kindTextOn]}>{t(k.label)}</Text>
            </Pressable>
          ))}</View>
          <Field id="address-building" label={t('address.form.building')} value={building} onChange={setBuilding} />
          <Field id="address-street" label={t('address.form.street')} value={street} onChange={setStreet} />
          {manual ? (
            <>
              <Field id="address-area" label={t('address.form.area')} value={area} onChange={setArea} />
              <Field id="address-pin" label={t('address.form.pincode')} value={pin} onChange={setPin} keyboard="number-pad" />
            </>
          ) : (
            <View style={styles.pinned}>
              <View style={styles.flex}><Text style={styles.pinnedLabel}>{t('address.form.pinnedLabel')}</Text><Text testID="address-area-pinned" style={styles.pinnedText}>{p.formatted}</Text></View>
              <Pressable testID="change-pin" onPress={() => router.back()} style={styles.change}><Icon name="location" size={18} color={colors.forest} /><Text style={styles.changeText}>{t('address.form.change')}</Text></Pressable>
            </View>
          )}
          {kind === 'other' && <Field id="address-save-as" label={t('address.form.saveAs')} value={saveAs} onChange={setSaveAs} />}
        </View>

        <Text style={styles.section}>{t('address.form.directions')}</Text>
        <View style={styles.card}>
          <TextInput testID="address-instructions" value={instructions} onChangeText={setInstructions} placeholder={t('address.form.directionsHint')} placeholderTextColor={colors.muted} multiline maxLength={200} style={[styles.input, styles.multiline]} />
        </View>
        {!!error && <Text testID="address-form-error" style={styles.error}>{error}</Text>}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable testID="save-address" disabled={busy} onPress={save} style={[styles.cta, busy && { opacity: 0.6 }]}><Text style={styles.ctaText}>{busy ? t('address.form.saving') : t('address.save')}</Text></Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ id, label, value, onChange, keyboard }: { id: string; label: string; value: string; onChange: (v: string) => void; keyboard?: 'phone-pad' | 'number-pad' }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput testID={id} value={value} onChangeText={onChange} keyboardType={keyboard} style={styles.input} placeholderTextColor={colors.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 58 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: colors.onSurface },
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 2 },
  content: { padding: 16, gap: 8 },
  section: { marginTop: 10, fontSize: 14, fontWeight: '700', color: colors.onSurface },
  card: { borderRadius: 18, backgroundColor: colors.surface, padding: 14, gap: 12, borderWidth: 1, borderColor: colors.border },
  help: { fontSize: 11, color: colors.muted, marginTop: -4 },
  kinds: { flexDirection: 'row', gap: 8, padding: 4, borderRadius: 14, backgroundColor: colors.surfaceSecondary },
  kind: { flex: 1, minHeight: 40, paddingVertical: 6, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  kindOn: { backgroundColor: colors.forestDeep },
  kindText: { fontSize: 13, fontWeight: '600', color: colors.onSurface },
  kindTextOn: { color: colors.surface },
  field: { gap: 5 },
  fieldLabel: { fontSize: 12, color: colors.muted, fontWeight: '500' },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, fontSize: 15, color: colors.onSurface, backgroundColor: colors.surface },
  multiline: { minHeight: 80, paddingTop: 12, textAlignVertical: 'top' },
  pinned: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: colors.surfaceSecondary },
  pinnedLabel: { fontSize: 11, color: colors.muted },
  pinnedText: { fontSize: 13, lineHeight: 18, color: colors.onSurface, marginTop: 3 },
  change: { alignItems: 'center', justifyContent: 'center', minWidth: 64, minHeight: 56, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  changeText: { fontSize: 11, fontWeight: '700', color: colors.forest, marginTop: 2 },
  error: { marginTop: 6, fontSize: 13, color: colors.error },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  cta: { minHeight: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.forest },
  ctaText: { color: colors.surface, fontSize: 16, fontWeight: '700' },
});
