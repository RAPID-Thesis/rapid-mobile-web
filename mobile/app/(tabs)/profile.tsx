import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, BorderRadius, MinTouchTarget } from '../../constants/theme';
import { platformShadow } from '../../utils/platformShadow';
import { useAuth } from '../../context/AuthContext';

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={20} color={Colors.textSecondary} />
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { session, profile, signOut } = useAuth();

  const displayName = profile?.full_name || profile?.email || 'User';
  const roleLabel = profile?.role
    ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
    : 'Inspector';
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/');
  };

  if (!session) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <LinearGradient
          colors={['#FFFFFF', '#F8FAFC']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatarSection}
        >
          <View style={styles.avatarGlow} />
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>?</Text>
          </View>
          <Text style={styles.name}>Offline field mode</Text>
          <View style={[styles.roleBadge, styles.roleBadgeMuted]}>
            <Text style={styles.roleText}>No account required</Text>
          </View>
        </LinearGradient>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Text style={styles.offlineExplain}>
            You can finish assessments without internet. When connection is restored, sign up or
            sign in here, then upload queued records from Sync.
          </Text>
          <TouchableOpacity style={styles.signInPrimary} onPress={() => router.push('/login')} activeOpacity={0.85}>
            <Ionicons name="log-in" size={20} color="#FFFFFF" />
            <Text style={styles.signInPrimaryText}>Sign in</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.signUpSecondary} onPress={() => router.push('/register')} activeOpacity={0.85}>
            <Text style={styles.signUpSecondaryText}>Create account later</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Info</Text>
          <InfoRow icon="information-circle" label="Version" value="1.0.0 MVP" />
          <InfoRow icon="document-text" label="Frameworks" value="FEMA P-154 / ATC-20" />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <LinearGradient
        colors={['#FFFFFF', '#F8FAFC']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.avatarSection}
      >
        <View style={styles.avatarGlow} />
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{displayName}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{roleLabel}</Text>
        </View>
      </LinearGradient>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account Information</Text>
        <InfoRow icon="mail" label="Email" value={profile?.email || '—'} />
        <InfoRow icon="business" label="LGU Code" value={profile?.lgu_code || '—'} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Info</Text>
        <InfoRow icon="information-circle" label="Version" value="1.0.0 MVP" />
        <InfoRow icon="document-text" label="Frameworks" value="FEMA P-154 / ATC-20" />
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
        <Ionicons name="log-out" size={20} color={Colors.error} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  avatarSection: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    overflow: 'hidden',
    ...platformShadow('#0F172A', { width: 0, height: 6 }, 0.08, 10, 3),
  },
  avatarGlow: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#DBEAFE',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  avatarText: { color: '#FFFFFF', fontSize: FontSize.xxl, fontWeight: '700' },
  name: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  roleBadge: {
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.xs,
  },
  roleText: { color: '#FFFFFF', fontSize: FontSize.sm, fontWeight: '600' },
  roleBadgeMuted: { backgroundColor: '#64748B' },
  offlineExplain: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  signInPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: MinTouchTarget,
    backgroundColor: Colors.primaryDark,
    borderRadius: BorderRadius.md,
  },
  signInPrimaryText: { color: '#FFFFFF', fontSize: FontSize.md, fontWeight: '700' },
  signUpSecondary: {
    alignItems: 'center',
    justifyContent: 'center',
    height: MinTouchTarget,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primaryDark,
    marginTop: Spacing.sm,
  },
  signUpSecondaryText: { color: Colors.primaryDark, fontSize: FontSize.md, fontWeight: '700' },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...platformShadow('#0F172A', { width: 0, height: 4 }, 0.05, 8, 2),
  },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  infoValue: { fontSize: FontSize.md, color: Colors.text, fontWeight: '500' },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: MinTouchTarget,
    borderWidth: 1,
    borderColor: Colors.error,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    backgroundColor: '#FFF5F5',
    ...platformShadow('#7F1D1D', { width: 0, height: 3 }, 0.08, 6, 1),
  },
  logoutText: { color: Colors.error, fontSize: FontSize.md, fontWeight: '600' },
});
