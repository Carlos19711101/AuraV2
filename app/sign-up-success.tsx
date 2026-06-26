import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignUpSuccessScreen() {
  const router = useRouter();

  return (
    <LinearGradient
      colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.icon}>💜</Text>

          <Text style={styles.title}>Cuenta creada</Text>

          <Text style={styles.subtitle}>
            Tu registro en Aura Púrpura fue creado correctamente.
          </Text>

          <Text style={styles.note}>
            Si Supabase tiene activada la confirmación por correo, revisa tu
            bandeja de entrada antes de iniciar sesión.
          </Text>

          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace('/')}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>Volver al inicio</Text>
          </TouchableOpacity>
        </View>
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
  content: {
    flex: 1,
    paddingHorizontal: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    fontSize: 58,
    marginBottom: 20,
  },
  title: {
    color: '#F5EFFF',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    color: '#E9D5FF',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 14,
  },
  note: {
    color: 'rgba(233, 213, 255, 0.65)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 34,
  },
  button: {
    width: '100%',
    borderRadius: 28,
    paddingVertical: 16,
    backgroundColor: '#9D4EDD',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});