/**
 * Skybird — Google Apps Script backend
 * Sheet ID: 1CcpkHYyL3WWgu4X2p2WUTYjBcz1hNqJjq7CrF-dsDNg
 *
 * Deploy:
 *   1. Open https://script.google.com → paste this file
 *   2. Save → Deploy → Manage deployments → edit existing Web App
 *      Execute as: Me     Who has access: Anyone
 *   3. Copy the Web App URL into js/api.js (WEB_APP_URL)
 *
 * Tabs auto-created on first call. Column order = HEADERS[tab].
 */

const SHEET_ID = '1CcpkHYyL3WWgu4X2p2WUTYjBcz1hNqJjq7CrF-dsDNg';

const HEADERS = {
  users: ['id','email','password','name','role','permissions','token','token_exp','created_at'],
  agency_profile: ['id','agency_name','phone','email','address','vat_no','logo_url','report_email'],
  customers: ['id','name','phone','email','address','created_at'],
  suppliers: ['id','name','phone','email','address','opening_balance','created_at'],
  sub_agents: ['id','name','phone','email','address','opening_balance','created_at'],
  tickets: ['id','ticket_no','passenger_name','airline','route','travel_date','pnr',
            'supplier_id','buyer_type','buyer_id','cost_price','sale_price','notes','created_at','created_by'],
  ticket_services: ['id','ticket_id','service','cost_price','sale_price','created_at'],
  refunds: ['id','ticket_id','customer_refund_amount','supplier_refund_amount',
            'supplier_retention_amount','reason','date','created_at'],
  payments: ['id','date','direction','party_type','party_id','amount','method','reference','notes','created_at','created_by']
};

/* ========== Router ========== */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const action = String(body.action || '');
    const data = body.data || {};
    const token = body.token || '';

    if (action === 'auth.login')    return ok(authLogin(data));
    if (action === 'auth.register') return ok(authRegister(data));
    if (action === 'auth.me')       return ok(authMe(token));

    // Public mirror endpoint — appends/updates a row from the HTML app (no auth)
    if (action === 'mirror')        return ok(mirror_(data));

    const user = requireAuth(token);

    const handlers = {
      'agency.get':        () => getOne_('agency_profile', { id: user.agency }) || {},
      'agency.save':       () => { requireAdmin(user); return saveAgency_(user, data); },

      'customers.list':    () => listAll_('customers'),
      'customers.upsert':  () => upsert_('customers', data),
      'customers.delete':  () => { requireAdmin(user); return del_('customers', data.id); },

      'suppliers.list':    () => listAll_('suppliers'),
      'suppliers.upsert':  () => upsert_('suppliers', data),
      'suppliers.delete':  () => { requireAdmin(user); return del_('suppliers', data.id); },

      'sub_agents.list':   () => listAll_('sub_agents'),
      'sub_agents.upsert': () => upsert_('sub_agents', data),
      'sub_agents.delete': () => { requireAdmin(user); return del_('sub_agents', data.id); },

      'tickets.list':      () => listAll_('tickets'),
      'tickets.upsert':    () => { requirePerm(user,'tickets'); data.created_by = data.created_by || user.id; return upsert_('tickets', data); },
      'tickets.delete':    () => { requireAdmin(user); return del_('tickets', data.id); },
      'tickets.services':  () => listWhere_('ticket_services', { ticket_id: data.ticket_id }),
      'services.upsert':   () => { requirePerm(user,'tickets'); return upsert_('ticket_services', data); },
      'services.delete':   () => { requireAdmin(user); return del_('ticket_services', data.id); },

      'refunds.list':      () => listAll_('refunds'),
      'refunds.upsert':    () => { requirePerm(user,'refunds'); return upsert_('refunds', data); },
      'refunds.delete':    () => { requireAdmin(user); return del_('refunds', data.id); },

      'payments.list':     () => listAll_('payments'),
      'payments.upsert':   () => { requirePerm(user,'payments'); data.created_by = data.created_by || user.id; return upsert_('payments', data); },
      'payments.delete':   () => { requireAdmin(user); return del_('payments', data.id); },

      'staff.list':        () => { requireAdmin(user); return listAll_('users').map(u => ({ id:u.id, email:u.email, name:u.name, role:u.role, permissions: safeJson_(u.permissions) })); },
      'staff.setPermissions': () => { requireAdmin(user); return setPermissions_(data); },
      'staff.setRole':     () => { requireAdmin(user); return setRole_(data); },
      'staff.delete':      () => { requireAdmin(user); return del_('users', data.id); },

      'reports.summary':   () => reportsSummary_(data),
    };
    if (!handlers[action]) throw new Error('Unknown action: ' + action);
    return ok(handlers[action]());
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok:false, error: String(err && err.message || err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput('Skybird API. Use POST.').setMimeType(ContentService.MimeType.TEXT);
}

