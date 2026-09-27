import { supabase } from '@/src/lib/supabase';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// ✅ Handler de notificaciones
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const router = useRouter();
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  const [hasProcessedInitialNotification, setHasProcessedInitialNotification] =
    useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsNavigationReady(true), 800);
    return () => clearTimeout(timer);
  }, []);

  // ✅ Listener global de autenticación + configuración de Realtime
  useEffect(() => {
    // Configurar token inicial si ya hay sesión
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) {
        supabase.realtime.setAuth(data.session.access_token);
        console.log('Realtime auth configurado (sesión inicial)');
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth event:', event);
        if (session?.access_token) {
          await supabase.realtime.setAuth(session.access_token);
          console.log('Realtime auth configurado:', event);
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // ✅ Manejar notificaciones
  useEffect(() => {
    if (!isNavigationReady) return;

    const handleInitialNotification = async () => {
      if (hasProcessedInitialNotification) return;

      const response = await Notifications.getLastNotificationResponseAsync();
      if (response) {
        const data = response.notification.request.content.data;
        console.log('Cold start con notificación:', data);

        if (data?.session_id) {
          setTimeout(() => {
            router.push('/requests-received');
          }, 300);
        }
        setHasProcessedInitialNotification(true);
      }
    };

    handleInitialNotification();

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        console.log('Notificación tocada (listener):', data);
        if (data?.session_id) {
          router.push('/requests-received');
        }
      });

    const receivedSubscription =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log(
          'Notificación recibida en foreground:',
          notification.request.content.title
        );
      });

    return () => {
      responseSubscription.remove();
      receivedSubscription.remove();
    };
  }, [isNavigationReady, hasProcessedInitialNotification, router]);

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#1A0033' },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="sign-up" />
          <Stack.Screen name="info" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="requests-received" />
          <Stack.Screen name="active-support" />
          <Stack.Screen name="companion-session" />
          <Stack.Screen name="chat" />
          <Stack.Screen name="video-call" />
          <Stack.Screen name="live-location" />
        </Stack>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}