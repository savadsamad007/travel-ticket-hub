window.Pages = window.Pages || {};
Pages.dashboard = async function(){
  const [tickets, payments, customers, suppliers, agents, refunds] = await Promise.all([
    Store.list("tickets"), Store.list("payments"),
    Store.list("customers"), Store.list("suppliers"),
    Store.list("sub_agents"), Store.list("refunds"),
  ]);
  const sale = tickets.reduce((s,t)=>s+Number(t.sale_price||0),0);
  const cost = tickets.reduce((s,t)=>s+Number(t.cost_price||0),0);
  const inSum = payments.filter(p=>p.direction==="in").reduce((s,p)=>s+Number(p.amount||0),0);
  const outSum = payments.filter(p=>p.direction==="out").reduce((s,p)=>s+Number(p.amount||0),0);
  const cashIn = payments.filter(p=>p.direction==="in" && p.method==="cash").reduce((s,p)=>s+Number(p.amount||0),0);
  const bankIn = payments.filter(p=>p.direction==="in" && p.method==="bank").reduce((s,p)=>s+Number(p.amount||0),0);

  const wrap = h(`<div></div>`);
  wrap.appendChild(pageHeader("Dashboard", "Snapshot of your travel agency."));
  const showProfit = Auth.isAdmin();

  const stats = h(`<div class="grid grid-4"></div>`);
  stats.appendChild(statCard("Total tickets", String(tickets.length), null, "", "✈"));
  if (showProfit) stats.appendChild(statCard("Total sales", fmt(sale), "Cost "+fmt(cost), "sky", "📈"));
  if (showProfit) stats.appendChild(statCard("Net profit", fmt(sale-cost), null, "sunset", "💼"));
  stats.appendChild(statCard("Refunds", String(refunds.length), null, "", "↺"));
  wrap.appendChild(stats);

  const stats2 = h(`<div class="grid grid-3" style="margin-top:16px"></div>`);
  stats2.appendChild(statCard("Suppliers", String(suppliers.length), null, "sky", "⛨"));
  stats2.appendChild(statCard("Sub-agents", String(agents.length), null, "", "♣"));
  stats2.appendChild(statCard("Customers", String(customers.length), null, "sunset", "☻"));
  wrap.appendChild(stats2);

  const cards = h(`<div class="grid grid-2" style="margin-top:14px"></div>`);
  const collect = h(`<div class="card"><h3 style="margin:0 0 12px">Collections</h3>
    <div class="grid grid-2">
      <div><div class="muted small">Cash received</div><div style="font-size:20px;font-weight:700;color:var(--success)">${fmt(cashIn)}</div></div>
      <div><div class="muted small">Bank received</div><div style="font-size:20px;font-weight:700;color:var(--info)">${fmt(bankIn)}</div></div>
      <div><div class="muted small">Total received</div><div style="font-weight:600">${fmt(inSum)}</div></div>
      <div><div class="muted small">Total paid</div><div style="font-weight:600">${fmt(outSum)}</div></div>
    </div></div>`);
  cards.appendChild(collect);

  const recent = h(`<div class="card"><h3 style="margin:0 0 12px">Recent tickets</h3></div>`);
  const rec = tickets.slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,5);
  if (!rec.length) recent.appendChild(h(`<div class="muted">No tickets yet.</div>`));
  else rec.forEach(t => recent.appendChild(h(`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px"><span>${escapeHtml(t.passenger_name||"—")} · <span class="muted">${escapeHtml(t.route||"—")}</span></span><span style="font-weight:600">${fmt(t.sale_price)}</span></div>`)));
  cards.appendChild(recent);
  wrap.appendChild(cards);
  return wrap;
};
