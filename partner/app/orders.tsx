import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { useTheme, makeStyles } from '@/src/theme';
import { useMe, useUpdateOutlet } from '@/src/use-partner';
import { useOrders, type OrderTab } from '@/src/use-orders';
import { OrderCard } from '@/src/components/order-card';
import { ScreenShell } from '@/src/components/screen-shell';

const TABS: { key: OrderTab; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'past', label: 'Past' },
];

export default function OrdersScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const [tab, setTab] = useState<OrderTab>('new');
  const { data: me, isLoading: meLoading } = useMe();
  const { data: orders, isLoading, isError, refetch, isFetching } = useOrders(tab);
  const updateOutlet = useUpdateOutlet();

  const accepting = me?.restaurant.accepting ?? false;

  return (
    <ScreenShell scroll refreshing={isFetching} onRefresh={refetch}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{me?.restaurant.name ?? 'VINII Partner'}</Text>
          {!me?.restaurant.set_up ? (
            <Text style={styles.setupWarning}>Restaurant not set up on One Local</Text>
          ) : null}
          <View style={styles.acceptingRow}>
            <Switch
              value={accepting}
              onValueChange={value => updateOutlet.mutate({ accepting: value })}
              trackColor={{ false: colors.borderStrong, true: colors.partnerAccent }}
              thumbColor={colors.surface}
              ios_backgroundColor={colors.borderStrong}
            />
            <Text style={[styles.acceptingText, { color: accepting ? colors.forest : colors.muted }]}>
              {accepting ? 'Accepting orders' : 'Not accepting'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.settingsButton} onPress={() => router.push('/settings')} activeOpacity={0.8}>
          <Ionicons name="settings-outline" size={24} color={colors.onSurface} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && { backgroundColor: colors.brandPrimary }]}
            onPress={() => setTab(t.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, tab === t.key && { color: colors.onBrandPrimary }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {meLoading || isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Could not load orders</Text>
          <Text style={styles.emptySubtitle}>Pull down to retry</Text>
        </View>
      ) : orders?.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No {TABS.find(t => t.key === tab)?.label.toLowerCase()} orders</Text>
          <Text style={styles.emptySubtitle}>Orders will appear here when customers order from One Local</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {orders?.map(order => <OrderCard key={order.id} order={order} />)}
        </View>
      )}
    </ScreenShell>
  );
}

const useStyles = makeStyles(colors => ({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.onSurface,
    marginBottom: 8,
  },
  acceptingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  acceptingText: {
    fontSize: 14,
    fontWeight: '700',
  },
  setupWarning: {
    fontSize: 12,
    color: colors.onError,
    fontWeight: '700',
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  list: {
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.onSurface,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
}));
