import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export function useTable<T = any>(table: string, opts?: { orderBy?: string; ascending?: boolean }) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  async function refetch() {
    setLoading(true);
    let q = supabase.from(table).select("*");
    if (opts?.orderBy) q = q.order(opts.orderBy, { ascending: opts.ascending ?? false });
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setData((data as T[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { refetch(); /* eslint-disable-next-line */ }, [table]);
  return { data, loading, refetch };
}
