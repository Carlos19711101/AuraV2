import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Welcome() {
  const router = useRouter();

  return (
    <LinearGradient
      colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.glowTop} />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <View style={styles.logoGlow}>
              <Text style={styles.logoIcon}>✨</Text>
            </View>
          </View>

          <Text style={styles.appName}>AURA</Text>

          <View style={styles.divider} />

          <Text style={styles.tagline}>Nunca caminas sola</Text>

          <Text style={styles.subtitle}>
            Un espacio seguro donde puedes{'\n'}
            compartir, crecer y sentirte acompañada
          </Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/sign-up')}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#7B2CBF', '#9D4EDD', '#716ff0']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buttonGradient}
              >
                <Text style={styles.primaryButtonText}>Registrarme</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push('/sign-in')}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryButtonText}>Iniciar sesión</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerText}>Privacidad. Seguridad. Comunidad.</Text>
        </View>
      </SafeAreaView>

      <View style={styles.glowBottom} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
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
  content: {
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  logoContainer: {
    marginBottom: 30,
  },
  logoGlow: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(123, 44, 191, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#9D4EDD',
    shadowOpacity: 0.9,
    shadowRadius: 25,
    elevation: 12,
  },
  logoIcon: {
    fontSize: 38,
  },
  appName: {
    fontSize: 42,
    fontWeight: '800',
    color: '#F5EFFF',
    letterSpacing: 3,
  },
  divider: {
    width: 50,
    height: 3,
    backgroundColor: '#C77DFF',
    borderRadius: 2,
    marginVertical: 16,
  },
  tagline: {
    fontSize: 18,
    color: '#D8B4FE',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(233, 213, 255, 0.75)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 50,
  },
  buttonContainer: {
    width: '100%',
    gap: 14,
    marginBottom: 30,
  },
  primaryButton: {
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#9D4EDD',
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 8,
  },
  buttonGradient: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  secondaryButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  secondaryButtonText: {
    color: '#E9D5FF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(233, 213, 255, 0.5)',
    letterSpacing: 1,
    marginTop: 10,
  },
});