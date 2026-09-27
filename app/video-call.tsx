import { supabase } from '@/src/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

export default function VideoCallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session_id } = useLocalSearchParams<{ session_id: string }>();
  const [loading, setLoading] = useState(true);
  const [myName, setMyName] = useState('Aura');
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const webViewRef = useRef<WebView>(null);

  // ✅ Pedir permisos nativos al sistema operativo
  useEffect(() => {
    const requestPermissions = async () => {
      if (Platform.OS === 'android') {
        try {
          const result = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.CAMERA,
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          ]);

          const cameraGranted =
            result['android.permission.CAMERA'] ===
            PermissionsAndroid.RESULTS.GRANTED;
          const audioGranted =
            result['android.permission.RECORD_AUDIO'] ===
            PermissionsAndroid.RESULTS.GRANTED;

          if (cameraGranted && audioGranted) {
            setPermissionsGranted(true);
          } else {
            Alert.alert(
              'Permisos requeridos',
              'Para la videollamada necesitamos cámara y micrófono.',
              [{ text: 'OK', onPress: () => router.back() }]
            );
          }
        } catch (err) {
          console.warn('Error pidiendo permisos:', err);
          setPermissionsGranted(true);
        }
      } else {
        setPermissionsGranted(true);
      }
    };

    requestPermissions();
  }, []);

  // ✅ Cargar nombre y notificar al otro
  useEffect(() => {
    if (!permissionsGranted) return;

    const fetchUserName = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, username')
        .eq('id', user.id)
        .maybeSingle();

      const name =
        profileData?.full_name ||
        profileData?.username ||
        user.user_metadata?.full_name ||
        user.email?.split('@')[0] ||
        'Aura';

      setMyName(name);

      if (session_id) {
        await supabase
          .from('support_sessions')
          .update({
            video_call_started_at: new Date().toISOString(),
            video_call_started_by: user.id,
          })
          .eq('id', session_id);
      }
    };

    fetchUserName();
  }, [permissionsGranted, session_id]);

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

  // ✅ Si el otro cierra, salir también
  useEffect(() => {
    if (!session_id) return;

    const channel = supabase
      .channel(`video_call_${session_id}_${Math.random().toString(36).slice(2, 8)}`)
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

  if (!session_id) {
    return (
      <LinearGradient
        colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']}
        style={styles.centered}
      >
        <Ionicons name="alert-circle" size={48} color="#FF6B6B" />
        <Text style={styles.errorText}>No se encontró la sesión</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.errorButton}>
          <Text style={styles.errorButtonText}>Volver</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  if (!permissionsGranted) {
    return (
      <LinearGradient
        colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']}
        style={styles.centered}
      >
        <ActivityIndicator color="#FFF" size="large" />
        <Text style={styles.loadingText}>Solicitando permisos...</Text>
      </LinearGradient>
    );
  }

  const roomName = `AuraPurpura-Sesion-${session_id}`;

  const jitsiHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        html, body, #meet { height: 100%; margin: 0; padding: 0; background: #1A0033; }
      </style>
    </head>
    <body>
      <div id="meet"></div>
      <script src="https://meet.jit.si/external_api.js"></script>
      <script>
        var options = {
          roomName: "${roomName}",
          parentNode: document.querySelector('#meet'),
          width: '100%',
          height: '100%',
          userInfo: { displayName: "${myName.replace(/"/g, '\\"')}" },
          configOverwrite: {
            prejoinConfig: { enabled: false },
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            disableDeepLinking: true,
            disableInviteFunctions: true,
            requireDisplayName: false,
            disableInitialGUM: false, // ✅ Forzar la solicitud de permisos al inicio
            toolbarButtons: [
              'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
              'fodeviceselection', 'hangup', 'profile', 'settings', 'raisehand',
              'videoquality', 'filmstrip', 'tileview', 'select-background',
              'download', 'help', 'mute-everyone', 'security', 'invite', 'chat'
            ]
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            HIDE_DEEP_LINKING_LOGO: true,
            DEFAULT_BACKGROUND: "#1A0033",
            MOBILE_APP_PROMO: false
          }
        };
        var api = new JitsiMeetExternalAPI("meet.jit.si", options);
        api.addEventListener('readyToClose', function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'closed' }));
        });
      </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
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
                <Text style={styles.headerSubtitle}>Cifrado por Jitsi Meet</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>

        <View style={[styles.webviewContainer, { paddingBottom: insets.bottom + 60 }]}>
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color="#FFF" size="large" />
              <Text style={styles.loadingText}>Conectando videollamada...</Text>
            </View>
          )}
          <WebView
            ref={webViewRef}
            source={{ html: jitsiHtml }}
            style={styles.webview}
            onLoadEnd={() => setLoading(false)}
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            startInLoadingState
            allowsFullscreenVideo
            androidLayerType="hardware"
            cacheEnabled={false}
            userAgent={MOBILE_USER_AGENT}
            // ✅ CONCEDER PERMISOS DE CÁMARA Y MICRÓFONO A LA PÁGINA WEB
            // @ts-ignore - la prop existe en Android pero no en los tipos oficiales
            onPermissionRequest={(request: any) => {
              request.grant(request.resources);
            }}
            onMessage={(event) => {
              try {
                const data = JSON.parse(event.nativeEvent.data);
                if (data.type === 'closed') {
                  cleanupCall().then(() => router.back());
                }
              } catch (e) {
                // ignorar
              }
            }}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A0033' },
  safeArea: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { color: '#FFF', fontSize: 16, marginTop: 16, marginBottom: 20, fontWeight: '700' },
  errorButton: { backgroundColor: '#9D4EDD', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  errorButtonText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  loadingText: { color: '#E9D5FF', marginTop: 16, fontSize: 15, fontWeight: '700' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: 'rgba(26,0,51,0.95)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(46,204,113,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  encryptionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  headerSubtitle: { color: '#2ECC71', fontSize: 10, fontWeight: '600' },
  closeButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,68,68,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  webviewContainer: { flex: 1, backgroundColor: '#000' },
  webview: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1A0033',
    justifyContent: 'center', alignItems: 'center', zIndex: 10, padding: 20,
  },
});