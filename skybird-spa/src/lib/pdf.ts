import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fmt } from "./supabase";
import { amountInWords } from "./numwords";

export type AgencyProfile = {
  agency_name?: string | null;
  legal_name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  cr_number?: string | null;
  vat_number?: string | null;
  logo_url?: string | null;
};

function header(doc: jsPDF, agency: AgencyProfile, w: number) {
  doc.setFillColor(14, 165, 233);
  doc.rect(0, 0, w, 24, "F");
  doc.setTextColor(255);
  doc.setFontSize(15); doc.setFont("helvetica", "bold");
  doc.text(agency.agency_name || "Skybird", 12, 13);
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  const lines: string[] = [];
  if (agency.address) lines.push(agency.address);
  const meta: string[] = [];
  if (agency.phone) meta.push("Tel: " + agency.phone);
  if (agency.email) meta.push(agency.email);
  if (meta.length) lines.push(meta.join("  ·  "));
  const ids: string[] = [];
  if (agency.cr_number) ids.push("CR: " + agency.cr_number);
  if (agency.vat_number) ids.push("VAT: " + agency.vat_number);
  if (ids.length) lines.push(ids.join("  ·  "));
  doc.text(lines.join("  |  ").slice(0, 110), 12, 19);
  doc.setTextColor(20);
}

function footer(doc: jsPDF, h: number, w: number) {
  doc.setDrawColor(220);
  doc.line(12, h - 22, w - 12, h - 22);
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text("Authorised signature", 14, h - 15);
  doc.text("Receiver signature", w - 14, h - 15, { align: "right" });
  doc.setFontSize(7);
  doc.text(`Generated ${new Date().toLocaleString()}`, w / 2, h - 6, { align: "center" });
  doc.setTextColor(20);
}

export function buildLedgerPDF(opts: {
  title: string;
  subtitle?: string;
  filters?: string;
  columns: string[];
  rows: (string | number)[][];
  totals?: { label: string; value: number }[];
}) {
  const doc = new jsPDF();
  doc.setFillColor(14, 165, 233);
  doc.rect(0, 0, 210, 22, "F");
  doc.setTextColor(255);
  doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text("Skybird", 14, 14);
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text("Travel Billing System", 14, 19);
  doc.setTextColor(20);
  doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.text(opts.title, 14, 32);
  if (opts.subtitle) { doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(80); doc.text(opts.subtitle, 14, 38); }
  if (opts.filters) { doc.setFontSize(9); doc.setTextColor(120); doc.text(opts.filters, 14, opts.subtitle ? 44 : 38); }
  autoTable(doc, {
    startY: 50,
    head: [opts.columns],
    body: opts.rows.map((r) => r.map((c) => typeof c === "number" ? fmt(c) : String(c))),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [14, 165, 233], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 250, 255] },
  });
  if (opts.totals?.length) {
    let y = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(20);
    for (const t of opts.totals) { doc.text(`${t.label}: ${fmt(t.value)}`, 14, y); y += 6; }
  }
  doc.setFontSize(8); doc.setTextColor(150);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, 290);
  doc.save(`${opts.title.replace(/\s+/g, "_").toLowerCase()}.pdf`);
}

/* =====================  PAYMENT VOUCHER (A5)  ===================== */
export function buildPaymentVoucher(opts: {
  agency: AgencyProfile;
  direction: "in" | "out";
  voucher_no: string;
  date: string; // ISO
  party_name: string;
  party_type: string;
  amount: number;
  method: string;
  reference?: string | null;
  notes?: string | null;
}) {
  const doc = new jsPDF({ format: "a5", orientation: "portrait" }); // 148 x 210 mm
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  header(doc, opts.agency, w);

  const title = opts.direction === "in" ? "RECEIPT VOUCHER" : "PAYMENT VOUCHER";
  doc.setFontSize(13); doc.setFont("helvetica", "bold");
  doc.text(title, w / 2, 34, { align: "center" });

  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text(`Voucher No: ${opts.voucher_no}`, 12, 44);
  doc.text(`Date: ${new Date(opts.date).toLocaleDateString()}`, w - 12, 44, { align: "right" });

  // Body box
  doc.setDrawColor(220);
  doc.roundedRect(12, 50, w - 24, 70, 2, 2);
  let y = 58;
  const label = (k: string, v: string) => {
    doc.setFont("helvetica", "bold"); doc.text(k, 16, y);
    doc.setFont("helvetica", "normal"); doc.text(v, 55, y);
    y += 7;
  };
  label(opts.direction === "in" ? "Received from:" : "Paid to:", opts.party_name);
  label("Party type:", opts.party_type.replace("_", "-"));
  label("Method:", opts.method);
  if (opts.reference) label("Reference:", opts.reference);

  // Amount big
  y += 4;
  doc.setFillColor(245, 250, 255);
  doc.rect(12, y, w - 24, 16, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text("Amount:", 16, y + 11);
  doc.text(fmt(opts.amount), w - 16, y + 11, { align: "right" });

  // Amount in words
  y += 22;
  doc.setFont("helvetica", "italic"); doc.setFontSize(9);
  const words = amountInWords(opts.amount);
  const split = doc.splitTextToSize(words, w - 28);
  doc.text(split, 14, y);
  y += split.length * 5 + 2;

  if (opts.notes) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(80);
    const n = doc.splitTextToSize("Notes: " + opts.notes, w - 28);
    doc.text(n, 14, y);
    doc.setTextColor(20);
  }
  footer(doc, h, w);
  doc.save(`${title.toLowerCase().replace(/\s+/g, "_")}_${opts.voucher_no}.pdf`);
}

