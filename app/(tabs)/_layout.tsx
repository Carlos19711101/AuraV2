import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabsLayout() {
  const insets = useSafeAreaInsets(); // 🔹 Obtiene el espacio seguro inferior

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#C77DFF',
        tabBarInactiveTintColor: 'rgba(233,213,255,0.5)',
        tabBarStyle: {
          backgroundColor: 'rgba(20, 0, 40, 0.92)',
          borderTopWidth: 0,
          borderTopColor: 'transparent',
          elevation: 0,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: -3 },
          // ✅ Altura dinámica: base + espacio inferior seguro
          height: Platform.OS === 'ios' ? 70 + insets.bottom : 60 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.3,
        },
        tabBarIconStyle: {
          marginBottom: 4,
        },
      }}
    >
      {/* Las pantallas se mantienen igual */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shield-checkmark" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="contactos"
        options={{
          title: 'Acompañamiento',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="resources"
        options={{
          title: 'Recursos',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="information-circle" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}