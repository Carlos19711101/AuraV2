import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../src/lib/supabase';

type SelectedAvatar = {
  uri: string;
  mimeType: string;
  fileExtension: string;
};

export default function SignUpScreen() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatar, setAvatar] = useState<SelectedAvatar | null>(null);
  const [loading, setLoading] = useState(false);

  const avatarInitial = useMemo(() => {
    const cleanName = fullName.trim();

    if (!cleanName) return 'A';

    return cleanName
      .split(' ')
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('');
  }, [fullName]);

  const validateForm = () => {
    if (!fullName.trim()) {
      Alert.alert('Nombre requerido', 'Por favor escribe tu nombre.');
      return false;
    }

    if (!email.trim()) {
      Alert.alert('Correo requerido', 'Por favor escribe tu correo electrónico.');
      return false;
    }

    if (!email.includes('@')) {
      Alert.alert('Correo inválido', 'Escribe un correo electrónico válido.');
      return false;
    }

    if (password.length < 6) {
      Alert.alert(
        'Contraseña muy corta',
        'La contraseña debe tener mínimo 6 caracteres.'
      );
      return false;
    }

    if (password !== confirmPassword) {
      Alert.alert(
        'Las contraseñas no coinciden',
        'Revisa nuevamente la contraseña.'
      );
      return false;
    }

    return true;
  };

  const getFileExtension = (uri: string, mimeType?: string | null) => {
    if (mimeType?.includes('png')) return 'png';
    if (mimeType?.includes('webp')) return 'webp';
    if (mimeType?.includes('jpg') || mimeType?.includes('jpeg')) return 'jpg';

    const uriParts = uri.split('.');
    const lastPart = uriParts[uriParts.length - 1]?.toLowerCase();

    if (lastPart === 'png' || lastPart === 'webp' || lastPart === 'jpg' || lastPart === 'jpeg') {
      return lastPart === 'jpeg' ? 'jpg' : lastPart;
    }

    return 'jpg';
  };

  const pickAvatar = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Permiso requerido',
          'Necesitamos permiso para acceder a tu galería y elegir una foto de perfil.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
      });

      if (result.canceled) return;

      const selectedAsset = result.assets[0];

      if (!selectedAsset?.uri) {
        Alert.alert('Imagen no válida', 'No se pudo leer la imagen seleccionada.');
        return;
      }

      const mimeType = selectedAsset.mimeType || 'image/jpeg';
      const fileExtension = getFileExtension(selectedAsset.uri, mimeType);

      setAvatar({
        uri: selectedAsset.uri,
        mimeType,
        fileExtension,
      });
    } catch (error) {
      Alert.alert(
        'Error al seleccionar imagen',
        'No se pudo abrir la galería. Intenta nuevamente.'
      );
    }
  };

  const uploadAvatar = async (userId: string) => {
    if (!avatar) return null;

    const filePath = `${userId}/avatar.${avatar.fileExtension}`;

    const response = await fetch(avatar.uri);
    const arrayBuffer = await response.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, arrayBuffer, {
        contentType: avatar.mimeType,
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);

    return data.publicUrl;
  };

  const saveAvatarUrl = async (userId: string, avatarUrl: string) => {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        avatar_url: avatarUrl,
        full_name: fullName.trim(),
      })
      .eq('id', userId);

    if (profileError) {
      throw profileError;
    }

    await supabase.auth.updateUser({
      data: {
        full_name: fullName.trim(),
        avatar_url: avatarUrl,
        app_name: 'Aura Púrpura',
      },
    });
  };

  const handleSignUp = async () => {
    if (!validateForm()) return;

    try {
      setLoading(true);

      const normalizedEmail = email.trim().toLowerCase();

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            app_name: 'Aura Púrpura',
          },
        },
      });

      if (error) {
        Alert.alert('No se pudo crear la cuenta', error.message);
        return;
      }

      if (!data.user) {
        Alert.alert(
          'Cuenta pendiente',
          'La cuenta fue enviada, pero no se recibió el usuario. Revisa la configuración de Supabase.'
        );
        return;
      }

      if (avatar) {
        try {
          const avatarUrl = await uploadAvatar(data.user.id);

          if (avatarUrl) {
            await saveAvatarUrl(data.user.id, avatarUrl);
          }
        } catch (avatarError) {
          Alert.alert(
            'Cuenta creada',
            'La cuenta fue creada, pero no se pudo guardar la foto de perfil. Podrás cambiarla después.'
          );
          router.replace('/sign-up-success');
          return;
        }
      }

      router.replace('/sign-up-success');
    } catch (error) {
      Alert.alert(
        'Error inesperado',
        'Ocurrió un problema al crear la cuenta. Intenta nuevamente.'
      );
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
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              activeOpacity={0.8}
            >
              <Text style={styles.backButtonText}>← Volver</Text>
            </TouchableOpacity>

            <View style={styles.header}>
              <TouchableOpacity
                style={styles.avatarButton}
                onPress={pickAvatar}
                activeOpacity={0.85}
                disabled={loading}
              >
                <View style={styles.avatarGlow}>
                  {avatar?.uri ? (
                    <Image source={{ uri: avatar.uri }} style={styles.avatarImage} />
                  ) : (
                    <Ionicons name="person" size={40} color="#f8f7fa" />
                  )}

                  <View style={styles.editBadge}>
                    <Text style={styles.editBadgeText}>✎</Text>
                  </View>
                </View>
              </TouchableOpacity>

              <Text style={styles.changePhotoText}>
                Toca el lápiz para elegir tu foto
              </Text>

              <Text style={styles.title}>Crear cuenta</Text>

              <Text style={styles.subtitle}>
                Únete a Aura Púrpura y empieza a construir tu red segura.
              </Text>
            </View>

            <View style={styles.form}>
              <Text style={styles.label}>Nombre completo</Text>
              <TextInput
                style={styles.input}
                placeholder="Tu nombre"
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={fullName}
                onChangeText={setFullName}
                returnKeyType="next"
              />

              <Text style={styles.label}>Correo electrónico</Text>
              <TextInput
                style={styles.input}
                placeholder="correo@ejemplo.com"
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />

              <Text style={styles.label}>Contraseña</Text>
              <TextInput
                style={styles.input}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                returnKeyType="next"
              />

              <Text style={styles.label}>Confirmar contraseña</Text>
              <TextInput
                style={styles.input}
                placeholder="Repite tu contraseña"
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                returnKeyType="done"
              />

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.disabledButton]}
                onPress={handleSignUp}
                disabled={loading}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#7B2CBF', '#9D4EDD', '#716ff0']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.buttonGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Crear mi cuenta</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <Text style={styles.privacyText}>
                Al registrarte aceptas que Aura Púrpura es un espacio de
                acompañamiento, privacidad y comunidad segura.
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
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 160,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  backButtonText: {
    color: '#E9D5FF',
    fontSize: 15,
    fontWeight: '700',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarButton: {
    marginBottom: 8,
  },
  avatarGlow: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: 'rgba(123, 44, 191, 0.28)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#9D4EDD',
    shadowOpacity: 0.9,
    shadowRadius: 25,
    elevation: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  avatarImage: {
    width: 104,
    height: 104,
    borderRadius: 52,
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 1,
  },
  editBadge: {
    position: 'absolute',
    right: -2,
    bottom: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#C77DFF',
    borderWidth: 2,
    borderColor: '#1A0033',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadgeText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  changePhotoText: {
    color: 'rgba(233, 213, 255, 0.7)',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 14,
  },
  title: {
    color: '#F5EFFF',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
  },
  subtitle: {
    color: 'rgba(233, 213, 255, 0.78)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  form: {
    width: '100%',
  },
  label: {
    color: '#E9D5FF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 14,
  },
  input: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 18,
    paddingVertical: 15,
    color: '#FFFFFF',
    fontSize: 15,
  },
  primaryButton: {
    marginTop: 28,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#9D4EDD',
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 8,
  },
  disabledButton: {
    opacity: 0.7,
  },
  buttonGradient: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  privacyText: {
    color: 'rgba(233, 213, 255, 0.55)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 22,
  },
});