function ok(data) {
  return ContentService.createTextOutput(JSON.stringify({ ok:true, data }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ========== Sheet helpers ========== */
function ss_() { return SpreadsheetApp.openById(SHEET_ID); }
function sheet_(name) {
  const ss = ss_();
  let s = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); s.appendRow(HEADERS[name]); }
  if (s.getLastRow() === 0) s.appendRow(HEADERS[name]);
  return s;
}
function rows_(name) {
  const s = sheet_(name);
  const data = s.getDataRange().getValues();
  const headers = data.shift() || HEADERS[name];
  return data.map(r => { const o={}; headers.forEach((h,i)=>o[h]=r[i]); return o; });
}
function listAll_(name)             { return rows_(name); }
function listWhere_(name, where)    { return rows_(name).filter(r => Object.keys(where).every(k => String(r[k])===String(where[k]))); }
function getOne_(name, where)       { return listWhere_(name, where)[0]; }

function upsert_(name, obj) {
  const s = sheet_(name);
  const headers = HEADERS[name];
  if (!obj.id) {
    obj.id = Utilities.getUuid();
    obj.created_at = obj.created_at || new Date().toISOString();
    const row = headers.map(h => obj[h] !== undefined ? obj[h] : '');
    s.appendRow(row);
    return obj;
  }
  const data = s.getDataRange().getValues();
  for (let i=1; i<data.length; i++) {
    if (String(data[i][0]) === String(obj.id)) {
      const row = headers.map((h,j) => obj[h] !== undefined ? obj[h] : data[i][j]);
      s.getRange(i+1, 1, 1, headers.length).setValues([row]);
      const out={}; headers.forEach((h,j)=>out[h]=row[j]); return out;
    }
  }
  // not found → insert
  const row = headers.map(h => obj[h] !== undefined ? obj[h] : '');
  s.appendRow(row);
  return obj;
}
function del_(name, id) {
  const s = sheet_(name);
  const data = s.getDataRange().getValues();
  for (let i=1; i<data.length; i++) if (String(data[i][0]) === String(id)) { s.deleteRow(i+1); return { id }; }
  return { id };
}
function safeJson_(v){ try { return v ? JSON.parse(v) : {}; } catch(e){ return {}; } }

/* ========== Auth ========== */
function sha_(s){ return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s)).map(b=>('0'+(b&0xff).toString(16)).slice(-2)).join(''); }

