import { supabase } from '@/src/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import {
  AudioSession,
  isTrackReference,
  LiveKitRoom,
  useTracks,
  VideoTrack,
} from '@livekit/react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Track } from 'livekit-client';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ⚠️ TU URL de LiveKit
const LIVEKIT_WS_URL = 'wss://aura-purpura-v51d4ipz.livekit.cloud';

export default function LiveKitVideoCallScreen() {
  const router = useRouter();
  const { session_id } = useLocalSearchParams<{ session_id: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ✅ Al montar: obtener token y notificar al otro
  useEffect(() => {
    const init = async () => {
      try {
        if (!session_id) {
          setError('No se encontró la sesión');
          setLoading(false);
          return;
        }

        // 1. Pedir token a la Edge Function
        const { data, error: fnError } = await supabase.functions.invoke(
          'generate_livekit_token',
          { body: { session_id } }
        );

        if (fnError || !data?.token) {
          throw new Error(fnError?.message || 'No se pudo obtener el token');
        }

        setToken(data.token);

        // 2. Notificar al otro que inicié la videollamada
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          await supabase
            .from('support_sessions')
            .update({
              video_call_started_at: new Date().toISOString(),
              video_call_started_by: userData.user.id,
            })
            .eq('id', session_id);
        }

        setLoading(false);
      } catch (err: any) {
        console.error('Error inicializando videollamada:', err);
        setError(err?.message || 'Error al conectar');
        setLoading(false);
      }
    };

    init();
  }, [session_id]);

  // ✅ Iniciar sesión de audio
  useEffect(() => {
    AudioSession.startAudioSession();
    return () => {
      AudioSession.stopAudioSession();
    };
  }, []);

  // ✅ Limpiar al salir
  const cleanupCall = async () => {
    if (!session_id) return;
    await supabase
      .from('support_sessions')
      .update({
        video_call_started_at: null,
        video_call_started_by: null,
      })
      .eq('id', session_id);
  };

  // ✅ Si el otro cierra, salir también
  useEffect(() => {
    if (!session_id) return;

    const channel = supabase
      .channel(`livekit_video_${session_id}_${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_sessions',
          filter: `id=eq.${session_id}`,
        },
        (payload) => {
          const updated = payload.new as { video_call_started_at: string | null };
          if (!updated.video_call_started_at) {
            router.back();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session_id]);

  const handleClose = () => {
    Alert.alert('Finalizar videollamada', '¿Deseas salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: async () => {
          await cleanupCall();
          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <LinearGradient colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']} style={styles.centered}>
        <ActivityIndicator color="#FFF" size="large" />
        <Text style={styles.loadingText}>Conectando videollamada...</Text>
      </LinearGradient>
    );
  }

  if (error || !token) {
    return (
      <LinearGradient colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']} style={styles.centered}>
        <Ionicons name="alert-circle" size={48} color="#FF6B6B" />
        <Text style={styles.errorText}>{error || 'Error al conectar'}</Text>
        <TouchableOpacity
          onPress={async () => {
            await cleanupCall();
            router.back();
          }}
          style={styles.errorButton}
        >
          <Text style={styles.errorButtonText}>Volver</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
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

        <LiveKitRoom
          serverUrl={LIVEKIT_WS_URL}
          token={token}
          connect={true}
          audio={true}
          video={true}
          options={{ adaptiveStream: { pixelDensity: 'screen' } }}
          onDisconnected={() => {
            cleanupCall().then(() => router.back());
          }}
          onError={(err) => {
            console.error('LiveKit error:', err);
            Alert.alert('Error en la videollamada', err?.message || 'Error desconocido');
          }}
        >
          <RoomView />
        </LiveKitRoom>
      </SafeAreaView>
    </LinearGradient>
  );
}

function RoomView() {
  const tracks = useTracks([Track.Source.Camera]);

  if (tracks.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#FFF" size="large" />
        <Text style={styles.loadingText}>Conectando...</Text>
      </View>
    );
  }

  return (
    <View style={styles.videoGrid}>
      {tracks.map((track) => {
        if (!isTrackReference(track)) return null;
        return (
          <VideoTrack
            key={track.publication.trackSid}
            trackRef={track}
            style={styles.videoView}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A0033' },
  safeArea: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: {
    color: '#FFF',
    fontSize: 16,
    marginTop: 16,
    marginBottom: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorButton: {
    backgroundColor: '#9D4EDD',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  errorButtonText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  loadingText: { color: '#E9D5FF', marginTop: 16, fontSize: 15, fontWeight: '700' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(26,0,51,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(46,204,113,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  encryptionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  headerSubtitle: { color: '#2ECC71', fontSize: 10, fontWeight: '600' },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,68,68,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoGrid: {
    flex: 1,
    backgroundColor: '#000',
    flexDirection: 'column',
  },
  videoView: {
    flex: 1,
    backgroundColor: '#000',
  },
});