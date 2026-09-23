import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration, ActivityIndicator, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';

import { useTheme, makeStyles } from '@/src/theme';
import { useOrder, useAcceptOrder, useRejectOrder } from '@/src/use-orders';
import { CountdownRing } from '@/src/components/countdown-ring';

const PREP_TIMES = [10, 15, 20, 30, 45];
const REJECT_REASONS = ['Item out of stock', 'Kitchen busy', 'Closing soon', 'Other'];

const RING_URL = 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg';

export default function AlertScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const { colors } = useTheme();
  const styles = useStyles();

  const { data: order, isLoading } = useOrder(orderId ?? '');
  const accept = useAcceptOrder();
  const reject = useRejectOrder();

  const totalSeconds = order?.seconds_left ?? 60;
  const [remaining, setRemaining] = useState(totalSeconds);
  const [selectedPrep, setSelectedPrep] = useState(order?.prep_minutes ?? 20);
  const [showReject, setShowReject] = useState(false);
  const [busy, setBusy] = useState(false);

  const deadline = useMemo(() => {
    if (!order?.deadline) return null;
    return +new Date(order.deadline);
  }, [order]);

  const player = useAudioPlayer({ uri: RING_URL });

  useEffect(() => {
    if (order?.prep_minutes) setSelectedPrep(order.prep_minutes);
  }, [order?.prep_minutes]);

  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const sec = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(sec);
      if (sec > 0 && sec <= 10) {
        Vibration.vibrate(200);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (sec > 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
      if (sec <= 0) {
        handleTimeout();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  useEffect(() => {
    let playing = false;
    if (remaining > 0 && player) {
      player.loop = true;
      player.play();
      playing = true;
    }
    return () => {
      if (playing && player) {
        player.pause();
      }
    };
  }, [remaining, player]);

  const handleAccept = async () => {
    if (!order) return;
    setBusy(true);
    try {
      await accept.mutateAsync({ id: order.id, prep_minutes: selectedPrep, version: order.version });
      player?.pause();
      router.replace('/orders?tab=preparing');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!order) return;
    setBusy(true);
    try {
      await reject.mutateAsync({ id: order.id, reason, version: order.version });
      player?.pause();
      router.replace('/orders');
    } finally {
      setBusy(false);
    }
  };

  const handleTimeout = async () => {
    if (!order || order.status !== 'placed' || busy) return;
    setBusy(true);
    try {
      await reject.mutateAsync({ id: order.id, reason: 'timed out', version: order.version });
      player?.pause();
      router.replace('/orders');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !order) {
    return (
      <View style={[styles.container, { backgroundColor: colors.partnerAccentSoft }]}>
        <ActivityIndicator color={colors.partnerOnAccent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.partnerAccentSoft }]}>
      <View style={styles.ringWrap}>
        <CountdownRing seconds={remaining} total={totalSeconds} size={220} stroke={14} color={remaining <= 10 ? colors.onError : colors.partnerAccent} />
        <View style={styles.ringCenter}>
          <Text style={styles.ringSeconds}>{remaining}</Text>
          <Text style={styles.ringLabel}>seconds</Text>
        </View>
      </View>

      <Text style={styles.title}>NEW ORDER</Text>
      <Text style={styles.orderNumber}>{order.display_no || order.id}</Text>

      <View style={styles.card}>
        <Text style={styles.customer}>{order.customer_name} · {order.address?.area ?? 'Delivery'}</Text>
        <Text style={styles.items}>{order.item_count} items · ₹{Math.round(order.total)} · {order.payment}</Text>
        {order.items.map((item, idx) => (
          <View key={idx} style={styles.itemRow}>
            <Text style={styles.itemQty}>{item.qty}×</Text>
            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
            {item.notes ? <Text style={styles.itemNote}> ({item.notes})</Text> : null}
          </View>
        ))}
      </View>

      <View style={styles.prepWrap}>
        <Text style={styles.prepLabel}>Prep time</Text>
        <View style={styles.prepRow}>
          {PREP_TIMES.map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.prepChip, selectedPrep === t && { backgroundColor: colors.partnerAccent }]}
              onPress={() => setSelectedPrep(t)}
              activeOpacity={0.8}
            >
              <Text style={[styles.prepChipText, selectedPrep === t && { color: colors.partnerOnAccent }]}>{t}m</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.acceptButton, busy && { opacity: 0.6 }]}
          onPress={handleAccept}
          disabled={busy}
          activeOpacity={0.8}
        >
          <Text style={styles.acceptText}>ACCEPT · {selectedPrep} MIN</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.rejectButton, busy && { opacity: 0.6 }]}
          onPress={() => setShowReject(true)}
          disabled={busy}
          activeOpacity={0.8}
        >
          <Text style={styles.rejectText}>REJECT</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showReject} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={styles.modalTitle}>Why are you rejecting?</Text>
            {REJECT_REASONS.map(reason => (
              <TouchableOpacity
                key={reason}
                style={styles.reasonRow}
                onPress={() => { setShowReject(false); handleReject(reason); }}
                disabled={busy}
                activeOpacity={0.8}
              >
                <Text style={styles.reasonText}>{reason}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowReject(false)} activeOpacity={0.8}>
              <Text style={[styles.reasonText, { color: colors.muted, marginTop: 12 }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  container: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  ringWrap: {
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  ringSeconds: {
    fontSize: 56,
    fontWeight: '900',
    color: colors.onSurface,
  },
  ringLabel: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '700',
  },
  title: {
    marginTop: 24,
    fontSize: 14,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 2,
  },
  orderNumber: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.onSurface,
    marginBottom: 16,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
  },
  customer: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.onSurface,
    marginBottom: 4,
  },
  items: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  itemQty: {
    width: 28,
    fontSize: 14,
    fontWeight: '800',
    color: colors.onSurface,
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    color: colors.onSurface,
  },
  itemNote: {
    fontSize: 12,
    color: colors.muted,
  },
  prepWrap: {
    width: '100%',
    marginBottom: 20,
  },
  prepLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 8,
  },
  prepRow: {
    flexDirection: 'row',
    gap: 8,
  },
  prepChip: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  prepChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.onSurface,
  },
  actions: {
    width: '100%',
    gap: 12,
    marginTop: 'auto',
    marginBottom: 16,
  },
  acceptButton: {
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.partnerAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.partnerOnAccent,
  },
  rejectButton: {
    height: 56,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  rejectText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.onError,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.onSurface,
    marginBottom: 16,
  },
  reasonRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reasonText: {
    fontSize: 16,
    color: colors.onSurface,
  },
}));