/* =====================  TICKET TAX INVOICE (A4)  ===================== */
export function buildTicketInvoice(opts: {
  agency: AgencyProfile;
  ticket: any;
  services: any[];
  buyer_name: string;
  buyer_phone?: string | null;
  buyer_email?: string | null;
}) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  header(doc, opts.agency, w);

  const isTax = !!opts.agency.vat_number;
  doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.text(isTax ? "TAX INVOICE" : "INVOICE", w / 2, 34, { align: "center" });

  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text(`Invoice No: ${opts.ticket.ticket_no || opts.ticket.id.slice(0, 8).toUpperCase()}`, 12, 44);
  doc.text(`Date: ${new Date(opts.ticket.created_at).toLocaleDateString()}`, w - 12, 44, { align: "right" });

  // Buyer block
  doc.setFont("helvetica", "bold"); doc.text("Bill to:", 12, 54);
  doc.setFont("helvetica", "normal");
  doc.text(opts.buyer_name, 12, 60);
  let by = 66;
  if (opts.buyer_phone) { doc.text(opts.buyer_phone, 12, by); by += 5; }
  if (opts.buyer_email) { doc.text(opts.buyer_email, 12, by); by += 5; }

  // Trip block (right)
  doc.setFont("helvetica", "bold"); doc.text("Trip details:", w - 80, 54);
  doc.setFont("helvetica", "normal");
  doc.text(`Passenger: ${opts.ticket.passenger_name}`, w - 80, 60);
  if (opts.ticket.route) doc.text(`Route: ${opts.ticket.route}`, w - 80, 66);
  if (opts.ticket.airline) doc.text(`Airline: ${opts.ticket.airline}`, w - 80, 72);
  if (opts.ticket.travel_date) doc.text(`Travel: ${opts.ticket.travel_date}`, w - 80, 78);
  if (opts.ticket.pnr) doc.text(`PNR: ${opts.ticket.pnr}`, w - 80, 84);

  // Line items
  const items: { desc: string; amount: number }[] = [];
  if (!opts.ticket.is_service_only && Number(opts.ticket.sale_price) > 0) {
    items.push({
      desc: `Air ticket — ${opts.ticket.passenger_name} (${opts.ticket.route || "—"})`,
      amount: Number(opts.ticket.sale_price),
    });
  }
  for (const s of opts.services ?? []) {
    items.push({
      desc: `${s.service_type.replace(/_/g, " ")}${s.description ? " — " + s.description : ""}`,
      amount: Number(s.sale_price),
    });
  }
  const subtotal = items.reduce((sum, x) => sum + x.amount, 0);
  const vatRate = isTax ? 0.15 : 0;
  // Subtotal shown is INCLUSIVE if invoice is non-tax; for tax invoice we treat sale as inclusive of 15% and split.
  const net = isTax ? subtotal / (1 + vatRate) : subtotal;
  const vat = isTax ? subtotal - net : 0;

  autoTable(doc, {
    startY: 95,
    head: [["#", "Description", "Amount (SAR)"]],
    body: items.map((it, i) => [String(i + 1), it.desc, fmt(it.amount)]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [14, 165, 233], textColor: 255 },
    columnStyles: { 0: { cellWidth: 12 }, 2: { halign: "right", cellWidth: 40 } },
  });

  let y = (doc as any).lastAutoTable.finalY + 6;
  const totalsX = w - 80;
  const valX = w - 14;
  const row = (k: string, v: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(k, totalsX, y); doc.text(v, valX, y, { align: "right" });
    y += 6;
  };
  if (isTax) {
    row("Net total:", fmt(net));
    row("VAT (15%):", fmt(vat));
  }
  row("Grand total:", fmt(subtotal), true);

  y += 4;
  doc.setFont("helvetica", "italic"); doc.setFontSize(9);
  const words = amountInWords(subtotal);
  doc.text(doc.splitTextToSize("Amount in words: " + words, w - 28), 14, y);

  footer(doc, h, w);
  doc.save(`invoice_${opts.ticket.ticket_no || opts.ticket.id.slice(0, 8)}.pdf`);
}
