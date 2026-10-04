import { supabase } from "@/src/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import {
  AudioSession,
  isTrackReference,
  LiveKitRoom,
  useTracks,
  VideoTrack,
} from "@livekit/react-native";
import { useIsFocused } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Track } from "livekit-client";
import { memo, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  LogBox,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ✅ Silenciar errores benignos confirmados por LiveKit
LogBox.ignoreLogs([
  "NegotiationError",
  "PC manager is closed",
  "UnexpectedConnectionState",
  "cannot negotiate on closed engine",
  "Client initiated disconnect",
  "Local fingerprint does not match identity",
  "cannot send signal request before connected",
]);

const LIVEKIT_WS_URL = "wss://aura-purpura-v51d4ipz.livekit.cloud";

// ✅ Componente memoizado, aislado del ciclo de vida del padre
const StableLiveKitRoom = memo(({ token }: { token: string }) => {
  return (
    <LiveKitRoom
      serverUrl={LIVEKIT_WS_URL}
      token={token}
      connect={true}
      audio={true}
      video={true}
      options={{ adaptiveStream: { pixelDensity: "screen" } }}
    >
      <RoomView />
    </LiveKitRoom>
  );
});

export default function LiveKitVideoCallScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { session_id } = useLocalSearchParams<{ session_id: string }>();

  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ✅ Estado que controla CUÁNDO desmontar el LiveKitRoom
  const [shouldRenderRoom, setShouldRenderRoom] = useState(true);

  const tokenRequestedRef = useRef(false);
  const hasCleanedUpRef = useRef(false);

  // ✅ Pedir token una sola vez
  useEffect(() => {
    if (tokenRequestedRef.current) return;
    if (!session_id) {
      setError("No se encontró la sesión");
      setLoading(false);
      return;
    }
    tokenRequestedRef.current = true;

    const init = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          "generate_livekit_token",
          { body: { session_id } },
        );

        if (fnError || !data?.token) {
          throw new Error(fnError?.message || "No se pudo obtener el token");
        }

        setToken(data.token);

        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          await supabase
            .from("support_sessions")
            .update({
              video_call_started_at: new Date().toISOString(),
              video_call_started_by: userData.user.id,
            })
            .eq("id", session_id);
        }

        setLoading(false);
      } catch (err: any) {
        console.error("Error inicializando videollamada:", err);
        setError(err?.message || "Error al conectar");
        setLoading(false);
      }
    };

    init();
  }, [session_id]);

  // ✅ Sesión de audio
  useEffect(() => {
    AudioSession.startAudioSession();
    return () => {
      AudioSession.stopAudioSession();
    };
  }, []);

  // ✅ CLAVE: Cuando pierde el foco, esperar 800ms antes de desmontar el LiveKitRoom.
  // Eso le da tiempo al SDK a completar su teardown interno limpiamente.
  useEffect(() => {
    if (isFocused) {
      // Si volvió a enfocarse, volver a montar
      setShouldRenderRoom(true);
      return;
    }

    // Si perdió el foco, esperar antes de desmontar
    const timeout = setTimeout(() => {
      console.log("🎥 Desmontando LiveKitRoom después del retraso");
      setShouldRenderRoom(false);
    }, 800);

    return () => clearTimeout(timeout);
  }, [isFocused]);

  // ✅ Cleanup al desmontar (limpiar flag en Supabase)
  useEffect(() => {
    return () => {
      if (!hasCleanedUpRef.current && session_id) {
        hasCleanedUpRef.current = true;
        supabase
          .from("support_sessions")
          .update({
            video_call_started_at: null,
            video_call_started_by: null,
          })
          .eq("id", session_id);
      }
    };
  }, [session_id]);

  // ✅ Si el otro cierra, salir
  useEffect(() => {
    if (!session_id) return;

    const channel = supabase
      .channel(
        `livekit_video_${session_id}_${Math.random().toString(36).slice(2, 8)}`,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "support_sessions",
          filter: `id=eq.${session_id}`,
        },
        (payload) => {
          const updated = payload.new as {
            video_call_started_at: string | null;
          };
          if (!updated.video_call_started_at && !hasCleanedUpRef.current) {
            hasCleanedUpRef.current = true;
            router.back();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session_id, router]);

  const handleClose = () => {
    Alert.alert("Finalizar videollamada", "¿Deseas salir?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Salir",
        style: "destructive",
        onPress: async () => {
          if (!hasCleanedUpRef.current) {
            hasCleanedUpRef.current = true;
            await supabase
              .from("support_sessions")
              .update({
                video_call_started_at: null,
                video_call_started_by: null,
              })
              .eq("id", session_id);
          }
          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <LinearGradient
        colors={["#1A0033", "#3A0CA3", "#7209B7", "#1A0033"]}
        style={styles.centered}
      >
        <ActivityIndicator color="#FFF" size="large" />
        <Text style={styles.loadingText}>Conectando videollamada...</Text>
      </LinearGradient>
    );
  }

  if (error || !token || !session_id) {
    return (
      <LinearGradient
        colors={["#1A0033", "#3A0CA3", "#7209B7", "#1A0033"]}
        style={styles.centered}
      >
        <Ionicons name="alert-circle" size={48} color="#FF6B6B" />
        <Text style={styles.errorText}>{error || "Error al conectar"}</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.errorButton}
        >
          <Text style={styles.errorButtonText}>Volver</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={["#08f5f5", "#3A0CA3", "#7209B7", "#1A0033"]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <View style={styles.headerIcon}>
              <Ionicons name="videocam" size={20} color="#2ECC71" />
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.headerTitle}>Videollamada segura</Text>
              <View style={styles.encryptionRow}>
                <Ionicons name="lock-closed" size={10} color="#2ECC71" />
                <Text style={styles.headerSubtitle}>Cifrado por LiveKit</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* ✅ Montaje controlado con retraso en el desmontaje */}
        {shouldRenderRoom ? <StableLiveKitRoom token={token} /> : null}
      </SafeAreaView>
    </LinearGradient>
  );
}

function RoomView() {
  const tracks = useTracks([Track.Source.Camera]);

  const localTrack = tracks.find((t) => t.participant?.isLocal);
  const remoteTracks = tracks.filter((t) => !t.participant?.isLocal);

  if (remoteTracks.length > 0) {
    return (
      <View style={styles.videoContainer}>
        {isTrackReference(remoteTracks[0]) && (
          <VideoTrack
            key={remoteTracks[0].publication.trackSid}
            trackRef={remoteTracks[0]}
            style={StyleSheet.absoluteFillObject}
          />
        )}

        {localTrack && isTrackReference(localTrack) && (
          <View style={styles.pipContainer}>
            <VideoTrack
              key={localTrack.publication.trackSid}
              trackRef={localTrack}
              style={styles.pipVideo}
            />
          </View>
        )}
      </View>
    );
  }

  if (localTrack && isTrackReference(localTrack)) {
    return (
      <View style={styles.videoContainer}>
        <VideoTrack
          key={localTrack.publication.trackSid}
          trackRef={localTrack}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.waitingOverlay}>
          <ActivityIndicator color="#FFF" size="small" />
          <Text style={styles.waitingText}>
            Esperando al otro participante...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <ActivityIndicator color="#FFF" size="large" />
      <Text style={styles.loadingText}>Conectando...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1A0033" },
  safeArea: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    color: "#FFF",
    fontSize: 16,
    marginTop: 16,
    marginBottom: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  errorButton: {
    backgroundColor: "#9D4EDD",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  errorButtonText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  loadingText: {
    color: "#E9D5FF",
    marginTop: 16,
    fontSize: 15,
    fontWeight: "700",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(26,0,51,0.95)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerInfo: { flexDirection: "row", alignItems: "center", flex: 1 },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(46,204,113,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { color: "#FFF", fontSize: 15, fontWeight: "800" },
  encryptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  headerSubtitle: { color: "#2ECC71", fontSize: 10, fontWeight: "600" },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,68,68,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  videoContainer: { flex: 1, backgroundColor: "#000" },
  pipContainer: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 100,
    height: 140,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  pipVideo: { flex: 1, backgroundColor: "#000" },
  waitingOverlay: {
    position: "absolute",
    bottom: 30,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  waitingText: { color: "#FFF", fontSize: 13, fontWeight: "600" },
});
