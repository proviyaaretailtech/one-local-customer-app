import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppDimensions } from '@/src/layout';
import { useFeatures } from '@/src/features';
import { ComingSoon } from '@/src/components/coming-soon';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import Icon from '@react-native-vector-icons/ionicons';
import { colors } from '@/src/theme';
import { AISearchResult, uploadSearch } from '@/src/api';
import { useCatalog } from '@/src/use-catalog';
import { VoiceSearchControl } from '@/src/components/voice-search-control';
import { ProductCard } from '@/src/components/product-card';

function SmartSearchScreen() {
  const { mode } = useLocalSearchParams<{ mode: string }>(); const voice = mode === 'voice'; const router = useRouter(); const { data } = useCatalog(); const width = useAppDimensions().width;
  const [photo, setPhoto] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [result, setResult] = useState<AISearchResult | null>(null);
  const request = useRef<AbortController | null>(null); const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort(); }; }, []);
  const searchFile = useCallback(async (uri: string, filename: string, type: string) => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setResult(null);
    const timeout = setTimeout(() => controller.abort(), 115000);
    try { const response = await uploadSearch(voice ? 'voice' : 'image', uri, filename, type, controller.signal); if (alive.current) setResult(response); }
    catch (e: any) { if (alive.current) setError(e.name === 'AbortError' ? 'Search took too long. Please try again.' : e.message || 'Search unavailable. Please try again.'); }
    finally { clearTimeout(timeout); if (alive.current) setBusy(false); }
  }, [voice]);
  const pick = async (camera: boolean) => {
    if (busy) return; setError('');
    try {
      if (camera) { const permission = await ImagePicker.requestCameraPermissionsAsync(); if (!permission.granted) { setError('Camera access is off. Enable it in settings or choose a photo instead.'); return; } }
      const response = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, selectionLimit: 1 });
      if (response.canceled || !response.assets[0]) return;
      const asset = response.assets[0];
      const converted = await manipulateAsync(asset.uri, asset.width > 1400 ? [{ resize: { width: 1400 } }] : [], { compress: 0.85, format: SaveFormat.JPEG });
      setPhoto(converted.uri); await searchFile(converted.uri, 'product.jpg', 'image/jpeg');
    } catch { setError('Could not open that photo. Please choose another.'); }
  };
  const products = result?.product_ids.flatMap(id => data?.products.filter(p => p.id === id) || []) || [];
  return <ScrollView testID="smart-search-screen" contentContainerStyle={styles.content}>
    <View style={styles.header}><Pressable testID="smart-search-back" accessibilityLabel="Go back" style={styles.round} onPress={() => router.canGoBack() ? router.back() : router.replace('/search' as any)}><Icon name="arrow-back" size={19} color={colors.onSurface} /></Pressable><View style={styles.flex}><Text testID="smart-search-title" style={styles.title}>{voice ? 'Say it. Find it.' : 'See it. Find it.'}</Text><Text style={styles.subtitle}>A little help from OneCity AI</Text></View><View style={styles.aiTag}><Icon name="sparkles-outline" size={13} color={colors.forest} /><Text style={styles.tagText}>AI</Text></View></View>
    <View style={styles.panel}>
      <Text style={styles.description}>{voice ? 'Tell us what’s on your shopping list. We’ll look through the catalogue for you.' : 'Snap a product or pick a photo. We’ll help you find it, or something similar.'}</Text>
      {voice ? <VoiceSearchControl onRecording={searchFile} onError={setError} disabled={busy} /> : <>{!!photo && <Image testID="ai-photo-preview" source={photo} style={styles.photo} contentFit="contain" />}<View style={styles.photoActions}><Pressable testID="ai-take-photo" disabled={busy} style={styles.photoButton} onPress={() => void pick(true)}><Icon name="camera-outline" size={23} color={colors.forest} /><Text style={styles.buttonText}>Take a photo</Text></Pressable><Pressable testID="ai-choose-photo" disabled={busy} style={styles.photoButton} onPress={() => void pick(false)}><Icon name="images-outline" size={23} color={colors.forest} /><Text style={styles.buttonText}>Choose photo</Text></Pressable></View></>}
      <Text testID="ai-search-privacy" style={styles.privacy}>{voice ? 'Audio is sent to our AI provider, then discarded after transcription. Record up to 20 seconds.' : 'Photos are sent to our AI provider and stored privately for processing. Avoid personal documents or sensitive images.'}</Text>
    </View>
    {busy && <View testID="ai-search-loading" style={styles.loading}><ActivityIndicator color={colors.forest} /><Text style={styles.description}>{voice ? 'Listening to your request and finding products…' : 'Looking for a little match…'}</Text><Pressable testID="ai-search-cancel" style={styles.retry} onPress={() => request.current?.abort()}><Text style={styles.buttonText}>Cancel search</Text></Pressable></View>}
    {!!error && <View testID="ai-search-error" style={styles.error}><Text style={styles.errorText}>{error}</Text>{!voice && !!photo && <Pressable testID="ai-search-retry" style={styles.retry} onPress={() => void searchFile(photo, 'product.jpg', 'image/jpeg')}><Text style={styles.buttonText}>Try photo again</Text></Pressable>}</View>}
    {result && <View style={styles.results}><Text testID="ai-recognised-query" style={styles.resultTitle}>{result.query}</Text>{!!result.transcript && <Text testID="voice-transcript" style={styles.transcript}>You said: “{result.transcript}”</Text>}<Text testID="ai-search-explanation" style={styles.description}>{result.explanation}</Text><View style={styles.grid}>{products.map(p => <ProductCard product={p} key={p.id} scope="ai" width={(width - 52) / 2} />)}</View>{!products.length && <Text testID="ai-search-no-matches" style={styles.description}>No matching products in this sample catalogue yet. Try another photo or search word.</Text>}<Text style={styles.privacy}>AI can make mistakes. Check the product details before adding.</Text></View>}
    <Pressable testID="ai-use-text-search" onPress={() => router.replace(`/search?q=${encodeURIComponent(result?.query || '')}` as any)} style={styles.textSearch}><Icon name="search-outline" size={16} color={colors.forest} /><Text style={styles.buttonText}>Prefer to type? Search here</Text><Icon name="arrow-forward" size={15} color={colors.forest} /></Pressable>
  </ScrollView>;
}
const styles = StyleSheet.create({ content: { padding: 20, paddingBottom: 35 }, header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 }, round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.glassBright, alignItems: 'center', justifyContent: 'center' }, flex: { flex: 1 }, title: { color: colors.onSurface, fontSize: 23, fontWeight: '600', letterSpacing: -0.6 }, subtitle: { fontSize: 10, color: colors.muted, marginTop: 5 }, aiTag: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 10, borderRadius: 22, backgroundColor: colors.glassBright }, tagText: { fontSize: 10, fontWeight: '600', color: colors.forest }, panel: { borderRadius: 30, backgroundColor: colors.glassBright, borderWidth: 1, borderColor: colors.glassLine, padding: 21 }, description: { fontSize: 12, color: colors.muted, lineHeight: 20 }, photo: { width: '100%', height: 150, borderRadius: 24, marginTop: 15 }, photoActions: { flexDirection: 'row', gap: 12, marginTop: 20, marginBottom: 14 }, photoButton: { flex: 1, height: 96, backgroundColor: colors.limeSoft, borderRadius: 25, alignItems: 'center', justifyContent: 'center', gap: 10 }, buttonText: { color: colors.forest, fontSize: 11, fontWeight: '600' }, privacy: { fontSize: 9, color: colors.muted, lineHeight: 15, marginTop: 14 }, loading: { padding: 20, alignItems: 'center', gap: 12 }, error: { marginTop: 18, padding: 18, borderRadius: 23, backgroundColor: colors.error }, errorText: { color: colors.onError, fontSize: 12, lineHeight: 19 }, retry: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, results: { marginTop: 25 }, resultTitle: { fontSize: 21, fontWeight: '600', color: colors.onSurface }, transcript: { fontSize: 12, color: colors.forest, marginVertical: 12, lineHeight: 19 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 18 }, textSearch: { marginTop: 24, minHeight: 48, borderRadius: 25, backgroundColor: colors.glassBright, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 9 } });
// Live only once its feature is switched on (src/features.ts); otherwise a 'coming soon' screen.
export default function SmartSearch() { return useFeatures().ai_search ? <SmartSearchScreen /> : <ComingSoon feature="ai_search" />; }
