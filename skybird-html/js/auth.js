const Auth = {
  user: null,
  agency: null,
  isAdmin(){ return this.user && this.user.role === "admin"; },
  can(perm){ if (!this.user) return false; if (this.user.role === "admin") return true; return !!(this.user.permissions && this.user.permissions[perm]); },
  async login(email, password){
    const r = await gas("auth.login", { email, password });
    setToken(r.token); this.user = r.user;
    await this.loadAgency();
  },
  async register(name, email, password){
    const r = await gas("auth.register", { name, email, password });
    setToken(r.token); this.user = r.user;
    await this.loadAgency();
  },
  async loadMe(){
    if (!getToken()) return false;
    try { this.user = await gas("auth.me"); await this.loadAgency(); return true; }
    catch(e){ setToken(""); return false; }
  },
  async loadAgency(){
    try { this.agency = await gas("agency.get"); } catch(e){ this.agency = {}; }
  },
  logout(){ setToken(""); this.user = null; this.agency = null; Store.cache = {}; location.hash = ""; renderShell(); },
};
