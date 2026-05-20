// Skybird HTML — Supabase backend + Google Sheets mirror
//
// Same database as the React app. Every write also fires-and-forgets a copy
// to your Google Apps Script Web App which appends a row to the matching tab.

const SUPABASE_URL = "https://zshyqwviuuhplgyiatdw.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzaHlxd3ZpdXVocGxneWlhdGR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NTYxMDIsImV4cCI6MjA5NDUzMjEwMn0.B-IseFCeGpvJx_2eKprhhm1mphYQb2KorbvX6eWsN50";

const SHEETS_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbxZsRJF-HnOQT9kxn_bRFwjEDH8mV62Swgm3sp3cSvcQ-sRlipFxck9ghfPKHgOIHz4YQ/exec";

// Supabase JS is loaded via CDN in index.html: window.supabase
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
});

// ---- Google Sheets mirror (fire and forget) ----
function mirrorToSheet(table, row, op) {
  try {
    fetch(SHEETS_WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "mirror", data: { table, row, op } }),
      keepalive: true,
    }).catch(() => {});
  } catch (_) {}
}

// ---- Helpers ----
function isSessionProblem(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  return msg.includes("jwt") || msg.includes("token") || msg.includes("session") || msg.includes("not signed in") || msg.includes("unauthorized");
}

async function withSessionRetry(work) {
  try {
    return await work();
  } catch (e) {
    if (!isSessionProblem(e) || !Auth.user) throw e;
    await Auth.refreshSessionIfNeeded(true);
    await Auth.loadMe();
    Store.cache = {};
    return await work();
  }
}

function ownerId() {
  if (!Auth.user) throw new Error("Not signed in");
  return Auth.agencyOwner || Auth.user.id;
}

async function sbList(table, opts = {}) {
  return withSessionRetry(async () => {
    let q = sb.from(table).select("*").eq("owner_id", ownerId());
    if (opts.order) q = q.order(opts.order, { ascending: false });
    else q = q.order("created_at", { ascending: false });
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  });
}

async function sbUpsert(table, row) {
  return withSessionRetry(async () => {
    const payload = { ...row, owner_id: ownerId() };
    if (!payload.id) delete payload.id;
    // Strip empties on numeric/uuid-ish optional fields.
    Object.keys(payload).forEach((k) => { if (payload[k] === "" || payload[k] === undefined) delete payload[k]; });
    const { data, error } = await sb.from(table).upsert(payload).select().single();
    if (error) throw new Error(error.message);
    mirrorToSheet(table, data, "upsert");
    return data;
  });
}

async function sbDelete(table, id) {
  return withSessionRetry(async () => {
    const { error } = await sb.from(table).delete().eq("id", id);
    if (error) throw new Error(error.message);
    mirrorToSheet(table, { id }, "delete");
    return { id };
  });
}

