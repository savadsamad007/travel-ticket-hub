Pages.payments = async function(){
  const [payments, customers, suppliers, agents] = await Promise.all([
    Store.list("payments", true), Store.list("customers"), Store.list("suppliers"), Store.list("sub_agents"),
  ]);
  const wrap = h(`<div></div>`);
  const right = h(`<div></div>`);
  if (Auth.can("payments")) { const b=h(`<button class="btn-primary">+ New payment</button>`); b.onclick = () => openPaymentForm({ onSaved: reload }); right.appendChild(b); }
  wrap.appendChild(pageHeader("Payments", "Receipts and payouts.", right));
  const list = h(`<div></div>`); wrap.appendChild(list);

  function partyName(p){
    const arr = p.party_type==="customer"?customers:p.party_type==="supplier"?suppliers:agents;
    return arr.find(x=>String(x.id)===String(p.party_id))?.name || "—";
  }
  function partyObj(p){
    const arr = p.party_type==="customer"?customers:p.party_type==="supplier"?suppliers:agents;
    return arr.find(x=>String(x.id)===String(p.party_id));
  }

  const cols = [
    { key:"date", label:"Date", render:r=>dateOnly(r.date||r.created_at) },
    { label:"Direction", render: r => `<span class="badge ${r.direction==='in'?'success':'danger'}">${r.direction==='in'?'Receive':'Pay'}</span>`, html:true },
    { label:"Party", render: r => `${escapeHtml(partyName(r))} <span class="muted small">(${escapeHtml(r.party_type)})</span>`, html:true },
    { key:"method", label:"Method" },
    { key:"reference", label:"Ref" },
    { key:"amount", label:"Amount", num:true, render:r=>fmt(r.amount) },
    { label:"Actions", render: r => rowActions([
      { label:"🧾", title:"Voucher PDF", onClick: () => { const doc = buildPaymentVoucher({ payment:r, party:partyObj(r), agency: Auth.agency||{} }); doc.save(`voucher-${r.id}.pdf`); } },
      { label:"📱", title:"WhatsApp", onClick: () => {
          const party = partyObj(r);
          const text = `*${Auth.agency?.agency_name||"Skybird"}*\n${r.direction==='in'?'Receipt':'Payment'} Voucher\nDate: ${dateOnly(r.date||r.created_at)}\nAmount: ${fmt(r.amount)}\nMethod: ${r.method}\nRef: ${r.reference||'-'}`;
          openWhatsApp(party?.phone||"", text);
      } },
      Auth.can("payments") && { label:"✏️", onClick: () => openPaymentForm({ row:r, onSaved: reload }) },
      Auth.isAdmin() && { label:"🗑️", onClick: async () => { if (await confirmDialog("Delete payment?")) { await gas("payments.delete",{id:r.id}); reload(); toast("Deleted","success"); } } },
    ]) },
  ];
  list.appendChild(tableEl(cols, payments));
  async function reload(){ Store.invalidate("payments"); const p = await Store.list("payments", true); list.innerHTML=""; list.appendChild(tableEl(cols, p)); }
  return wrap;
};

function openPaymentForm({ row, onSaved }){
  const customers = Store.cache.customers || [];
  const suppliers = Store.cache.suppliers || [];
  const agents = Store.cache.sub_agents || [];
  const opts = (type) => { const a = type==="customer"?customers:type==="supplier"?suppliers:agents; return [{value:"",label:"— Select —"}].concat(a.map(x=>({value:x.id,label:x.name}))); };

  const f = buildForm([
    { name:"date", label:"Date", type:"date", value:(row?.date||todayISO()).slice(0,10) },
    { name:"direction", label:"Direction", type:"select", value:row?.direction||"in", options:[{value:"in",label:"Receive (cash in)"},{value:"out",label:"Pay (cash out)"}] },
    { name:"party_type", label:"Party type", type:"select", value:row?.party_type||"customer", options:[{value:"customer",label:"Customer"},{value:"supplier",label:"Supplier"},{value:"sub_agent",label:"Sub-agent"}] },
    { name:"party_id", label:"Party", type:"select", value:row?.party_id, options:opts(row?.party_type||"customer") },
    { name:"amount", label:"Amount", type:"number", step:"0.01", required:true, value:row?.amount||0 },
    { name:"method", label:"Method", type:"select", value:row?.method||"cash", options:[{value:"cash",label:"Cash"},{value:"bank",label:"Bank transfer"},{value:"card",label:"Card"},{value:"cheque",label:"Cheque"},{value:"other",label:"Other"}] },
    { name:"reference", label:"Reference", value:row?.reference },
    { name:"notes", label:"Notes", type:"textarea", value:row?.notes },
  ]);
  f.refs.party_type.addEventListener("change", () => {
    const o = opts(f.refs.party_type.value); f.refs.party_id.innerHTML = "";
    o.forEach(x => { const op=document.createElement("option"); op.value=x.value; op.textContent=x.label; f.refs.party_id.appendChild(op); });
  });
  openModal(row?"Edit payment":"New payment", f.form, {
    onSave: async () => { const v = f.values(); if (row) v.id = row.id; await gas("payments.upsert", v); toast("Saved","success"); onSaved && onSaved(); }
  });
}
