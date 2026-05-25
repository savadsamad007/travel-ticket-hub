/* global supabase */
const SUPABASE_URL = "https://zshyqwviuuhplgyiatdw.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzaHlxd3ZpdXVocGxneWlhdGR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NTYxMDIsImV4cCI6MjA5NDUzMjEwMn0.B-IseFCeGpvJx_2eKprhhm1mphYQb2KorbvX6eWsN50";

// Chrome storage adapter for Supabase auth
const chromeStorage = {
  getItem: (k) => new Promise((r) => chrome.storage.local.get([k], (v) => r(v[k] ?? null))),
  setItem: (k, v) => new Promise((r) => chrome.storage.local.set({ [k]: v }, r)),
  removeItem: (k) => new Promise((r) => chrome.storage.local.remove([k], r)),
};

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storage: chromeStorage },
});

const app = document.getElementById("app");
const fmt = (n) => "SAR " + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayISO = () => new Date().toISOString().slice(0, 10);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let state = { user: null, agencyOwner: null, tab: "ticket", suppliers: [], customers: [], agents: [], customerSummary: {} };

// Build a per-customer summary: latest ticket # + pending amount
async function loadCustomerSummary() {
  const map = {};
  state.customers.forEach((c) => { map[c.id] = { ticket_no: "", sales: 0, paid: 0 }; });
  const [{ data: tks }, { data: pys }] = await Promise.all([
    sb.from("tickets").select("buyer_id,buyer_type,ticket_no,sale_price,created_at").eq("is_deleted", false).eq("buyer_type", "customer").order("created_at", { ascending: false }),
    sb.from("payments").select("party_id,party_type,amount,direction").eq("is_deleted", false).eq("party_type", "customer"),
  ]);
  (tks || []).forEach((t) => {
    const m = map[t.buyer_id]; if (!m) return;
    m.sales += Number(t.sale_price || 0);
    if (!m.ticket_no && t.ticket_no) m.ticket_no = t.ticket_no;
  });
  (pys || []).forEach((p) => {
    const m = map[p.party_id]; if (!m) return;
    if (p.direction === "in") m.paid += Number(p.amount || 0);
  });
  state.customerSummary = map;
}

async function loadAgency(uid) {
  const { data: ua } = await sb.from("user_agency").select("agency_owner, role").eq("user_id", uid).eq("is_deleted", false).maybeSingle();
  state.agencyOwner = ua ? ua.agency_owner : uid;
}

async function loadLookups() {
  const [s, c, a] = await Promise.all([
    sb.from("suppliers").select("id,name").eq("is_deleted", false).order("name"),
    sb.from("customers").select("id,name").eq("is_deleted", false).order("name"),
    sb.from("sub_agents").select("id,name").eq("is_deleted", false).order("name"),
  ]);
  state.suppliers = s.data || [];
  state.customers = c.data || [];
  state.agents = a.data || [];
}

function showMsg(text, type) {
  const m = document.createElement("div");
  m.className = "msg " + (type || "ok");
  m.textContent = text;
  app.prepend(m);
  setTimeout(() => m.remove(), 3500);
}

function renderLogin() {
  app.innerHTML = `
    <h1><span class="logo"></span> Skybird</h1>
    <div class="card">
      <h2 style="margin-top:0">Sign in</h2>
      <label>Email</label>
      <input id="email" type="email" autocomplete="email" />
      <label>Password</label>
      <input id="password" type="password" autocomplete="current-password" />
      <div style="margin-top:10px"><button id="loginBtn">Login</button></div>
    </div>
  `;
  document.getElementById("loginBtn").onclick = async () => {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    if (!email || !password) return showMsg("Enter email and password", "err");
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return showMsg(error.message, "err");
    await init();
  };
}

function renderHome() {
  app.innerHTML = `
    <div class="topbar">
      <h1 style="margin:0"><span class="logo"></span> Skybird</h1>
      <div>
        <div class="who">${esc(state.user.email)}</div>
        <button class="danger" id="logoutBtn" style="width:auto;padding:2px 6px;font-size:11px">Logout</button>
      </div>
    </div>
    <div class="tabs">
      <button data-tab="ticket" class="${state.tab === "ticket" ? "active" : ""}">Ticket</button>
      <button data-tab="payment" class="${state.tab === "payment" ? "active" : ""}">Payment</button>
    </div>
    <div id="tabContent"></div>
    <h2>Recent tickets</h2>
    <div class="card" id="recent"><div class="spinner"></div></div>
  `;
  document.getElementById("logoutBtn").onclick = async () => { await sb.auth.signOut(); state.user = null; renderLogin(); };
  document.querySelectorAll(".tabs button").forEach((b) => b.onclick = () => { state.tab = b.dataset.tab; renderHome(); });
  if (state.tab === "ticket") renderTicketForm(); else renderPaymentForm();
  renderRecent();
}

