// Choose where to deliver: search, current location, a new pinned address, saved addresses
// and recent searches.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@react-native-vector-icons/ionicons';
import { randomId } from '@/src/api';
import { Address, useCustomer } from '@/src/customer';
import { Point, useDeliveryLocation } from '@/src/delivery-location';
import { addressText, CITY_CENTER, currentPoint, distanceKm, knownPoint, placeDetails, Recent, recentPlaces, rememberPlace, searchPlaces, Suggestion } from '@/src/places';
import { colors } from '@/src/theme';

const kindIcon = (a: Address) => (a.kind === 'work' || a.label === 'Work' ? 'briefcase-outline' : a.kind === 'other' || a.label === 'Other' ? 'location-outline' : 'home-outline');
const mapHref = (p?: Point | null, extra = '') => `/address-map?${p ? `lat=${p.lat}&lng=${p.lng}` : ''}${extra}` as never;

export default function LocationPicker() {
  const router = useRouter(); const insets = useSafeAreaInsets();
  const { addresses, update } = useCustomer(); const delivery = useDeliveryLocation();
  const session = useRef(randomId(16)).current;
  const [query, setQuery] = useState(''); const [results, setResults] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false); const [error, setError] = useState(''); const [locating, setLocating] = useState(false);
  const [here, setHere] = useState<Point | null>(null); const [recent, setRecent] = useState<Recent[]>([]); const [menu, setMenu] = useState('');

  useEffect(() => { knownPoint().then(setHere); recentPlaces().then(setRecent); }, []);

  // Debounced search; each visit to this screen is one billing session with Google.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(() => {
      searchPlaces(q, session, here ?? delivery.point).then(r => { setResults(r); setError(''); })
        .catch(e => { setResults([]); setError(e.message); }).finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(t);
  }, [query, session, here, delivery.point]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)' as never));
  const pickSuggestion = async (s: Suggestion) => {
    try {
      const place = await placeDetails(s.place_id, session);
      await rememberPlace({ title: s.title, subtitle: s.subtitle, lat: place.lat, lng: place.lng });
      router.push(mapHref(place));
    } catch (e) { setError((e as Error).message); }
  };
  const useCurrent = async () => {
    setLocating(true); setError('');
    try { const p = await currentPoint(); setHere(p); router.push(mapHref(p)); }
    catch (e) { setError((e as Error).message); }
    finally { setLocating(false); }
  };
  const choose = (a: Address) => {
    delivery.setLocation(addressText(a), a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null);
    close();
  };
  const remove = async (a: Address) => { setMenu(''); await update({ addresses: addresses.filter(x => x.id !== a.id) }); };
  const selected = useMemo(() => addresses.find(a => addressText(a) === delivery.location)?.id, [addresses, delivery.location]);

  return (
    <View testID="location-screen" style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="location-back" accessibilityLabel="Go back" onPress={close} style={styles.back}><Icon name="arrow-back" size={21} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Where should we deliver?</Text>
      </View>
      <View style={styles.search}>
        <Icon name="search-outline" size={18} color={colors.muted} />
        <TextInput testID="location-search" value={query} onChangeText={setQuery} placeholder="Search your area, street or landmark" placeholderTextColor={colors.muted} style={styles.input} autoCorrect={false} returnKeyType="search" />
        {searching ? <ActivityIndicator size="small" color={colors.forest} /> : !!query && <Pressable accessibilityLabel="Clear search" onPress={() => setQuery('')} hitSlop={10}><Icon name="close-circle" size={18} color={colors.muted} /></Pressable>}
      </View>
      {!!error && <Text testID="location-error" style={styles.error}>{error}</Text>}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]} keyboardShouldPersistTaps="handled">
        {query.trim().length >= 2 ? (
          <View style={styles.card}>
            {!searching && !results.length && !error && <Text style={styles.muted}>No places found. Try a nearby landmark.</Text>}
            {results.map((r, i) => (
              <Pressable key={r.place_id} testID={`place-result-${i}`} onPress={() => pickSuggestion(r)} style={[styles.row, i > 0 && styles.divider]}>
                <View style={styles.rowIcon}><Icon name="location-outline" size={17} color={colors.onSurface} /></View>
                <View style={styles.flex}><Text style={styles.rowTitle} numberOfLines={1}>{r.title}</Text><Text style={styles.rowSub} numberOfLines={2}>{r.subtitle}</Text></View>
              </Pressable>
            ))}
          </View>
        ) : (
          <>
            <View style={styles.actions}>
              <Pressable testID="use-current-location" onPress={useCurrent} style={styles.action}>
                {locating ? <ActivityIndicator color={colors.forest} /> : <Icon name="locate" size={20} color={colors.forest} />}
                <Text style={styles.actionText}>Use current location</Text>
              </Pressable>
              <Pressable testID="add-new-address" onPress={() => router.push(mapHref(here ?? delivery.point ?? CITY_CENTER))} style={styles.action}>
                <Icon name="add-circle-outline" size={20} color={colors.forest} />
                <Text style={styles.actionText}>Add new address</Text>
              </Pressable>
            </View>

            {!!addresses.length && <Text style={styles.section}>SAVED ADDRESSES</Text>}
            {!!addresses.length && (
              <View style={styles.card}>
                {addresses.map((a, i) => {
                  const km = here && a.lat != null && a.lng != null ? distanceKm(here, { lat: a.lat, lng: a.lng }) : null;
                  return (
                    <View key={a.id} style={[styles.row, i > 0 && styles.divider]}>
                      <Pressable testID={`saved-address-${a.id}`} onPress={() => choose(a)} style={styles.rowMain}>
                        <View style={styles.rowIcon}><Icon name={kindIcon(a) as never} size={17} color={colors.onSurface} />{km != null && <Text style={styles.km}>{km < 10 ? km.toFixed(1) : Math.round(km)} km</Text>}</View>
                        <View style={styles.flex}>
                          <View style={styles.labelRow}><Text style={styles.rowTitle}>{a.label}</Text>{selected === a.id && <Text style={styles.badge}>SELECTED</Text>}</View>
                          <Text style={styles.rowSub} numberOfLines={2}>{[a.line, a.locality || a.area, a.pin].filter(Boolean).join(', ')}</Text>
                        </View>
                      </Pressable>
                      <Pressable testID={`address-menu-${a.id}`} accessibilityLabel={`Options for ${a.label}`} onPress={() => setMenu(menu === a.id ? '' : a.id)} hitSlop={8} style={styles.more}><Icon name="ellipsis-vertical" size={17} color={colors.muted} /></Pressable>
                      {menu === a.id && (
                        <View style={styles.menu}>
                          <Pressable testID={`edit-address-${a.id}`} onPress={() => { setMenu(''); router.push(a.lat != null && a.lng != null ? mapHref({ lat: a.lat, lng: a.lng }, `&id=${a.id}`) : (`/address-form?id=${a.id}&manual=1` as never)); }} style={styles.menuItem}><Text style={styles.menuText}>Edit</Text></Pressable>
                          <Pressable testID={`delete-address-${a.id}`} onPress={() => remove(a)} style={styles.menuItem}><Text style={[styles.menuText, { color: colors.error }]}>Delete</Text></Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {!!recent.length && <Text style={styles.section}>RECENTLY SEARCHED</Text>}
            {!!recent.length && (
              <View style={styles.card}>
                {recent.map((r, i) => (
                  <Pressable key={`${r.title}-${i}`} testID={`recent-place-${i}`} onPress={() => router.push(mapHref(r))} style={[styles.row, i > 0 && styles.divider]}>
                    <View style={styles.rowIcon}><Icon name="time-outline" size={17} color={colors.onSurface} /></View>
                    <View style={styles.flex}><Text style={styles.rowTitle} numberOfLines={1}>{r.title}</Text><Text style={styles.rowSub} numberOfLines={2}>{r.subtitle}</Text></View>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 54 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: colors.onSurface },
  search: { marginHorizontal: 16, height: 50, borderRadius: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, fontSize: 14, color: colors.onSurface, height: 48 },
  error: { marginHorizontal: 18, marginTop: 10, fontSize: 12, color: colors.error },
  content: { padding: 16, gap: 10 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, minHeight: 78, borderRadius: 18, padding: 14, gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  actionText: { fontSize: 13, fontWeight: '600', color: colors.onSurface },
  section: { marginTop: 14, fontSize: 11, letterSpacing: 1.2, fontWeight: '700', color: colors.muted },
  card: { borderRadius: 18, backgroundColor: colors.surface, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
  rowMain: { flex: 1, flexDirection: 'row', gap: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  rowIcon: { width: 42, minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary, paddingVertical: 4 },
  km: { fontSize: 9, color: colors.muted, marginTop: 2 },
  flex: { flex: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.onSurface },
  rowSub: { marginTop: 3, fontSize: 12, lineHeight: 17, color: colors.muted },
  badge: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6, color: colors.forest, backgroundColor: colors.limeSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  more: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  menu: { position: 'absolute', right: 30, top: 12, zIndex: 5, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingVertical: 4, boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 12, color: colors.shadow }] },
  menuItem: { paddingHorizontal: 16, paddingVertical: 10, minWidth: 110 },
  menuText: { fontSize: 13, fontWeight: '600', color: colors.onSurface },
  muted: { paddingVertical: 16, fontSize: 13, color: colors.muted },
});
