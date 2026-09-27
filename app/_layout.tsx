import { supabase } from '@/src/lib/supabase';
import { registerGlobals } from '@livekit/react-native';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// ✅ Registrar los globals de LiveKit una sola vez
registerGlobals();

// ✅ Handler a nivel de módulo (obligatorio según docs de expo-notifications)
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

  // ✅ Listener global de autenticación + Realtime setAuth
  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }: { data: { session: any } }) => {
        if (session?.access_token) {
          console.log('INITIAL_SESSION: Configurando Realtime auth...');
          supabase.realtime.setAuth(session.access_token);
        }
      });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: string, session: any) => {
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
          <Stack.Screen name="livekit-video-call" />
          <Stack.Screen name="live-location" />
        </Stack>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}