import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://zshyqwviuuhplgyiatdw.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzaHlxd3ZpdXVocGxneWlhdGR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NTYxMDIsImV4cCI6MjA5NDUzMjEwMn0.B-IseFCeGpvJx_2eKprhhm1mphYQb2KorbvX6eWsN50";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

export const CURRENCY = "SAR";
export function fmt(amount: number | null | undefined) {
  const v = Number(amount ?? 0);
  return `${CURRENCY} ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
