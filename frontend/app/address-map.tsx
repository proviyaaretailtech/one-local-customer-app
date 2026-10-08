// Drop the pin: move the map under a fixed pin; the address below follows it.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@react-native-vector-icons/ionicons';
import { ApiError } from '@/src/api';
import { Point, useDeliveryLocation } from '@/src/delivery-location';
import { MapView, mapsAvailable } from '@/src/components/map-view';
import { useErrorMessage, useFormat, useTranslation } from '@/src/i18n';
import { checkServiceable, CITY_CENTER, currentPoint, isLocationError, Place, reverseGeocode } from '@/src/places';
import { colors } from '@/src/theme';

const COORD = { maxFractionDigits: 5, minFractionDigits: 5 }; // coordinates are shown to 5 decimals, as technical text

type Status = { kind: 'loading' } | { kind: 'place'; place: Place } | { kind: 'basic'; point: Point; serviceable: boolean; nearest: string } | { kind: 'error'; error: unknown };

export default function AddressMap() {
  const router = useRouter(); const insets = useSafeAreaInsets(); const delivery = useDeliveryLocation();
  const { t } = useTranslation(); const fmt = useFormat(); const message = useErrorMessage();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; id?: string }>();
  const start = useRef<Point>(params.lat && params.lng ? { lat: Number(params.lat), lng: Number(params.lng) } : delivery.point ?? CITY_CENTER).current;
  const [center, setCenter] = useState<Point>(start);
  const [moveTo, setMoveTo] = useState<(Point & { at: number }) | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [hint, setHint] = useState(true); const [locating, setLocating] = useState(false); const [locError, setLocError] = useState('');

  // Look up the address after the map stops moving.
  useEffect(() => {
    setStatus({ kind: 'loading' });
    const t = setTimeout(async () => {
      try {
        setStatus({ kind: 'place', place: await reverseGeocode(center) });
      } catch (e) {
        if (e instanceof ApiError && e.status === 503) {
          // Maps not configured: still check the delivery area (free, no Google call).
          const s = await checkServiceable(center).catch(() => null);
          setStatus({ kind: 'basic', point: center, serviceable: !!s?.serviceable, nearest: s?.nearest_city ?? 'Latur' }); // i18n-ignore: fallback place name (data)
        } else setStatus({ kind: 'error', error: e });
      }
    }, 450);
    return () => clearTimeout(t);
  }, [center]);

  const recenter = async () => {
    setLocating(true); setLocError('');
    // A failed "locate me" keeps the pin and its address; it only explains why it couldn't move.
    try { const p = await currentPoint(); setMoveTo({ ...p, at: Date.now() }); setCenter(p); }
    catch (e) { setLocError(isLocationError(e) ? e.message : message(e)); }
    finally { setLocating(false); }
  };

  const serviceable = status.kind === 'place' ? status.place.serviceable : status.kind === 'basic' ? status.serviceable : false;
  const confirm = () => {
    const p = status.kind === 'place' ? status.place : null;
    const q = new URLSearchParams({ lat: String(center.lat), lng: String(center.lng) });
    if (p) { q.set('locality', p.locality); q.set('formatted', p.formatted); q.set('pincode', p.pincode); }
    else q.set('manual', '1');
    if (params.id) q.set('id', params.id);
    router.push(`/address-form?${q.toString()}` as never);
  };

  return (
    <View testID="address-map-screen" style={styles.screen}>
      <MapView initial={start} moveTo={moveTo} onSettle={setCenter} style={StyleSheet.absoluteFill} />

      {/* The pin stays in the middle; the map moves under it. */}
      {mapsAvailable && (
        <View pointerEvents="none" style={styles.pinWrap}>
          {hint && <View style={styles.tooltip}><Text style={styles.tooltipText}>{t('address.map.hint')}</Text></View>}
          <Icon name="location" size={46} color={colors.forest} />
          <View style={styles.pinShadow} />
        </View>
      )}

      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="address-map-back" accessibilityLabel={t('common.goBack')} onPress={() => router.back()} style={styles.round}><Icon name="arrow-back" size={21} color={colors.onSurface} /></Pressable>
        <Pressable testID="address-map-search" onPress={() => router.back()} style={styles.searchPill}><Icon name="search-outline" size={16} color={colors.muted} /><Text style={styles.searchText}>{t('address.map.searchAnother')}</Text></Pressable>
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        {mapsAvailable && (
          <Pressable testID="recenter-map" onPress={recenter} style={styles.recenter}>
            {locating ? <ActivityIndicator size="small" color={colors.forest} /> : <Icon name="locate" size={16} color={colors.forest} />}
            <Text style={styles.recenterText}>{t('location.current')}</Text>
          </Pressable>
        )}
        <Text style={styles.eyebrow}>{t('address.map.eyebrow')}</Text>
        {status.kind === 'loading' && <View style={styles.loading}><ActivityIndicator color={colors.forest} /><Text style={styles.muted}>{t('address.map.finding')}</Text></View>}
        {status.kind === 'place' && (
          <>
            <View style={styles.placeRow}><Icon name="location" size={18} color={colors.forest} /><Text testID="map-locality" style={styles.locality} numberOfLines={1}>{status.place.locality || status.place.city || t('address.map.pinned')}</Text></View>
            <Text testID="map-formatted" style={styles.formatted} numberOfLines={3}>{status.place.formatted}</Text>
          </>
        )}
        {status.kind === 'basic' && <Text style={styles.formatted}>{t('address.map.pinnedAt', { latitude: fmt.number(status.point.lat, COORD), longitude: fmt.number(status.point.lng, COORD) })}</Text>}
        {status.kind === 'error' && <Text testID="map-error" style={styles.error}>{message(status.error)}</Text>}
        {!!locError && <Text testID="map-locate-error" style={styles.error}>{locError}</Text>}
        {status.kind !== 'loading' && status.kind !== 'error' && !serviceable && (
          <View testID="not-serviceable" style={styles.warning}><Icon name="alert-circle-outline" size={16} color={colors.warning} /><Text style={styles.warningText}>{t('address.map.notServiceable', { city: status.kind === 'place' ? status.place.nearest_city : status.nearest })}</Text></View>
        )}
        <Pressable testID="confirm-location" disabled={!serviceable} onPress={() => { setHint(false); confirm(); }} style={[styles.cta, !serviceable && styles.ctaOff]}>
          <Text style={styles.ctaText}>{t('address.map.confirm')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceSecondary },
  pinWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 46 },
  tooltip: { backgroundColor: colors.surfaceInverse, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 6 },
  tooltipText: { color: colors.onSurfaceInverse, fontSize: 12, fontWeight: '600' },
  pinShadow: { width: 10, height: 4, borderRadius: 5, backgroundColor: colors.overlay, marginTop: -4 },
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 14 },
  round: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 10, color: colors.shadow }] },
  searchPill: { flex: 1, minHeight: 46, paddingVertical: 6, borderRadius: 23, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, backgroundColor: colors.surface, boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 10, color: colors.shadow }] },
  searchText: { flexShrink: 1, fontSize: 14, color: colors.muted },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, gap: 8, boxShadow: [{ offsetX: 0, offsetY: -4, blurRadius: 18, color: colors.shadow }] },
  recenter: { position: 'absolute', top: -58, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  recenterText: { fontSize: 13, fontWeight: '600', color: colors.forest },
  eyebrow: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700', color: colors.muted },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locality: { fontSize: 18, fontWeight: '700', color: colors.onSurface, flex: 1 },
  formatted: { fontSize: 13, lineHeight: 19, color: colors.muted },
  muted: { fontSize: 13, color: colors.muted },
  error: { fontSize: 13, color: colors.error },
  warning: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 12, backgroundColor: colors.pastelYellow },
  warningText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.onSurface },
  cta: { marginTop: 6, minHeight: 54, paddingVertical: 8, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.forest },
  ctaOff: { opacity: 0.4 },
  ctaText: { color: colors.surface, fontSize: 16, fontWeight: '700' },
});
