Pages.tickets = async function(){
  const [tickets, customers, suppliers, agents] = await Promise.all([
    Store.list("tickets", true), Store.list("customers"), Store.list("suppliers"), Store.list("sub_agents"),
  ]);
  const wrap = h(`<div></div>`);
  const right = h(`<div></div>`);
  if (Auth.can("tickets")) { const b=h(`<button class="btn-primary">+ New ticket</button>`); b.onclick = () => openTicketForm({ onSaved: reload }); right.appendChild(b); }
  wrap.appendChild(pageHeader("Tickets", "Issued air tickets.", right));
  const list = h(`<div></div>`); wrap.appendChild(list);

  function buyerName(t){
    const tbl = t.buyer_type==="customer"?customers:t.buyer_type==="sub_agent"?agents:[];
    return tbl.find(x=>String(x.id)===String(t.buyer_id))?.name || "—";
  }
  function supplierName(t){ return suppliers.find(x=>String(x.id)===String(t.supplier_id))?.name || "—"; }

  const cols = [
    { key:"ticket_no", label:"Ticket #" },
    { key:"passenger_name", label:"Passenger" },
    { key:"airline", label:"Airline" },
    { key:"route", label:"Route" },
    { key:"travel_date", label:"Travel", render:r=>dateOnly(r.travel_date) },
    { label:"Buyer", render: buyerName },
    { label:"Supplier", render: supplierName },
    { key:"sale_price", label:"Sale", num:true, render:r=>fmt(r.sale_price) },
    ...(Auth.isAdmin()?[{ key:"cost_price", label:"Cost", num:true, render:r=>fmt(r.cost_price) }]:[]),
    { label:"Actions", render: r => rowActions([
      { label:"🧾", title:"Invoice PDF", onClick: () => downloadInvoice(r) },
      { label:"📱", title:"WhatsApp", onClick: () => shareTicketWA(r) },
      Auth.can("tickets") && { label:"✏️", onClick: () => openTicketForm({ row:r, onSaved: reload }) },
      Auth.isAdmin() && { label:"🗑️", onClick: async () => { if (await confirmDialog("Delete ticket?")) { await gas("tickets.delete",{id:r.id}); reload(); toast("Deleted","success"); } } },
    ]) },
  ];
  list.appendChild(tableEl(cols, tickets));

  async function reload(){ Store.invalidate("tickets"); const t = await Store.list("tickets", true); list.innerHTML = ""; list.appendChild(tableEl(cols, t)); }

  async function downloadInvoice(t){
    const services = await gas("tickets.services", { ticket_id: t.id });
    const buyerArr = t.buyer_type==="customer"?customers:agents;
    const buyer = buyerArr.find(x=>String(x.id)===String(t.buyer_id));
    const doc = buildTicketInvoice({ ticket:t, services, buyer, agency: Auth.agency||{} });
    doc.save(`invoice-${t.ticket_no||t.id}.pdf`);
  }
  function shareTicketWA(t){
    const buyerArr = t.buyer_type==="customer"?customers:agents;
    const buyer = buyerArr.find(x=>String(x.id)===String(t.buyer_id));
    const text = `*${Auth.agency?.agency_name||"Skybird"}*\nTicket #${t.ticket_no||""}\nPassenger: ${t.passenger_name}\nAirline: ${t.airline}\nRoute: ${t.route}\nTravel: ${dateOnly(t.travel_date)}\nAmount: ${fmt(t.sale_price)}`;
    openWhatsApp(buyer?.phone||"", text);
  }
  return wrap;
};

function openTicketForm({ row, onSaved }){
  const customers = Store.cache.customers || [];
  const agents = Store.cache.sub_agents || [];
  const suppliers = Store.cache.suppliers || [];
  const buyerOptions = (type) => {
    const arr = type==="customer"?customers:type==="sub_agent"?agents:[];
    return [{value:"",label:"— Select —"}].concat(arr.map(x=>({value:x.id,label:x.name})));
  };

  const f = buildForm([
    { name:"ticket_no", label:"Ticket #", value:row?.ticket_no },
    { name:"passenger_name", label:"Passenger name", required:true, value:row?.passenger_name },
    { name:"airline", label:"Airline (type SV → Saudia)", value:row?.airline },
    { name:"route", label:"Route (RUH/JED/DXB)", value:row?.route },
    { name:"travel_date", label:"Travel date", type:"date", value:row?.travel_date?String(row.travel_date).slice(0,10):"" },
    { name:"pnr", label:"PNR", value:row?.pnr },
    { name:"supplier_id", label:"Supplier", type:"select", value:row?.supplier_id, options:[{value:"",label:"— Select —"}].concat(suppliers.map(x=>({value:x.id,label:x.name}))) },
    { name:"buyer_type", label:"Buyer type", type:"select", value:row?.buyer_type||"customer", options:[{value:"customer",label:"Customer"},{value:"sub_agent",label:"Sub-agent"}] },
    { name:"buyer_id", label:"Buyer", type:"select", value:row?.buyer_id, options:buyerOptions(row?.buyer_type||"customer") },
    { name:"cost_price", label:"Cost price", type:"number", step:"0.01", value:row?.cost_price||0 },
    { name:"sale_price", label:"Sale price", type:"number", step:"0.01", value:row?.sale_price||0 },
    { name:"notes", label:"Notes", type:"textarea", value:row?.notes },
  ]);

  // Wire dynamic buyer list + autocomplete + route formatter
  airlineAutocomplete(f.refs.airline);
  bindRouteInput(f.refs.route);
  f.refs.buyer_type.addEventListener("change", () => {
    const t = f.refs.buyer_type.value;
    const opts = buyerOptions(t);
    f.refs.buyer_id.innerHTML = "";
    opts.forEach(o => { const op=document.createElement("option"); op.value=o.value; op.textContent=o.label; f.refs.buyer_id.appendChild(op); });
  });

  // Quick add customer button
  const quick = h(`<button type="button" class="btn" style="margin-bottom:10px">+ Quick add customer</button>`);
  quick.onclick = () => openQuickAddCustomer(c => {
    Store.invalidate("customers");
    customers.push(c);
    if (f.refs.buyer_type.value !== "customer") { f.refs.buyer_type.value = "customer"; f.refs.buyer_type.dispatchEvent(new Event("change")); }
    Array.from(f.refs.buyer_id.options).forEach(o=>o.remove());
    [{value:"",label:"— Select —"}].concat(customers.map(x=>({value:x.id,label:x.name}))).forEach(o => { const op=document.createElement("option"); op.value=o.value; op.textContent=o.label; f.refs.buyer_id.appendChild(op); });
    f.refs.buyer_id.value = c.id;
  });
  f.form.insertBefore(quick, f.form.firstChild);

  openModal(row?"Edit ticket":"New ticket", f.form, {
    onSave: async () => {
      const v = f.values(); if (row) v.id = row.id;
      await gas("tickets.upsert", v);
      toast("Saved","success");
      onSaved && onSaved();
    }
  });
}

function openQuickAddCustomer(onCreated){
  const f = buildForm([
    { name:"name", label:"Name", required:true },
    { name:"phone", label:"Phone" },
    { name:"email", label:"Email", type:"email" },
  ]);
  openModal("Quick add customer", f.form, {
    onSave: async () => {
      const v = f.values(); if (!v.name) throw new Error("Name required");
      const c = await gas("customers.upsert", v);
      Store.invalidate("customers");
      toast("Customer added","success");
      onCreated && onCreated(c);
    }
  });
}
