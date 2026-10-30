import { useEffect, useRef, useState } from 'react';
import { useAppDimensions } from '@/src/layout';
import { View, FlatList, PixelRatio, StyleSheet } from 'react-native';
import { useLocalSearchParams, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Reel } from '@/src/api';
import { useDiscovery } from '@/src/use-discovery';
import { colors } from '@/src/theme';
import { LoadState } from '@/src/components/catalog-sections';
import { ReelCard } from '@/src/components/reel-card';
export default function Reels() {
  const { data, isError, refetch } = useDiscovery();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [height, setHeight] = useState(useAppDimensions().height - 80);
  const [index, setIndex] = useState(0);
  const focused = usePathname() === '/reels';
  const list = useRef<FlatList<Reel>>(null);
  // Jump to the reel that was tapped once per opening. Re-running this whenever the feed refreshed pulled people back to
  // that reel in the middle of a swipe, so the feed looked stuck between two reels.
  const opened = useRef<string | undefined>(undefined);
  useEffect(() => { if (!focused) { opened.current = undefined; return; } if (!data || opened.current === (id ?? '')) return; opened.current = id ?? ''; const target = Math.max(0, data.findIndex(r => r.id === id)); setIndex(target); list.current?.scrollToIndex({ index: target, animated: false }); }, [data, id, focused]);
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => { if (viewableItems.length) setIndex(viewableItems[0].index ?? 0); }).current;
  if (!data) return <LoadState error={isError} retry={refetch} />;
  return <View testID="reels-screen" style={styles.screen} onLayout={e => setHeight(PixelRatio.roundToNearestPixel(e.nativeEvent.layout.height))}>{focused && <StatusBar style="light" />}<FlatList ref={list} testID="reels-list" data={data} keyExtractor={r => r.id} pagingEnabled snapToInterval={height} snapToAlignment="start" disableIntervalMomentum decelerationRate="fast" showsVerticalScrollIndicator={false} getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })} onViewableItemsChanged={onViewableItemsChanged} viewabilityConfig={{ itemVisiblePercentThreshold: 55 }} extraData={`${index}-${height}-${focused}`} windowSize={3} initialNumToRender={1} renderItem={({ item, index: i }) => <ReelCard reel={item} height={height} active={focused && i === index} next={() => list.current?.scrollToIndex({ index: (i + 1) % data.length, animated: true })} />} /></View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.brandPrimary } });