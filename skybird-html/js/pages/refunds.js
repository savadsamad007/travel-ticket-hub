Pages.refunds = async function(){
  const [refunds, tickets] = await Promise.all([ Store.list("refunds", true), Store.list("tickets") ]);
  const wrap = h(`<div></div>`);
  const right = h(`<div></div>`);
  if (Auth.can("refunds")) { const b = h(`<button class="btn-primary">+ New refund</button>`); b.onclick = () => openRefundForm({ tickets, onSaved: reload }); right.appendChild(b); }
  wrap.appendChild(pageHeader("Refunds", "Ticket refunds and retentions.", right));
  const list = h(`<div></div>`); wrap.appendChild(list);
  const cols = [
    { key:"date", label:"Date", render:r=>dateOnly(r.date||r.created_at) },
    { label:"Ticket", render: r => tickets.find(t=>String(t.id)===String(r.ticket_id))?.ticket_no || "—" },
    { key:"customer_refund_amount", label:"Customer refund", num:true, render:r=>fmt(r.customer_refund_amount) },
    { key:"supplier_refund_amount", label:"Supplier refund", num:true, render:r=>fmt(r.supplier_refund_amount) },
    { key:"supplier_retention_amount", label:"Supplier retention", num:true, render:r=>fmt(r.supplier_retention_amount) },
    { key:"reason", label:"Reason" },
    { label:"Actions", render: r => rowActions([
      Auth.can("refunds") && { label:"✏️", onClick: () => openRefundForm({ tickets, row:r, onSaved: reload }) },
      Auth.isAdmin() && { label:"🗑️", onClick: async () => { if (await confirmDialog("Delete refund?")) { await gas("refunds.delete",{id:r.id}); reload(); toast("Deleted","success"); } } },
    ]) },
  ];
  list.appendChild(tableEl(cols, refunds));
  async function reload(){ Store.invalidate("refunds"); const r = await Store.list("refunds", true); list.innerHTML=""; list.appendChild(tableEl(cols, r)); }
  return wrap;
};

function openRefundForm({ tickets, row, onSaved }){
  const f = buildForm([
    { name:"date", label:"Date", type:"date", value:(row?.date||todayISO()).slice(0,10) },
    { name:"ticket_id", label:"Ticket", type:"select", value:row?.ticket_id, options:[{value:"",label:"— Select —"}].concat(tickets.map(t=>({value:t.id,label:`${t.ticket_no||t.id} · ${t.passenger_name||""}`}))) },
    { name:"customer_refund_amount", label:"Customer refund", type:"number", step:"0.01", value:row?.customer_refund_amount||0 },
    { name:"supplier_refund_amount", label:"Supplier refund", type:"number", step:"0.01", value:row?.supplier_refund_amount||0 },
    { name:"supplier_retention_amount", label:"Supplier retention", type:"number", step:"0.01", value:row?.supplier_retention_amount||0 },
    { name:"reason", label:"Reason", type:"textarea", value:row?.reason },
  ]);
  openModal(row?"Edit refund":"New refund", f.form, {
    onSave: async () => { const v = f.values(); if (row) v.id=row.id; await gas("refunds.upsert", v); toast("Saved","success"); onSaved && onSaved(); }
  });
}
