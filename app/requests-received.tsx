import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../src/lib/supabase';

type SupportRequest = {
  id: string;
  session_id: string;
  contact_id: string;
  contact_user_id: string | null;
  status: string;
  created_at: string;
  emergency_contacts?: {
    name: string;
    relationship: string | null;
    phone: string;
  } | null;
  session_owner_name?: string;
};

export default function RequestsReceivedScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    let channel: any = null;
    let isMounted = true;

    const init = async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      if (!isMounted) return;

      setUserId(uid);

      if (!uid) {
        router.replace('/sign-in');
        return;
      }

      await fetchRequests(uid);
      if (!isMounted) return;

      const uniqueName = `requests_${uid}_${Math.random().toString(36).slice(2, 8)}`;

      channel = supabase
        .channel(uniqueName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'support_requests',
            filter: `contact_user_id=eq.${uid}`,
          },
          (payload) => {
            console.log('Cambio en support_requests:', payload);
            fetchRequests(uid);
          }
        )
        .subscribe();
    };

    init();

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const fetchRequests = async (uid: string) => {
    try {
      setLoading(true);

      const { data: rawRequests, error } = await supabase
        .from('support_requests')
        .select(`
          *,
          emergency_contacts ( name, relationship, phone )
        `)
        .eq('contact_user_id', uid)
        .in('status', ['pending', 'notified'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!rawRequests || rawRequests.length === 0) {
        setRequests([]);
        return;
      }

      const sessionIds = [...new Set(rawRequests.map((r) => r.session_id))];

      const { data: sessions } = await supabase
        .from('support_sessions')
        .select('id, user_id, status')
        .in('id', sessionIds);

      const sessionsMap = new Map(sessions?.map((s) => [s.id, s]) || []);

      const userIds = [...new Set(sessions?.map((s) => s.user_id) || [])];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, username')
        .in('id', userIds);

      const profilesMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      const enriched = rawRequests.map((r) => {
        const session = sessionsMap.get(r.session_id);
        const profile = session ? profilesMap.get(session.user_id) : null;
        return {
          ...r,
          session_owner_name: profile?.full_name || profile?.username || 'Usuario AURA',
        };
      });

      setRequests(enriched);
    } catch (error: any) {
      console.error('Error cargando solicitudes:', error);
      Alert.alert('Error', 'No se pudieron cargar las solicitudes: ' + (error?.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (request: SupportRequest) => {
    if (!userId) return;
    try {
      setProcessingId(request.id);

      // 1. Verificar que la sesión siga pendiente
      const { data: currentSession, error: checkError } = await supabase
        .from('support_sessions')
        .select('status, accepted_by')
        .eq('id', request.session_id)
        .single();

      if (checkError) throw checkError;

      if (currentSession?.status === 'accepted') {
        Alert.alert(
          'Acompañamiento ya aceptado',
          'Otra persona ya está acompañando. ¡Gracias por estar disponible!'
        );
        fetchRequests(userId);
        return;
      }

      // 2. Actualizar la sesión
      const { data: updatedSession, error: sessionError } = await supabase
        .from('support_sessions')
        .update({
          status: 'accepted',
          accepted_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.session_id)
        .select()
        .single();

      if (sessionError) throw sessionError;
      if (!updatedSession) throw new Error('No se actualizó la sesión.');

      // 3. Marcar su propia solicitud como aceptada
      const { error: acceptReqError } = await supabase
        .from('support_requests')
        .update({ status: 'accepted' })
        .eq('id', request.id);

      if (acceptReqError) throw acceptReqError;

      // 4. Marcar las demás solicitudes como 'notified'
      const { error: notifyOthersError } = await supabase
        .from('support_requests')
        .update({ status: 'notified' })
        .eq('session_id', request.session_id)
        .neq('id', request.id);

      if (notifyOthersError) throw notifyOthersError;

      // 5. Alert con navegación a la pantalla compartida
      Alert.alert(
        'Acompañamiento aceptado',
        'Has aceptado brindar apoyo.',
        [
          {
            text: 'Continuar',
            onPress: () => {
              router.push({
                pathname: '/companion-session',
                params: { session_id: request.session_id },
              });
            },
          },
        ]
      );

      fetchRequests(userId);
    } catch (error: any) {
      console.error('Error al aceptar:', error);
      Alert.alert('Error', error?.message || 'No se pudo aceptar la solicitud');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (request: SupportRequest) => {
    try {
      setProcessingId(request.id);
      const { error } = await supabase
        .from('support_requests')
        .update({ status: 'rejected' })
        .eq('id', request.id);

      if (error) throw error;

      Alert.alert('Solicitud rechazada');
      if (userId) fetchRequests(userId);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo rechazar la solicitud');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']} style={styles.centered}>
        <ActivityIndicator color="#FFFFFF" size="large" />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Solicitudes recibidas</Text>
      </View>

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-outline" size={40} color="#C77DFF" />
            <Text style={styles.emptyText}>No tienes solicitudes pendientes</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isNotified = item.status === 'notified';

          return (
            <View style={[styles.card, isNotified && styles.cardNotified]}>
              <View style={styles.userInfo}>
                <Ionicons
                  name={isNotified ? 'checkmark-circle' : 'person-circle'}
                  size={48}
                  color={isNotified ? '#2ECC71' : '#C77DFF'}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.userName}>{item.session_owner_name}</Text>
                  <Text style={styles.userRelation}>
                    {item.emergency_contacts?.relationship || 'Contacto de apoyo'}
                  </Text>
                  <Text style={styles.timestamp}>
                    {new Date(item.created_at).toLocaleString()}
                  </Text>
                </View>
              </View>

              {isNotified ? (
                <View style={styles.thanksBox}>
                  <Ionicons name="heart" size={22} color="#2ECC71" />
                  <Text style={styles.thanksText}>
                    Gracias por tu ayuda. Ya alguien lo está acompañando.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.message}>Necesito acompañamiento</Text>

                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={[styles.acceptButton, processingId === item.id && { opacity: 0.6 }]}
                      onPress={() => handleAccept(item)}
                      disabled={processingId === item.id}
                    >
                      {processingId === item.id ? (
                        <ActivityIndicator color="#FFF" size="small" />
                      ) : (
                        <Text style={styles.acceptText}>Aceptar</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.rejectButton, processingId === item.id && { opacity: 0.6 }]}
                      onPress={() => handleReject(item)}
                      disabled={processingId === item.id}
                    >
                      <Text style={styles.rejectText}>Rechazar</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          );
        }}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 60,
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
  title: { fontSize: 24, fontWeight: '800', color: '#FFF' },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 80,
    gap: 10,
  },
  emptyText: {
    color: '#E9D5FF',
    fontSize: 16,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardNotified: {
    backgroundColor: 'rgba(46,204,113,0.10)',
    borderColor: 'rgba(46,204,113,0.5)',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  userName: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },
  userRelation: {
    color: '#C77DFF',
    fontSize: 13,
    marginTop: 2,
  },
  timestamp: {
    color: 'rgba(233,213,255,0.5)',
    fontSize: 11,
    marginTop: 2,
  },
  message: {
    color: '#FFF',
    fontSize: 15,
    marginBottom: 15,
  },
  thanksBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(46,204,113,0.15)',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  thanksText: {
    flex: 1,
    color: '#2ECC71',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#2ECC71',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  acceptText: {
    color: '#FFF',
    fontWeight: '800',
  },
  rejectButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  rejectText: {
    color: '#FF6B6B',
    fontWeight: '800',
  },
});