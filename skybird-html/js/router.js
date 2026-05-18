const ROUTES = [
  { path:"dashboard",  icon:"📊", label:"Dashboard",  render: () => Pages.dashboard(),  perm:null },
  { path:"tickets",    icon:"🎫", label:"Tickets",    render: () => Pages.tickets(),    perm:"tickets" },
  { path:"refunds",    icon:"↩️", label:"Refunds",    render: () => Pages.refunds(),    perm:"refunds" },
  { path:"payments",   icon:"💵", label:"Payments",   render: () => Pages.payments(),   perm:"payments" },
  { path:"customers",  icon:"👤", label:"Customers",  render: () => Pages.customers(),  perm:"customers" },
  { path:"suppliers",  icon:"🏢", label:"Suppliers",  render: () => Pages.suppliers(),  perm:"suppliers" },
  { path:"sub-agents", icon:"👥", label:"Sub-agents", render: () => Pages.subAgents(),  perm:"sub_agents" },
  { path:"cash-book",  icon:"💰", label:"Cash book",  render: () => Pages.cashBook(),   perm:"cash_book" },
  { path:"reports",    icon:"📈", label:"Reports",    render: () => Pages.reports(),    perm:"reports" },
  { path:"staff",      icon:"🛡️", label:"Staff",      render: () => Pages.staff(),      adminOnly:true },
  { path:"settings",   icon:"⚙️", label:"Settings",   render: () => Pages.settings(),   adminOnly:true },
];

function visibleRoutes(){
  return ROUTES.filter(r => {
    if (r.adminOnly) return Auth.isAdmin();
    if (r.perm) return Auth.can(r.perm);
    return true;
  });
}

function renderNav(){
  const nav = $("#nav"); nav.innerHTML = "";
  const cur = (location.hash||"#/dashboard").replace("#/","");
  visibleRoutes().forEach(r => {
    const a = h(`<a class="nav-item ${cur===r.path?'active':''}" href="#/${r.path}"><span class="nav-icon">${r.icon}</span>${escapeHtml(r.label)}</a>`);
    nav.appendChild(a);
  });
}

async function renderRoute(){
  if (!Auth.user) return;
  const path = (location.hash||"#/dashboard").replace("#/","");
  const r = ROUTES.find(x => x.path === path) || ROUTES[0];
  const allowed = visibleRoutes().find(x => x.path === r.path);
  const root = $("#route"); root.innerHTML = `<div class="muted">Loading…</div>`;
  try {
    if (!allowed) { root.innerHTML = `<div class="card"><h3>Access denied</h3><p class="muted">You don't have permission to view this page.</p></div>`; renderNav(); return; }
    const el = await r.render();
    root.innerHTML = ""; root.appendChild(el);
    renderNav();
  } catch(e){
    root.innerHTML = `<div class="card"><h3>Failed to load</h3><p class="error">${escapeHtml(e.message)}</p></div>`;
  }
}

window.addEventListener("hashchange", renderRoute);
