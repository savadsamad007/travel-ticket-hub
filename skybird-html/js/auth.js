// Skybird HTML — Supabase Auth
const Auth = {
  user: null,           // { id, email }
  agency: null,         // agency profile fields (with vat_no mapped)
  agencyOwner: null,    // uuid of owning admin
  role: null,           // 'admin' | 'salesman'
  permissions: {},      // { tickets:true, ... }
  _loadingMe: null,

  isAdmin(){ return this.role === "admin"; },
  can(perm){ if (!this.user) return false; if (this.role === "admin") return true; return !!this.permissions?.[perm]; },

  async login(email, password){
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    await this.loadMe();
  },

  async refreshSessionIfNeeded(force){
    const now = Math.floor(Date.now() / 1000);
    const { data, error } = force ? await sb.auth.refreshSession() : await sb.auth.getSession();
    if (error && force) throw new Error(error.message);
    let session = data?.session || null;
    if (session?.expires_at && session.expires_at - now < 120) {
      const refreshed = await sb.auth.refreshSession();
      if (refreshed.error) throw new Error(refreshed.error.message);
      session = refreshed.data?.session || session;
    }
    return session;
  },

  async waitForSession(ms = 2500){
    const start = Date.now();
    while (Date.now() - start < ms) {
      const session = await this.refreshSessionIfNeeded(false).catch(() => null);
      if (session?.user) return session;
      await new Promise((r) => setTimeout(r, 150));
    }
    return null;
  },

  async register(name, email, password){
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { full_name: name } },
    });
    if (error) throw new Error(error.message);
    if (!data.session) {
      throw new Error("Account created. Please verify email if asked, then sign in.");
    }
    // Wait briefly for trigger to insert user_agency row, then load.
    await this.waitForSession();
    await this.loadMe();
  },

  async loadMe(){
    if (this._loadingMe) return this._loadingMe;
    this._loadingMe = this._loadMeNow().finally(() => { this._loadingMe = null; });
    return this._loadingMe;
  },

  async _loadMeNow(){
    const session = await this.refreshSessionIfNeeded(false).catch(() => null);
    const u = session?.user;
    if (!u) { this.user = null; return false; }
    this.user = { id: u.id, email: u.email };
    // Load membership
    let { data: ua, error: uaError } = await sb
      .from("user_agency")
      .select("agency_owner, role, full_name, permissions")
      .eq("user_id", u.id)
      .maybeSingle();
    if (uaError) {
      await this.refreshSessionIfNeeded(true).catch(() => null);
      const retry = await sb
        .from("user_agency")
        .select("agency_owner, role, full_name, permissions")
        .eq("user_id", u.id)
        .maybeSingle();
      ua = retry.data;
      uaError = retry.error;
    }
    if (ua) {
      this.agencyOwner = ua.agency_owner;
      this.role = ua.role;
      this.permissions = ua.permissions || {};
      this.user.name = ua.full_name || u.email;
    } else {
      // No row yet — assume self-admin (trigger should have made one)
      this.agencyOwner = u.id;
      this.role = "admin";
      this.permissions = {};
      this.user.name = u.email;
    }
    await this.loadAgency();
    return true;
  },

  async loadAgency(){
    try { this.agency = await gas("agency.get"); }
    catch (_) { this.agency = {}; }
    return this.agency;
  },

  async logout(){
    await sb.auth.signOut();
    this.user = null; this.agency = null; this.agencyOwner = null; this.role = null; this.permissions = {};
    Store.cache = {};
    location.hash = "";
    renderShell();
  },
};