function authRegister(d) {
  if (!d.email || !d.password) throw new Error('Email and password required');
  const users = rows_('users');
  if (users.find(u => String(u.email).toLowerCase() === String(d.email).toLowerCase())) throw new Error('Email already registered');
  const role = users.length === 0 ? 'admin' : (d.role || 'salesman');
  const u = {
    id: Utilities.getUuid(), email: d.email.toLowerCase(), password: sha_(d.password),
    name: d.name || d.email.split('@')[0], role,
    permissions: JSON.stringify(role==='admin' ? {} : (d.permissions || { tickets:true, customers:true, payments:true })),
    token:'', token_exp:'', created_at: new Date().toISOString()
  };
  sheet_('users').appendRow(HEADERS.users.map(h => u[h] ?? ''));
  return authLogin({ email: d.email, password: d.password });
}
function authLogin(d) {
  const u = rows_('users').find(x => String(x.email).toLowerCase() === String(d.email||'').toLowerCase());
  if (!u || u.password !== sha_(d.password||'')) throw new Error('Invalid email or password');
  const token = Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,'');
  const exp = new Date(Date.now() + 1000*60*60*24*30).toISOString();
  upsert_('users', { id: u.id, token, token_exp: exp });
  return { token, user: pubUser_({ ...u, token, token_exp: exp }) };
}
function authMe(token) {
  const u = userByToken_(token); if (!u) throw new Error('Invalid token');
  return pubUser_(u);
}
function userByToken_(token){
  if (!token) return null;
  const u = rows_('users').find(x => x.token === token);
  if (!u) return null;
  if (u.token_exp && new Date(u.token_exp) < new Date()) return null;
  return u;
}
function pubUser_(u){ return { id:u.id, email:u.email, name:u.name, role:u.role, permissions: safeJson_(u.permissions), agency: 'main' }; }
function requireAuth(token){ const u = userByToken_(token); if (!u) throw new Error('Unauthorized'); return pubUser_(u); }
function requireAdmin(u){ if (u.role !== 'admin') throw new Error('Admin only'); }
function requirePerm(u, k){ if (u.role === 'admin') return; if (!u.permissions || !u.permissions[k]) throw new Error('Permission denied: '+k); }

function saveAgency_(user, d) {
  const existing = rows_('agency_profile')[0];
  const obj = { ...(existing||{}), ...d, id: existing ? existing.id : 'main', agency_name: d.agency_name || existing?.agency_name || 'Skybird' };
  return upsert_('agency_profile', obj);
}
function setPermissions_(d) {
  return upsert_('users', { id: d.id, permissions: JSON.stringify(d.permissions || {}) });
}
function setRole_(d) {
  return upsert_('users', { id: d.id, role: d.role });
}

/* ========== Reports ========== */
function reportsSummary_(d) {
  const from = d && d.from ? new Date(d.from) : new Date(new Date().setHours(0,0,0,0));
  const to   = d && d.to   ? new Date(d.to)   : new Date();
  const inRange = r => { const t = new Date(r.created_at||r.date); return t >= from && t <= to; };
  const tickets = rows_('tickets').filter(inRange);
  const payments = rows_('payments').filter(inRange);
  const sale = tickets.reduce((s,t)=>s+Number(t.sale_price||0),0);
  const cost = tickets.reduce((s,t)=>s+Number(t.cost_price||0),0);
  const received = payments.filter(p=>p.direction==='in').reduce((s,p)=>s+Number(p.amount||0),0);
  const paid     = payments.filter(p=>p.direction==='out').reduce((s,p)=>s+Number(p.amount||0),0);
  return { tickets: tickets.length, sale, cost, profit: sale-cost, received, paid, cashInHand: received-paid };
}

/* ========== Daily email trigger (optional) ==========
 * In Apps Script: Triggers → Add Trigger → sendDailyReport → Time-driven → Day timer → 11pm–midnight
 */
function sendDailyReport() {
  const ap = rows_('agency_profile')[0] || {};
  const to = ap.report_email || ap.email; if (!to) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const r = reportsSummary_({ from: today.toISOString(), to: new Date().toISOString() });
  const html = `<h2>${ap.agency_name||'Skybird'} — Daily Report</h2>
    <p>${new Date().toDateString()}</p>
    <table cellpadding="6" border="1" style="border-collapse:collapse">
      <tr><td>Tickets</td><td>${r.tickets}</td></tr>
      <tr><td>Sales</td><td>SAR ${r.sale.toFixed(2)}</td></tr>
      <tr><td>Cost</td><td>SAR ${r.cost.toFixed(2)}</td></tr>
      <tr><td>Profit</td><td>SAR ${r.profit.toFixed(2)}</td></tr>
      <tr><td>Received</td><td>SAR ${r.received.toFixed(2)}</td></tr>
      <tr><td>Paid</td><td>SAR ${r.paid.toFixed(2)}</td></tr>
      <tr><td>Cash in hand</td><td>SAR ${r.cashInHand.toFixed(2)}</td></tr>
    </table>`;
  MailApp.sendEmail({ to, subject:`Skybird Daily Report — ${new Date().toDateString()}`, htmlBody: html });
}
