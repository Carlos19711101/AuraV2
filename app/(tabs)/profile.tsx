import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { supabase } from '../../src/lib/supabase';

export default function ProfileScreen() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [bio, setBio] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
      if (sessionError || !sessionData.user) {
        router.replace('/sign-in');
        return;
      }
      const currentUser = sessionData.user;
      setUserId(currentUser.id);
      setEmail(currentUser.email || '');

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, username, bio, avatar_url, document_id')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (!profileError && profileData) {
        setFullName(profileData.full_name || '');
        setUsername(profileData.username || '');
        setBio(profileData.bio || '');
        setAvatarUrl(profileData.avatar_url || null);
        setDocumentId(profileData.document_id || '');
      } else {
        const metadataName =
          currentUser.user_metadata?.full_name ||
          currentUser.user_metadata?.name ||
          currentUser.email?.split('@')[0] ||
          '';
        setFullName(metadataName);
        setUsername(currentUser.user_metadata?.username || '');
        setBio('');
        setAvatarUrl(currentUser.user_metadata?.avatar_url || null);
        setDocumentId(currentUser.user_metadata?.document_id || '');

        await supabase.from('profiles').upsert({
          id: currentUser.id,
          full_name: metadataName,
          username: currentUser.user_metadata?.username || '',
          bio: '',
          avatar_url: currentUser.user_metadata?.avatar_url || null,
          document_id: currentUser.user_metadata?.document_id || '',
        });
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo cargar el perfil');
    } finally {
      setLoading(false);
    }
  };

  const pickAndUploadAvatar = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permiso requerido', 'Necesitas dar permiso para acceder a la galería.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      const extension = asset.fileName?.split('.').pop() || 'jpg';
      const filePath = `${userId}/avatar.${extension}`;

      setUploadingAvatar(true);

      const arrayBuffer = await fetch(asset.uri).then((res) => res.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, arrayBuffer, {
          contentType: asset.mimeType || 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      setAvatarUrl(data.publicUrl);
    } catch (error) {
      Alert.alert('Error', 'No se pudo subir la imagen de perfil');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    try {
      setSaving(true);
      setUsernameError('');

      // Generar username automático si está vacío
      const baseUsername =
        username.trim() ||
        fullName.trim().toLowerCase().replace(/\s+/g, '_') ||
        'usuario';
      const finalUsername = username.trim() ? username.trim() : `${baseUsername}_${Math.floor(Math.random() * 10000)}`;

      // Verificar unicidad del username
      const { data: existingUser, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', finalUsername)
        .neq('id', userId)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingUser) {
        setUsernameError('Ese username ya está en uso. Elige otro.');
        setSaving(false);
        return;
      }

      const { error } = await supabase.from('profiles').upsert(
        {
          id: userId,
          full_name: fullName.trim(),
          username: finalUsername,
          bio: bio.trim(),
          avatar_url: avatarUrl,
          document_id: documentId.trim(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      if (error) throw error;

      Alert.alert('Perfil actualizado', 'Tus cambios han sido guardados exitosamente.');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudieron guardar los cambios');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      router.replace('/');
    } catch (error) {
      Alert.alert('Error', 'No se pudo cerrar sesión');
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que deseas salir de tu cuenta?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: handleSignOut },
    ]);
  };

  if (loading) {
    return (
      <LinearGradient colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']} style={styles.loadingContainer}>
        <ActivityIndicator color="#FFFFFF" size="large" />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Mi Perfil</Text>
          </View>

          <View style={styles.avatarSection}>
            <View style={styles.avatarRow}>
              <TouchableOpacity onPress={pickAndUploadAvatar} disabled={uploadingAvatar} activeOpacity={0.8}>
                <View style={styles.avatarContainer}>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <Ionicons name="person" size={40} color="#C77DFF" />
                  )}
                  {uploadingAvatar && (
                    <View style={styles.uploadingOverlay}>
                      <ActivityIndicator color="#FFFFFF" />
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity onPress={pickAndUploadAvatar} disabled={uploadingAvatar} style={styles.cameraButton} activeOpacity={0.8}>
                <Ionicons name="camera" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.changePhotoText}>Cambiar foto de perfil</Text>
          </View>

          <View style={styles.formContainer}>
            <Text style={styles.label}>Nombre completo</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={18} color="#E9D5FF" />
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Tu nombre"
                placeholderTextColor="rgba(233,213,255,0.4)"
              />
            </View>

            <Text style={styles.label}>Username</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="at-outline" size={18} color="#E9D5FF" />
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="usuario"
                placeholderTextColor="rgba(233,213,255,0.4)"
                autoCapitalize="none"
              />
            </View>
            {usernameError ? <Text style={styles.errorText}>{usernameError}</Text> : null}

            <Text style={styles.label}>Número de documento</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="card-outline" size={18} color="#E9D5FF" />
              <TextInput
                style={styles.input}
                value={documentId}
                onChangeText={setDocumentId}
                placeholder="Cédula, pasaporte, etc."
                placeholderTextColor="rgba(233,213,255,0.4)"
                autoCapitalize="none"
              />
            </View>

            <Text style={styles.label}>Bio</Text>
            <View style={[styles.inputContainer, styles.bioInputContainer]}>
              <Ionicons name="document-text-outline" size={18} color="#E9D5FF" style={{ marginTop: 2 }} />
              <TextInput
                style={[styles.input, styles.bioInput]}
                value={bio}
                onChangeText={setBio}
                placeholder="Cuéntanos sobre ti..."
                placeholderTextColor="rgba(233,213,255,0.4)"
                multiline
                numberOfLines={4}
              />
            </View>

            <Text style={styles.emailDisplay}>
              <Ionicons name="mail-outline" size={14} color="rgba(233,213,255,0.6)" /> {email}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>Guardar cambios</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.signOutButton}
            onPress={confirmSignOut}
            activeOpacity={0.85}
          >
            <Ionicons name="log-out-outline" size={20} color="#FF6B6B" />
            <Text style={styles.signOutText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
  header: { marginBottom: 20 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },
  avatarSection: { alignItems: 'center', marginBottom: 30 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: '#C77DFF',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#9D4EDD',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1A0033',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  changePhotoText: { marginTop: 10, color: '#D8B4FE', fontSize: 13 },
  formContainer: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  label: { color: '#E9D5FF', fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 12 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  input: { flex: 1, color: '#FFFFFF', fontSize: 15 },
  bioInputContainer: { alignItems: 'flex-start' },
  bioInput: { minHeight: 80, textAlignVertical: 'top' },
  emailDisplay: { color: 'rgba(233,213,255,0.6)', fontSize: 12, marginTop: 15 },
  errorText: { color: '#FF6B6B', fontSize: 12, marginTop: 4 },
  saveButton: {
    backgroundColor: '#7B2CBF',
    borderRadius: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  signOutButton: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  signOutText: { color: '#FF6B6B', fontSize: 16, fontWeight: '700' },
});