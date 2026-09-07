import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { registerForPushNotifications } from '../src/lib/notifications';
import { supabase } from '../src/lib/supabase';

export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!email.trim() || !password.trim() || !fullName.trim() || !documentId.trim()) {
      Alert.alert('Campos requeridos', 'Por favor completa todos los campos.');
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            username: username.trim(),
            document_id: documentId.trim(),
          },
        },
      });

      if (error) throw error;

      // Crear perfil en la tabla public.profiles
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          full_name: fullName.trim(),
          username: username.trim(),
          document_id: documentId.trim(),
          avatar_url: null,
        });

        // ✅ Registrar token de notificaciones push
        await registerForPushNotifications(data.user.id);
      }

      Alert.alert('Cuenta creada', 'Revisa tu correo para confirmar y luego inicia sesión.', [
        { text: 'OK', onPress: () => router.replace('/sign-in') },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>

          <Text style={styles.title}>Crear cuenta</Text>
          <Text style={styles.subtitle}>Únete a AURA y comienza tu acompañamiento</Text>

          {/* Nombre completo */}
          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={20} color="#E9D5FF" />
            <TextInput
              style={styles.input}
              placeholder="Nombre completo"
              placeholderTextColor="rgba(233,213,255,0.4)"
              value={fullName}
              onChangeText={setFullName}
            />
          </View>

          {/* Username */}
          <View style={styles.inputContainer}>
            <Ionicons name="at-outline" size={20} color="#E9D5FF" />
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="rgba(233,213,255,0.4)"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
          </View>

          {/* Documento de identidad */}
          <View style={styles.inputContainer}>
            <Ionicons name="card-outline" size={20} color="#E9D5FF" />
            <TextInput
              style={styles.input}
              placeholder="Número de documento (cédula, pasaporte)"
              placeholderTextColor="rgba(233,213,255,0.4)"
              value={documentId}
              onChangeText={setDocumentId}
              autoCapitalize="none"
            />
          </View>

          {/* Email */}
          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color="#E9D5FF" />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="rgba(233,213,255,0.4)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {/* Password */}
          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#E9D5FF" />
            <TextInput
              style={styles.input}
              placeholder="Contraseña"
              placeholderTextColor="rgba(233,213,255,0.4)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity style={styles.registerButton} onPress={handleSignUp} disabled={loading} activeOpacity={0.85}>
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.registerText}>Registrarme</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60 },
  backButton: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '800', color: '#FFF', marginBottom: 8 },
  subtitle: { color: '#D8B4FE', fontSize: 15, marginBottom: 30 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    marginBottom: 16,
  },
  input: { flex: 1, color: '#FFF', fontSize: 16 },
  registerButton: {
    backgroundColor: '#9D4EDD',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  registerText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});