import { supabase } from '@/src/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

type LocationRow = {
  id: string;
  session_id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  created_at: string;
};

type Role = 'emisor' | 'acompañante';

export default function LiveLocationScreen() {
  const router = useRouter();
  const { session_id } = useLocalSearchParams<{ session_id: string }>();

  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [emisorLocation, setEmisorLocation] = useState<{ lat: number; lng: number; updatedAt: string } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showRetentionModal, setShowRetentionModal] = useState(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    let channel: any = null;
    let sessionChannel: any = null;

    const init = async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);

      if (!uid || !session_id) {
        router.replace('/sign-in');
        return;
      }

      // Obtener la sesión
      const { data: session } = await supabase
        .from('support_sessions')
        .select('user_id, accepted_by, status, location_stopped_at')
        .eq('id', session_id)
        .single();

      if (!session) {
        Alert.alert('Error', 'No se pudo cargar la sesión');
        router.back();
        return;
      }

      const currentRole: Role = session.user_id === uid ? 'emisor' : 'acompañante';
      setRole(currentRole);

      // ✅ Si soy acompañante y el emisor YA dejó de compartir, salgo inmediatamente
      if (currentRole === 'acompañante' && session.location_stopped_at) {
        Alert.alert('Ubicación detenida', 'La persona dejó de compartir su ubicación.');
        router.back();
        return;
      }

      // ✅ Acompañante: cargar última ubicación del emisor
      if (currentRole === 'acompañante') {
        const { data: lastLoc } = await supabase
          .from('support_locations')
          .select('*')
          .eq('session_id', session_id)
          .eq('user_id', session.user_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastLoc) {
          setEmisorLocation({
            lat: lastLoc.latitude,
            lng: lastLoc.longitude,
            updatedAt: lastLoc.created_at,
          });
        }
      }

      // ✅ Realtime: escuchar nuevas ubicaciones del EMISOR
      channel = supabase
        .channel(`locations_${session_id}_${Math.random().toString(36).slice(2, 8)}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'support_locations',
            filter: `session_id=eq.${session_id}`,
          },
          (payload) => {
            const loc = payload.new as LocationRow;
            if (loc.user_id === session.user_id) {
              setEmisorLocation({
                lat: loc.latitude,
                lng: loc.longitude,
                updatedAt: loc.created_at,
              });
            }
          }
        )
        .subscribe();

      // ✅ Realtime: si SOY ACOMPAÑANTE, escuchar cuando el emisor deja de compartir
      if (currentRole === 'acompañante') {
        sessionChannel = supabase
          .channel(`session_stop_${session_id}_${Math.random().toString(36).slice(2, 8)}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'support_sessions',
              filter: `id=eq.${session_id}`,
            },
            (payload) => {
              const updated = payload.new as { location_stopped_at: string | null };
              if (updated.location_stopped_at) {
                console.log('El emisor dejó de compartir, saliendo...');
                Alert.alert(
                  'Ubicación detenida',
                  'La persona dejó de compartir su ubicación.',
                  [{ text: 'OK', onPress: () => router.back() }]
                );
              }
            }
          )
          .subscribe();
      }

      setLoading(false);

      // ✅ Emisor: auto-inicia la compartición SOLO una vez
      if (currentRole === 'emisor' && !autoStartedRef.current) {
        autoStartedRef.current = true;
        setTimeout(() => startSharing(uid, session_id), 300);
      }
    };

    init();

    return () => {
      if (channel) supabase.removeChannel(channel);
      if (sessionChannel) supabase.removeChannel(sessionChannel);
      if (watchRef.current) watchRef.current.remove();
    };
  }, [session_id]);

  const startSharing = async (uid: string, sid: string) => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permiso denegado',
        'Para que tu acompañante pueda verte, activa el permiso de ubicación en los ajustes.'
      );
      return;
    }

    setSharing(true);

    // ✅ Al empezar a compartir, limpiar el flag de "detenido"
    await supabase
      .from('support_sessions')
      .update({ location_stopped_at: null })
      .eq('id', sid);

    const initial = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    await sendLocation(uid, sid, initial.coords.latitude, initial.coords.longitude, initial.coords.accuracy);

    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 10000,
        distanceInterval: 10,
      },
      async (loc) => {
        await sendLocation(uid, sid, loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy);
      }
    );
  };

  const stopSharing = async () => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    setSharing(false);

    // ✅ Notificar al receptor que dejaste de compartir
    if (session_id) {
      await supabase
        .from('support_sessions')
        .update({ location_stopped_at: new Date().toISOString() })
        .eq('id', session_id);
    }
  };

  const sendLocation = async (
    uid: string,
    sid: string,
    lat: number,
    lng: number,
    acc: number | null
  ) => {
    await supabase.from('support_locations').insert({
      session_id: sid,
      user_id: uid,
      latitude: lat,
      longitude: lng,
      accuracy: acc,
    });
  };

  const handleStopPress = () => {
    Alert.alert(
      'Dejar de compartir',
      '¿Deseas dejar de compartir tu ubicación?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Dejar de compartir',
          style: 'destructive',
          onPress: async () => {
            await stopSharing();
            setShowRetentionModal(true);
          },
        },
      ]
    );
  };

  const confirmRetention = async (choice: 'delete_now' | 'keep_7_days') => {
    if (!session_id) return;

    try {
      await supabase
        .from('support_sessions')
        .update({ location_retention: choice })
        .eq('id', session_id);

      if (choice === 'delete_now') {
        await supabase.from('support_locations').delete().eq('session_id', session_id);
      }

      setShowRetentionModal(false);
      Alert.alert(
        'Listo',
        choice === 'delete_now'
          ? 'Tu historial de ubicación fue eliminado.'
          : 'Tu historial se conservará por 7 días y luego se eliminará automáticamente.'
      );
      router.back();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo actualizar la retención.');
    }
  };

  const buildMapHtml = () => {
    const centerLat = emisorLocation?.lat || 4.711;
    const centerLng = emisorLocation?.lng || -74.0721;

    const markers: string[] = [];
    if (emisorLocation) {
      markers.push(`[${emisorLocation.lat}, ${emisorLocation.lng}, "Persona acompañada", "#9D4EDD"]`);
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <style>html,body,#map{height:100%;margin:0;padding:0;}</style>
      </head>
      <body>
        <div id="map"></div>
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <script>
          var map = L.map('map').setView([${centerLat}, ${centerLng}], 16);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
          }).addTo(map);

          var markers = [${markers.join(',')}];
          markers.forEach(function(m) {
            var icon = L.divIcon({
              html: '<div style="background:' + m[3] + ';width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px ' + m[3] + ';"></div>',
              iconSize: [26, 26],
              iconAnchor: [13, 13],
            });
            L.marker([m[0], m[1]], { icon: icon }).addTo(map).bindPopup(m[2]);
          });
        </script>
      </body>
      </html>
    `;
  };

  if (loading || !role) {
    return (
      <LinearGradient colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']} style={styles.centered}>
        <ActivityIndicator color="#FFF" size="large" />
      </LinearGradient>
    );
  }

  // ✅ VISTA DEL EMISOR
  if (role === 'emisor') {
    return (
      <LinearGradient colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']} style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Compartir ubicación</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.emisorContent}>
            <View style={[styles.bigStatusCircle, sharing ? styles.circleGreen : styles.circleGray]}>
              <Ionicons name={sharing ? 'location' : 'location-outline'} size={70} color="#FFF" />
            </View>

            <Text style={styles.emisorTitle}>
              {sharing ? 'Estás compartiendo ubicación' : 'Ubicación no compartida'}
            </Text>

            <Text style={styles.emisorSubtitle}>
              {sharing
                ? 'Tu acompañante puede ver dónde estás en tiempo real'
                : 'Pulsa el botón para empezar a compartir'}
            </Text>

            {sharing ? (
              <TouchableOpacity
                style={styles.stopBigButton}
                onPress={handleStopPress}
                activeOpacity={0.85}
              >
                <Ionicons name="stop-circle" size={24} color="#FFF" />
                <Text style={styles.stopBigButtonText}>Dejar de compartir</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.startBigButton}
                onPress={() => userId && session_id && startSharing(userId, session_id)}
                activeOpacity={0.85}
              >
                <Ionicons name="location" size={24} color="#FFF" />
                <Text style={styles.startBigButtonText}>Compartir mi ubicación</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>

        <Modal
          visible={showRetentionModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRetentionModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Ionicons name="shield-checkmark-outline" size={48} color="#9D4EDD" />
              <Text style={styles.modalTitle}>¿Qué hacemos con el recorrido?</Text>
              <Text style={styles.modalText}>
                Tu ubicación se compartió con tu acompañante. Puedes elegir qué hacer
                con el historial.
              </Text>

              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => confirmRetention('delete_now')}
                activeOpacity={0.85}
              >
                <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={styles.modalOptionTitle}>Borrar ahora</Text>
                  <Text style={styles.modalOptionSub}>Elimina el historial inmediatamente</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => confirmRetention('keep_7_days')}
                activeOpacity={0.85}
              >
                <Ionicons name="archive-outline" size={22} color="#2ECC71" />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={styles.modalOptionTitle}>Conservar 7 días</Text>
                  <Text style={styles.modalOptionSub}>
                    Útil como respaldo, se borra automáticamente
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowRetentionModal(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </LinearGradient>
    );
  }

  // ✅ VISTA DEL ACOMPAÑANTE
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Ubicación en vivo</Text>
            <View style={styles.statusBadge}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: emisorLocation ? '#2ECC71' : '#F39C12' },
                ]}
              />
              <Text style={styles.statusText}>
                {emisorLocation ? 'Recibiendo ubicación' : 'Esperando ubicación...'}
              </Text>
            </View>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.mapContainer}>
          {emisorLocation ? (
            <WebView
              source={{ html: buildMapHtml() }}
              style={styles.webview}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              key={`${emisorLocation.lat}-${emisorLocation.lng}`}
            />
          ) : (
            <View style={styles.waitingMap}>
              <ActivityIndicator color="#C77DFF" size="large" />
              <Text style={styles.waitingMapText}>
                Esperando que la persona comparta su ubicación...
              </Text>
            </View>
          )}
        </View>

        <View style={styles.bottomPanel}>
          <View style={styles.infoBox}>
            <Ionicons name="eye" size={20} color="#2ECC71" />
            <Text style={styles.infoText}>
              {emisorLocation
                ? `Actualizado: ${new Date(emisorLocation.updatedAt).toLocaleTimeString()}`
                : 'Aún no hay datos de ubicación'}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A0033' },
  safeArea: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: { alignItems: 'center' },
  headerTitle: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { color: 'rgba(233,213,255,0.7)', fontSize: 11, fontWeight: '600' },
  emisorContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  bigStatusCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 15,
  },
  circleGreen: { backgroundColor: '#2ECC71', shadowColor: '#2ECC71' },
  circleGray: { backgroundColor: 'rgba(157,78,221,0.3)', shadowColor: '#9D4EDD' },
  emisorTitle: { color: '#FFF', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  emisorSubtitle: {
    color: 'rgba(233,213,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 40,
  },
  startBigButton: {
    backgroundColor: '#9D4EDD',
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#9D4EDD',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  startBigButtonText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  stopBigButton: {
    backgroundColor: '#FF4444',
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#FF4444',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  stopBigButtonText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  mapContainer: { flex: 1, backgroundColor: '#000' },
  webview: { flex: 1 },
  waitingMap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A0033',
    paddingHorizontal: 30,
  },
  waitingMapText: {
    color: 'rgba(233,213,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 20,
  },
  bottomPanel: { padding: 16, gap: 12, backgroundColor: 'rgba(26,0,51,0.95)' },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(46,204,113,0.12)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(46,204,113,0.3)',
  },
  infoText: { color: '#2ECC71', fontSize: 12, flex: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#2A0A4A',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 12,
    textAlign: 'center',
  },
  modalText: {
    color: 'rgba(233,213,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 20,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalOptionTitle: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  modalOptionSub: { color: 'rgba(233,213,255,0.6)', fontSize: 12, marginTop: 2 },
  modalCancel: { marginTop: 10, padding: 12 },
  modalCancelText: { color: '#9D4EDD', fontSize: 15, fontWeight: '700' },
});