// ---- Dispatch table: same action strings the pages already call ----
const ACTIONS = {
  // Customers / suppliers / sub-agents
  "customers.list":   () => sbList("customers"),
  "customers.upsert": (d) => sbUpsert("customers", d),
  "customers.delete": (d) => sbDelete("customers", d.id),

  "suppliers.list":   () => sbList("suppliers"),
  "suppliers.upsert": (d) => sbUpsert("suppliers", d),
  "suppliers.delete": (d) => sbDelete("suppliers", d.id),

  "sub_agents.list":   () => sbList("sub_agents"),
  "sub_agents.upsert": (d) => sbUpsert("sub_agents", d),
  "sub_agents.delete": (d) => sbDelete("sub_agents", d.id),

  // Tickets + services
  "tickets.list":     () => sbList("tickets"),
  "tickets.upsert":   (d) => sbUpsert("tickets", d),
  "tickets.delete":   (d) => sbDelete("tickets", d.id),
  "tickets.services": async (d) => {
    const { data, error } = await sb.from("ticket_services").select("*").eq("ticket_id", d.ticket_id);
    if (error) throw new Error(error.message);
    return data || [];
  },
  "services.upsert":  (d) => sbUpsert("ticket_services", d),
  "services.delete":  (d) => sbDelete("ticket_services", d.id),

  // Refunds + payments
  "refunds.list":     () => sbList("refunds"),
  "refunds.upsert":   (d) => sbUpsert("refunds", d),
  "refunds.delete":   (d) => sbDelete("refunds", d.id),

  "payments.list":    () => sbList("payments"),
  "payments.upsert":  (d) => sbUpsert("payments", d),
  "payments.delete":  (d) => sbDelete("payments", d.id),

  // Agency profile
  "agency.get": async () => {
    return withSessionRetry(async () => {
      const { data, error } = await sb
        .from("agency_profile")
        .select("*")
        .eq("agency_owner", ownerId())
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return {};
      return {
        agency_name: data.agency_name,
        phone: data.phone,
        email: data.email,
        address: data.address,
        vat_no: data.vat_number,
        logo_url: data.logo_url,
        report_email: data.report_email,
      };
    });
  },
  "agency.save": async (d) => {
    const payload = {
      agency_owner: ownerId(),
      agency_name: d.agency_name || "Skybird",
      phone: d.phone || null,
      email: d.email || null,
      address: d.address || null,
      vat_number: d.vat_no || null,
      logo_url: d.logo_url || null,
      report_email: d.report_email || null,
      updated_at: new Date().toISOString(),
    };
    return withSessionRetry(async () => {
      const { data, error } = await sb
        .from("agency_profile")
        .upsert(payload, { onConflict: "agency_owner" })
        .select()
        .single();
      if (error) throw new Error(error.message);
      mirrorToSheet("agency_profile", data, "upsert");
      return data;
    });
  },

  // Staff
  "staff.list": async () => {
    const { data, error } = await sb
      .from("user_agency")
      .select("user_id, full_name, role, permissions, created_at")
      .eq("agency_owner", ownerId())
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map((r) => ({
      id: r.user_id,
      name: r.full_name || "—",
      email: r.user_id.slice(0, 8) + "…", // email isn't exposed via anon — show short id
      role: r.role,
      permissions: r.permissions || {},
    }));
  },
  "staff.setPermissions": async (d) => {
    const { error } = await sb
      .from("user_agency")
      .update({ permissions: d.permissions || {} })
      .eq("user_id", d.id)
      .eq("agency_owner", ownerId());
    if (error) throw new Error(error.message);
    mirrorToSheet("user_agency", { user_id: d.id, permissions: d.permissions }, "perms");
    return { id: d.id };
  },
  "staff.setRole": async (d) => {
    const { error } = await sb
      .from("user_agency")
      .update({ role: d.role })
      .eq("user_id", d.id)
      .eq("agency_owner", ownerId());
    if (error) throw new Error(error.message);
    return { id: d.id };
  },
  "staff.delete": async (d) => {
    const { error } = await sb.from("user_agency").delete().eq("user_id", d.id).eq("agency_owner", ownerId());
    if (error) throw new Error(error.message);
    mirrorToSheet("user_agency", { user_id: d.id }, "delete");
    return { id: d.id };
  },

  // Admin creating a salesman (same trick as React app: secondary client)
  "auth.register": async (d) => {
    if (!Auth.isAdmin()) throw new Error("Admin only");
    const tmp = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: su, error: e1 } = await tmp.auth.signUp({
      email: d.email,
      password: d.password,
      options: { data: { full_name: d.name } },
    });
    if (e1) throw new Error(e1.message);
    const newId = su.user?.id;
    if (!newId) throw new Error("Could not create user (may already exist)");
    const { error: e2 } = await sb.from("user_agency").upsert(
      {
        user_id: newId,
        agency_owner: ownerId(),
        role: d.role || "salesman",
        full_name: d.name || d.email,
        permissions: d.role === "admin" ? {} : (d.permissions || { tickets: true, customers: true, payments: true }),
      },
      { onConflict: "user_id" },
    );
    if (e2) throw new Error(e2.message);
    return { id: newId };
  },

  // Reports — compute client-side from rows we already have access to
  "reports.summary": async (d) => {
    const from = d?.from ? new Date(d.from) : new Date(new Date().setHours(0, 0, 0, 0));
    const to = d?.to ? new Date(d.to) : new Date();
    const [tickets, payments] = await Promise.all([sbList("tickets"), sbList("payments")]);
    const inRange = (t) => { const x = new Date(t); return x >= from && x <= to; };
    const tk = tickets.filter((t) => inRange(t.created_at));
    const pm = payments.filter((p) => inRange(p.date || p.created_at));
    const sale = tk.reduce((s, t) => s + Number(t.sale_price || 0), 0);
    const cost = tk.reduce((s, t) => s + Number(t.cost_price || 0), 0);
    const received = pm.filter((p) => p.direction === "in").reduce((s, p) => s + Number(p.amount || 0), 0);
    const paid = pm.filter((p) => p.direction === "out").reduce((s, p) => s + Number(p.amount || 0), 0);
    return { tickets: tk.length, sale, cost, profit: sale - cost, received, paid, cashInHand: received - paid };
  },
};

// Public API used by every page: same signature as before
async function gas(action, data = {}) {
  const fn = ACTIONS[action];
  if (!fn) throw new Error("Unknown action: " + action);
  return await fn(data);
}
