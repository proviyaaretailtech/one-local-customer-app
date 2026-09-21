import { createContext, useContext } from 'react';

export type Point = { lat: number; lng: number };

// The address the customer is shopping for: display text plus, when known, its map position
// (needed for delivery-area checks and distances).
export const DeliveryLocationContext = createContext<{
  location: string;
  point: Point | null;
  edit: () => void;
  setLocation: (value: string, point?: Point | null) => void;
}>({ location: 'Latur, Maharashtra', point: null, edit: () => {}, setLocation: () => {} });

export const useDeliveryLocation = () => useContext(DeliveryLocationContext);
