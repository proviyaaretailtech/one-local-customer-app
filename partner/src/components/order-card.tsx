import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { useTheme, makeStyles } from '@/src/theme';
import type { PartnerOrder } from '@/src/use-orders';

function ageText(iso: string): string {
  const minutes = Math.floor((Date.now() - +new Date(iso)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function statusChip(status: PartnerOrder['status']) {
  switch (status) {
    case 'placed': return { label: 'NEW', color: '#CC0000', bg: '#FFE6E6' };
    case 'accepted': return { label: 'PREPARING', color: '#997300', bg: '#FFF7D6' };
    case 'packed': return { label: 'READY', color: '#0C831F', bg: '#E6F4EA' };
    case 'out': return { label: 'OUT', color: '#174D37', bg: '#DDF5EA' };
    case 'delivered': return { label: 'DELIVERED', color: '#0C831F', bg: '#E6F4EA' };
    case 'cancelled': return { label: 'CANCELLED', color: '#CC0000', bg: '#FFE6E6' };
  }
}

export function OrderCard({ order }: { order: PartnerOrder }) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const chip = statusChip(order.status);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/order/${order.id}`)}
      activeOpacity={0.8}
    >
      <View style={styles.row}>
        <Text style={styles.number}>{order.display_no || order.id}</Text>
        <View style={[styles.chip, { backgroundColor: chip.bg }]}>
          <Text style={[styles.chipText, { color: chip.color }]}>{chip.label}</Text>
        </View>
      </View>
      <Text style={styles.meta}>{order.item_count} items · {ageText(order.placed_at)} ago</Text>
      <Text style={styles.customer} numberOfLines={1}>
        {order.customer_name} · {order.address?.area ?? 'Delivery'}
      </Text>
      <View style={styles.footer}>
        <Text style={[styles.total, { color: colors.onSurface }]}>₹{Math.round(order.total)}</Text>
        <Text style={styles.payment}>{order.payment}</Text>
      </View>
    </TouchableOpacity>
  );
}

const useStyles = makeStyles(colors => ({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  number: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.onSurface,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  meta: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 4,
  },
  customer: {
    fontSize: 14,
    color: colors.onSurface,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  total: {
    fontSize: 20,
    fontWeight: '800',
  },
  payment: {
    fontSize: 12,
    color: colors.muted,
  },
}));
