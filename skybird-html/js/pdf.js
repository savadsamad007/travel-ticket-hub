// jsPDF is exposed as window.jspdf.jsPDF
function newDoc(format){ return new window.jspdf.jsPDF({ unit: "mm", format: format || "a4" }); }

function pdfHeader(doc, agency, title, w){
  doc.setFontSize(18); doc.setFont("helvetica","bold");
  doc.text(agency.agency_name || "Skybird", 14, 18);
  doc.setFontSize(9); doc.setFont("helvetica","normal");
  let y = 23;
  if (agency.address) { doc.text(String(agency.address), 14, y); y+=4; }
  const line2 = [agency.phone && "Tel: "+agency.phone, agency.email].filter(Boolean).join("  •  ");
  if (line2) { doc.text(line2, 14, y); y+=4; }
  if (agency.vat_no) { doc.text("VAT: " + agency.vat_no, 14, y); }
  doc.setFontSize(14); doc.setFont("helvetica","bold");
  doc.text(title, w-14, 18, { align:"right" });
  doc.setLineWidth(0.4); doc.line(14, 33, w-14, 33);
}

function buildPaymentVoucher({ payment, party, agency }){
  const doc = newDoc("a5"); // 148x210mm
  const W = 148;
  const isIn = payment.direction === "in";
  pdfHeader(doc, agency||{}, isIn ? "RECEIPT VOUCHER" : "PAYMENT VOUCHER", W);
  doc.setFontSize(10);
  let y = 42;
  const rows = [
    ["Voucher No", String(payment.id||"").slice(0,8).toUpperCase()],
    ["Date", dateOnly(payment.date || payment.created_at)],
    [isIn ? "Received from" : "Paid to", party?.name || "—"],
    ["Phone", party?.phone || "—"],
    ["Method", String(payment.method||"—").toUpperCase()],
    ["Reference", payment.reference || "—"],
  ];
  rows.forEach(([k,v]) => { doc.setFont("helvetica","normal"); doc.text(k+":", 14, y); doc.setFont("helvetica","bold"); doc.text(String(v), 50, y); y+=6; });
  y += 4;
  doc.setFillColor(91,140,255); doc.rect(14, y, W-28, 14, "F");
  doc.setTextColor(255,255,255); doc.setFontSize(14);
  doc.text("Amount: " + fmt(payment.amount), 18, y+9);
  doc.setTextColor(0,0,0); doc.setFontSize(10);
  y += 20;
  doc.text("In words: " + numToWords(payment.amount), 14, y, { maxWidth: W-28 });
  if (payment.notes) { y += 12; doc.text("Notes: " + payment.notes, 14, y, { maxWidth: W-28 }); }
  y = 180;
  doc.setLineWidth(0.3); doc.line(20, y, 60, y); doc.line(W-60, y, W-20, y);
  doc.setFontSize(9); doc.text("Receiver signature", 22, y+5); doc.text("Authorised signature", W-58, y+5);
  return doc;
}

function buildTicketInvoice({ ticket, services, buyer, agency }){
  const doc = newDoc("a4"); const W = 210;
  pdfHeader(doc, agency||{}, "TAX INVOICE", W);
  let y = 42;
  doc.setFontSize(10);
  doc.text("Invoice #: " + (ticket.ticket_no || String(ticket.id||"").slice(0,8)), 14, y);
  doc.text("Date: " + dateOnly(ticket.created_at), W-14, y, { align:"right" });
  y += 8;
  doc.setFont("helvetica","bold"); doc.text("Bill to:", 14, y); doc.setFont("helvetica","normal");
  y += 5; doc.text(buyer?.name || "Walk-in customer", 14, y);
  if (buyer?.phone) { y+=5; doc.text("Tel: "+buyer.phone, 14, y); }
  if (buyer?.address) { y+=5; doc.text(buyer.address, 14, y, { maxWidth: 100 }); }

  // line items
  const items = [
    ["Air Ticket — " + (ticket.passenger_name||"") + (ticket.route?" ("+ticket.route+")":""),
     ticket.airline || "", 1, Number(ticket.sale_price||0)]
  ];
  (services||[]).forEach(s => items.push([s.service, "", 1, Number(s.sale_price||0)]));
  const sub = items.reduce((a,b)=>a+Number(b[3]),0);
  const hasVat = !!(agency && agency.vat_no);
  const vat = hasVat ? +(sub*0.15/1.15).toFixed(2) : 0;
  const net = sub - vat;

  doc.autoTable({
    startY: y+10,
    head: [["Description","Airline","Qty","Amount (SAR)"]],
    body: items.map(r => [r[0], r[1], r[2], num(r[3])]),
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [91,140,255], textColor: 255 },
    columnStyles: { 2: { halign:"right" }, 3: { halign:"right" } },
  });
  let ty = doc.lastAutoTable.finalY + 6;
  const right = (label, val) => { doc.text(label, W-70, ty); doc.text(num(val), W-14, ty, { align:"right" }); ty += 6; };
  if (hasVat) { right("Net amount", net); right("VAT 15%", vat); }
  doc.setFont("helvetica","bold"); right("Total", sub); doc.setFont("helvetica","normal");
  ty += 4; doc.text("In words: " + numToWords(sub), 14, ty, { maxWidth: W-28 });
  ty += 14; doc.setFontSize(9);
  doc.text("Terms: Tickets non-refundable after issuance unless airline rules permit. Thank you for your business.", 14, ty, { maxWidth: W-28 });
  return doc;
}
