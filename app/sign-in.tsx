import { supabase } from '@/src/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export default function SignIn() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false });

  const emailError = useMemo(() => {
    if (!touched.email) return '';
    if (!email.trim()) return 'El email es obligatorio.';
    if (!emailRegex.test(email.trim())) return 'Ingresa un email válido.';
    return '';
  }, [email, touched.email]);

  const passwordError = useMemo(() => {
    if (!touched.password) return '';
    if (!password.trim()) return 'La contraseña es obligatoria.';
    if (password.trim().length < 6) return 'Debe tener mínimo 6 caracteres.';
    return '';
  }, [password, touched.password]);

  const canSubmit = useMemo(() => {
    return emailRegex.test(email.trim()) && password.trim().length >= 6 && !loading;
  }, [email, password, loading]);

  const onSignIn = async () => {
    setTouched({ email: true, password: true });
    setAuthError('');

    if (!emailRegex.test(email.trim()) || password.trim().length < 6) return;

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        setAuthError(error.message);
        return;
      }

      router.replace('/(tabs)');
    } catch (error) {
      setAuthError('Ocurrió un error al iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerRow}>
              <TouchableOpacity
                onPress={() => router.replace('/')}
                style={styles.backBtn}
                activeOpacity={0.85}
              >
                <Ionicons name="chevron-back" size={22} color="#E9D5FF" />
              </TouchableOpacity>

              <Text style={styles.headerTitle}>Iniciar sesión</Text>

              <View style={{ width: 42 }} />
            </View>

            <View style={styles.center}>
              <View style={styles.card}>
                <View style={styles.logoContainer}>
                  <View style={styles.logoGlow}>
                    <Text style={styles.logoIcon}>✨</Text>
                  </View>
                </View>

                <Text style={styles.title}>Bienvenida de nuevo</Text>

                <Text style={styles.subtitle}>
                  Entra a AURA PÚRPURA y vuelve a conectarte con tu comunidad.
                </Text>

                {!!authError && <Text style={styles.authError}>{authError}</Text>}

                <View style={[styles.field, !!emailError && styles.fieldError]}>
                  <Ionicons name="mail-outline" size={18} color="#E9D5FF" />

                  <TextInput
                    placeholder="Email"
                    placeholderTextColor="rgba(233,213,255,0.45)"
                    value={email}
                    onChangeText={setEmail}
                    onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    returnKeyType="next"
                    style={styles.input}
                  />
                </View>

                {!!emailError && <Text style={styles.errorText}>{emailError}</Text>}

                <View style={[styles.field, !!passwordError && styles.fieldError]}>
                  <Ionicons name="lock-closed-outline" size={18} color="#E9D5FF" />

                  <TextInput
                    placeholder="Contraseña"
                    placeholderTextColor="rgba(233,213,255,0.45)"
                    value={password}
                    onChangeText={setPassword}
                    onBlur={() =>
                      setTouched((prev) => ({ ...prev, password: true }))
                    }
                    secureTextEntry={secure}
                    returnKeyType="done"
                    style={styles.input}
                  />

                  <Pressable onPress={() => setSecure(!secure)} hitSlop={10}>
                    <Ionicons
                      name={secure ? 'eye-outline' : 'eye-off-outline'}
                      size={18}
                      color="#E9D5FF"
                    />
                  </Pressable>
                </View>

                {!!passwordError && (
                  <Text style={styles.errorText}>{passwordError}</Text>
                )}

                <TouchableOpacity
                  style={[styles.primaryButton, !canSubmit && styles.disabledButton]}
                  onPress={onSignIn}
                  activeOpacity={0.9}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={['#7B2CBF', '#9D4EDD', '#716ff0']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.buttonGradient}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Entrar</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => router.push('/sign-up')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryButtonText}>
                    No tengo cuenta, quiero registrarme
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.footerText}>
                Privacidad. Seguridad. Comunidad.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 160,
  },
  glowTop: {
    position: 'absolute',
    top: -90,
    left: '50%',
    width: 255,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(157, 78, 221, 0.25)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -100,
    right: '10%',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(123, 44, 191, 0.2)',
  },
  headerRow: {
    marginTop: 10,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  headerTitle: {
    color: '#F5EFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 14,
  },
  logoGlow: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(123, 44, 191, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#9D4EDD',
    shadowOpacity: 0.9,
    shadowRadius: 20,
    elevation: 10,
  },
  logoIcon: {
    fontSize: 34,
  },
  title: {
    color: '#F5EFFF',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(233, 213, 255, 0.75)',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 18,
    lineHeight: 22,
  },
  authError: {
    color: '#FF7B7B',
    marginBottom: 10,
    textAlign: 'center',
    fontWeight: '700',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    marginBottom: 6,
  },
  fieldError: {
    borderColor: 'rgba(255, 107, 107, 0.8)',
  },
  input: {
    flex: 1,
    color: '#F5EFFF',
    fontSize: 15,
    paddingVertical: 0,
  },
  errorText: {
    color: '#FF7B7B',
    fontSize: 12,
    marginBottom: 8,
    marginLeft: 4,
  },
  primaryButton: {
    borderRadius: 18,
    overflow: 'hidden',
    marginTop: 8,
    shadowColor: '#9D4EDD',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  secondaryButton: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#E9D5FF',
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
  },
  footerText: {
    marginTop: 14,
    textAlign: 'center',
    color: 'rgba(233, 213, 255, 0.5)',
    fontSize: 12,
    letterSpacing: 1,
  },
});