import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize } from '../../constants/theme';
import { platformShadow } from '../../utils/platformShadow';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color, size }: { name: IoniconsName; color: string; size: number }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: FontSize.xs, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: 'transparent',
          borderTopWidth: 0,
          height: 68,
          paddingBottom: 8,
          paddingTop: 6,
          marginHorizontal: 10,
          marginBottom: 8,
          borderRadius: 16,
          position: 'absolute',
          ...platformShadow('#0F172A', { width: 0, height: 8 }, 0.15, 12, 6),
        },
        headerStyle: { backgroundColor: Colors.primaryDark },
        headerTintColor: '#FFFFFF',
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800', fontSize: FontSize.lg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <TabIcon name="home" color={color} size={size} />,
          headerTitle: 'RAPID',
        }}
      />
      <Tabs.Screen
        name="assessments"
        options={{
          title: 'Assessments',
          tabBarIcon: ({ color, size }) => <TabIcon name="clipboard" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="sync"
        options={{
          title: 'Sync',
          tabBarIcon: ({ color, size }) => <TabIcon name="cloud-upload" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <TabIcon name="person" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
