import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  try {
    const payload = await req.json();
    console.log('Payload accepted:', JSON.stringify(payload));

    const record = payload.record || payload;
    const oldRecord = payload.old_record || {};

    // ✅ FILTRO 1: Solo procesar si el status cambió de 'pending' a 'accepted'
    const newStatus = record.status;
    const oldStatus = oldRecord.status;

    if (newStatus !== 'accepted' || oldStatus === 'accepted') {
      console.log('SKIP: no es transición pending → accepted', { oldStatus, newStatus });
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'not_transition_to_accepted' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ✅ FILTRO 2: Solo procesar si hay accepted_by
    const accepted_by = record.accepted_by;
    if (!accepted_by) {
      console.log('SKIP: no hay accepted_by');
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'no_accepted_by' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const session_id = record.id;

    // Obtener emisor
    const { data: session, error: sessErr } = await supabase
      .from('support_sessions')
      .select('user_id')
      .eq('id', session_id)
      .single();

    if (sessErr) throw sessErr;
    const emisorId = session.user_id;

    // Nombre del contacto que aceptó
    const { data: acceptor } = await supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', accepted_by)
      .maybeSingle();

    const acceptorName = acceptor?.full_name || acceptor?.username || 'Tu contacto';

    // ✅ Notificar SOLO al emisor
    const { data: emisorTokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', emisorId);

    if (emisorTokens && emisorTokens.length > 0) {
      const mensajesEmisor = emisorTokens.map((t: any) => ({
        to: t.token,
        sound: 'default',
        title: '💜 Estamos Juntos',
        body: `${acceptorName} ha aceptado acompañarte.`,
        data: { session_id, action: 'accepted' },
      }));

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mensajesEmisor),
      });

      console.log('Notificación enviada al emisor:', emisorId);
    }

    // ✅ Notificar SOLO a los DEMÁS contactos (excluir aceptante y emisor)
    const { data: otherRequests } = await supabase
      .from('support_requests')
      .select('contact_user_id')
      .eq('session_id', session_id)
      .neq('contact_user_id', accepted_by)
      .neq('contact_user_id', emisorId);

    const otherUserIds = (otherRequests || [])
      .map((r: any) => r.contact_user_id)
      .filter(Boolean);

    if (otherUserIds.length > 0) {
      const { data: otherTokens } = await supabase
        .from('push_tokens')
        .select('token')
        .in('user_id', otherUserIds);

      if (otherTokens && otherTokens.length > 0) {
        const mensajesOtros = otherTokens.map((t: any) => ({
          to: t.token,
          sound: 'default',
          title: 'AURA',
          body: 'Gracias por tu ayuda. Alguien más ya está acompañando.',
          data: { session_id, action: 'other_accepted' },
        }));

        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mensajesOtros),
        });

        console.log('Notificados demás contactos:', otherUserIds.length);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Error:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});