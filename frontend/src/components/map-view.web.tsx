// Web map: Google Maps JavaScript API. Needs GOOGLE_MAPS_BROWSER_KEY (restricted by referrer).
import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import Icon from '@react-native-vector-icons/ionicons';
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps';
import type { MapViewProps } from './map-view';
import { colors } from '../theme';

const KEY: string | undefined = Constants.expoConfig?.extra?.googleMapsBrowserKey;
export const mapsAvailable = !!KEY;

function Mover({ moveTo }: Pick<MapViewProps, 'moveTo'>) {
  const map = useMap();
  useEffect(() => {
    if (map && moveTo) map.panTo({ lat: moveTo.lat, lng: moveTo.lng });
  }, [map, moveTo]);
  return null;
}

export function MapView({ initial, moveTo, onSettle, style }: MapViewProps) {
  if (!KEY) {
    return (
      <View testID="address-map-missing" style={[style, styles.missing]}>
        <Icon name="map-outline" size={34} color={colors.muted} />
        <Text style={styles.title}>The map is not switched on yet</Text>
        <Text style={styles.body}>It needs a Google Maps key. You can still search for your area or type your address.</Text>
      </View>
    );
  }
  return (
    <View testID="address-map" style={style}>
      <APIProvider apiKey={KEY} language="en" region="IN">
        <Map
          style={{ width: '100%', height: '100%' }}
          defaultCenter={initial}
          defaultZoom={17}
          gestureHandling="greedy"
          disableDefaultUI
          clickableIcons={false}
          onIdle={e => {
            const c = e.map.getCenter();
            if (c) onSettle({ lat: c.lat(), lng: c.lng() });
          }}
        />
        <Mover moveTo={moveTo} />
      </APIProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  missing: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 28, backgroundColor: colors.surfaceSecondary },
  title: { fontSize: 15, fontWeight: '700', color: colors.onSurface, textAlign: 'center' },
  body: { fontSize: 12, color: colors.muted, textAlign: 'center', maxWidth: 300, lineHeight: 17 },
});
