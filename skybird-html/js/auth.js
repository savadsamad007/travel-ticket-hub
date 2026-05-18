// Skybird HTML — Supabase Auth
const Auth = {
  user: null,           // { id, email }
  agency: null,         // agency profile fields (with vat_no mapped)
  agencyOwner: null,    // uuid of owning admin
  role: null,           // 'admin' | 'salesman'
  permissions: {},      // { tickets:true, ... }

  isAdmin(){ return this.role === "admin"; },
  can(perm){ if (!this.user) return false; if (this.role === "admin") return true; return !!this.permissions?.[perm]; },

  async login(email, password){
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    await this.loadMe();
  },

  async register(name, email, password){
    const { error } = await sb.auth.signUp({
      email, password,
      options: { data: { full_name: name } },
    });
    if (error) throw new Error(error.message);
    // Wait briefly for trigger to insert user_agency row, then load
    await new Promise((r) => setTimeout(r, 400));
    await this.loadMe();
  },

  async loadMe(){
    const { data: sess } = await sb.auth.getSession();
    const u = sess?.session?.user;
    if (!u) { this.user = null; return false; }
    this.user = { id: u.id, email: u.email };
    // Load membership
    const { data: ua } = await sb
      .from("user_agency")
      .select("agency_owner, role, full_name, permissions")
      .eq("user_id", u.id)
      .maybeSingle();
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
    try { this.agency = await gas("agency.get"); } catch (_) { this.agency = {}; }
    return true;
  },

  async logout(){
    await sb.auth.signOut();
    this.user = null; this.agency = null; this.agencyOwner = null; this.role = null; this.permissions = {};
    Store.cache = {};
    location.hash = "";
    renderShell();
  },
};
