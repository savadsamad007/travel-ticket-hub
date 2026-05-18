Pages.reports = async function(){
  const wrap = h(`<div></div>`);
  wrap.appendChild(pageHeader("Reports", "Sales, profit and cash summary."));
  const filterCard = h(`<div class="card" style="margin-bottom:14px">
    <div class="row">
      <div><label>From</label><input type="date" id="rep-from" value="${new Date(Date.now()-30*864e5).toISOString().slice(0,10)}"/></div>
      <div><label>To</label><input type="date" id="rep-to" value="${todayISO()}"/></div>
      <div style="flex:0"><label>&nbsp;</label><button class="btn-primary" id="rep-run">Generate</button></div>
    </div>
  </div>`);
  wrap.appendChild(filterCard);
  const out = h(`<div></div>`); wrap.appendChild(out);
  async function run(){
    const from = $("#rep-from", filterCard).value;
    const to = $("#rep-to", filterCard).value;
    out.innerHTML = `<div class="muted">Loading…</div>`;
    try {
      const r = await gas("reports.summary", { from: new Date(from).toISOString(), to: new Date(to+"T23:59:59").toISOString() });
      const showProfit = Auth.isAdmin();
      out.innerHTML = "";
      const g = h(`<div class="grid grid-4"></div>`);
      g.appendChild(statCard("Tickets", String(r.tickets)));
      g.appendChild(statCard("Sales", fmt(r.sale), null, "sky"));
      if (showProfit) g.appendChild(statCard("Profit", fmt(r.profit), "Cost "+fmt(r.cost), "sunset"));
      g.appendChild(statCard("Cash in hand", fmt(r.cashInHand)));
      out.appendChild(g);
      const c2 = h(`<div class="grid grid-2" style="margin-top:14px"></div>`);
      c2.appendChild(statCard("Received", fmt(r.received), null, "sky"));
      c2.appendChild(statCard("Paid", fmt(r.paid), null, "sunset"));
      out.appendChild(c2);
    } catch(e){ out.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`; }
  }
  $("#rep-run", filterCard).onclick = run;
  run();
  return wrap;
};
