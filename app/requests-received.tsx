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
  // Campos de la relación con emergency_contacts y support_sessions
  emergency_contacts?: {
    name: string;
    relationship: string | null;
    phone: string;
  } | null;
  support_sessions?: {
    user_id: string;
    status: string;
    created_at: string;
    // Datos del usuario solicitante
    profiles?: {
      full_name: string | null;
      username: string | null;
    } | null;
  } | null;
};

export default function RequestsReceivedScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        fetchRequests(uid);
      } else {
        router.replace('/sign-in');
      }
    });
  }, []);

  const fetchRequests = async (uid: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('support_requests')
        .select(`
          *,
          emergency_contacts ( name, relationship, phone ),
          support_sessions ( 
            user_id, status, created_at,
            profiles ( full_name, username )
          )
        `)
        .eq('contact_user_id', uid)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      Alert.alert('Error', 'No se pudieron cargar las solicitudes');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (request: SupportRequest) => {
    if (!userId) return;
    try {
      setProcessingId(request.id);

      // 1. Actualizar la sesión: marcar aceptada y establecer accepted_by
      const { error: sessionError } = await supabase
        .from('support_sessions')
        .update({
          status: 'accepted',
          accepted_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.session_id);

      if (sessionError) throw sessionError;

      // 2. Actualizar esta solicitud a 'accepted'
      const { error: acceptReqError } = await supabase
        .from('support_requests')
        .update({ status: 'accepted' })
        .eq('id', request.id);

      if (acceptReqError) throw acceptReqError;

      // 3. Actualizar las demás solicitudes de la misma sesión a 'notified'
      const { error: notifyOthersError } = await supabase
        .from('support_requests')
        .update({ status: 'notified' })
        .eq('session_id', request.session_id)
        .neq('id', request.id);

      if (notifyOthersError) throw notifyOthersError;

      Alert.alert('Acompañamiento aceptado', 'Has aceptado brindar apoyo.');
      fetchRequests(userId); // recargar la lista
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo aceptar la solicitud');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (request: SupportRequest) => {
    try {
      setProcessingId(request.id);

      // Marcar esta solicitud como 'rejected'
      const { error } = await supabase
        .from('support_requests')
        .update({ status: 'rejected' })
        .eq('id', request.id);

      if (error) throw error;

      // Opcional: si todas las solicitudes son rechazadas, podríamos cancelar la sesión
      // (pero por ahora solo la rechazamos individualmente)
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
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.userInfo}>
              <Ionicons name="person-circle" size={48} color="#C77DFF" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.userName}>
                  {item.support_sessions?.profiles?.full_name || 'Usuario AURA'}
                </Text>
                <Text style={styles.userRelation}>
                  {item.emergency_contacts?.relationship || 'Contacto de apoyo'}
                </Text>
                <Text style={styles.timestamp}>
                  {new Date(item.created_at).toLocaleString()}
                </Text>
              </View>
            </View>

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
          </View>
        )}
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