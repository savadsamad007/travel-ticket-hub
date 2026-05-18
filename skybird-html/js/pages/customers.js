Pages.customers = () => partyPage({ type:"customer", table:"customers", title:"Customers", desc:"Walk-in customers buying tickets.", withOpening:false });
Pages.suppliers = () => partyPage({ type:"supplier", table:"suppliers", title:"Suppliers", desc:"Airlines & ticket suppliers.", withOpening:true });
Pages.subAgents = () => partyPage({ type:"sub_agent", table:"sub_agents", title:"Sub-agents", desc:"Other agencies you sell to.", withOpening:true });

async function partyPage({ type, table, title, desc, withOpening }){
  const rows = await Store.list(table, true);
  const wrap = h(`<div></div>`);
  const right = h(`<div></div>`);
  if (Auth.can(table)) {
    const btn = h(`<button class="btn-primary">+ Add ${escapeHtml(title.slice(0,-1))}</button>`);
    btn.onclick = () => openPartyForm({ table, withOpening, onSaved: refresh });
    right.appendChild(btn);
  }
  wrap.appendChild(pageHeader(title, desc, right));
  const list = h(`<div></div>`);
  wrap.appendChild(list);
  function refresh(){ Store.invalidate(table); Pages[type==="sub_agent"?"subAgents":table].apply().then(); }

  const cols = [
    { key:"name", label:"Name" },
    { key:"phone", label:"Phone" },
    { key:"email", label:"Email" },
    { key:"address", label:"Address" },
  ];
  if (withOpening) cols.push({ key:"opening_balance", label:"Opening", num:true, render:r=>fmt(r.opening_balance) });
  cols.push({ label:"Actions", render: r => rowActions([
    Auth.can(table) && { label:"✏️", title:"Edit", onClick: () => openPartyForm({ table, withOpening, row:r, onSaved: () => { Store.invalidate(table); reload(); } }) },
    Auth.isAdmin() && { label:"🗑️", title:"Delete", onClick: async () => { if (await confirmDialog("Delete this "+title.slice(0,-1)+"?")) { await gas(table+".delete",{id:r.id}); Store.invalidate(table); reload(); toast("Deleted","success"); } } },
  ]) });

  async function reload(){
    const data = await Store.list(table, true);
    list.innerHTML = ""; list.appendChild(tableEl(cols, data));
  }
  list.appendChild(tableEl(cols, rows));
  return wrap;
}

function openPartyForm({ table, withOpening, row, onSaved }){
  const fields = [
    { name:"name", label:"Name", required:true, value:row?.name },
    { name:"phone", label:"Phone", value:row?.phone },
    { name:"email", label:"Email", type:"email", value:row?.email },
    { name:"address", label:"Address", type:"textarea", value:row?.address },
  ];
  if (withOpening) fields.push({ name:"opening_balance", label:"Opening balance", type:"number", step:"0.01", value:row?.opening_balance||0 });
  const f = buildForm(fields);
  openModal((row?"Edit ":"New ")+table.slice(0,-1).replace("_"," "), f.form, {
    onSave: async () => {
      const v = f.values(); if (row) v.id = row.id;
      await gas(table+".upsert", v);
      toast("Saved","success");
      Store.invalidate(table);
      onSaved && onSaved();
    }
  });
}
