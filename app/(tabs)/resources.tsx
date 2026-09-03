import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const emergencyNumbers = [
  { label: 'Línea Nacional de Violencia de Género', number: '155' },
  { label: 'Policía Nacional', number: '123' },
  { label: 'Emergencias Médicas', number: '125' },
];

export default function ResourcesScreen() {
  return (
    <LinearGradient colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']} style={styles.container}>
      <Text style={styles.title}>Recursos de ayuda</Text>
      <View style={styles.list}>
        {emergencyNumbers.map((item) => (
          <TouchableOpacity
            key={item.number}
            style={styles.card}
            onPress={() => Linking.openURL(`tel:${item.number}`)}
          >
            <Ionicons name="call" size={24} color="#C77DFF" />
            <Text style={styles.cardText}>{item.label}</Text>
            <Text style={styles.number}>{item.number}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#FFF', marginBottom: 20 },
  list: { gap: 12 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardText: { color: '#FFF', flex: 1, fontSize: 16 },
  number: { color: '#FFD700', fontWeight: 'bold', fontSize: 18 },
});