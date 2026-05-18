Pages.cashBook = async function(){
  const [payments, customers, suppliers, agents] = await Promise.all([
    Store.list("payments", true), Store.list("customers"), Store.list("suppliers"), Store.list("sub_agents"),
  ]);
  const wrap = h(`<div></div>`);
  wrap.appendChild(pageHeader("Cash book", "All cash in / cash out transactions."));
  function partyName(p){ const a = p.party_type==="customer"?customers:p.party_type==="supplier"?suppliers:agents; return a.find(x=>String(x.id)===String(p.party_id))?.name||"—"; }
  const cashOnly = payments.filter(p => p.method === "cash").sort((a,b)=>new Date(b.date||b.created_at)-new Date(a.date||a.created_at));
  const cashIn = cashOnly.filter(p=>p.direction==="in").reduce((s,p)=>s+Number(p.amount||0),0);
  const cashOut = cashOnly.filter(p=>p.direction==="out").reduce((s,p)=>s+Number(p.amount||0),0);
  const stats = h(`<div class="grid grid-3"></div>`);
  stats.appendChild(statCard("Cash in", fmt(cashIn), null, "sky"));
  stats.appendChild(statCard("Cash out", fmt(cashOut), null, "sunset"));
  stats.appendChild(statCard("Cash in hand", fmt(cashIn-cashOut)));
  wrap.appendChild(stats);
  wrap.appendChild(h(`<div style="height:16px"></div>`));
  const cols = [
    { key:"date", label:"Date", render:r=>dateOnly(r.date||r.created_at) },
    { label:"Type", render: r => `<span class="badge ${r.direction==='in'?'success':'danger'}">${r.direction==='in'?'IN':'OUT'}</span>`, html:true },
    { label:"Party", render: partyName },
    { key:"reference", label:"Ref" },
    { key:"amount", label:"Amount", num:true, render:r=>fmt(r.amount) },
  ];
  wrap.appendChild(tableEl(cols, cashOnly));
  return wrap;
};
