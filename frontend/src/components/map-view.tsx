// Native map (iOS: Apple Maps, Android: Google Maps). The web version is map-view.web.tsx.
import { useEffect, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import RNMapView from 'react-native-maps';
import type { Point } from '../delivery-location';

export type MapViewProps = {
  initial: Point;
  // Change the object (e.g. add a new `at` timestamp) to move the map there.
  moveTo?: (Point & { at: number }) | null;
  onSettle: (center: Point) => void;
  style?: StyleProp<ViewStyle>;
};

const ZOOM = { latitudeDelta: 0.004, longitudeDelta: 0.004 };

export function MapView({ initial, moveTo, onSettle, style }: MapViewProps) {
  const ref = useRef<RNMapView>(null);
  useEffect(() => {
    if (moveTo) ref.current?.animateToRegion({ latitude: moveTo.lat, longitude: moveTo.lng, ...ZOOM }, 450);
  }, [moveTo]);
  return (
    <RNMapView
      ref={ref}
      testID="address-map"
      style={style}
      initialRegion={{ latitude: initial.lat, longitude: initial.lng, ...ZOOM }}
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
      onRegionChangeComplete={r => onSettle({ lat: r.latitude, lng: r.longitude })}
    />
  );
}

export const mapsAvailable = true;