function renderTicketForm() {
  const c = document.getElementById("tabContent");
  c.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0">New ticket</h2>
      <div class="row">
        <div><label>Ticket #</label><input id="t_ticket_no" /></div>
        <div><label>PNR</label><input id="t_pnr" /></div>
      </div>
      <label>Passenger name *</label>
      <input id="t_passenger_name" />
      <div class="row">
        <div><label>Route</label><input id="t_route" placeholder="JED-DXB" /></div>
        <div><label>Airline</label><input id="t_airline" /></div>
      </div>
      <div class="row">
        <div><label>Booking date</label><input id="t_booking_date" type="date" value="${todayISO()}" /></div>
        <div><label>Travel date</label><input id="t_travel_date" type="date" /></div>
      </div>
      <label>Supplier *</label>
      <select id="t_supplier_id"><option value="">— pick —</option>${state.suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select>
      <div class="row">
        <div><label>Buyer type</label>
          <select id="t_buyer_type"><option value="customer">Customer</option><option value="sub_agent">Sub-agent</option></select>
        </div>
        <div><label>Buyer *</label><select id="t_buyer_id"></select></div>
      </div>
      <div class="row">
        <div><label>Cost</label><input id="t_cost_price" type="number" step="0.01" value="0" /></div>
        <div><label>Sale</label><input id="t_sale_price" type="number" step="0.01" value="0" /></div>
      </div>
      <div style="margin-top:10px"><button id="saveTicket">Save ticket</button></div>
    </div>
  `;
  const buyerSel = document.getElementById("t_buyer_id");
  const fillBuyers = () => {
    const list = document.getElementById("t_buyer_type").value === "customer" ? state.customers : state.agents;
    buyerSel.innerHTML = `<option value="">— pick —</option>` + list.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("");
  };
  document.getElementById("t_buyer_type").onchange = fillBuyers;
  fillBuyers();

  document.getElementById("saveTicket").onclick = async () => {
    const v = (id) => document.getElementById(id).value;
    if (!v("t_passenger_name").trim()) return showMsg("Passenger name required", "err");
    if (!v("t_supplier_id")) return showMsg("Pick supplier", "err");
    if (!v("t_buyer_id")) return showMsg("Pick buyer", "err");
    const payload = {
      agency_owner: state.agencyOwner,
      ticket_no: v("t_ticket_no") || null,
      pnr: v("t_pnr") || null,
      passenger_name: v("t_passenger_name").trim(),
      route: v("t_route") || null,
      airline: v("t_airline") || null,
      booking_date: v("t_booking_date") || todayISO(),
      travel_date: v("t_travel_date") || null,
      supplier_id: v("t_supplier_id"),
      buyer_type: v("t_buyer_type"),
      buyer_id: v("t_buyer_id"),
      cost_price: Number(v("t_cost_price") || 0),
      sale_price: Number(v("t_sale_price") || 0),
      status: "booked",
    };
    const { error } = await sb.from("tickets").insert(payload);
    if (error) return showMsg(error.message, "err");
    showMsg("Ticket saved", "ok");
    renderTicketForm();
    renderRecent();
  };
}

function renderPaymentForm() {
  const c = document.getElementById("tabContent");
  c.innerHTML = `
    <div class="card">
      <h2 style="margin-top:0">New payment</h2>
      <div class="row">
        <div><label>Direction</label>
          <select id="p_direction"><option value="in">In (received)</option><option value="out">Out (paid)</option></select>
        </div>
        <div><label>Method</label>
          <select id="p_method"><option value="cash">Cash</option><option value="bank">Bank</option></select>
        </div>
      </div>
      <div class="row">
        <div><label>Party type</label>
          <select id="p_party_type"><option value="customer">Customer</option><option value="supplier">Supplier</option><option value="sub_agent">Sub-agent</option></select>
        </div>
        <div><label>Party *</label><select id="p_party_id"></select></div>
      </div>
      <div class="row">
        <div><label>Amount *</label><input id="p_amount" type="number" step="0.01" value="0" /></div>
        <div><label>Date</label><input id="p_date" type="date" value="${todayISO()}" /></div>
      </div>
      <label>Notes</label>
      <textarea id="p_notes" rows="2"></textarea>
      <div style="margin-top:10px"><button id="savePayment">Save payment</button></div>
    </div>
  `;
  const partySel = document.getElementById("p_party_id");
  const fillParty = () => {
    const t = document.getElementById("p_party_type").value;
    const list = t === "customer" ? state.customers : t === "supplier" ? state.suppliers : state.agents;
    partySel.innerHTML = `<option value="">— pick —</option>` + list.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("");
  };
  document.getElementById("p_party_type").onchange = fillParty;
  fillParty();

  document.getElementById("savePayment").onclick = async () => {
    const v = (id) => document.getElementById(id).value;
    const amt = Number(v("p_amount") || 0);
    if (!amt) return showMsg("Enter amount", "err");
    if (!v("p_party_id")) return showMsg("Pick party", "err");
    const payload = {
      agency_owner: state.agencyOwner,
      direction: v("p_direction"),
      method: v("p_method"),
      party_type: v("p_party_type"),
      party_id: v("p_party_id"),
      amount: amt,
      paid_at: v("p_date") || todayISO(),
      notes: v("p_notes") || null,
    };
    const { error } = await sb.from("payments").insert(payload);
    if (error) return showMsg(error.message, "err");
    showMsg("Payment saved", "ok");
    renderPaymentForm();
  };
}

async function renderRecent() {
  const box = document.getElementById("recent");
  const { data, error } = await sb.from("tickets").select("id,passenger_name,route,sale_price,created_at").eq("is_deleted", false).order("created_at", { ascending: false }).limit(8);
  if (error) { box.innerHTML = `<div class="muted">${esc(error.message)}</div>`; return; }
  if (!data || !data.length) { box.innerHTML = `<div class="muted">No tickets yet.</div>`; return; }
  box.innerHTML = data.map((t) => `
    <div class="ticket">
      <div><div class="pn">${esc(t.passenger_name || "—")}</div><div class="muted">${esc(t.route || "")}</div></div>
      <div class="amt">${fmt(t.sale_price)}</div>
    </div>
  `).join("");
}

async function init() {
  app.innerHTML = `<div class="spinner"></div>`;
  const { data } = await sb.auth.getSession();
  if (!data.session) { renderLogin(); return; }
  state.user = data.session.user;
  await loadAgency(state.user.id);
  await loadLookups();
  state.tab = "ticket";
  renderHome();
}

init();
