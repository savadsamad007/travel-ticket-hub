import { supabase } from "@/lib/supabase";

function isSessionError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
  return (
    message.includes("jwt") ||
    message.includes("token") ||
    message.includes("session") ||
    message.includes("unauthorized")
  );
}

export async function ensureSupabaseSession() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (!userError && userData.user) return userData.user;

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshed.session?.user) {
    throw new Error("Your login session is not ready. Please wait a moment and try again.");
  }
  return refreshed.session.user;
}

export async function withSupabaseRetry<T>(work: () => Promise<T>): Promise<T> {
  try {
    await ensureSupabaseSession();
    return await work();
  } catch (error) {
    if (!isSessionError(error)) throw error;
    await ensureSupabaseSession();
    return await work();
  }
}
