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

type Contact = {
  id: string;
  name: string;
  phone: string;
  relationship: string | null;
  priority: number;
  contact_user_id?: string | null; // ✅ Añadido para vincular contacto con usuario AURA
};

type SupportSession = {
  id: string;
  user_id: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'completed';
  accepted_by: string | null;
  created_at: string;
  updated_at: string;
};

type SupportRequest = {
  id: string;
  session_id: string;
  contact_id: string;
  contact_user_id?: string | null; // ✅ Añadido
  status: string;
  created_at: string;
};

export default function ActiveSupportScreen() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [activeSession, setActiveSession] = useState<SupportSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [acceptedContact, setAcceptedContact] = useState<Contact | null>(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        fetchContacts(uid);
        fetchActiveSession(uid);
      } else {
        router.replace('/sign-in');
      }
    });
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
    } catch (error) {
      Alert.alert('Error', 'No se pudieron cargar los contactos de apoyo');
    } finally {
      setLoadingContacts(false);
    }
  };

  const fetchActiveSession = async (uid: string) => {
    try {
      setCheckingSession(true);
      const { data, error } = await supabase
        .from('support_sessions')
        .select('*')
        .eq('user_id', uid)
        .in('status', ['pending', 'accepted'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setActiveSession(data);

      if (data && data.status === 'accepted' && data.accepted_by) {
        const accepted = contacts.find((c) => c.id === data.accepted_by);
        setAcceptedContact(accepted || null);
      }
    } catch (error) {
      setActiveSession(null);
    } finally {
      setCheckingSession(false);
    }
  };

  const createSessionAndRequests = async () => {
    if (!userId || contacts.length === 0) return;

    try {
      setSendingRequest(true);

      // 1. Crear sesión
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

      // 2. Crear solicitudes para cada contacto, incluyendo contact_user_id
      const requests = contacts.map((contact) => ({
        session_id: newSession.id,
        contact_id: contact.id,
        contact_user_id: contact.contact_user_id || null, // ✅ Incluimos el vínculo
        status: 'pending',
      }));

      const { error: requestsError } = await supabase
        .from('support_requests')
        .insert(requests);

      if (requestsError) throw requestsError;

      // ✅ Llamar a la Edge Function para enviar notificaciones push
      await supabase.functions.invoke('notify_support_request', {
        body: { session_id: newSession.id },
      });

      setActiveSession(newSession);
      Alert.alert(
        'Solicitud enviada',
        'Se ha notificado a tus contactos de apoyo. Te avisaremos cuando alguien acepte.',
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo enviar la solicitud');
    } finally {
      setSendingRequest(false);
    }
  };

  // Simular aceptación manual (solo para pruebas)
  const simulateAcceptance = async () => {
    if (!activeSession || contacts.length === 0) return;

    const acceptingContact = contacts[0];

    try {
      const { error: sessionError } = await supabase
        .from('support_sessions')
        .update({
          status: 'accepted',
          accepted_by: acceptingContact.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeSession.id);

      if (sessionError) throw sessionError;

      const { error: acceptReqError } = await supabase
        .from('support_requests')
        .update({ status: 'accepted' })
        .eq('session_id', activeSession.id)
        .eq('contact_id', acceptingContact.id);

      if (acceptReqError) throw acceptReqError;

      const { error: notifyOthersError } = await supabase
        .from('support_requests')
        .update({ status: 'notified' })
        .eq('session_id', activeSession.id)
        .neq('contact_id', acceptingContact.id);

      if (notifyOthersError) throw notifyOthersError;

      setAcceptedContact(acceptingContact);
      setActiveSession({
        ...activeSession,
        status: 'accepted',
        accepted_by: acceptingContact.id,
        updated_at: new Date().toISOString(),
      });

      Alert.alert(
        'Acompañamiento activo',
        `${acceptingContact.name} está contigo en línea. Se ha informado a los demás contactos. Gracias por tu red de apoyo.`
      );
    } catch (error: any) {
      Alert.alert('Error', 'No se pudo simular la aceptación');
    }
  };

  // Finalizar acompañamiento
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

  if (checkingSession) {
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
        <Text style={styles.title}>Acompañamiento</Text>
      </View>

      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <Text style={styles.sectionTitle}>
              {activeSession ? 'Estado de la solicitud' : 'Contactos prioritarios'}
            </Text>
            {activeSession ? (
              <View style={styles.statusCard}>
                <Ionicons
                  name={activeSession.status === 'accepted' ? 'checkmark-circle' : 'time'}
                  size={40}
                  color={activeSession.status === 'accepted' ? '#2ECC71' : '#F39C12'}
                />
                <Text style={styles.statusText}>
                  {activeSession.status === 'accepted'
                    ? 'Acompañamiento activo'
                    : 'Esperando confirmación...'}
                </Text>
                {activeSession.status === 'accepted' && acceptedContact ? (
                  <>
                    <Text style={styles.statusSubtext}>
                      {acceptedContact.name} está contigo en línea.
                    </Text>
                    {acceptedContact.relationship ? (
                      <Text style={styles.statusRelation}>
                        ({acceptedContact.relationship})
                      </Text>
                    ) : null}
                    <Text style={styles.gratitudeText}>
                      Gracias a tu red de apoyo, los demás contactos han sido notificados.
                    </Text>
                  </>
                ) : activeSession.status === 'pending' ? (
                  <Text style={styles.statusSubtext}>
                    Tus contactos recibirán la solicitud de acompañamiento.
                  </Text>
                ) : null}
                {activeSession.status === 'pending' && (
                  <TouchableOpacity style={styles.simulateButton} onPress={simulateAcceptance}>
                    <Text style={styles.simulateButtonText}>Simular aceptación</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <Text style={styles.subtitle}>
                Estas personas serán notificadas para acompañarte.
              </Text>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={styles.contactItem}>
            <Text style={styles.priorityNumber}>{index + 1}</Text>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>{item.name}</Text>
              <Text style={styles.contactRelation}>{item.relationship || 'Contacto de apoyo'}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          !loadingContacts && !activeSession ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={40} color="#C77DFF" />
              <Text style={styles.emptyText}>No tienes contactos de apoyo</Text>
              <Text style={styles.emptySubtext}>Agrega contactos primero desde la pestaña Contactos.</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          activeSession?.status === 'accepted' ? (
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
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
      />

      {!activeSession && contacts.length > 0 && (
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
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#E9D5FF', marginBottom: 10 },
  subtitle: { color: '#D8B4FE', fontSize: 14, marginBottom: 20 },
  statusCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statusText: { color: '#FFF', fontSize: 18, fontWeight: '800', marginTop: 10 },
  statusSubtext: { color: 'rgba(233,213,255,0.7)', fontSize: 14, marginTop: 4 },
  statusRelation: { color: '#C77DFF', fontSize: 14, marginTop: 2 },
  gratitudeText: { color: '#D8B4FE', fontSize: 12, marginTop: 8, textAlign: 'center' },
  simulateButton: {
    marginTop: 15,
    backgroundColor: '#9D4EDD',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  simulateButtonText: { color: '#FFF', fontWeight: '700' },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
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
  emptySubtext: { color: 'rgba(233,213,255,0.6)', fontSize: 14, marginTop: 8, textAlign: 'center' },
  sendButton: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
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