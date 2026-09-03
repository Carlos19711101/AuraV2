import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function InfoScreen() {
  const router = useRouter();

  return (
    <LinearGradient colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']} style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.8}>
        <Ionicons name="arrow-back" size={24} color="#FFF" />
      </TouchableOpacity>
      <View style={styles.content}>
        <Ionicons name="information-circle" size={60} color="#C77DFF" />
        <Text style={styles.title}>Acerca de AURA</Text>
        <Text style={styles.description}>
          AURA es un espacio seguro de acompañamiento para personas en situación de vulnerabilidad.{'\n\n'}
          Nuestra misión es brindar apoyo emocional, información y herramientas para que nunca te sientas sola.
        </Text>
        <Text style={styles.comingSoon}>Próximamente más contenido...</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backButton: { position: 'absolute', top: 50, left: 20, zIndex: 10 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  title: { fontSize: 32, fontWeight: '800', color: '#FFF', marginTop: 20, marginBottom: 10 },
  description: { color: '#D8B4FE', fontSize: 16, textAlign: 'center', lineHeight: 24 },
  comingSoon: { color: 'rgba(233,213,255,0.6)', fontSize: 14, marginTop: 30, fontStyle: 'italic' },
});