import { useCallback, useEffect, useRef, useState } from 'react';
import { useFeatures } from '@/src/features';
import { ComingSoon } from '@/src/components/coming-soon';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from '@react-native-vector-icons/ionicons';
import { api, apiPost, uploadSearch } from '@/src/api';
import { ChatMessage, ChatSession, streamChat } from '@/src/assistant';
import { colors } from '@/src/theme';
import { OneGlyph } from '@/src/components/one-button';
import { AssistantMessage } from '@/src/components/assistant-message';
import { VoiceSearchControl } from '@/src/components/voice-search-control';
import { useCart } from '@/src/cart';
import { AssistantShoppingTools } from '@/src/components/assistant-shopping-tools';

const STARTERS = [ { icon: 'sparkles-outline', title: 'Plan my festive basket', text: 'Build a Ganesh Chaturthi shopping list with sweets and puja essentials. Choose a few affordable items and show their total.' }, { icon: 'barbell-outline', title: 'Fuel my fitness routine', text: 'Suggest a budget-friendly fitness shopping list and balanced meal ideas.' }, { icon: 'basket-outline', title: 'Restock my pantry', text: 'Build a useful everyday pantry restock basket. Prefer value and give the combined price.' }, { icon: 'leaf-outline', title: 'Veggie meal plan', text: 'Recommend a vegetarian high-protein meal plan and matching products.' }, { icon: 'pricetags-outline', title: 'Find better-value swaps', text: 'Review my current cart and suggest less expensive catalogue alternatives where relevant. Explain the price difference honestly.' } ];
function AssistantScreen() {
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  const [budget, setBudget] = useState<number | null>(null); const [vegetarian, setVegetarian] = useState(false);
  const [session, setSession] = useState(''); const [messages, setMessages] = useState<ChatMessage[]>([]); const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [partial, setPartial] = useState(''); const [error, setError] = useState(''); const [voice, setVoice] = useState(false);
  const cancel = useRef<(() => void) | null>(null); const audioAbort = useRef<AbortController | null>(null); const alive = useRef(true); const busyRef = useRef(false); const list = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets(); const router = useRouter(); const { totalItems, items } = useCart();
  useEffect(() => { if (prompt) setInput(prompt); }, [prompt]);
  const initialize = useCallback(async (fresh = false) => {
    setLoading(true); setError('');
    try {
      const saved = fresh ? null : await AsyncStorage.getItem('onecity-ai-session'); let result: ChatSession;
      if (saved) { try { result = await api<ChatSession>(`/assistant/sessions/${saved}`); } catch (e) { if (!(e instanceof Error) || !e.message.includes('404')) throw e; result = await apiPost<ChatSession>('/assistant/sessions', {}); } }
      else result = await apiPost<ChatSession>('/assistant/sessions', {});
      await AsyncStorage.setItem('onecity-ai-session', result.id);
      if (alive.current) { setSession(result.id); setMessages(result.messages); }
    } catch { if (alive.current) setError('Could not load your conversation. Tap retry.'); }
    finally { if (alive.current) setLoading(false); }
  }, []);
  useEffect(() => { alive.current = true; void initialize(); return () => { alive.current = false; cancel.current?.(); audioAbort.current?.abort(); }; }, [initialize]);
  const send = (value = input) => {
    const text = value.trim(); if (!text || !session || busyRef.current) return;
    busyRef.current = true; setBusy(true); setVoice(false); setInput(''); setError(''); setPartial('');
    setMessages(previous => [...previous, { role: 'user', text }]); let answer = '';
    cancel.current = streamChat(session, text, delta => { answer += delta; setPartial(answer); }, result => { setMessages(previous => [...previous, result]); setPartial(''); setBusy(false); busyRef.current = false; }, reason => { setMessages(previous => previous.slice(0, -1)); setInput(text); setPartial(''); setError(reason); setBusy(false); busyRef.current = false; }, { budget, preference: vegetarian ? 'vegetarian' : 'any', cart_items: items.slice(0, 100).map(p => ({ id: p.id, qty: Math.min(99, p.qty) })) });
  };
  const recording = async (uri: string, name: string, type: string) => {
    setBusy(true); setError(''); const controller = new AbortController(); audioAbort.current = controller;
    try { const result = await uploadSearch('voice', uri, name, type, controller.signal); if (alive.current) { setInput(result.transcript || result.query); setVoice(false); } }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Could not transcribe. Please type instead.'); }
    finally { if (alive.current) setBusy(false); }
  };
  return <KeyboardAvoidingView testID="assistant-screen" behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.screen, { paddingTop: insets.top, paddingBottom: Math.max(12, insets.bottom) }]}>
    <View style={styles.header}><Pressable testID="assistant-close" accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.round}><Icon name="arrow-back" size={22} color={colors.onSurface} /></Pressable><View style={styles.headerTitle}><Text testID="assistant-title" style={styles.title}>One, for you.</Text><Text style={styles.subtitle}>YOUR CITY’S SHOPPING SIDEKICK</Text></View><Pressable testID="assistant-new-chat" accessibilityLabel="Start a new conversation" disabled={busy || loading} onPress={() => void initialize(true)} style={styles.round}><Icon name="create-outline" size={21} color={colors.forest} /></Pressable><Pressable testID="assistant-cart" accessibilityLabel={`Cart with ${totalItems} items`} onPress={() => router.push('/cart' as any)} style={styles.round}><Icon name="bag-handle-outline" size={21} color={colors.forest} />{totalItems > 0 && <Text testID="assistant-cart-count" style={styles.badge}>{totalItems}</Text>}</Pressable></View>
    <AssistantShoppingTools budget={budget} setBudget={setBudget} vegetarian={vegetarian} setVegetarian={setVegetarian} disabled={busy || loading} count={totalItems} analyse={() => send('Review my current cart, tell me the subtotal, suggest value swaps, and identify useful missing essentials. Do not change my cart.')} />
    <ScrollView ref={list} testID="assistant-conversation" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.conversation} onContentSizeChange={() => { if (busy) list.current?.scrollToEnd({ animated: false }); }}>
      {loading ? <ActivityIndicator testID="assistant-loading" color={colors.forest} style={styles.loading} /> : !messages.length && <View testID="assistant-welcome" style={styles.welcome}><View style={styles.orb}><OneGlyph size={65} /></View><Text style={styles.welcomeTitle}>Big plans.<Text style={styles.green}> Little help?</Text></Text><Text style={styles.welcomeCopy}>From your next meal to your smartest buy.\nTell One what’s on your mind.</Text>{STARTERS.map((s, i) => <Pressable key={s.title} testID={`assistant-starter-${i}`} disabled={busy || !session} onPress={() => send(s.text)} style={({ pressed }) => [styles.starter, pressed && styles.pressed]}><Icon name={s.icon as any} size={21} color={colors.forest} /><Text style={styles.starterText}>{s.title}</Text><Icon name="arrow-up-right-box-outline" size={17} color={colors.forest} /></Pressable>)}<Text testID="assistant-limitations" style={styles.disclaimer}>AI can make mistakes. Catalogue prices are samples; live retailer prices aren’t connected. Meal ideas are general guidance.</Text></View>}
      {messages.map((message, i) => <AssistantMessage key={i} message={message} index={i} onError={setError} />)}
      {busy && <View testID="assistant-thinking" style={styles.thinking}><ActivityIndicator color={colors.forest} size="small" /><Text testID="assistant-stream-text" style={styles.partial}>{partial || 'One is finding a little goodness for you…'}</Text></View>}
    </ScrollView>
    {!!error && <View testID="assistant-error" style={styles.error}><Text style={styles.errorText}>{error}</Text>{!session && <Pressable testID="assistant-retry" style={styles.round} onPress={() => void initialize()}><Text style={styles.errorText}>Retry</Text></Pressable>}</View>}
    {voice && <VoiceSearchControl disabled={busy} onRecording={recording} onError={setError} />}
    <View style={styles.composer}><Pressable testID="assistant-voice" accessibilityLabel={voice ? 'Hide microphone' : 'Speak to One'} disabled={busy || loading} onPress={() => setVoice(!voice)} style={styles.round}><Icon name={voice ? 'close' : 'mic-outline'} size={22} color={colors.forest} /></Pressable><TextInput testID="assistant-input" accessibilityLabel="Message One" value={input} onChangeText={setInput} placeholder="Ask anything. Make it a One thing." placeholderTextColor={colors.muted} style={styles.input} maxLength={2000} multiline editable={!busy && !loading} /><Pressable testID="assistant-send" accessibilityLabel="Send message" disabled={busy || loading || !input.trim() || !session} onPress={() => send()} style={[styles.send, (busy || !input.trim() || !session) && styles.disabled]}><Icon name="arrow-up" size={21} color={colors.onSurface} /></Pressable></View>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.surface }, header: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }, round: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 }, headerTitle: { flex: 1 }, title: { fontSize: 18, fontWeight: '700', color: colors.onSurface }, subtitle: { fontSize: 6.5, color: colors.muted, letterSpacing: 1, marginTop: 4 }, badge: { position: 'absolute', right: 0, top: 0, backgroundColor: colors.lime, borderRadius: 9, paddingHorizontal: 4, color: colors.forest, fontSize: 10 }, conversation: { paddingVertical: 23, flexGrow: 1 }, loading: { marginTop: 70 }, welcome: { paddingHorizontal: 25, paddingTop: 15, alignItems: 'center' }, orb: { width: 110, height: 110, borderRadius: 42, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-6deg' }], borderWidth: 8, borderColor: colors.limeSoft }, welcomeTitle: { fontSize: 25, fontWeight: '700', color: colors.onSurface, marginTop: 25, letterSpacing: -0.8 }, green: { color: colors.forest }, welcomeCopy: { color: colors.muted, fontSize: 12, lineHeight: 20, textAlign: 'center', marginTop: 10, marginBottom: 25 }, starter: { width: '100%', minHeight: 56, borderRadius: 24, backgroundColor: colors.cream, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 17, marginBottom: 9 }, starterText: { flex: 1, fontSize: 12, fontWeight: '500', color: colors.onSurface }, disclaimer: { color: colors.muted, fontSize: 9, lineHeight: 16, textAlign: 'center', marginTop: 15 }, thinking: { marginHorizontal: 20, padding: 16, borderRadius: 24, backgroundColor: colors.limeSoft, gap: 10, alignItems: 'flex-start' }, partial: { color: colors.forest, fontSize: 13, lineHeight: 21 }, composer: { marginHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 29, padding: 5, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cream }, input: { flex: 1, color: colors.onSurface, fontSize: 12, minHeight: 44, maxHeight: 110, paddingVertical: 12 }, send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.4 }, error: { margin: 12, padding: 12, backgroundColor: colors.error, borderRadius: 18, flexDirection: 'row', alignItems: 'center' }, errorText: { color: colors.onError, fontSize: 11, flex: 1 }, pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] } });
// Live only once its feature is switched on (src/features.ts); otherwise a 'coming soon' screen.
export default function Assistant() { return useFeatures().assistant ? <AssistantScreen /> : <ComingSoon feature="assistant" />; }
