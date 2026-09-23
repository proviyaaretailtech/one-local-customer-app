import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { partnerGet, partnerPost } from './api';

export type OrderTab = 'new' | 'preparing' | 'ready' | 'past';

export type Address = { area?: string | null; line?: string | null; label?: string | null } | null;

export type OrderItem = {
  name: string;
  qty: number;
  price: number;
  notes?: string | null;
};

export type OrderEvent = {
  kind: string;
  message?: string | null;
  created_at: string;
};

export type PartnerOrder = {
  id: string;
  one_local_id: string;
  display_no: string;
  status: 'placed' | 'accepted' | 'packed' | 'out' | 'delivered' | 'cancelled';
  pos_status: string;
  version: string;
  placed_at: string;
  deadline: string | null;
  seconds_left: number | null;
  customer_name: string;
  customer_phone: string | null;
  address: Address;
  notes: string | null;
  items: OrderItem[];
  item_count: number;
  subtotal: number;
  gst: number;
  delivery_fee: number;
  total: number;
  payment: string;
  prep_minutes?: number;
  cancel_reason?: string | null;
  events?: OrderEvent[];
};

export function useOrders(tab: OrderTab) {
  return useQuery<PartnerOrder[]>({
    queryKey: ['partner', 'orders', tab],
    queryFn: () => partnerGet(`/orders?tab=${tab}`),
    refetchInterval: tab === 'new' ? 5_000 : 10_000,
  });
}

export function useOrder(id: string) {
  return useQuery<PartnerOrder>({
    queryKey: ['partner', 'order', id],
    queryFn: () => partnerGet(`/orders/${id}`),
    enabled: !!id,
  });
}

function invalidateOrders(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['partner', 'orders'] });
  qc.invalidateQueries({ queryKey: ['partner', 'order'] });
}

export function useAcceptOrder() {
  const qc = useQueryClient();
  return useMutation<PartnerOrder, Error, { id: string; prep_minutes: number; version: string }>({
    mutationFn: ({ id, prep_minutes, version }) =>
      partnerPost(`/orders/${id}/accept`, { prep_minutes, version }),
    onSuccess: () => invalidateOrders(qc),
  });
}

export function useRejectOrder() {
  const qc = useQueryClient();
  return useMutation<PartnerOrder, Error, { id: string; reason: string; version: string }>({
    mutationFn: ({ id, reason, version }) =>
      partnerPost(`/orders/${id}/reject`, { reason, version }),
    onSuccess: () => invalidateOrders(qc),
  });
}

export function useMarkReady() {
  const qc = useQueryClient();
  return useMutation<PartnerOrder, Error, { id: string; version: string }>({
    mutationFn: ({ id, version }) => partnerPost(`/orders/${id}/ready`, { version }),
    onSuccess: () => invalidateOrders(qc),
  });
}

export function useMarkOut() {
  const qc = useQueryClient();
  return useMutation<PartnerOrder, Error, { id: string; version: string }>({
    mutationFn: ({ id, version }) => partnerPost(`/orders/${id}/out`, { version }),
    onSuccess: () => invalidateOrders(qc),
  });
}

export function useMarkDelivered() {
  const qc = useQueryClient();
  return useMutation<PartnerOrder, Error, { id: string; version: string }>({
    mutationFn: ({ id, version }) => partnerPost(`/orders/${id}/delivered`, { version }),
    onSuccess: () => invalidateOrders(qc),
  });
}

export type TestOrderResponse = { order_id: string; display_no: string; push_sent: number };

export function useCreateTestOrder() {
  const qc = useQueryClient();
  return useMutation<TestOrderResponse, Error, void>({
    mutationFn: () => partnerPost('/test-order', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner', 'orders'] }),
  });
}
