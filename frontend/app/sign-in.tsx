// Sign in / create account (Supabase Auth). Email + password works now; a one-time code to an Indian
// mobile number, and Google, each switch themselves on as soon as Supabase has them enabled
// (auth.tsx asks Supabase's public settings). Browsing never needs an account — "Skip for now" is
// always there. Placing an order does: the cart's Pay button opens this screen with next=checkout,
// and signing in returns to the cart, which carries on paying.
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { mobileDigits, useAuth } from '@/src/auth';
import { OneGlyph } from '@/src/components/one-button';
import { colors } from '@/src/theme';

const INK = '#050605';
const CARD = '#101210';
const LINE = 'rgba(255,255,255,0.12)';
const SOFT = 'rgba(255,255,255,0.62)';

export default function SignIn() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle, googleAvailable, phoneAvailable, sendPhoneCode, verifyPhoneCode } = useAuth();
  const router = useRouter(); const insets = useSafeAreaInsets();
  const { welcome, next } = useLocalSearchParams<{ welcome?: string; next?: string }>();
  const checkout = next === 'checkout';
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false); const [busy, setBusy] = useState<'' | 'email' | 'google' | 'phone'>('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  // Mobile number + one-time code: offered first whenever Supabase has phone sign-in switched on.
  const [method, setMethod] = useState<'phone' | 'email'>('phone');
  const byPhone = phoneAvailable && method === 'phone';
  const [mobile, setMobile] = useState(''); const [sentTo, setSentTo] = useState(''); const [code, setCode] = useState('');
  const [wait, setWait] = useState(0);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(w => w - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const leave = () => {
    // From the cart's Pay button: back to the cart, which carries on paying once signed in.
    if (checkout) { if (router.canGoBack()) router.back(); else router.replace('/cart' as never); }
    else if (typeof next === 'string' && next.startsWith('/')) router.replace(next as never);
    else if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };
  const signedIn = () => { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); leave(); };
  const failed = (e: unknown) => {
    setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  };

  const sendCode = async () => {
    setError(''); setNotice('');
    const digits = mobileDigits(mobile);
    if (!/^[6-9]\d{9}$/.test(digits)) return setError('Enter a valid 10-digit mobile number.');
    setBusy('phone');
    try {
      await sendPhoneCode(digits);
      setSentTo(digits); setCode(''); setWait(30);
      setNotice(`We sent a code by SMS to +91 ${digits.slice(0, 5)} ${digits.slice(5)}.`);
    } catch (e) { failed(e); } finally { setBusy(''); }
  };
  const verifyCode = async () => {
    setError('');
    if (code.length < 6) return setError('Enter the 6-digit code from the SMS.');
    setBusy('phone');
    try { await verifyPhoneCode(sentTo, code); signedIn(); } catch (e) { failed(e); } finally { setBusy(''); }
  };

  const submit = async () => {
    setError(''); setNotice('');
    if (mode === 'signup' && name.trim().length < 2) return setError('Tell us your name (at least two letters).');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 6) return setError('Your password needs at least 6 characters.');
    setBusy('email');
    try {
      if (mode === 'signin') await signInWithEmail(email, password);
      else {
        const { needsConfirmation } = await signUpWithEmail(name, email, password);
        if (needsConfirmation) { setNotice('Almost there — confirm your email from the link we sent, then sign in.'); setMode('signin'); return; }
      }
      signedIn();
    } catch (e) { failed(e); } finally { setBusy(''); }
  };

  const google = async () => {
    setError(''); setBusy('google');
    try { await signInWithGoogle(); } catch (e) { setError(e instanceof Error ? e.message : 'Google sign-in did not finish.'); } finally { setBusy(''); }
  };

  return <KeyboardAvoidingView testID="sign-in-screen" behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.screen}>
    <StatusBar style="light" />
    <ScrollView keyboardShouldPersistTaps="handled" horizontal={false} showsHorizontalScrollIndicator={false} contentContainerStyle={[s.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
      <View style={s.top}>
        <View style={s.brand}><OneGlyph size={30} /><Text style={s.brandWord}>neCity</Text></View>
        <Pressable testID="sign-in-skip" accessibilityRole="button" onPress={leave} hitSlop={8} style={s.skip}><Text style={s.skipText}>{welcome ? 'Skip for now' : 'Close'}</Text></Pressable>
      </View>

      <View style={s.hero}>
        <View pointerEvents="none" style={s.glow} />
        {checkout ? <>
          <Text style={s.eyebrow}>ALMOST THERE</Text>
          <Text testID="sign-in-checkout-title" style={s.title}>{'Sign in to place\nyour order.'}</Text>
          <Text style={s.sub}>Your bag is saved. Sign in once and we’ll take you straight back to pay.</Text>
        </> : <>
          <Text style={s.eyebrow}>{mode === 'signin' ? 'WELCOME BACK' : 'NEW HERE?'}</Text>
          <Text style={s.title}>{mode === 'signin' ? 'Your whole city,\none sign-in away.' : 'Make OneCity\nfeel like yours.'}</Text>
          <Text style={s.sub}>Orders that follow you to any phone, saved addresses, and OneLocal Coins when they arrive.</Text>
        </>}
      </View>

      {phoneAvailable && <View testID="sign-in-method" accessibilityRole="tablist" style={[s.segment, { marginBottom: 12 }]}>
        {(['phone', 'email'] as const).map(m => <Pressable key={m} testID={`sign-in-method-${m}`} accessibilityRole="tab" accessibilityState={{ selected: method === m }} onPress={() => { setMethod(m); setError(''); setNotice(''); }} style={[s.segmentItem, method === m && s.segmentOn]}>
          <Text style={[s.segmentText, method === m && s.segmentTextOn]}>{m === 'phone' ? 'Mobile number' : 'Email'}</Text>
        </Pressable>)}
      </View>}

      {byPhone ? <View testID="sign-in-phone" style={s.card}>
        {!sentTo
          ? <Field icon="call-outline" prefix="+91" testID="sign-in-mobile" placeholder="10-digit mobile number" value={mobile} onChangeText={t => setMobile(t.replace(/[^\d ]/g, ''))}
              keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" maxLength={14} onSubmitEditing={sendCode} returnKeyType="go" />
          : <Field icon="keypad-outline" testID="sign-in-code" placeholder="6-digit code" value={code} onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6} onSubmitEditing={verifyCode} returnKeyType="go" />}
        {!!error && <Text testID="sign-in-error" accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
        {!!notice && <Text testID="sign-in-notice" accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
        <Pressable testID="sign-in-submit" accessibilityRole="button" disabled={!!busy} onPress={sentTo ? verifyCode : sendCode} style={({ pressed }) => [s.primary, (pressed || busy === 'phone') && { opacity: 0.85 }]}>
          {busy === 'phone' ? <ActivityIndicator color={INK} /> : <><Text style={s.primaryText}>{sentTo ? 'Verify and continue' : 'Send code'}</Text><Icon name="arrow-forward" size={18} color={INK} /></>}
        </Pressable>
        {!!sentTo && <View style={s.codeLinks}>
          <Pressable testID="sign-in-change-number" accessibilityRole="button" onPress={() => { setSentTo(''); setCode(''); setNotice(''); setError(''); }} style={s.link}><Text style={s.linkText}>Change number</Text></Pressable>
          <Pressable testID="sign-in-resend" accessibilityRole="button" disabled={wait > 0 || !!busy} onPress={sendCode} style={s.link}><Text style={[s.linkText, wait > 0 && { color: SOFT }]}>{wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}</Text></Pressable>
        </View>}
      </View> : <>
      <View testID="sign-in-mode" accessibilityRole="tablist" style={s.segment}>
        {(['signin', 'signup'] as const).map(m => <Pressable key={m} testID={`sign-in-mode-${m}`} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} onPress={() => { setMode(m); setError(''); setNotice(''); }} style={[s.segmentItem, mode === m && s.segmentOn]}>
          <Text style={[s.segmentText, mode === m && s.segmentTextOn]}>{m === 'signin' ? 'Sign in' : 'Create account'}</Text>
        </Pressable>)}
      </View>

      <View style={s.card}>
        {mode === 'signup' && <Field icon="person-outline" testID="sign-in-name" placeholder="Your name" value={name} onChangeText={setName} autoCapitalize="words" textContentType="name" />}
        <Field icon="mail-outline" testID="sign-in-email" placeholder="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress" autoComplete="email" />
        <Field icon="lock-closed-outline" testID="sign-in-password" placeholder={mode === 'signup' ? 'Create a password (6+ characters)' : 'Password'} value={password} onChangeText={setPassword}
          secureTextEntry={!reveal} autoCapitalize="none" textContentType={mode === 'signup' ? 'newPassword' : 'password'} onSubmitEditing={submit} returnKeyType="go"
          trailing={<Pressable testID="sign-in-reveal" accessibilityLabel={reveal ? 'Hide password' : 'Show password'} onPress={() => setReveal(r => !r)} style={s.eye}><Icon name={reveal ? 'eye-off-outline' : 'eye-outline'} size={18} color={SOFT} /></Pressable>} />
        {!!error && <Text testID="sign-in-error" accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
        {!!notice && <Text testID="sign-in-notice" accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
        <Pressable testID="sign-in-submit" accessibilityRole="button" disabled={!!busy} onPress={submit} style={({ pressed }) => [s.primary, (pressed || busy === 'email') && { opacity: 0.85 }]}>
          {busy === 'email' ? <ActivityIndicator color={INK} /> : <><Text style={s.primaryText}>{mode === 'signin' ? 'Sign in' : 'Create my account'}</Text><Icon name="arrow-forward" size={18} color={INK} /></>}
        </Pressable>
      </View>
      </>}

      <View style={s.orRow}><View style={s.orLine} /><Text style={s.or}>or</Text><View style={s.orLine} /></View>

      <Pressable testID="sign-in-google" accessibilityRole="button" accessibilityState={{ disabled: !googleAvailable }} disabled={!googleAvailable || !!busy} onPress={google} style={[s.google, !googleAvailable && s.googleOff]}>
        {busy === 'google' ? <ActivityIndicator color={INK} /> : <><Text style={s.g}>G</Text><Text style={s.googleText}>Continue with Google</Text></>}
        {!googleAvailable && <View testID="sign-in-google-soon" style={s.soon}><Text style={s.soonText}>SOON</Text></View>}
      </Pressable>
      {!googleAvailable && <Text style={s.hint}>Google sign-in switches on as soon as its keys are added.</Text>}

      <Text style={s.legal}>By continuing you agree to OneCity’s terms and privacy policy. We never share your details with stores beyond what an order needs.</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}

function Field({ icon, prefix, trailing, testID, ...input }: React.ComponentProps<typeof TextInput> & { icon: string; prefix?: string; trailing?: React.ReactNode }) {
  return <View style={s.field}>
    <Icon name={icon as any} size={18} color={SOFT} />
    {!!prefix && <Text style={s.prefix}>{prefix}</Text>}
    <TextInput testID={testID} accessibilityLabel={input.placeholder} placeholderTextColor="rgba(255,255,255,0.38)" style={s.input} autoCorrect={false} {...input} />
    {trailing}
  </View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: INK, overflow: 'hidden' },
  content: { paddingHorizontal: 22, flexGrow: 1, overflow: 'hidden' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'flex-end', gap: 1 },
  brandWord: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.6, marginBottom: 1 },
  skip: { zIndex: 5, position: 'relative', minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  skipText: { color: SOFT, fontSize: 13, fontWeight: '600' },
  hero: { marginTop: 34, marginBottom: 26 },
  glow: { position: 'absolute', right: -40, top: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: colors.lime, opacity: 0.16, boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 90, color: colors.lime }] },
  eyebrow: { color: colors.electricLime, fontSize: 11, fontWeight: '800', letterSpacing: 2.5 },
  title: { color: '#fff', fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -1, marginTop: 10 },
  sub: { color: SOFT, fontSize: 13, lineHeight: 20, marginTop: 12, maxWidth: 320 },
  segment: { flexDirection: 'row', backgroundColor: CARD, borderRadius: 16, padding: 4, borderWidth: 1, borderColor: LINE },
  segmentItem: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.electricLime },
  segmentText: { color: SOFT, fontSize: 13, fontWeight: '700' },
  segmentTextOn: { color: INK },
  card: { marginTop: 14, gap: 12 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, paddingHorizontal: 16, borderRadius: 16, backgroundColor: CARD, borderWidth: 1, borderColor: LINE },
  input: { flex: 1, color: '#fff', fontSize: 15, paddingVertical: 14 },
  prefix: { color: '#fff', fontSize: 15, fontWeight: '700' },
  codeLinks: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { color: colors.electricLime, fontSize: 13, fontWeight: '700' },
  eye: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -12 },
  error: { color: '#FF8A8A', fontSize: 12, lineHeight: 18 },
  notice: { color: colors.electricLime, fontSize: 12, lineHeight: 18 },
  primary: { marginTop: 4, minHeight: 56, borderRadius: 18, backgroundColor: colors.electricLime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 28, color: 'rgba(179,244,0,0.35)' }] },
  primaryText: { color: INK, fontSize: 16, fontWeight: '800' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 22 },
  orLine: { flex: 1, height: 1, backgroundColor: LINE },
  or: { color: SOFT, fontSize: 12 },
  google: { minHeight: 54, borderRadius: 18, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  googleOff: { opacity: 0.55 },
  g: { fontSize: 19, fontWeight: '800', color: '#4285F4' },
  googleText: { color: INK, fontSize: 15, fontWeight: '700' },
  soon: { position: 'absolute', right: 14, backgroundColor: INK, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  soonText: { color: colors.electricLime, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  hint: { color: SOFT, fontSize: 11, textAlign: 'center', marginTop: 8 },
  legal: { color: 'rgba(255,255,255,0.4)', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 'auto', paddingTop: 28 },
});
