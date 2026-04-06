import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, BorderRadius, MinTouchTarget } from '../../constants/theme';
import { platformShadow } from '../../utils/platformShadow';

export default function SyncScreen() {
  const [isSyncingNow] = useState(false);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#1E4E8D', '#143A6B', '#102C50']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.healthCard}
      >
        <Text style={styles.healthTitle}>Sync Health</Text>
        <Text style={styles.healthMeta}>100% completed &bull; Up to date</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '100%' }]} />
        </View>
      </LinearGradient>

      <View style={styles.empty}>
        <Ionicons name="checkmark-done-circle" size={48} color={Colors.success} />
        <Text style={styles.emptyTitle}>All synced up!</Text>
        <Text style={styles.emptyBody}>
          Assessments captured offline will queue here and sync automatically when connectivity returns.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  healthCard: {
    backgroundColor: Colors.primaryDark,
    margin: Spacing.md,
    marginBottom: 0,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...platformShadow('#0F172A', { width: 0, height: 8 }, 0.2, 12, 5),
  },
  healthTitle: { color: '#FFFFFF', fontSize: FontSize.md, fontWeight: '800' },
  healthMeta: { color: 'rgba(255,255,255,0.86)', fontSize: FontSize.xs, marginTop: 2, marginBottom: Spacing.sm },
  progressTrack: { width: '100%', height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.26)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: '#FFFFFF' },
  empty: { alignItems: 'center', marginTop: Spacing.xxl, paddingHorizontal: Spacing.lg },
  emptyTitle: { fontSize: FontSize.lg, color: Colors.text, fontWeight: '700', marginTop: Spacing.sm },
  emptyBody: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.xs },
});
