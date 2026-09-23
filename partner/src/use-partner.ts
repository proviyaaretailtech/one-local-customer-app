import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { partnerGet, partnerPatch } from './api';

export type PartnerRole = string;

export type Person = {
  id: string;
  email: string;
  name: string;
  role: PartnerRole;
  organization_id: string;
};

export type Restaurant = {
  id: string;
  name: string;
  accepting: boolean;
  back_at: string | null;
  default_prep_minutes: number;
  accept_window_seconds: number;
  missed_in_a_row: number;
  address: string | { area?: string | null } | null;
  set_up: boolean;
};

export type MeResponse = { person: Person; restaurant: Restaurant };

export function useMe() {
  return useQuery<MeResponse>({
    queryKey: ['partner', 'me'],
    queryFn: () => partnerGet('/me'),
  });
}

export function useUpdateOutlet() {
  const qc = useQueryClient();
  return useMutation<Restaurant, Error, Partial<Pick<Restaurant, 'accepting' | 'back_at'>>>({
    mutationFn: body => partnerPatch('/outlet', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partner', 'me'] }),
  });
}
