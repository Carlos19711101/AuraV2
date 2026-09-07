import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  // Leer el body de la solicitud
  const { session_id } = await req.json();

  if (!session_id) {
    return new Response(JSON.stringify({ error: 'session_id es requerido' }), { status: 400 });
  }

  // 1. Obtener los contact_user_id de las solicitudes pendientes de esa sesión
  const { data: requests, error: reqError } = await supabase
    .from('support_requests')
    .select('contact_user_id')
    .eq('session_id', session_id)
    .eq('status', 'pending');

  if (reqError) {
    return new Response(JSON.stringify({ error: reqError.message }), { status: 500 });
  }

  // Extraer los IDs de usuario (contact_user_id) sin nulos
  const userIds = requests
    .map((r: any) => r.contact_user_id)
    .filter(Boolean);

  if (userIds.length === 0) {
    return new Response(JSON.stringify({ success: true, message: 'No hay contactos vinculados' }), { status: 200 });
  }

  // 2. Obtener los tokens de push de esos usuarios
  const { data: tokens, error: tokenError } = await supabase
    .from('push_tokens')
    .select('token')
    .in('user_id', userIds);

  if (tokenError) {
    return new Response(JSON.stringify({ error: tokenError.message }), { status: 500 });
  }

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ success: true, message: 'No hay tokens registrados' }), { status: 200 });
  }

  // 3. Enviar notificación push a cada token usando Expo Push API
  const expoPushApiUrl = 'https://exp.host/--/api/v2/push/send';
  const messages = tokens.map((t: any) => ({
    to: t.token,
    sound: 'default',
    title: 'AURA',
    body: 'Necesito acompañamiento',
    data: { session_id },
  }));

  const pushResponse = await fetch(expoPushApiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });

  const pushResult = await pushResponse.json();
  console.log('Respuesta de Expo Push:', pushResult);

  return new Response(JSON.stringify({ success: true, sent: tokens.length }), { status: 200 });
});