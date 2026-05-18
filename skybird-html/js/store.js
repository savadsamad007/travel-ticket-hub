// In-memory cache so pages don't re-fetch on every nav.
const Store = {
  cache: {},
  async list(name, force){
    if (!force && this.cache[name]) return this.cache[name];
    const data = await gas(name + ".list");
    this.cache[name] = data;
    return data;
  },
  invalidate(...names){ names.forEach(n => delete this.cache[n]); },
  byId(name, id){ return (this.cache[name]||[]).find(x => String(x.id)===String(id)); },
};
