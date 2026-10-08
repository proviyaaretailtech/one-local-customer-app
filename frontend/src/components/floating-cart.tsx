import { useEffect, useRef } from 'react';
import { useAppDimensions } from '../layout';
import { View, Text, Animated, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Icon from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useCart } from '../cart';
import { ThemeColors } from '../theme';
import { usePageColors } from '../use-page-colors';
import { nativeDriver, useMotionAllowed } from '../motion';
import { useFormat, useTranslation } from '../i18n';

export function FloatingCart({ bottom, compact = false }: { bottom: number; compact?: boolean }) {
  const colors = usePageColors(); const styles = getStyles(colors); const { t } = useTranslation(); const fmt = useFormat();
  const { items, totalItems, totalPrice, totalMrp, lastAdded } = useCart();
  const router = useRouter(); const motion = useMotionAllowed(); const { height, width } = useAppDimensions();
  const entrance = useRef(new Animated.Value(0)).current; const bump = useRef(new Animated.Value(1)).current; const flight = useRef(new Animated.Value(1)).current;
  useEffect(() => { if (!motion) { entrance.setValue(totalItems ? 1 : 0); return; } const animation = Animated.spring(entrance, { toValue: totalItems ? 1 : 0, friction: 8, useNativeDriver: nativeDriver }); animation.start(); return () => animation.stop(); }, [entrance, totalItems, motion]);
  useEffect(() => {
    if (!lastAdded || !motion) return;
    flight.setValue(0); bump.setValue(1);
    const animation = Animated.parallel([Animated.timing(flight, { toValue: 1, duration: 650, useNativeDriver: nativeDriver }), Animated.sequence([Animated.delay(400), Animated.spring(bump, { toValue: 1.035, friction: 4, useNativeDriver: nativeDriver }), Animated.spring(bump, { toValue: 1, friction: 5, useNativeDriver: nativeDriver })])]);
    animation.start(); return () => animation.stop();
  }, [lastAdded, motion, flight, bump]);
  if (!totalItems) return null;
  const start = lastAdded?.origin || { x: width * 0.65, y: height - bottom - 170 };
  const endY = height - bottom - 45;
  if (compact) return <Animated.View testID="floating-cart" style={[styles.position, styles.compactPosition, { bottom, left: Math.max(24, (width-278)/2), right: Math.max(24, (width-278)/2), opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [90, 0] }) }, { scale: bump }] }]}><Pressable testID="floating-cart-open" accessibilityLabel={t('shell.cartBar.open', { count: totalItems, total: fmt.money(totalPrice) })} onPress={() => router.navigate('/cart')} style={({ pressed }) => [styles.compactBar, pressed && styles.pressed]}><View style={styles.thumbnails}>{items.slice(-2).map((item,i) => <Image key={item.id} testID={`subcategory-cart-image-${item.id}`} source={item.image} contentFit="contain" style={[styles.compactThumb, { marginLeft: i ? -16 : 0 }]} />)}</View><View style={styles.flex}><Text testID="subcategory-cart-title" style={styles.compactTitle}>{t('shell.cartBar.view')}</Text><Text testID="floating-cart-count" style={styles.compactCount}>{t('shell.cartBar.items', { count: totalItems })}<Text testID="floating-cart-price">{` · ${fmt.money(totalPrice)}`}</Text></Text></View><View style={styles.compactArrow}><Icon name="chevron-forward" size={25} color={colors.forest} /></View></Pressable></Animated.View>;
  return <>
    {motion && lastAdded && <Animated.View testID="cart-flying-product" style={[styles.flying, { opacity: flight.interpolate({ inputRange: [0, 0.05, 0.85, 1], outputRange: [0, 1, 1, 0] }), transform: [{ translateX: flight.interpolate({ inputRange: [0, 1], outputRange: [start.x - 22, 26] }) }, { translateY: flight.interpolate({ inputRange: [0, 0.35, 1], outputRange: [start.y - 22, Math.min(start.y - 95, endY - 100), endY] }) }, { scale: flight.interpolate({ inputRange: [0, 1], outputRange: [1.15, 0.5] }) }] }]}><Image source={lastAdded.product.image} style={styles.flyingImage} /></Animated.View>}
    <Animated.View testID="floating-cart" style={[styles.position, { bottom, opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [110, 0] }) }, { scale: bump }] }]}>
      <View style={styles.savings}><Icon name={totalPrice >= 199 ? 'checkmark-circle' : 'bicycle-outline'} color={colors.forest} size={12} /><Text testID="floating-cart-savings" style={styles.savingsText}>{totalPrice >= 199 ? t('shell.cartBar.freeDelivery', { amount: fmt.money(Math.max(0, totalMrp - totalPrice)) }) : t('shell.cartBar.awayFromFree', { amount: fmt.money(199 - totalPrice) })}</Text><View style={styles.progressTrack}><View style={[styles.progress, { width: `${Math.min(100, totalPrice / 199 * 100)}%` }]} /></View></View>
      <Pressable testID="floating-cart-open" accessibilityLabel={t('shell.cartBar.open', { count: totalItems, total: fmt.money(totalPrice) })} onPress={() => router.navigate('/cart' as any)} style={({ pressed }) => [styles.bar, pressed && styles.pressed]}>
        <View style={styles.thumbnails}>{items.slice(-2).map((item, i) => <Image key={item.id} source={item.image} style={[styles.thumb, { marginLeft: i ? -20 : 0, transform: [{ rotate: i ? '8deg' : '-8deg' }] }]} />)}</View>
        <View style={styles.flex}><Text testID="floating-cart-count" style={styles.count}>{t('shell.cartBar.inBag', { count: totalItems })}</Text><Text testID="floating-cart-price" style={styles.price}>{fmt.money(totalPrice)}<Text style={styles.fee}>{` ${t('shell.cartBar.fees')}`}</Text></Text></View>
        <Text style={styles.cta}>{t('shell.cartBar.view')}</Text><View style={styles.arrow}><Icon name="arrow-forward" size={18} color={colors.onSurface} /></View>
      </Pressable>
    </Animated.View>
  </>;
}
const getStyles = (colors: ThemeColors) => StyleSheet.create({
  compactPosition: { borderRadius: 40, backgroundColor: colors.forest }, compactBar: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 9, paddingLeft: 12 }, compactThumb: { width: 43, height: 43, borderRadius: 22, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.surface }, compactTitle: { color: colors.surface, fontSize: 16, fontWeight: '600' }, compactCount: { color: colors.cityMid, fontSize: 10, marginTop: 4 }, compactArrow: { width: 45, height: 45, borderRadius: 23, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  position: { position: 'absolute', left: 14, right: 14, zIndex: 40, borderRadius: 26, backgroundColor: colors.limeSoft, boxShadow: [{ offsetX: 0, offsetY: 6, blurRadius: 22, color: colors.overlay }] }, savings: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 4, minHeight: 27 }, savingsText: { fontSize: 9, color: colors.forest, fontWeight: '600', flex: 1 }, progressTrack: { width: 30, height: 3, borderRadius: 2, backgroundColor: colors.cityMid, overflow: 'hidden' }, progress: { height: 3, backgroundColor: colors.forest }, bar: { backgroundColor: colors.forestDeep, borderRadius: 24, padding: 10, minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 9 }, thumbnails: { flexDirection: 'row' }, thumb: { width: 36, height: 38, borderRadius: 12, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.surface }, flex: { flex: 1 }, count: { color: colors.surface, fontSize: 11, fontWeight: '700' }, price: { color: colors.lime, fontSize: 12, fontWeight: '700', marginTop: 4 }, fee: { color: colors.onSurfaceInverse, fontSize: 7, fontWeight: '400' }, cta: { fontSize: 11, fontWeight: '600', color: colors.surface }, arrow: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lime }, flying: { position: 'absolute', left: 0, top: 0, zIndex: 60, width: 44, height: 44, pointerEvents: 'none' }, flyingImage: { width: 44, height: 44, borderRadius: 16, borderWidth: 2, borderColor: colors.lime }, pressed: { opacity: 0.8 },
});