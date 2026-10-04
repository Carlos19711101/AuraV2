// src/lib/sessions.ts
import { supabase } from "./supabase";

type RetentionType = "delete_now" | "keep_7_days";
type CloseStatus = "completed" | "cancelled";

/**
 * Cierra una sesión y limpia las ubicaciones según su retención.
 *
 * - Si `location_retention = 'delete_now'`: borra las ubicaciones inmediatamente.
 * - Si `location_retention = 'keep_7_days'`: las deja; `pg_cron` las borrará al día 7.
 *
 * También marca `location_stopped_at` y `updated_at` para auditoría.
 */
export async function closeSession(
  sessionId: string,
  newStatus: CloseStatus,
): Promise<void> {
  const nowIso = new Date().toISOString();

  // 1) Leer la retención configurada
  const { data: session, error: readError } = await supabase
    .from("support_sessions")
    .select("location_retention")
    .eq("id", sessionId)
    .single();

  if (readError) throw readError;

  const retention: RetentionType =
    (session?.location_retention as RetentionType) ?? "delete_now";

  // 2) Actualizar la sesión
  const { error: updateError } = await supabase
    .from("support_sessions")
    .update({
      status: newStatus,
      updated_at: nowIso,
      location_stopped_at: nowIso,
    })
    .eq("id", sessionId);

  if (updateError) throw updateError;

  // 3) Borrar ubicaciones si la retención es "delete_now"
  if (retention === "delete_now") {
    const { error: deleteError } = await supabase
      .from("support_locations")
      .delete()
      .eq("session_id", sessionId);

    if (deleteError) {
      // No relanzamos: la sesión ya se cerró. Logueamos para diagnóstico.
      console.warn(
        "[closeSession] No se pudieron borrar ubicaciones:",
        deleteError.message,
      );
    }
  }
}

/**
 * Cancela una sesión y sus solicitudes asociadas.
 * Además limpia las ubicaciones si la retención es "delete_now".
 */
export async function cancelSessionWithRequests(
  sessionId: string,
): Promise<void> {
  await closeSession(sessionId, "cancelled");

  const { error } = await supabase
    .from("support_requests")
    .update({ status: "cancelled" })
    .eq("session_id", sessionId);

  if (error) {
    console.warn(
      "[cancelSessionWithRequests] No se pudieron cancelar las requests:",
      error.message,
    );
  }
}
