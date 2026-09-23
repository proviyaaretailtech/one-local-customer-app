import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { useTheme, makeStyles } from '@/src/theme';
import { ScreenShell } from '@/src/components/screen-shell';

export default function ItemsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();

  return (
    <ScreenShell>
      <View style={styles.header}>
        <Ionicons name="arrow-back" size={24} color={colors.onSurface} onPress={() => router.back()} />
        <Text style={styles.title}>Items</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={styles.center}>
        <Text style={styles.subtitle}>Item availability controls coming in P2.</Text>
      </View>
    </ScreenShell>
  );
}

const useStyles = makeStyles(colors => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.onSurface,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
}));
