// Skybird HTML — Statements (party ledger)
Pages.statements = async function(){
  const wrap = h(`<div></div>`);
  wrap.appendChild(pageHeader("Statements", "Debit / credit ledger per supplier, sub-agent, or customer."));

  // Filter card
  const filter = h(`<div class="card" style="margin-bottom:16px">
    <div class="grid grid-3">
      <div><label>Party type</label>
        <select id="stmt-type">
          <option value="supplier">Supplier</option>
          <option value="sub_agent">Sub-agent</option>
          <option value="customer">Customer</option>
        </select>
      </div>
      <div style="grid-column:span 2"><label>Party</label>
        <select id="stmt-party"><option value="">Choose…</option></select>
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:12px"><button id="stmt-export" class="btn hidden">⬇ Export PDF</button></div>
  </div>`);
  wrap.appendChild(filter);

  const result = h(`<div></div>`);
  wrap.appendChild(result);

  const PARTY_TABLES = { supplier:"suppliers", sub_agent:"sub_agents", customer:"customers" };

  async function loadParties(){
    const type = filter.querySelector("#stmt-type").value;
    const parties = await Store.list(PARTY_TABLES[type], true);
    const sel = filter.querySelector("#stmt-party");
    sel.innerHTML = `<option value="">Choose…</option>` + parties.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
    result.innerHTML = "";
    filter.querySelector("#stmt-export").classList.add("hidden");
  }

  async function loadLedger(){
    const type = filter.querySelector("#stmt-type").value;
    const id = filter.querySelector("#stmt-party").value;
    if (!id){ result.innerHTML = ""; filter.querySelector("#stmt-export").classList.add("hidden"); return; }

    const entries = [];
    let opening = 0;
    const party = (Store.cache[PARTY_TABLES[type]]||[]).find(p => p.id === id);
    const partyName = party?.name || "";
    if (type !== "customer") opening = Number(party?.opening_balance || 0);

    const tickets = await Store.list("tickets", true);
    const refunds = await Store.list("refunds", true);
    const payments = await Store.list("payments", true);

    let relTickets = [];
    if (type === "supplier") {
      relTickets = tickets.filter(t => t.supplier_id === id);
      relTickets.forEach(t => entries.push({ date:t.created_at, description:`Ticket: ${t.passenger_name||""} (${t.route||"—"})`, ref:t.ticket_no||"", debit:0, credit:Number(t.cost_price||0) }));
      const ids = relTickets.map(t=>t.id);
      refunds.filter(r => ids.includes(r.ticket_id)).forEach(r => {
        if (Number(r.supplier_retention_amount)>0) entries.push({ date:r.created_at, description:"Refund — supplier retention", ref:"", debit:Number(r.supplier_retention_amount), credit:0 });
        if (Number(r.supplier_refund_amount)>0) entries.push({ date:r.created_at, description:"Refund — supplier returned", ref:"", debit:Number(r.supplier_refund_amount), credit:0 });
      });
    } else {
      relTickets = tickets.filter(t => t.buyer_type === type && t.buyer_id === id);
      relTickets.forEach(t => entries.push({ date:t.created_at, description:`Ticket: ${t.passenger_name||""} (${t.route||"—"})`, ref:t.ticket_no||"", debit:Number(t.sale_price||0), credit:0 }));
      const ids = relTickets.map(t=>t.id);
      refunds.filter(r => ids.includes(r.ticket_id)).forEach(r => {
        if (Number(r.customer_refund_amount)>0) entries.push({ date:r.created_at, description:"Refund to buyer", ref:"", debit:0, credit:Number(r.customer_refund_amount) });
      });
    }

    payments.filter(p => p.party_type === type && p.party_id === id).forEach(p => {
      const isSupplier = type === "supplier";
      const desc = `Payment ${p.direction==='in'?'in':'out'} (${p.method||''})`;
      if (isSupplier) {
        if (p.direction === "out") entries.push({ date:p.created_at, description:desc, ref:p.reference||"", debit:Number(p.amount||0), credit:0 });
        else entries.push({ date:p.created_at, description:desc, ref:p.reference||"", debit:0, credit:Number(p.amount||0) });
      } else {
        if (p.direction === "in") entries.push({ date:p.created_at, description:"Payment received ("+(p.method||'')+")", ref:p.reference||"", debit:0, credit:Number(p.amount||0) });
        else entries.push({ date:p.created_at, description:desc, ref:p.reference||"", debit:Number(p.amount||0), credit:0 });
      }
    });

    entries.sort((a,b) => String(a.date).localeCompare(String(b.date)));
    const totalDebit = entries.reduce((s,e)=>s+e.debit,0);
    const totalCredit = entries.reduce((s,e)=>s+e.credit,0);
    const closing = opening + totalDebit - totalCredit;
    const balLabel = type === "supplier"
      ? (closing >= 0 ? "Closing — you owe" : "Closing — they owe")
      : (closing >= 0 ? "Closing — they owe" : "You owe back");

    const card = h(`<div class="card" style="padding:0;overflow:hidden">
      <div class="stmt-head">
        <div><div class="name">${escapeHtml(partyName)}</div><div class="muted small">Opening balance: ${fmt(opening)}</div></div>
        <div style="text-align:right"><div class="muted small">${escapeHtml(balLabel)}</div><div class="bal ${closing>=0?'pos':'neg'}">${fmt(Math.abs(closing))}</div></div>
      </div>
    </div>`);

    const cols = [
      { label:"Date", render: e => new Date(e.date).toLocaleDateString() },
      { label:"Description", key:"description" },
      { label:"Ref", key:"ref" },
      { label:"Debit", num:true, render: e => e.debit ? fmt(e.debit) : "—" },
      { label:"Credit", num:true, render: e => e.credit ? fmt(e.credit) : "—" },
      { label:"Balance", num:true, render: e => fmt(e._run) },
    ];
    let run = opening;
    const enriched = entries.map(e => { run = run + e.debit - e.credit; return { ...e, _run: run }; });
    const tbl = tableEl(cols, enriched);
    card.appendChild(tbl);

    const foot = h(`<div style="display:flex;justify-content:flex-end;gap:24px;padding:14px 18px;border-top:1px solid var(--border);background:var(--surface-2);font-size:13px">
      <div><span class="muted">Total debit:</span> <strong>${fmt(totalDebit)}</strong></div>
      <div><span class="muted">Total credit:</span> <strong>${fmt(totalCredit)}</strong></div>
    </div>`);
    card.appendChild(foot);

    result.innerHTML = "";
    result.appendChild(card);

    const exp = filter.querySelector("#stmt-export");
    exp.classList.remove("hidden");
    exp.onclick = () => {
      const rows = enriched.map(e => [new Date(e.date).toLocaleDateString(), e.description, e.ref, e.debit, e.credit]);
      buildLedgerPDF && buildLedgerPDF({
        title: `Statement — ${partyName}`,
        subtitle: `${type.replace('_','-')} statement`,
        filters: `Opening: ${fmt(opening)}`,
        columns: ["Date","Description","Ref","Debit (SAR)","Credit (SAR)"],
        rows,
        totals: [
          { label:"Total debit", value: totalDebit },
          { label:"Total credit", value: totalCredit },
          { label: balLabel, value: Math.abs(closing) },
        ],
      });
    };
  }

  filter.querySelector("#stmt-type").addEventListener("change", loadParties);
  filter.querySelector("#stmt-party").addEventListener("change", loadLedger);
  await loadParties();
  return wrap;
};
