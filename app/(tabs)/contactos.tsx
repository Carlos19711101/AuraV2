import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../src/lib/supabase';

type Contact = {
  id: string;
  name: string;
  phone: string;
  relationship: string | null;
  priority: number;
  contact_user_id?: string | null;
};

export default function ContactosScreen() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [priority, setPriority] = useState('1');
  const [contactDocument, setContactDocument] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) fetchContacts(uid);
    });
  }, []);

  const fetchContacts = async (uid: string) => {
    const { data, error } = await supabase
      .from('emergency_contacts')
      .select('*')
      .eq('user_id', uid)
      .order('priority', { ascending: true });

    if (error) {
      Alert.alert('Error', 'No se pudieron cargar los contactos');
      return;
    }
    setContacts(data || []);
  };

  const openAddModal = () => {
    setEditingContact(null);
    setName('');
    setPhone('');
    setRelationship('');
    setPriority('1');
    setContactDocument('');
    setModalVisible(true);
  };

  const openEditModal = (contact: Contact) => {
    setEditingContact(contact);
    setName(contact.name);
    setPhone(contact.phone);
    setRelationship(contact.relationship || '');
    setPriority(String(contact.priority || 1));
    setContactDocument('');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!userId) return;
    if (!name.trim() || !phone.trim()) {
      Alert.alert('Campos requeridos', 'Nombre y teléfono son obligatorios.');
      return;
    }

    try {
      setSaving(true);

      let contactUserId: string | null = null;
      if (contactDocument.trim()) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('document_id', contactDocument.trim())
          .maybeSingle();

        if (profileError) throw profileError;
        if (profileData) {
          contactUserId = profileData.id;
        } else {
          Alert.alert(
            'Usuario no encontrado',
            'No se encontró un usuario de AURA con ese documento. El contacto se guardará sin vínculo.'
          );
        }
      }

      const contactData = {
        user_id: userId,
        name: name.trim(),
        phone: phone.trim(),
        relationship: relationship.trim() || null,
        priority: parseInt(priority) || 1,
        contact_user_id: contactUserId,
      };

      if (editingContact) {
        const { error } = await supabase
          .from('emergency_contacts')
          .update(contactData)
          .eq('id', editingContact.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('emergency_contacts')
          .insert(contactData);
        if (error) throw error;
      }

      setModalVisible(false);
      fetchContacts(userId);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo guardar el contacto');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contactId: string) => {
    Alert.alert('Eliminar contacto', '¿Seguro que deseas eliminar este contacto?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('emergency_contacts')
            .delete()
            .eq('id', contactId);
          if (error) {
            Alert.alert('Error', 'No se pudo eliminar');
          } else {
            if (userId) fetchContacts(userId);
          }
        },
      },
    ]);
  };

  const callContact = (phoneNumber: string) => {
    Linking.openURL(`tel:${phoneNumber}`);
  };

  const renderContact = ({ item, index }: { item: Contact; index: number }) => (
    <View style={styles.contactCard}>
      <View style={styles.contactInfo}>
        <Text style={styles.priorityBadge}>{index + 1}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.contactName}>{item.name}</Text>
          <Text style={styles.contactPhone}>{item.phone}</Text>
          {item.relationship ? (
            <Text style={styles.contactRelation}>{item.relationship}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.actionButtons}>
        <TouchableOpacity onPress={() => callContact(item.phone)} style={styles.callButton}>
          <Ionicons name="call" size={18} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => openEditModal(item)} style={styles.editButton}>
          <Ionicons name="pencil" size={16} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteButton}>
          <Ionicons name="trash" size={16} color="#FFF" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <LinearGradient colors={['#1A0033', '#3A0CA3', '#7209B7', '#1A0033']} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Contactos de Apoyo</Text>
        <Text style={styles.subtitle}>Personas de confianza para momentos difíciles</Text>
      </View>

      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        renderItem={renderContact}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={40} color="#C77DFF" />
            <Text style={styles.emptyText}>Aún no tienes contactos de apoyo</Text>
            <Text style={styles.emptySubtext}>Toca el botón + para agregar a alguien de confianza</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={openAddModal} activeOpacity={0.8}>
        <Ionicons name="add" size={30} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>{editingContact ? 'Editar contacto' : 'Nuevo contacto'}</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
              <Text style={styles.label}>Nombre</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nombre completo" placeholderTextColor="rgba(233,213,255,0.4)" />

              <Text style={styles.label}>Teléfono</Text>
              <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Número de teléfono" placeholderTextColor="rgba(233,213,255,0.4)" keyboardType="phone-pad" />

              <Text style={styles.label}>Relación (opcional)</Text>
              <TextInput style={styles.input} value={relationship} onChangeText={setRelationship} placeholder="Ej: Madre, Amiga, Terapeuta" placeholderTextColor="rgba(233,213,255,0.4)" />

              <Text style={styles.label}>Orden de importancia</Text>
              <Text style={styles.helperText}>Usa números para ordenar tus contactos: 1 es el más importante, 2 el siguiente, y así sucesivamente.</Text>
              <TextInput style={styles.input} value={priority} onChangeText={setPriority} keyboardType="numeric" placeholder="Ej: 1, 2, 3..." placeholderTextColor="rgba(233,213,255,0.4)" />

              <Text style={styles.label}>Número de documento del contacto en AURA</Text>
              <TextInput style={styles.input} value={contactDocument} onChangeText={setContactDocument} placeholder="Ej: 1234567890" placeholderTextColor="rgba(233,213,255,0.4)" autoCapitalize="none" />

              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setModalVisible(false)}>
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleSave} disabled={saving}>
                  <Text style={styles.saveButtonText}>{saving ? 'Guardando...' : 'Guardar'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 10 },
  title: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },
  subtitle: { color: '#D8B4FE', fontSize: 14, marginTop: 4, marginBottom: 10 },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  contactCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  contactInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  priorityBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#9D4EDD',
    textAlign: 'center',
    lineHeight: 32,
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  contactName: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  contactPhone: { color: 'rgba(233,213,255,0.8)', fontSize: 14, marginTop: 2 },
  contactRelation: { color: '#C77DFF', fontSize: 12, marginTop: 2 },
  actionButtons: { flexDirection: 'row', gap: 8 },
  callButton: { backgroundColor: '#2ECC71', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  editButton: { backgroundColor: '#F39C12', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  deleteButton: { backgroundColor: '#E74C3C', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { alignItems: 'center', marginTop: 60, paddingHorizontal: 20 },
  emptyText: { color: '#FFF', fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptySubtext: { color: 'rgba(233,213,255,0.6)', fontSize: 14, marginTop: 8, textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 90,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#9D4EDD',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 20 },
  modalContainer: { backgroundColor: '#2A0A4A', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#FFF', marginBottom: 16 },
  label: { color: '#D8B4FE', fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  helperText: { color: 'rgba(233,213,255,0.6)', fontSize: 12, marginBottom: 6, lineHeight: 16 },
  input: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: '#FFF', fontSize: 15 },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalButton: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  cancelButton: { backgroundColor: 'rgba(255,255,255,0.1)' },
  saveButton: { backgroundColor: '#9D4EDD' },
  cancelButtonText: { color: '#FFF', fontWeight: '700' },
  saveButtonText: { color: '#FFF', fontWeight: '700' },
});