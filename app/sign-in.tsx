import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { registerForPushNotifications } from '../src/lib/notifications';
import { supabase } from '../src/lib/supabase';

export default function SignInScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const onSignIn = async () => {
    setTouched({ email: true, password: true });
    setAuthError('');

    if (!emailRegex.test(email.trim()) || password.trim().length < 6) {
      setAuthError('Ingresa un correo válido y una contraseña de al menos 6 caracteres.');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        setAuthError(error.message);
        return;
      }

      // ✅ Registrar token de notificaciones push
      if (data.session?.user?.id) {
        await registerForPushNotifications(data.session.user.id);
      }

      router.replace('/(tabs)');
    } catch (error) {
      setAuthError('Ocurrió un error al iniciar sesión.');
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
          {/* Botón atrás */}
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>

          <Text style={styles.title}>Bienvenido de nuevo</Text>
          <Text style={styles.subtitle}>Inicia sesión para continuar</Text>

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
              autoComplete="email"
            />
          </View>
          {touched.email && !emailRegex.test(email.trim()) ? (
            <Text style={styles.errorText}>Ingresa un email válido</Text>
          ) : null}

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
              autoCapitalize="none"
            />
          </View>
          {touched.password && password.trim().length < 6 ? (
            <Text style={styles.errorText}>La contraseña debe tener al menos 6 caracteres</Text>
          ) : null}

          {authError ? <Text style={styles.authError}>{authError}</Text> : null}

          <TouchableOpacity style={styles.loginButton} onPress={onSignIn} disabled={loading} activeOpacity={0.85}>
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.loginButtonText}>Iniciar sesión</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/sign-up')} style={styles.linkButton}>
            <Text style={styles.linkText}>¿No tienes cuenta? Regístrate</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
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
    marginBottom: 8,
  },
  input: { flex: 1, color: '#FFF', fontSize: 16 },
  errorText: { color: '#FF6B6B', fontSize: 12, marginBottom: 10, marginLeft: 4 },
  authError: { color: '#FF6B6B', fontSize: 14, textAlign: 'center', marginBottom: 15 },
  loginButton: {
    backgroundColor: '#9D4EDD',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  loginButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  linkButton: { marginTop: 20, alignItems: 'center' },
  linkText: { color: '#C77DFF', fontSize: 14, fontWeight: '600' },
});