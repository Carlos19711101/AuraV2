import { supabase } from '@/src/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type SupportSession = {
  id: string;
  user_id: string;
  accepted_by: string | null;
  status: 'pending' | 'accepted' | 'cancelled' | 'completed';
  created_at: string;
  updated_at: string;
  location_stopped_at?: string | null;
  video_call_started_at?: string | null;
  video_call_started_by?: string | null;
  chat_opened_at?: string | null;
  chat_opened_by?: string | null;
};

type Profile = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type Role = 'emisor' | 'acompañante';

export default function CompanionSessionScreen() {
  const router = useRouter();
  const { session_id } = useLocalSearchParams<{ session_id: string }>();

  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [session, setSession] = useState<SupportSession | null>(null);
  const [emitterProfile, setEmitterProfile] = useState<Profile | null>(null);
  const [companionProfile, setCompanionProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);

  // ============================================================
  // CARGAR SESIÓN Y PERFILES
  // ============================================================
  useEffect(() => {
    let channel: any = null;
    let isMounted = true;

    const init = async () => {
      if (!session_id) {
        Alert.alert('Error', 'No se encontró la sesión');
        router.back();
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      if (!isMounted) return;

      setUserId(uid);

      if (!uid) {
        router.replace('/sign-in');
        return;
      }

      await loadSession(uid);

      channel = supabase
        .channel(`companion_session_${session_id}_${Math.random().toString(36).slice(2, 8)}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'support_sessions',
            filter: `id=eq.${session_id}`,
          },
          (payload) => {
            console.log('Cambio en sesión:', payload);
            loadSession(uid);
          }
        )
        .subscribe();
    };

    init();

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [session_id]);

  const loadSession = async (uid: string) => {
    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from('support_sessions')
        .select('*')
        .eq('id', session_id)
        .single();

      if (sessionError) throw sessionError;
      setSession(sessionData);

      let currentRole: Role | null = null;
      if (sessionData.user_id === uid) {
        currentRole = 'emisor';
      } else if (sessionData.accepted_by === uid) {
        currentRole = 'acompañante';
      } else {
        Alert.alert('Sin acceso', 'No formas parte de esta sesión.');
        router.back();
        return;
      }
      setRole(currentRole);

      const profileIds = [sessionData.user_id, sessionData.accepted_by].filter(
        Boolean
      ) as string[];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, username, avatar_url')
        .in('id', profileIds);

      const emitter = profiles?.find((p) => p.id === sessionData.user_id) || null;
      const companion = sessionData.accepted_by
        ? profiles?.find((p) => p.id === sessionData.accepted_by) || null
        : null;

      setEmitterProfile(emitter);
      setCompanionProfile(companion);

      if (sessionData.status === 'completed' || sessionData.status === 'cancelled') {
        router.back();
      }
    } catch (error: any) {
      console.error('Error cargando sesión:', error);
      Alert.alert('Error', 'No se pudo cargar la sesión');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // AUTO-NAVEGACIÓN: UBICACIÓN (solo acompañante)
  // ============================================================
  useEffect(() => {
    if (!session_id || !role || !session) return;
    if (role !== 'acompañante') return;

    const emitterId = session.user_id;

    const checkExisting = async () => {
      const { data: sessionData } = await supabase
        .from('support_sessions')
        .select('location_stopped_at')
        .eq('id', session_id)
        .single();

      if (sessionData?.location_stopped_at) return;

      const { data } = await supabase
        .from('support_locations')
        .select('id')
        .eq('session_id', session_id)
        .eq('user_id', emitterId)
        .limit(1)
        .maybeSingle();

      if (data) {
        router.push({ pathname: '/live-location', params: { session_id } });
      }
    };

    checkExisting();

    const channel = supabase
      .channel(`companion_autonav_location_${session_id}_${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_locations',
          filter: `session_id=eq.${session_id}`,
        },
        (payload) => {
          const loc = payload.new as { user_id: string };
          if (loc.user_id === emitterId) {
            console.log('Emisor compartió ubicación, navegando...');
            router.push({ pathname: '/live-location', params: { session_id } });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session_id, role, session?.id]);

  // ============================================================
  // AUTO-NAVEGACIÓN: VIDEOLLAMADA (bidireccional + polling)
  // ============================================================
  useEffect(() => {
    if (!session_id || !session || !userId) return;

    let isNavigating = false;

    const checkAndNavigate = async () => {
      if (isNavigating) return;

      const { data } = await supabase
        .from('support_sessions')
        .select('video_call_started_at, video_call_started_by')
        .eq('id', session_id)
        .single();

      if (
        data?.video_call_started_at &&
        data?.video_call_started_by &&
        data.video_call_started_by !== userId
      ) {
        isNavigating = true;
        console.log('Videollamada iniciada por el otro, navegando...');
        router.push({ pathname: '/video-call', params: { session_id } });
      }
    };

    checkAndNavigate();

    const channel = supabase
      .channel(`companion_autonav_video_${session_id}_${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_sessions',
          filter: `id=eq.${session_id}`,
        },
        (payload) => {
          const updated = payload.new as {
            video_call_started_at: string | null;
            video_call_started_by: string | null;
          };
          if (
            updated.video_call_started_at &&
            updated.video_call_started_by &&
            updated.video_call_started_by !== userId
          ) {
            if (!isNavigating) {
              isNavigating = true;
              console.log('Realtime: el otro inició videollamada, navegando...');
              router.push({ pathname: '/video-call', params: { session_id } });
            }
          }
        }
      )
      .subscribe();

    const interval = setInterval(checkAndNavigate, 3000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [session_id, session?.id, userId]);

  // ============================================================
  // AUTO-NAVEGACIÓN: CHAT (bidireccional + polling)
  // ============================================================
  useEffect(() => {
    if (!session_id || !session || !userId) return;

    let isNavigating = false;

    const checkAndNavigate = async () => {
      if (isNavigating) return;

      const { data } = await supabase
        .from('support_sessions')
        .select('chat_opened_at, chat_opened_by')
        .eq('id', session_id)
        .single();

      if (
        data?.chat_opened_at &&
        data?.chat_opened_by &&
        data.chat_opened_by !== userId
      ) {
        isNavigating = true;
        console.log('Chat abierto por el otro, navegando...');
        router.push({ pathname: '/chat', params: { session_id } });
      }
    };

    checkAndNavigate();

    const channel = supabase
      .channel(`companion_autonav_chat_${session_id}_${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_sessions',
          filter: `id=eq.${session_id}`,
        },
        (payload) => {
          const updated = payload.new as {
            chat_opened_at: string | null;
            chat_opened_by: string | null;
          };
          if (
            updated.chat_opened_at &&
            updated.chat_opened_by &&
            updated.chat_opened_by !== userId
          ) {
            if (!isNavigating) {
              isNavigating = true;
              console.log('Realtime: el otro abrió el chat, navegando...');
              router.push({ pathname: '/chat', params: { session_id } });
            }
          }
        }
      )
      .subscribe();

    const interval = setInterval(checkAndNavigate, 3000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [session_id, session?.id, userId]);

  // ============================================================
  // FINALIZAR SESIÓN
  // ============================================================
  const handleFinish = async () => {
    if (!session || !userId) return;

    Alert.alert(
      'Finalizar acompañamiento',
      '¿Seguro que deseas finalizar esta sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          style: 'destructive',
          onPress: async () => {
            try {
              setFinishing(true);
              const { error } = await supabase
                .from('support_sessions')
                .update({
                  status: 'completed',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', session.id);

              if (error) throw error;

              router.replace('/(tabs)');
            } catch (error: any) {
              Alert.alert('Error', 'No se pudo finalizar');
            } finally {
              setFinishing(false);
            }
          },
        },
      ]
    );
  };

  if (loading || !session || !role) {
    return (
      <LinearGradient
        colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']}
        style={styles.centered}
      >
        <ActivityIndicator color="#FFFFFF" size="large" />
      </LinearGradient>
    );
  }

  const otherPerson = role === 'emisor' ? companionProfile : emitterProfile;
  const me = role === 'emisor' ? emitterProfile : companionProfile;
  const otherPersonLabel = role === 'emisor' ? 'Tu acompañante' : 'Estás acompañando a';
  const meLabel = role === 'emisor' ? 'Tú' : 'Tú (acompañante)';

  return (
    <LinearGradient
      colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {role === 'emisor' ? 'Acompañamiento activo' : 'Estás acompañando'}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusBadgeText}>
              {session.status === 'accepted' ? 'En curso' : session.status}
            </Text>
          </View>

          {/* Foto grande del otro participante */}
          <View style={styles.otherPersonCard}>
            <View style={styles.otherAvatarCircle}>
              {otherPerson?.avatar_url ? (
                <Image
                  source={{ uri: otherPerson.avatar_url }}
                  style={styles.avatarImage}
                />
              ) : (
                <Ionicons name="person" size={56} color="#C77DFF" />
              )}
            </View>
            <Text style={styles.personLabel}>{otherPersonLabel}</Text>
            <Text style={styles.personName}>
              {otherPerson?.full_name || otherPerson?.username || 'Usuario AURA'}
            </Text>
          </View>

          {/* Tarjeta pequeña del usuario actual */}
          <View style={styles.meCard}>
            <View style={styles.meAvatarCircle}>
              {me?.avatar_url ? (
                <Image source={{ uri: me.avatar_url }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={24} color="#E9D5FF" />
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.meLabel}>{meLabel}</Text>
              <Text style={styles.meName}>
                {me?.full_name || me?.username || 'Tú'}
              </Text>
            </View>
            <Ionicons name="checkmark-circle" size={22} color="#2ECC71" />
          </View>

          {/* Grid de acciones */}
          <View style={styles.actionsGrid}>
            {/* Chat */}
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() =>
                router.push({ pathname: '/chat', params: { session_id } })
              }
              activeOpacity={0.85}
            >
              <View
                style={[styles.actionIcon, { backgroundColor: 'rgba(157,78,221,0.2)' }]}
              >
                <Ionicons name="chatbubbles" size={28} color="#C77DFF" />
              </View>
              <Text style={styles.actionLabel}>Chat</Text>
              <Text style={styles.actionSub}>Mensajes en tiempo real</Text>
            </TouchableOpacity>

            {/* Videollamada */}
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() =>
                router.push({ pathname: '/livekit-video-call', params: { session_id } })
              }
              activeOpacity={0.85}
            >
              <View
                style={[styles.actionIcon, { backgroundColor: 'rgba(46,204,113,0.2)' }]}
              >
                <Ionicons name="videocam" size={28} color="#2ECC71" />
              </View>
              <Text style={styles.actionLabel}>Videollamada</Text>
              <Text style={styles.actionSub}>Ver y hablar en vivo</Text>
            </TouchableOpacity>

            {/* Ubicación */}
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() =>
                router.push({ pathname: '/live-location', params: { session_id } })
              }
              activeOpacity={0.85}
            >
              <View
                style={[styles.actionIcon, { backgroundColor: 'rgba(255,107,107,0.2)' }]}
              >
                <Ionicons name="location" size={28} color="#FF6B6B" />
              </View>
              <Text style={styles.actionLabel}>Ubicación</Text>
              <Text style={styles.actionSub}>Compartir mi posición</Text>
            </TouchableOpacity>

            {/* Emergencia */}
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/(tabs)/resources')}
              activeOpacity={0.85}
            >
              <View
                style={[styles.actionIcon, { backgroundColor: 'rgba(255,68,68,0.25)' }]}
              >
                <Ionicons name="alert-circle" size={28} color="#FF4444" />
              </View>
              <Text style={styles.actionLabel}>Emergencia</Text>
              <Text style={styles.actionSub}>Llamar a líneas de ayuda</Text>
            </TouchableOpacity>
          </View>

          {/* Botón finalizar */}
          <TouchableOpacity
            style={[styles.finishButton, finishing && { opacity: 0.6 }]}
            onPress={handleFinish}
            disabled={finishing}
            activeOpacity={0.85}
          >
            {finishing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="close-circle" size={22} color="#FFF" />
                <Text style={styles.finishButtonText}>Finalizar acompañamiento</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.note}>Ambos participantes pueden finalizar la sesión.</Text>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(46,204,113,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(46,204,113,0.4)',
    gap: 8,
    marginBottom: 24,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2ECC71' },
  statusBadgeText: { color: '#2ECC71', fontSize: 13, fontWeight: '800' },
  otherPersonCard: { alignItems: 'center', marginBottom: 20 },
  otherAvatarCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(157,78,221,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#C77DFF',
    marginBottom: 14,
    overflow: 'hidden',
    shadowColor: '#C77DFF',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  avatarImage: { width: '100%', height: '100%' },
  personLabel: { color: 'rgba(233,213,255,0.7)', fontSize: 14, letterSpacing: 0.4 },
  personName: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 6,
    textAlign: 'center',
  },
  meCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(46,204,113,0.35)',
    marginBottom: 30,
  },
  meAvatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(157,78,221,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E9D5FF',
  },
  meLabel: { color: 'rgba(233,213,255,0.6)', fontSize: 12, letterSpacing: 0.4 },
  meName: { color: '#FFF', fontSize: 15, fontWeight: '700', marginTop: 2 },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 30,
  },
  actionCard: {
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  actionLabel: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  actionSub: {
    color: 'rgba(233,213,255,0.6)',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  finishButton: {
    backgroundColor: '#FF4444',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#FF4444',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  finishButtonText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  note: {
    color: 'rgba(233,213,255,0.5)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
  },
});