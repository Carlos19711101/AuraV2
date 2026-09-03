import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/lib/supabase'; // ajusta la ruta según tu estructura

export default function HomeScreen() {
  const router = useRouter();
  const [userName, setUserName] = useState('');

  // Cargar el nombre del usuario al montar la pantalla
  useEffect(() => {
    const loadUserName = async () => {
      const { data: sessionData } = await supabase.auth.getUser();
      if (sessionData?.user) {
        const user = sessionData.user;

        // Intentar obtener de la tabla profiles
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name, username')
          .eq('id', user.id)
          .maybeSingle();

        if (profileData?.full_name) {
          setUserName(profileData.full_name);
        } else if (profileData?.username) {
          setUserName(profileData.username);
        } else {
          // Fallback: metadata o email
          const metadataName =
            user.user_metadata?.full_name ||
            user.email?.split('@')[0] ||
            'Usuaria';
          setUserName(metadataName);
        }
      }
    };

    loadUserName();
  }, []);

  const handlePanic = () => {
    Alert.alert(
      'Botón de pánico',
      '¿Necesitas ayuda inmediata?',
      [
        { text: 'Llamar a emergencias', onPress: () => console.log('Llamar 123') },
        { text: 'Enviar mensaje a contacto', onPress: () => router.push('././chat') },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  };

  return (
    <LinearGradient colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']} style={styles.container}>
      <View style={styles.content}>
        {/* <Ionicons name="heart" size={40} color="#e908fd" /> */}
        <Text style={styles.title}>AURA</Text>
        <Text style={styles.title1}>PÚRPURA</Text>
        <Text style={styles.subtitle}>Estamos contigo, no estás sola</Text>

        {/* Saludo personalizado */}
        {userName ? (
          <Text style={styles.userNameText}>Hola, {userName} 💜</Text>
        ) : null}

        <TouchableOpacity style={styles.panicButton} onPress={() => router.push('./active-support')} activeOpacity={0.8}>
          <Ionicons name="alert-circle" size={40} color="#FFF" />
          <Text style={styles.panicText}>Acompañamiento</Text>
        </TouchableOpacity>

        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickButton} onPress={() => router.push('././chat')}>
            <Ionicons name="chatbubble-ellipses" size={24} color="#FFF" />
            <Text style={styles.quickText}>Contactos Apoyo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickButton} onPress={() => router.push('.//resources')}>
            <Ionicons name="call" size={24} color="#FFF" />
            <Text style={styles.quickText}>Líneas de ayuda</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#FFF',
    letterSpacing: 3,
    marginTop: 20,
  },
  title1: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    letterSpacing: 3,
    marginTop: 10,
  },
  subtitle: {
    color: '#16f822',
    fontSize: 16,
    marginTop: 8,
    marginBottom: 40,
  },
  userNameText: {
    marginTop: 4,
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 30,
  },
  panicButton: {
    backgroundColor: '#FF0000',
    width: 200,
    height: 200,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF0000',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
    marginBottom: 30,
  },
  panicText: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginTop: 10 },
  quickActions: { flexDirection: 'row', gap: 16 },
  quickButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
    gap: 6,
  },
  quickText: { color: '#FFF', fontSize: 14 },
});