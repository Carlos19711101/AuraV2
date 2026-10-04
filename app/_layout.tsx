import { supabase } from "@/src/lib/supabase";
import { registerGlobals } from "@livekit/react-native";
import * as Notifications from "expo-notifications";
import { Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

registerGlobals();

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
  const pathname = usePathname();
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  const [hasProcessedInitialNotification, setHasProcessedInitialNotification] =
    useState(false);

  const pathnameRef = useRef(pathname);
  const routerRef = useRef(router);
  const lockedRoute = useRef<string | null>(null);

  useEffect(() => {
    pathnameRef.current = pathname;
    if (lockedRoute.current && !pathname.startsWith(lockedRoute.current)) {
      console.log("🔓 Bloqueo liberado al salir de", lockedRoute.current);
      lockedRoute.current = null;
    }
  }, [pathname]);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(() => setIsNavigationReady(true), 800);
    return () => clearTimeout(timer);
  }, []);

  // ✅ Autenticación + Realtime setAuth
  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }: { data: { session: any } }) => {
        if (session?.access_token) {
          supabase.realtime.setAuth(session.access_token);
          console.log("INITIAL_SESSION: Realtime auth configurado");
        }
      });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: string, session: any) => {
        if (session?.access_token) {
          await supabase.realtime.setAuth(session.access_token);
        }
      },
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // ✅ AUTO-NAVEGACIÓN GLOBAL
  useEffect(() => {
    if (!isNavigationReady) return;

    let userId: string | null = null;
    let interval: any = null;
    let channel: any = null;
    let stopped = false;

    const navigateIfNeeded = (session: any) => {
      if (!session) return;

      const current = pathnameRef.current ?? "";
      const sid = session.id;
      const now = Date.now();

      // ✅ VIDEOLLAMADA
      if (
        session.video_call_started_at &&
        session.video_call_started_by &&
        session.video_call_started_by !== userId
      ) {
        const ageSeconds =
          (now - new Date(session.video_call_started_at).getTime()) / 1000;
        if (ageSeconds > 20) return;

        if (lockedRoute.current === "/livekit-video-call") return;
        if (current.includes("livekit-video-call")) return;

        console.log(
          "🚀 NAV → Videollamada iniciada por",
          session.video_call_started_by,
        );
        lockedRoute.current = "/livekit-video-call";
        routerRef.current.push({
          pathname: "/livekit-video-call",
          params: { session_id: sid },
        });
        return;
      }

      // ✅ CHAT
      if (
        session.chat_opened_at &&
        session.chat_opened_by &&
        session.chat_opened_by !== userId
      ) {
        const ageSeconds =
          (now - new Date(session.chat_opened_at).getTime()) / 1000;
        if (ageSeconds > 15) return;

        if (lockedRoute.current === "/chat") return;
        if (current.includes("chat")) return;

        console.log("💬 NAV → Chat abierto por", session.chat_opened_by);
        lockedRoute.current = "/chat";
        routerRef.current.push({
          pathname: "/chat",
          params: { session_id: sid, auto: "1" },
        });
        return;
      }

      // Liberar bloqueo si no hay flags activos
      if (
        !session.video_call_started_at &&
        !session.chat_opened_at &&
        lockedRoute.current
      ) {
        console.log("🔓 Bloqueo liberado (flags limpios)");
        lockedRoute.current = null;
      }
    };

    const checkForChanges = async () => {
      if (!userId || stopped) return;

      const { data, error } = await supabase
        .from("support_sessions")
        .select(
          "id, user_id, accepted_by, status, video_call_started_at, video_call_started_by, chat_opened_at, chat_opened_by",
        )
        .or(`user_id.eq.${userId},accepted_by.eq.${userId}`)
        .in("status", ["pending", "accepted"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) navigateIfNeeded(data);
    };

    const setup = async () => {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
      if (!userId) return;

      console.log("🎯 GLOBAL LISTENER activo para", userId);

      channel = supabase
        .channel(`global_autonav_singleton_${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "support_sessions" },
          (payload) => {
            const session: any = payload.new;
            if (!session) return;
            if (session.user_id !== userId && session.accepted_by !== userId)
              return;
            navigateIfNeeded(session);
          },
        )
        .subscribe((status) => {
          console.log("🔌 Global channel status:", status);
        });

      interval = setInterval(checkForChanges, 10000);
    };

    setup();

    return () => {
      stopped = true;
      if (interval) clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [isNavigationReady]);

  // ✅ Manejar notificaciones
  useEffect(() => {
    if (!isNavigationReady) return;

    const handleInitialNotification = async () => {
      if (hasProcessedInitialNotification) return;
      const response = await Notifications.getLastNotificationResponseAsync();
      if (response) {
        const data = response.notification.request.content.data;
        if (data?.session_id) {
          setTimeout(() => routerRef.current.push("/requests-received"), 300);
        }
        setHasProcessedInitialNotification(true);
      }
    };
    handleInitialNotification();

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        if (data?.session_id) routerRef.current.push("/requests-received");
      });

    const receivedSubscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log("Notif FG:", notification.request.content.title);
      },
    );

    return () => {
      responseSubscription.remove();
      receivedSubscription.remove();
    };
  }, [isNavigationReady, hasProcessedInitialNotification]);

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#1A0033" },
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
