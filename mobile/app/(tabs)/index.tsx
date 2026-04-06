import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, BorderRadius, MinTouchTarget } from '../../constants/theme';
import { platformShadow } from '../../utils/platformShadow';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={[styles.statIconWrap, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({ total: 0, pending: 0, highRisk: 0, toSync: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('assessments').select('status, ai_fused_label');
      const list = data ?? [];
      setStats({
        total: list.length,
        pending: list.filter(a => a.status === 'pending-review').length,
        highRisk: list.filter(a => a.ai_fused_label === 'high' || a.ai_fused_label === 'UNSAFE').length,
        toSync: list.filter(a => a.status === 'pending-sync').length,
      });
      setLoading(false);
    }
    load();
  }, []);

  const displayName = profile?.full_name || profile?.email || 'Inspector';
  const roleLabel = profile?.role?.toUpperCase() || 'INSPECTOR';
  const lguCode = profile?.lgu_code || '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <LinearGradient
        colors={['#1E4E8D', '#153A69', '#0F294A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <Text style={styles.heroEyebrow}>RAPID FIELD OPERATIONS</Text>
        <Text style={styles.greeting}>Welcome, {displayName}</Text>
        <Text style={styles.role}>{roleLabel}{lguCode ? ` \u2022 ${lguCode}` : ''}</Text>
        <View style={styles.heroPills}>
          <View style={styles.heroPill}>
            <Text style={styles.heroPillText}>Offline-First Capture</Text>
          </View>
          <View style={styles.heroPill}>
            <Text style={styles.heroPillText}>AI-Assisted Triage</Text>
          </View>
        </View>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: Spacing.xl }} />
      ) : (
        <>
          <View style={styles.statsRow}>
            <StatCard icon="clipboard" label="Total" value={stats.total} color={Colors.primary} />
            <StatCard icon="time" label="Pending" value={stats.pending} color={Colors.warning} />
          </View>
          <View style={styles.statsRow}>
            <StatCard icon="alert-circle" label="High Risk" value={stats.highRisk} color={Colors.error} />
            <StatCard icon="cloud-upload" label="To Sync" value={stats.toSync} color={Colors.statusPendingSync} />
          </View>
        </>
      )}

      <TouchableOpacity style={styles.newButton} onPress={() => router.push('/assessment/new')}>
        <LinearGradient
          colors={['#1E4E8D', '#143A6B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.newButtonGradient}
        >
          <Ionicons name="add-circle" size={24} color="#FFFFFF" />
          <Text style={styles.newButtonText}>New Assessment</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl },
  heroCard: {
    backgroundColor: Colors.primaryDark,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...platformShadow('#0F172A', { width: 0, height: 10 }, 0.28, 16, 7),
  },
  heroEyebrow: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.8)', letterSpacing: 0.7, fontWeight: '700' },
  greeting: { fontSize: FontSize.xl, fontWeight: '800', color: '#FFFFFF', marginTop: 2 },
  role: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.sm },
  heroPill: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  heroPillText: { color: '#FFFFFF', fontSize: FontSize.xs, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderLeftWidth: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...platformShadow('#0F172A', { width: 0, height: 4 }, 0.07, 8, 2),
  },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.text, marginTop: Spacing.xs },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  newButton: {
    height: MinTouchTarget + 8,
    borderRadius: BorderRadius.md,
    marginVertical: Spacing.md,
    overflow: 'hidden',
    ...platformShadow('#0F172A', { width: 0, height: 8 }, 0.25, 12, 5),
  },
  newButtonGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  newButtonText: { color: '#FFFFFF', fontSize: FontSize.lg, fontWeight: '700' },
});
