import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface Order {
  id: string;
  user_id: string;
  status: 'placed' | 'packed' | 'out' | 'delivered' | 'cancelled';
  eta_minutes: number;
  rider_name?: string;
  rider_phone?: string;
  items: any[];
  total: number;
  created_at: string;
}

/**
 * Hook: Subscribe to real-time order updates via Supabase
 */
export function useRealtimeOrders(userId?: string) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const fetchOrders = async () => {
      try {
        setIsLoading(true);
        const { data, error: fetchError } = await supabase
          .from('orders')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;
        setOrders(data || []);
        setError(null);
      } catch (err: any) {
        setError(err.message);
        console.error('Failed to fetch orders:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();

    const channel = supabase
      .channel(`orders-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setOrders((prev) => [payload.new as Order, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setOrders((prev) =>
              prev.map((order) =>
                order.id === payload.new.id ? (payload.new as Order) : order
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setOrders((prev) =>
              prev.filter((order) => order.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  return { orders, isLoading, error };
}

/**
 * Hook: Subscribe to single order
 */
export function useRealtimeOrder(orderId?: string) {
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;

    const fetchOrder = async () => {
      try {
        setIsLoading(true);
        const { data, error: fetchError } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();

        if (fetchError) throw fetchError;
        setOrder(data as Order);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrder();

    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          setOrder(payload.new as Order);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [orderId]);

  return { order, isLoading, error };
}
