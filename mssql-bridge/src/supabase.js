import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export async function fetchSince(table, watermarkCol, sinceIso) {
  let q = supabase.from(table).select("*").order(watermarkCol, { ascending: true }).limit(500);
  if (sinceIso) q = q.gt(watermarkCol, sinceIso);
  const { data, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

export async function upsertRows(table, rows) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`${table}: ${error.message}`);
}
