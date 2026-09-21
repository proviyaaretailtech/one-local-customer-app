// Customer sign-in (Google, through Supabase Auth). Browsing never needs an account.
import { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import { supabase, SUPABASE_KEY, SUPABASE_URL } from './lib/supabase';
import { useCustomer } from './customer';

type AuthState = { ready: boolean; session: Session | null; signInWithGoogle: () => Promise<void>; signOut: () => Promise<void> };
const AuthContext = createContext<AuthState | null>(null);

// Ask Supabase (public settings) whether Google sign-in is switched on, so customers never
// land on a raw error page.
async function googleEnabled(): Promise<boolean> {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY ?? '' } });
    return !!(await r.json())?.external?.google;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null); const [ready, setReady] = useState(!supabase);
  const { profile, update, ready: customerReady } = useCustomer();

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // First sign-in: fill an empty profile from the Google account (never overwrites).
  useEffect(() => {
    const user = session?.user;
    if (!user || !customerReady || (profile.name && profile.email)) return;
    const meta = user.user_metadata ?? {};
    update({ profile: { ...profile, name: profile.name || meta.full_name || meta.name || '', email: profile.email || user.email || '' } }).catch(() => {});
  }, [session?.user?.id, customerReady]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const signOut = async () => { await supabase?.auth.signOut(); };

  return <AuthContext.Provider value={{ ready, session, signInWithGoogle, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider missing');
  return value;
}
