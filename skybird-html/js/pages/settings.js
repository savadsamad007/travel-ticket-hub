Pages.settings = async function(){
  if (!Auth.isAdmin()) return h(`<div class="card"><h3>Admin only</h3></div>`);
  const ap = Auth.agency || {};
  const wrap = h(`<div></div>`);
  wrap.appendChild(pageHeader("Settings", "Agency profile, branding, and report email."));
  const f = buildForm([
    { name:"agency_name", label:"Agency name", required:true, value:ap.agency_name||"Skybird" },
    { name:"phone", label:"Phone", value:ap.phone },
    { name:"email", label:"Email", type:"email", value:ap.email },
    { name:"address", label:"Address", type:"textarea", value:ap.address },
    { name:"vat_no", label:"VAT number (enables VAT on invoices)", value:ap.vat_no },
    { name:"logo_url", label:"Logo URL", value:ap.logo_url },
    { name:"report_email", label:"Daily report email (for 23:59 auto report)", type:"email", value:ap.report_email },
  ]);
  const card = h(`<div class="card"></div>`);
  card.appendChild(f.form);
  const saveBtn = h(`<button class="btn-primary" style="margin-top:14px">Save settings</button>`);
  saveBtn.onclick = async () => { try { await gas("agency.save", f.values()); await Auth.loadAgency(); $("#agency-name").textContent = Auth.agency?.agency_name || "Skybird"; toast("Saved","success"); } catch(e){ toast(e.message,"error"); } };
  card.appendChild(saveBtn);
  wrap.appendChild(card);

  wrap.appendChild(h(`<div class="card" style="margin-top:14px"><h3 style="margin-top:0">Daily auto-email at 23:59</h3>
    <p class="muted small">Schedule this from your Apps Script editor: <b>Triggers → + Add trigger → Function: sendDailyReport → Event source: Time-driven → Day timer → 11pm–12am</b>. The report goes to the email above.</p></div>`));
  return wrap;
};
