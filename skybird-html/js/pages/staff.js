const PERM_KEYS = ["tickets","refunds","payments","customers","suppliers","sub_agents","cash_book","reports","statements"];

Pages.staff = async function(){
  if (!Auth.isAdmin()) return h(`<div class="card"><h3>Admin only</h3></div>`);
  const staff = await gas("staff.list");
  const wrap = h(`<div></div>`);
  const right = h(`<div></div>`);
  const addBtn = h(`<button class="btn-primary">+ Create user</button>`);
  addBtn.onclick = () => openCreateUser(reload);
  right.appendChild(addBtn);
  wrap.appendChild(pageHeader("Staff", "Manage users, roles and permissions.", right));

  const list = h(`<div></div>`); wrap.appendChild(list);
  const cols = [
    { label:"Name", render: r => `<div style="display:flex;align-items:center;gap:8px"><span>${r.role==='admin'?'🛡':'👤'}</span><span style="font-weight:600">${escapeHtml(r.name||'—')}</span>${r.id===Auth.user.id?' <span class="muted small">(you)</span>':''}</div>`, html:true },
    { label:"Role", render: r => `<span class="badge ${r.role==='admin'?'info':''}">${escapeHtml(r.role)}</span>`, html:true },
    { label:"Permissions", render: r => r.role==='admin' ? '<span class="muted">All (admin)</span>' : (Object.keys(r.permissions||{}).filter(k=>r.permissions[k]).map(k=>k.replace('_',' ')).join(", ") || '<span class="muted">—</span>'), html:true },
    { label:"Actions", render: r => rowActions([
      r.role !== "admin" && { label:"⚙", title:"Edit permissions", onClick: () => openPerms(r, reload) },
      r.id !== Auth.user.id && { label:"🗑", title:"Delete user", onClick: async () => { if (await confirmDialog("Delete this user?")) { await gas("staff.delete",{id:r.id}); reload(); toast("Deleted","success"); } } },
    ]) },
  ];
  list.appendChild(tableEl(cols, staff));
  async function reload(){ const s = await gas("staff.list"); list.innerHTML=""; list.appendChild(tableEl(cols, s)); }
  return wrap;
};

function openCreateUser(onSaved){
  const f = buildForm([
    { name:"name", label:"Full name", required:true },
    { name:"email", label:"Email", type:"email", required:true },
    { name:"password", label:"Temporary password", type:"password", required:true },
    { name:"role", label:"Role", type:"select", value:"salesman", options:[{value:"salesman",label:"Salesman"},{value:"admin",label:"Admin"}] },
  ]);
  openModal("Create user", f.form, {
    onSave: async () => {
      const v = f.values();
      await gas("auth.register", { name:v.name, email:v.email, password:v.password, role:v.role, permissions: v.role==='admin'?{}:{tickets:true,customers:true,payments:true} });
      toast("User created","success"); onSaved && onSaved();
    }
  });
}

function openPerms(user, onSaved){
  const wrap = document.createElement("div");
  wrap.appendChild(h(`<p class="muted small">${escapeHtml(user.name)} — pick what this salesman can access. Profit figures and Delete are always hidden for salesmen.</p>`));
  const grid = h(`<div class="perm-grid"></div>`);
  const cbs = {};
  PERM_KEYS.forEach(k => {
    const lab = h(`<label class="checkbox"><input type="checkbox" ${user.permissions?.[k]?'checked':''}/> ${escapeHtml(k.replace('_',' '))}</label>`);
    cbs[k] = lab.querySelector("input");
    grid.appendChild(lab);
  });
  wrap.appendChild(grid);
  const preset = h(`<div style="margin-top:10px"><button type="button" class="btn">Default (tickets+customers+payments)</button></div>`);
  preset.querySelector("button").onclick = () => { PERM_KEYS.forEach(k => cbs[k].checked = ["tickets","customers","payments"].includes(k)); };
  wrap.appendChild(preset);

  openModal("Permissions — "+user.email, wrap, {
    onSave: async () => {
      const p = {}; PERM_KEYS.forEach(k => { if (cbs[k].checked) p[k] = true; });
      await gas("staff.setPermissions", { id: user.id, permissions: p });
      toast("Permissions updated","success");
      onSaved && onSaved();
    }
  });
}
