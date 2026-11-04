import { useEffect, useState } from 'react';
import { Tap } from './tap';
import { View, StyleSheet, Animated } from 'react-native';
import { Text } from '@/src/ui/text';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { colors } from '../theme';
import { departments, departmentName } from '../departments';
import { useTranslation } from '../i18n';
import { mediaUrl } from '../api';
import { nativeDriver, useMotionAllowed } from '../motion';
import { useScreenPath } from '../use-screen-path';
import { useLineHeight } from '../layout';

function DepartmentIcon({ id, selected, delay }: { id: string; selected: boolean; delay: number }) {
  const [tilt] = useState(() => new Animated.Value(0)); const motion = useMotionAllowed();
  useEffect(() => {
    if (!motion) { tilt.setValue(0); return; }
    const animation = Animated.sequence([Animated.delay(delay), Animated.timing(tilt, { toValue: -6, duration: 240, useNativeDriver: nativeDriver }), Animated.spring(tilt, { toValue: 0, friction: 3, useNativeDriver: nativeDriver })]);
    animation.start(); return () => animation.stop();
  }, [delay, motion, selected, tilt]);
  return <Animated.View style={[styles.circle, { transform: [{ translateY: tilt }, { rotate: tilt.interpolate({ inputRange: [-6, 0], outputRange: ['-8deg', '0deg'] }) }, { scale: selected ? 1.12 : 1 }] }]}><Image testID={`department-icon-${id}`} source={mediaUrl(`icon-${id}-v4`)} style={styles.icon} contentFit="contain" /></Animated.View>;
}
// Each department page has its own strip (in its header), which marks that page, so a page being left keeps its mark.
export function DepartmentStrip() {
  const path = useScreenPath(); const router = useRouter(); const { t } = useTranslation(); const lineHeight = useLineHeight();
  return <View testID="department-strip" style={styles.row}>{departments.map((d, i) => {
    const selected = path === d.route || (d.id === 'care' && ['/beauty', '/pharmacy'].includes(path));
    return <Tap testID={`department-${d.id}`} accessibilityRole="button" accessibilityLabel={departmentName(t, d.id).replace('\n', ' ')} accessibilityState={{ selected }} key={d.id} onPress={() => router.navigate(d.route)} style={[styles.item]}>
      <DepartmentIcon id={d.id} selected={selected} delay={i * 65} /><Text testID={`department-label-${d.id}`} style={[styles.label, { lineHeight: lineHeight(11, 13) }, selected && styles.active, selected && { color: d.color }]}>{departmentName(t, d.id)}</Text>{selected && <View style={[styles.dot, { backgroundColor: d.color }]} />}
    </Tap>;
  })}</View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 9, paddingBottom: 5 }, item: { flex: 1, alignItems: 'center', minHeight: 81, gap: 3 }, // Cut-out icons straight on the header, no tile or ring; the selected one grows a little and gets the underline.
  circle: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center' }, icon: { width: 54, height: 54 }, label: { color: colors.onSurface, fontSize: 11, lineHeight: 13, fontWeight: '600', textAlign: 'center' }, active: { fontWeight: '700', color: colors.forest }, dot: { width: 12, height: 3, borderRadius: 2, backgroundColor: colors.forest },  });