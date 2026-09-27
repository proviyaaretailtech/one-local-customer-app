// Food comes from one restaurant per order, like Swiggy Food, so adding a dish from another
// restaurant asks before the food cart is emptied. Shopping carts mix stores freely and never ask.
// Shown by CartProvider (src/cart.tsx); the server refuses a two-restaurant food checkout as well.
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@react-native-vector-icons/ionicons';
import { colors, radius, spacing } from '../theme';

export function ReplaceCartSheet({ from, to, onKeep, onReplace }: { from: string; to: string; onKeep: () => void; onReplace: () => void }) {
  const insets = useSafeAreaInsets();
  return <Modal visible transparent animationType="slide" onRequestClose={onKeep}>
    <Pressable style={s.backdrop} onPress={onKeep} accessibilityLabel="Keep current cart" />
    <View testID="replace-cart-sheet" accessibilityViewIsModal style={[s.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={s.handle} />
      <View style={s.icon}><Icon name="restaurant-outline" size={22} color={colors.forest} /></View>
      <Text style={s.title}>Replace cart?</Text>
      <Text testID="replace-cart-message" style={s.body}>Your cart has items from {from}. Start a new cart with {to}?</Text>
      <Text style={s.note}>Food comes from one restaurant per order. Your shopping cart stays as it is.</Text>
      <View style={s.actions}>
        <Pressable testID="replace-cart-keep" accessibilityRole="button" onPress={onKeep} style={({ pressed }) => [s.btn, s.ghost, pressed && s.pressed]}><Text style={s.ghostText}>Keep current</Text></Pressable>
        <Pressable testID="replace-cart-start" accessibilityRole="button" onPress={onReplace} style={({ pressed }) => [s.btn, s.primary, pressed && s.pressed]}><Text style={s.primaryText}>Start new</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.limeSoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: colors.onSurface, marginTop: spacing.md },
  body: { fontSize: 15, lineHeight: 22, color: colors.onSurface, marginTop: 6 },
  note: { fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 6 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  btn: { flex: 1, minHeight: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  ghost: { borderWidth: 1, borderColor: colors.forest, backgroundColor: colors.surface },
  ghostText: { color: colors.forest, fontSize: 15, fontWeight: '800' },
  primary: { backgroundColor: colors.brandPrimary },
  primaryText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.85 },
});
