import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Configurar el manejador global de notificaciones
Notifications.setNotificationHandler({
  handleNotification: async (_notification) => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(userId: string) {
  // Verificamos que sea Android o iOS (no web)
  if (Platform.OS === 'web') {
    console.log('Notificaciones push no soportadas en web.');
    return;
  }

  // Canal de notificación para Android
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Permiso de notificaciones no concedido');
    return;
  }

  let token: string;
  try {
    const pushToken = await Notifications.getExpoPushTokenAsync();
    token = pushToken.data;
  } catch (error) {
    console.error('Error obteniendo token push:', error);
    return;
  }

  const { error } = await supabase.from('push_tokens').upsert(
    { user_id: userId, token },
    { onConflict: 'token' }
  );

  if (error) {
    console.error('Error guardando token push:', error.message);
  } else {
    console.log('Token push guardado correctamente.');
  }
}