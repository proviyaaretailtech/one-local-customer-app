import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 'https://ywylhzcxuoeilygzdonx.supabase.co';
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 'sb_publishable_jx2WYiDuTQYrfIFd2BdGew_G_xNg1bG';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// User authentication
export const signUp = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
};

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

// Products
export const getProducts = async (department: string = 'grocery', limit: number = 50) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('department', department)
    .limit(limit);
  if (error) throw error;
  return data;
};

export const getCategories = async (department: string = 'grocery') => {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('department', department);
  if (error) throw error;
  return data;
};

// Orders
export const getOrders = async () => {
  const user = await getCurrentUser();
  if (!user) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', user.id);
  if (error) throw error;
  return data;
};

export const createOrder = async (order: any) => {
  const user = await getCurrentUser();
  if (!user) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('orders')
    .insert({
      ...order,
      user_id: user.id,
    });
  if (error) throw error;
  return data;
};

// Stores
export const getStores = async (department: string = 'grocery') => {
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('department', department);
  if (error) throw error;
  return data;
};

// Realtime subscriptions
export const subscribeToOrders = (userId: string, callback: (order: any) => void) => {
  return supabase
    .from(`orders:user_id=eq.${userId}`)
    .on('*', (payload) => callback(payload.new))
    .subscribe();
};

export const subscribeToRides = (riderId: string, callback: (ride: any) => void) => {
  return supabase
    .from(`rides:rider_id=eq.${riderId}`)
    .on('*', (payload) => callback(payload.new))
    .subscribe();
};
