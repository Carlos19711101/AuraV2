import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  try {
    const payload = await req.json();
    console.log('Payload request:', JSON.stringify(payload));

    // ✅ FILTRO: Solo procesar INSERT (no UPDATE ni DELETE)
    if (payload.type && payload.type !== 'INSERT') {
      console.log('SKIP: no es INSERT');
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'not_insert' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const session_id = payload.session_id || payload.record?.session_id;
    const specificContactUserId = payload.record?.contact_user_id;

    if (!session_id) {
      return new Response(JSON.stringify({ error: 'session_id requerido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Obtener el emisor
    const { data: session, error: sessionError } = await supabase
      .from('support_sessions')
      .select('user_id')
      .eq('id', session_id)
      .single();

    if (sessionError) throw sessionError;

    const emisorId = session.user_id;

    // Obtener el nombre del emisor
    const { data: emitter } = await supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', emisorId)
      .maybeSingle();

    const emitterName =
      emitter?.full_name || emitter?.username || 'Alguien de AURA';

    // Determinar destinatarios
    let userIds: string[] = [];

    if (specificContactUserId) {
      // ✅ Llamada desde webhook: solo a ese contacto
      if (specificContactUserId !== emisorId) {
        userIds = [specificContactUserId];
      }
    } else {
      // Llamada directa: todos los pendientes
      const { data: requests } = await supabase
        .from('support_requests')
        .select('contact_user_id')
        .eq('session_id', session_id)
        .eq('status', 'pending');

      userIds = (requests || [])
        .map((r: any) => r.contact_user_id)
        .filter((id: string | null) => id && id !== emisorId);
    }

    if (userIds.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Sin destinatarios' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Obtener tokens
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .in('user_id', userIds);

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Sin tokens' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Enviar notificaciones
    const messages = tokens.map((t: any) => ({
      to: t.token,
      sound: 'default',
      title: 'AURA',
      body: `${emitterName} necesita acompañamiento`,
      data: { session_id },
    }));

    const pushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    const pushResult = await pushResponse.json();
    console.log('Respuesta Expo Push:', JSON.stringify(pushResult));

    return new Response(
      JSON.stringify({ success: true, sent: tokens.length, result: pushResult }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('Error:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});