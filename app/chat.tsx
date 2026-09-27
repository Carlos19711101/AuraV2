import { supabase } from '@/src/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { KeyboardAvoidingView as KeyboardControllerView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type Message = {
  id: string;
  session_id: string;
  sender_id: string;
  ciphertext: string;
  nonce: string;
  created_at: string;
  decrypted?: string;
};

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session_id } = useLocalSearchParams<{ session_id: string }>();

  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    let channel: any = null;
    let isMounted = true;

    const init = async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      if (!isMounted) return;

      setUserId(uid);

      if (!uid || !session_id) {
        router.replace('/sign-in');
        return;
      }

      // ✅ Notificar al otro que abrí el chat
      await supabase
        .from('support_sessions')
        .update({
          chat_opened_at: new Date().toISOString(),
          chat_opened_by: uid,
        })
        .eq('id', session_id);

      await fetchMessages();
      if (!isMounted) return;

      channel = supabase
        .channel(`chat_${session_id}_${Math.random().toString(36).slice(2, 8)}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'support_messages',
            filter: `session_id=eq.${session_id}`,
          },
          (payload) => {
            console.log('Nuevo mensaje recibido:', payload);
            fetchMessages();
          }
        )
        .subscribe();
    };

    init();

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
      // ✅ Limpiar el flag al salir
      if (session_id) {
        supabase
          .from('support_sessions')
          .update({
            chat_opened_at: null,
            chat_opened_by: null,
          })
          .eq('id', session_id);
      }
    };
  }, [session_id]);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .eq('session_id', session_id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const decryptedMessages = (data || []).map((msg) => ({
        ...msg,
        decrypted: msg.ciphertext,
      }));

      setMessages(decryptedMessages);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Error cargando mensajes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !userId || !session_id) return;

    try {
      setSending(true);

      const { error } = await supabase.from('support_messages').insert({
        session_id,
        sender_id: userId,
        ciphertext: newMessage.trim(),
        nonce: 'placeholder_nonce',
      });

      if (error) throw error;

      setNewMessage('');
      fetchMessages();
    } catch (error) {
      console.error('Error enviando mensaje:', error);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMine = item.sender_id === userId;

    return (
      <View style={[styles.messageRow, isMine && styles.messageRowMine]}>
        <View style={[styles.messageBubble, isMine ? styles.myBubble : styles.theirBubble]}>
          <Text style={styles.messageText}>{item.decrypted}</Text>
          <Text style={styles.messageTime}>
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </View>
    );
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
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Chat seguro</Text>
            <View style={styles.encryptionBadge}>
              <Ionicons name="lock-closed" size={10} color="#2ECC71" />
              <Text style={styles.encryptionText}>Cifrado extremo a extremo</Text>
            </View>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardControllerView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubbles-outline" size={40} color="#C77DFF" />
                <Text style={styles.emptyText}>Inicia la conversación</Text>
              </View>
            }
          />

          <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 12 }]}>
            <TextInput
              style={styles.input}
              value={newMessage}
              onChangeText={setNewMessage}
              placeholder="Escribe un mensaje..."
              placeholderTextColor="rgba(233,213,255,0.4)"
              multiline
            />
            <TouchableOpacity
              style={[styles.sendButton, (!newMessage.trim() || sending) && { opacity: 0.5 }]}
              onPress={handleSend}
              disabled={!newMessage.trim() || sending}
            >
              {sending ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Ionicons name="send" size={20} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardControllerView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
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
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  encryptionBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  encryptionText: { color: '#2ECC71', fontSize: 10, fontWeight: '600' },
  messagesList: { padding: 20, paddingBottom: 10, flexGrow: 1 },
  messageRow: { marginBottom: 12, alignItems: 'flex-start' },
  messageRowMine: { alignItems: 'flex-end' },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  myBubble: { backgroundColor: '#9D4EDD' },
  theirBubble: { backgroundColor: 'rgba(255,255,255,0.1)' },
  messageText: { color: '#FFF', fontSize: 15, lineHeight: 20 },
  messageTime: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingTop: 100,
  },
  emptyText: { color: 'rgba(233,213,255,0.6)', fontSize: 14, marginTop: 12 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(26,0,51,0.95)',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#9D4EDD',
    justifyContent: 'center',
    alignItems: 'center',
  },
});