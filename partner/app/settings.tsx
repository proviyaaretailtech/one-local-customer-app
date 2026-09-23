import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Switch, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';

import { useTheme, makeStyles } from '@/src/theme';
import { useAuth } from '@/src/auth';
import { useMe } from '@/src/use-partner';
import { useCreateTestOrder } from '@/src/use-orders';
import { useRegisterDevice } from '@/src/use-device';
import { ScreenShell } from '@/src/components/screen-shell';

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const { signOut, user } = useAuth();
  const { data: me } = useMe();
  const testOrder = useCreateTestOrder();
  const registerDevice = useRegisterDevice();
  const [pushEnabled, setPushEnabled] = useState(false);

  const handleTestOrder = async () => {
    try {
      const created = await testOrder.mutateAsync();
      router.push(`/alert?orderId=${created.order_id}`);
    } catch {
      // error surfaces via testOrder.error below
    }
  };

  const handleSoundTest = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handlePushToggle = async (value: boolean) => {
    setPushEnabled(value);
    if (value) {
      await registerDevice.mutateAsync();
    }
  };

  const address = me?.restaurant.address;
  const addressText = typeof address === 'string' ? address : address?.area ?? 'No address set';

  return (
    <ScreenShell scroll>
      <TouchableOpacity onPress={() => router.back()} style={styles.back} activeOpacity={0.8}>
        <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Restaurant</Text>
        <Text style={styles.cardValue}>{me?.restaurant.name}</Text>
        <Text style={styles.cardSub}>{addressText}</Text>
        {!me?.restaurant.set_up ? <Text style={styles.warning}>Not set up on One Local</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Signed in as</Text>
        <Text style={styles.cardValue}>{me?.person.name ?? user?.email}</Text>
        <Text style={styles.cardSub}>{me?.person.role}</Text>
      </View>

      {Platform.OS !== 'web' && (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.cardTitle}>Push notifications</Text>
            <Switch
              value={pushEnabled}
              onValueChange={handlePushToggle}
              trackColor={{ false: colors.borderStrong, true: colors.partnerAccent }}
              thumbColor={colors.surface}
            />
          </View>
          {registerDevice.isPending ? <ActivityIndicator color={colors.brandPrimary} /> : null}
          {registerDevice.error ? <Text style={styles.error}>{registerDevice.error.message}</Text> : null}
        </View>
      )}

      <TouchableOpacity style={styles.action} onPress={handleSoundTest} activeOpacity={0.8}>
        <Text style={styles.actionText}>Test vibration</Text>
        <Ionicons name="volume-medium-outline" size={20} color={colors.onSurface} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.testButton, (testOrder.isPending) && { opacity: 0.6 }]}
        onPress={handleTestOrder}
        disabled={testOrder.isPending}
        activeOpacity={0.8}
      >
        {testOrder.isPending ? (
          <ActivityIndicator color={colors.partnerOnAccent} />
        ) : (
          <Text style={styles.testButtonText}>Send test order</Text>
        )}
      </TouchableOpacity>
      {testOrder.error ? <Text style={styles.error}>{testOrder.error.message}</Text> : null}

      <TouchableOpacity style={styles.signOut} onPress={signOut} activeOpacity={0.8}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScreenShell>
  );
}

const useStyles = makeStyles(colors => ({
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
    marginBottom: 16,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    gap: 4,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.onSurface,
  },
  cardSub: {
    fontSize: 13,
    color: colors.muted,
  },
  warning: {
    fontSize: 12,
    color: colors.onError,
    fontWeight: '700',
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  action: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.onSurface,
  },
  testButton: {
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.partnerAccent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  testButtonText: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.partnerOnAccent,
  },
  signOut: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 16,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.onError,
  },
  error: {
    color: colors.onError,
    textAlign: 'center',
    marginTop: 8,
    fontSize: 14,
  },
}));
