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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';

type Contact = {
  id: string;
  name: string;
  phone: string;
  relationship: string | null;
  priority: number;
  contact_user_id?: string | null;
};

type SupportSession = {
  id: string;
  user_id: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'completed';
  accepted_by: string | null;
  created_at: string;
  updated_at: string;
};

export default function ActiveSupportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [userId, setUserId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [activeSession, setActiveSession] = useState<SupportSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [acceptedContact, setAcceptedContact] = useState<Contact | null>(null);
  const [finishing, setFinishing] = useState(false);

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

      await fetchContacts(uid);
      await fetchActiveSession(uid);
      if (!isMounted) return;

      const uniqueName = `support_sessions_${uid}_${Math.random().toString(36).slice(2, 8)}`;

      channel = supabase
        .channel(uniqueName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'support_sessions',
            filter: `user_id=eq.${uid}`,
          },
          (payload) => {
            console.log('Cambio en support_sessions:', payload);
            fetchActiveSession(uid);
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

  const fetchContacts = async (uid: string) => {
    try {
      setLoadingContacts(true);
      const { data, error } = await supabase
        .from('emergency_contacts')
        .select('*')
        .eq('user_id', uid)
        .order('priority', { ascending: true })
        .limit(5);

      if (error) throw error;
      setContacts(data || []);
    } catch (error: any) {
      console.error('Error cargando contactos:', error);
      Alert.alert('Error', 'No se pudieron cargar los contactos de apoyo');
    } finally {
      setLoadingContacts(false);
    }
  };

  const fetchActiveSession = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from('support_sessions')
        .select('*')
        .eq('user_id', uid)
        .in('status', ['pending', 'accepted'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      // Auto-expirar sesiones pendientes mayores a 5 minutos
      if (data && data.status === 'pending') {
        const ageInMinutes =
          (Date.now() - new Date(data.created_at).getTime()) / 1000 / 60;
        if (ageInMinutes > 5) {
          await supabase
            .from('support_sessions')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', data.id);
          setActiveSession(null);
          setAcceptedContact(null);
          return;
        }
      }

      setActiveSession(data);

      if (data && data.status === 'accepted' && data.accepted_by) {
        let accepted = contacts.find((c) => c.contact_user_id === data.accepted_by);

        if (!accepted) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, username')
            .eq('id', data.accepted_by)
            .maybeSingle();

          if (profile) {
            accepted = {
              id: data.accepted_by,
              name: profile.full_name || profile.username || 'Contacto de apoyo',
              phone: '',
              relationship: null,
              priority: 0,
              contact_user_id: data.accepted_by,
            };
          }
        }

        setAcceptedContact(accepted || null);
      } else {
        setAcceptedContact(null);
      }
    } catch (error: any) {
      console.error('Error buscando sesión activa:', error);
      setActiveSession(null);
    } finally {
      setCheckingSession(false);
    }
  };

  const createSessionAndRequests = async () => {
    if (!userId || contacts.length === 0) {
      Alert.alert('Espera', 'No hay contactos cargados todavía.');
      return;
    }

    const contactsWithUser = contacts.filter((c) => c.contact_user_id);

    if (contactsWithUser.length === 0) {
      Alert.alert(
        'Contactos sin vincular',
        'Ninguno de tus contactos está vinculado a un usuario de AURA. Edítalos y agrega su número de documento.'
      );
      return;
    }

    try {
      setSendingRequest(true);

      const { data: sessionData, error: sessionError } = await supabase
        .from('support_sessions')
        .insert({
          user_id: userId,
          status: 'pending',
        })
        .select()
        .single();

      if (sessionError) throw sessionError;
      const newSession = sessionData as SupportSession;

      const requests = contacts.map((contact) => ({
        session_id: newSession.id,
        contact_id: contact.id,
        contact_user_id: contact.contact_user_id || null,
        status: 'pending',
      }));

      const { error: requestsError } = await supabase
        .from('support_requests')
        .insert(requests);

      if (requestsError) throw requestsError;

      setActiveSession(newSession);
      Alert.alert(
        'Solicitud enviada',
        'Se ha notificado a tus contactos de apoyo. Te avisaremos cuando alguien acepte.',
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      console.error('Error general:', error);
      Alert.alert('Error', error?.message || 'No se pudo enviar la solicitud');
    } finally {
      setSendingRequest(false);
    }
  };

  const handleCancelSession = async () => {
    if (!activeSession) return;
    Alert.alert('Cancelar solicitud', '¿Seguro que deseas cancelar la solicitud?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: async () => {
          try {
            setFinishing(true);
            await supabase
              .from('support_sessions')
              .update({ status: 'cancelled', updated_at: new Date().toISOString() })
              .eq('id', activeSession.id);

            await supabase
              .from('support_requests')
              .update({ status: 'cancelled' })
              .eq('session_id', activeSession.id);

            setActiveSession(null);
            setAcceptedContact(null);
          } catch (error: any) {
            Alert.alert('Error', 'No se pudo cancelar la solicitud');
          } finally {
            setFinishing(false);
          }
        },
      },
    ]);
  };

  const handleFinishSupport = async () => {
    if (!activeSession) return;
    try {
      setFinishing(true);
      const { error } = await supabase
        .from('support_sessions')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', activeSession.id);
      if (error) throw error;
      setActiveSession(null);
      setAcceptedContact(null);
      router.back();
    } catch (error: any) {
      Alert.alert('Error', 'No se pudo finalizar el acompañamiento');
    } finally {
      setFinishing(false);
    }
  };

  const handleContinue = () => {
      if (!activeSession) return;
      router.push({
        pathname: '/companion-session',
        params: { session_id: activeSession.id },
      });
  };

  if (checkingSession) {
    return (
      <LinearGradient colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']} style={styles.centered}>
        <ActivityIndicator color="#FFFFFF" size="large" />
      </LinearGradient>
    );
  }

  const isAccepted = activeSession?.status === 'accepted';
  const isPending = activeSession?.status === 'pending';

  return (
    <LinearGradient colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Acompañamiento</Text>
      </View>

      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            {/* ✅ Tarjeta de estado: roja si espera, verde si aceptado */}
            {activeSession ? (
              <View
                style={[
                  styles.statusCard,
                  isAccepted ? styles.statusCardAccepted : styles.statusCardPending,
                ]}
              >
                <View
                  style={[
                    styles.statusIconCircle,
                    isAccepted ? styles.statusIconCircleAccepted : styles.statusIconCirclePending,
                  ]}
                >
                  <Ionicons
                    name={isAccepted ? 'checkmark' : 'time-outline'}
                    size={32}
                    color="#FFF"
                  />
                </View>

                <Text
                  style={[
                    styles.statusText,
                    { color: isAccepted ? '#2ECC71' : '#FF4444' },
                  ]}
                >
                  {isAccepted ? 'Estamos Juntos' : 'Esperando aceptación...'}
                </Text>

                {isAccepted && acceptedContact ? (
                  <>
                    <Text style={styles.acceptedByLabel}>Quien te acompaña:</Text>
                    <Text style={[styles.contactAcceptedText, { color: '#2ECC71' }]}>
                      {acceptedContact.name}
                    </Text>
                    {acceptedContact.relationship ? (
                      <Text style={styles.statusRelation}>({acceptedContact.relationship})</Text>
                    ) : null}
                    <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
                      <Text style={styles.continueButtonText}>Presiona para continuar</Text>
                    </TouchableOpacity>
                  </>
                ) : isPending ? (
                  <>
                    <Text style={styles.pendingSubtext}>
                      Notificamos a tus contactos. En breve alguien te acompañará.
                    </Text>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={handleCancelSession}
                      disabled={finishing}
                    >
                      <Text style={styles.cancelButtonText}>Cancelar solicitud</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
              </View>
            ) : (
              <Text style={styles.subtitle}>
                Estas personas serán notificadas para acompañarte.
              </Text>
            )}

            <Text style={styles.sectionTitle}>
              {activeSession ? 'Contactos notificados' : 'Contactos prioritarios'}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const isTheAcceptor =
            isAccepted && acceptedContact && item.contact_user_id === acceptedContact.contact_user_id;

          return (
            <View
              style={[
                styles.contactItem,
                isTheAcceptor && styles.contactItemAccepted,
              ]}
            >
              <Text
                style={[
                  styles.priorityNumber,
                  isTheAcceptor && { backgroundColor: '#2ECC71' },
                ]}
              >
                {index + 1}
              </Text>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{item.name}</Text>
                <Text style={styles.contactRelation}>
                  {item.relationship || 'Contacto de apoyo'}
                </Text>
                {!item.contact_user_id && (
                  <Text style={{ color: '#FF6B6B', fontSize: 11, marginTop: 2 }}>
                    ⚠️ Sin vincular
                  </Text>
                )}
              </View>
              {isTheAcceptor && (
                <Ionicons name="checkmark-circle" size={24} color="#2ECC71" />
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          !loadingContacts && contacts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={40} color="#C77DFF" />
              <Text style={styles.emptyText}>No tienes contactos de apoyo</Text>
              <Text style={styles.emptySubtext}>
                Agrega contactos primero desde la pestaña Contactos.
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          isAccepted ? (
            <TouchableOpacity
              style={[styles.finishButton, finishing && { opacity: 0.6 }]}
              onPress={handleFinishSupport}
              disabled={finishing}
              activeOpacity={0.85}
            >
              {finishing ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-done-circle" size={22} color="#FFF" />
                  <Text style={styles.finishButtonText}>Finalizar acompañamiento</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null
        }
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + 120,
        }}
      />

      {!activeSession && contacts.length > 0 && (
        <View style={[styles.bottomButtonContainer, { bottom: insets.bottom + 70 }]}>
          <TouchableOpacity
            style={[styles.sendButton, sendingRequest && { opacity: 0.6 }]}
            onPress={createSessionAndRequests}
            disabled={sendingRequest}
            activeOpacity={0.85}
          >
            {sendingRequest ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={20} color="#FFF" />
                <Text style={styles.sendButtonText}>Enviar solicitud de acompañamiento</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E9D5FF',
    marginTop: 20,
    marginBottom: 10,
  },
  subtitle: { color: '#D8B4FE', fontSize: 14, marginBottom: 8 },

  // ✅ Tarjeta de estado
  statusCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
  },
  statusCardPending: {
    borderColor: 'rgba(255,68,68,0.55)',
    backgroundColor: 'rgba(255,68,68,0.08)',
  },
  statusCardAccepted: {
    borderColor: 'rgba(46,204,113,0.55)',
    backgroundColor: 'rgba(46,204,113,0.08)',
  },
  statusIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  statusIconCirclePending: {
    backgroundColor: '#FF4444',
    shadowColor: '#FF4444',
  },
  statusIconCircleAccepted: {
    backgroundColor: '#2ECC71',
    shadowColor: '#2ECC71',
  },
  statusText: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
    textAlign: 'center',
  },
  pendingSubtext: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
  },
  acceptedByLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    marginTop: 12,
    letterSpacing: 0.5,
  },
  contactAcceptedText: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 4,
    textAlign: 'center',
  },
  statusRelation: {
    color: '#C77DFF',
    fontSize: 14,
    marginTop: 2,
  },
  continueButton: {
    marginTop: 18,
    backgroundColor: '#9D4EDD',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    shadowColor: '#9D4EDD',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  continueButtonText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  cancelButton: {
    marginTop: 14,
    backgroundColor: 'rgba(255,107,107,0.15)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.4)',
  },
  cancelButtonText: { color: '#FF6B6B', fontWeight: '700', fontSize: 14 },

  // ✅ Contactos
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  contactItemAccepted: {
    backgroundColor: 'rgba(46,204,113,0.10)',
    borderColor: 'rgba(46,204,113,0.5)',
  },
  priorityNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#9D4EDD',
    color: '#FFF',
    textAlign: 'center',
    lineHeight: 32,
    fontWeight: 'bold',
  },
  contactInfo: { flex: 1 },
  contactName: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  contactRelation: { color: '#C77DFF', fontSize: 12, marginTop: 2 },

  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#FFF', fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptySubtext: {
    color: 'rgba(233,213,255,0.6)',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  bottomButtonContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
  sendButton: {
    backgroundColor: '#9D4EDD',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#9D4EDD',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  sendButtonText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  finishButton: {
    backgroundColor: '#2ECC71',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    marginBottom: 20,
    shadowColor: '#2ECC71',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  finishButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
});