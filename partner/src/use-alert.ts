import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { useMe } from './use-partner';
import { partnerGet } from './api';
import type { PartnerOrder } from './use-orders';

const SEEN_KEY = 'partner-alert-seen';
const seen = new Set<string>();

export function useAlertPoller() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: me } = useMe();
  const accepting = me?.restaurant.accepting ?? false;
  const appActive = useRef(true);

  const { data: newOrders } = useQuery<PartnerOrder[]>({
    queryKey: ['partner', 'orders', 'new'],
    queryFn: () => partnerGet('/orders?tab=new'),
    refetchInterval: 5_000,
    enabled: accepting,
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      appActive.current = state === 'active';
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!newOrders?.length || !appActive.current) return;
    const first = newOrders[0];
    if (pathname.startsWith('/alert')) return;
    if (seen.has(first.id)) return;
    seen.add(first.id);
    router.push(`/alert?orderId=${first.id}`);
  }, [newOrders, pathname, router]);
}

export function markOrderSeen(orderId: string) {
  seen.add(orderId);
}
