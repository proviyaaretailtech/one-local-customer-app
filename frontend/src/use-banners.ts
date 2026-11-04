// The marketing banners (GET /banners, the ol_banners rows for the customer's city), one query shared by every screen that
// shows them.
import { useQuery } from '@tanstack/react-query';
import { api, Banner } from './api';

const NONE: Banner[] = [];

export function useBanners(): Banner[] {
  const { data } = useQuery({ queryKey: ['banners'], queryFn: () => api<Banner[]>('/banners'), staleTime: 5 * 60_000 });
  return data ?? NONE;
}
