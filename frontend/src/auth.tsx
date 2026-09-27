// Customer sign-in through Supabase Auth: email + password; a one-time code by SMS to an Indian
// mobile number once Supabase's Phone provider is on; Google once its keys exist. Browsing and
// filling the cart never need an account; placing an order does (the cart opens sign-in at Pay).
import { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import { supabase, SUPABASE_KEY, SUPABASE_URL } from './lib/supabase';
import { useCustomer } from './customer';
import { afterSignIn } from './privacy';

type AuthState = {
  ready: boolean; session: Session | null; googleAvailable: boolean; phoneAvailable: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (name: string, email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  sendPhoneCode: (mobile: string) => Promise<void>;
  verifyPhoneCode: (mobile: string, code: string) => Promise<void>;
  signOut: (everywhere?: boolean) => Promise<void>;
};

// Supabase's own messages, in words a customer can act on.
function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match. Check them and try again.';
  if (/already registered|already exists/i.test(message)) return 'An account with this email already exists. Sign in instead.';
  if (/password should be at least/i.test(message)) return 'Choose a password with at least 6 characters.';
  if (/email not confirmed/i.test(message)) return 'Please confirm your email first — check your inbox for the link.';
  if (/token has expired or is invalid|otp.*(expired|invalid)|invalid.*otp/i.test(message)) return 'That code is wrong or has expired. Check it, or send a new one.';
  const wait = message.match(/after (\d+) seconds/i);
  if (wait) return `Please wait ${wait[1]} seconds before asking for another code.`;
  if (/phone.*(disabled|not enabled)|unsupported phone provider|signups not allowed for otp/i.test(message)) return 'Sign-in by mobile number isn’t switched on yet. Please use your email for now.';
  if (/sending.*(sms|otp)|sms.*(send|fail)/i.test(message)) return 'We couldn’t send the code. Check the number and try again in a minute.';
  if (/invalid phone|phone number/i.test(message)) return 'Enter a valid 10-digit mobile number.';
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Please wait a minute and try again.';
  return message;
}
const AuthContext = createContext<AuthState | null>(null);

// Ask Supabase (public settings) which sign-in methods are switched on, so a customer is never
// offered one that ends on a raw error page.
async function providers(): Promise<{ google: boolean; phone: boolean }> {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY ?? '' } });
    const external = (await r.json())?.external ?? {};
    return { google: !!external.google, phone: !!external.phone };
  } catch {
    return { google: false, phone: false };
  }
}
const googleEnabled = async () => (await providers()).google;

// Indian mobile numbers only for now: 10 digits starting 6–9, sent as +91…
export const mobileDigits = (value: string) => value.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
function e164(mobile: string) {
  const digits = mobileDigits(mobile);
  if (!/^[6-9]\d{9}$/.test(digits)) throw new Error('Enter a valid 10-digit mobile number.');
  return `+91${digits}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null); const [ready, setReady] = useState(!supabase);
  const [googleAvailable, setGoogleAvailable] = useState(false); const [phoneAvailable, setPhoneAvailable] = useState(false);
  const { profile, update, ready: customerReady } = useCustomer();

  useEffect(() => { void providers().then(p => { setGoogleAvailable(p.google); setPhoneAvailable(p.phone); }); }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // First sign-in: fill an empty profile from the account — name and email from Google or email
  // sign-up, the mobile number from a phone sign-in (never overwrites).
  useEffect(() => {
    const user = session?.user;
    if (!user || !customerReady) return;
    const meta = user.user_metadata ?? {};
    const phone = mobileDigits(user.phone ?? '');
    const next = {
      name: profile.name || meta.full_name || meta.name || '', email: profile.email || user.email || '',
      phone: profile.phone || (/^[6-9]\d{9}$/.test(phone) ? phone : ''),
    };
    if (next.name === profile.name && next.email === profile.email && next.phone === profile.phone) return;
    update({ profile: { ...profile, ...next } }).catch(() => {});
  }, [session?.user?.id, customerReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Privacy choices made on this phone (including at sign-in) go to the account; choices made on
  // another phone come back (src/privacy.ts).
  useEffect(() => { if (session?.user?.id) void afterSignIn(); }, [session?.user?.id]);

  const signInWithGoogle = async () => {
    if (!supabase) throw new Error('Sign-in is not configured for this build.');
    if (!(await googleEnabled())) throw new Error('Google sign-in is not switched on yet. Please try again later.');
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/account` } });
      if (error) throw error;
      return; // the browser now goes to Google and comes back to /account
    }
    const redirectTo = Linking.createURL('account');
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
    if (error || !data?.url) throw error ?? new Error('Could not start Google sign-in.');
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return; // cancelled
    const code = new URL(result.url).searchParams.get('code');
    if (!code) throw new Error('Google sign-in did not finish. Please try again.');
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
  };

  const signInWithEmail = async (email: string, password: string) => {
    if (!supabase) throw new Error('Sign-in is not configured for this build.');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw new Error(friendly(error.message));
  };

  // A new account signs straight in when the project auto-confirms emails; otherwise the customer
  // is told to confirm from their inbox first.
  const signUpWithEmail = async (name: string, email: string, password: string) => {
    if (!supabase) throw new Error('Sign-in is not configured for this build.');
    const { data, error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { full_name: name.trim() } } });
    if (error) throw new Error(friendly(error.message));
    if (name.trim() && customerReady) await update({ profile: { ...profile, name: profile.name || name.trim(), email: profile.email || email.trim().toLowerCase() } }).catch(() => {});
    return { needsConfirmation: !data.session };
  };

  // Mobile number sign-in: Supabase texts a one-time code (creating the account the first time),
  // then the code signs the customer in. Needs Supabase's Phone provider and an SMS provider.
  const sendPhoneCode = async (mobile: string) => {
    if (!supabase) throw new Error('Sign-in is not configured for this build.');
    const { error } = await supabase.auth.signInWithOtp({ phone: e164(mobile) });
    if (error) throw new Error(friendly(error.message));
  };
  const verifyPhoneCode = async (mobile: string, code: string) => {
    if (!supabase) throw new Error('Sign-in is not configured for this build.');
    const token = code.replace(/\D/g, '');
    if (token.length < 4) throw new Error('Enter the code we sent you.');
    const { error } = await supabase.auth.verifyOtp({ phone: e164(mobile), token, type: 'sms' });
    if (error) throw new Error(friendly(error.message));
  };

  // This phone only by default (Supabase's own default signs out every device); "everywhere"
  // ends every session of the account, e.g. after losing a phone.
  const signOut = async (everywhere = false) => {
    const { error } = (await supabase?.auth.signOut({ scope: everywhere ? 'global' : 'local' })) ?? { error: null };
    if (error) throw new Error('Couldn’t sign out right now. Check your connection and try again.');
  };

  return <AuthContext.Provider value={{ ready, session, googleAvailable, phoneAvailable, signInWithGoogle, signInWithEmail, signUpWithEmail, sendPhoneCode, verifyPhoneCode, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider missing');
  return value;
}
