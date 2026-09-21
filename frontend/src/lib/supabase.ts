// Supabase is used by the app ONLY to sign customers in. Data never goes from the app straight
// to the database: it goes through app/api, which checks who is asking (plan: one API).
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

if (Platform.OS !== 'web') require('react-native-url-polyfill/auto');

export const SUPABASE_URL: string | undefined = Constants.expoConfig?.extra?.supabaseUrl;
export const SUPABASE_KEY: string | undefined = Constants.expoConfig?.extra?.supabaseAnonKey;
const inBrowser = typeof window !== 'undefined';

export const supabase: SupabaseClient | null = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        flowType: 'pkce',
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        // The web page is also rendered on the server, where there is no browser storage.
        persistSession: Platform.OS !== 'web' || inBrowser,
        autoRefreshToken: Platform.OS !== 'web' || inBrowser,
        detectSessionInUrl: Platform.OS === 'web' && inBrowser,
      },
    })
  : null;

export async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
