import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { useTheme, makeStyles } from '@/src/theme';
import { useOrder, useMarkReady, useMarkOut, useMarkDelivered } from '@/src/use-orders';
import { ScreenShell } from '@/src/components/screen-shell';

const NEXT_ACTION: Record<string, { label: string; action: 'ready' | 'out' | 'delivered' | null }> = {
  accepted: { label: 'Mark ready', action: 'ready' },
  packed: { label: 'Out for delivery', action: 'out' },
  out: { label: 'Mark delivered', action: 'delivered' },
};

export default function OrderDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const styles = useStyles();
  const { data: order, isLoading } = useOrder(id);
  const markReady = useMarkReady();
  const markOut = useMarkOut();
  const markDelivered = useMarkDelivered();

  const handleNext = async () => {
    if (!order) return;
    const next = NEXT_ACTION[order.status];
    if (!next?.action) return;
    const params = { id: order.id, version: order.version };
    if (next.action === 'ready') await markReady.mutateAsync(params);
    if (next.action === 'out') await markOut.mutateAsync(params);
    if (next.action === 'delivered') await markDelivered.mutateAsync(params);
    router.back();
  };

  const callCustomer = () => {
    if (order?.customer_phone) {
      Linking.openURL(`tel:${order.customer_phone}`).catch(() => {});
    }
  };

  if (isLoading || !order) {
    return (
      <ScreenShell>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      </ScreenShell>
    );
  }

  const next = NEXT_ACTION[order.status];

  return (
    <ScreenShell scroll>
      <TouchableOpacity onPress={() => router.back()} style={styles.back} activeOpacity={0.8}>
        <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        <Text style={styles.backText}>Orders</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{order.display_no || order.id}</Text>
      <Text style={styles.customer}>{order.customer_name} · {order.address?.area ?? 'Delivery'}</Text>

      <View style={styles.card}>
        {order.items.map((item, idx) => (
          <View key={idx} style={styles.itemRow}>
            <Text style={styles.itemQty}>{item.qty}×</Text>
            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.itemPrice}>₹{Math.round(item.price * item.qty)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.billRow}>
          <Text style={styles.billLabel}>Subtotal</Text>
          <Text style={styles.billValue}>₹{Math.round(order.subtotal)}</Text>
        </View>
        <View style={styles.billRow}>
          <Text style={styles.billLabel}>GST</Text>
          <Text style={styles.billValue}>₹{Math.round(order.gst)}</Text>
        </View>
        <View style={styles.billRow}>
          <Text style={styles.billLabel}>Delivery fee</Text>
          <Text style={styles.billValue}>₹{Math.round(order.delivery_fee)}</Text>
        </View>
        <View style={styles.billRow}>
          <Text style={[styles.billLabel, { fontWeight: '800' }]}>Total</Text>
          <Text style={[styles.billValue, { fontWeight: '800' }]}>₹{Math.round(order.total)}</Text>
        </View>
      </View>

      {order.customer_phone ? (
        <TouchableOpacity style={styles.callButton} onPress={callCustomer} activeOpacity={0.8}>
          <Ionicons name="call-outline" size={18} color={colors.onBrandPrimary} />
          <Text style={styles.callText}>Call {order.customer_phone}</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.sectionTitle}>Timeline</Text>
      {(order.events ?? []).map((event, idx) => (
        <View key={idx} style={styles.timelineRow}>
          <View style={[styles.dot, { backgroundColor: idx === 0 ? colors.partnerAccent : colors.borderStrong }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.timelineKind}>{event.kind}</Text>
            <Text style={styles.timelineMeta}>{new Date(event.created_at).toLocaleString()} {event.message ? `· ${event.message}` : ''}</Text>
          </View>
        </View>
      ))}

      {next?.action ? (
        <TouchableOpacity
          style={[styles.nextButton, (markReady.isPending || markOut.isPending || markDelivered.isPending) && { opacity: 0.6 }]}
          onPress={handleNext}
          disabled={markReady.isPending || markOut.isPending || markDelivered.isPending}
          activeOpacity={0.8}
        >
          <Text style={styles.nextButtonText}>{next.label}</Text>
        </TouchableOpacity>
      ) : null}
    </ScreenShell>
  );
}

const useStyles = makeStyles(colors => ({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  backText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.onSurface,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.onSurface,
  },
  customer: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 16,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 24,
    padding: 20,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  itemQty: {
    width: 32,
    fontSize: 14,
    fontWeight: '800',
    color: colors.onSurface,
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    color: colors.onSurface,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurface,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  billLabel: {
    fontSize: 14,
    color: colors.muted,
  },
  billValue: {
    fontSize: 14,
    color: colors.onSurface,
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.brandPrimary,
    marginBottom: 20,
  },
  callText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.onBrandPrimary,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.onSurface,
    marginBottom: 12,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  timelineKind: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurface,
    textTransform: 'capitalize',
  },
  timelineMeta: {
    fontSize: 12,
    color: colors.muted,
  },
  nextButton: {
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.partnerAccent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
    marginBottom: 8,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.partnerOnAccent,
  },
}));
