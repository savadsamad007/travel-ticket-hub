import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fmt } from "./supabase";

export function buildLedgerPDF(opts: {
  title: string;
  subtitle?: string;
  filters?: string;
  columns: string[];
  rows: (string | number)[][];
  totals?: { label: string; value: number }[];
}) {
  const doc = new jsPDF();
  // header bar
  doc.setFillColor(14, 165, 233);
  doc.rect(0, 0, 210, 22, "F");
  doc.setTextColor(255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Skybird", 14, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Travel Billing System", 14, 19);

  doc.setTextColor(20);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(opts.title, 14, 32);
  if (opts.subtitle) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80);
    doc.text(opts.subtitle, 14, 38);
  }
  if (opts.filters) {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(opts.filters, 14, opts.subtitle ? 44 : 38);
  }

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
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20);
    for (const t of opts.totals) {
      doc.text(`${t.label}: ${fmt(t.value)}`, 14, y);
      y += 6;
    }
  }

  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, 290);
  doc.save(`${opts.title.replace(/\s+/g, "_").toLowerCase()}.pdf`);
}
