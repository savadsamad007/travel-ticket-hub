import { RequirePerm } from "@/components/skybird/require-perm";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { supabase, fmt } from "@/lib/supabase";
import { computePartyBalance, type PartyType, PARTY_TABLES } from "@/lib/data";
import { PageHeader } from "@/components/skybird/ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildLedgerPDF } from "@/lib/pdf";

export const Route = createFileRoute("/_app/statements")({
  component: () => (<RequirePerm perm="statements"><StatementsPage /></RequirePerm>),
});

type Entry = {
  date: string;
  description: string;
  ref: string;
  debit: number;  // increases what other party owes (for us = receivable)
  credit: number; // decreases / payment received
};

function StatementsPage() {
  const [partyType, setPartyType] = useState<PartyType>("supplier");
  const [partyId, setPartyId] = useState<string>("");
  const [parties, setParties] = useState<any[]>([]);
  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [opening, setOpening] = useState(0);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  useEffect(() => {
    supabase.from(PARTY_TABLES[partyType]).select("id, name").eq("is_deleted", false).order("name").then(({ data }) => {
      setParties(data ?? []); setPartyId("");
    });
  }, [partyType]);

  useEffect(() => {
    if (!partyId) { setAllEntries([]); setOpening(0); return; }
    (async () => {
      const list: Entry[] = [];
      // opening balance (suppliers/sub_agents only)
      let openBal = 0;
      if (partyType !== "customer") {
        const { data } = await supabase.from(PARTY_TABLES[partyType]).select("opening_balance").eq("id", partyId).eq("is_deleted", false).maybeSingle();
        openBal = Number((data as any)?.opening_balance ?? 0);
      }
      setOpening(openBal);

      if (partyType === "supplier") {
        // tickets where this supplier
        const { data: tk } = await supabase.from("tickets").select("*").eq("supplier_id", partyId).eq("is_deleted", false).order("created_at");
        for (const t of tk ?? []) {
          list.push({
            date: t.created_at, description: `Ticket: ${t.passenger_name} (${t.route ?? "—"})`,
            ref: t.ticket_no ?? "", debit: 0, credit: Number(t.cost_price),
          });
        }
        const ids = (tk ?? []).map((t: any) => t.id);
        if (ids.length) {
          const { data: svs } = await supabase.from("ticket_services").select("*").in("ticket_id", ids).eq("is_deleted", false);
          for (const s of svs ?? []) list.push({
            date: s.created_at, description: `Service: ${s.service_type}`, ref: "",
            debit: 0, credit: Number(s.cost_price),
          });
          const { data: rfs } = await supabase.from("refunds").select("*").in("ticket_id", ids).eq("is_deleted", false);
          for (const r of rfs ?? []) {
            if (Number(r.supplier_retention_amount) > 0)
              list.push({ date: r.created_at, description: "Refund — supplier retention", ref: "", debit: Number(r.supplier_retention_amount), credit: 0 });
            if (Number(r.supplier_refund_amount) > 0)
              list.push({ date: r.created_at, description: "Refund — supplier returned", ref: "", debit: Number(r.supplier_refund_amount), credit: 0 });
          }
        }
      } else {
        const { data: tk } = await supabase.from("tickets").select("*").eq("buyer_type", partyType).eq("buyer_id", partyId).eq("is_deleted", false).order("created_at");
        for (const t of tk ?? []) list.push({
          date: t.created_at, description: `Ticket: ${t.passenger_name} (${t.route ?? "—"})`,
          ref: t.ticket_no ?? "", debit: Number(t.sale_price), credit: 0,
        });
        const ids = (tk ?? []).map((t: any) => t.id);
        if (ids.length) {
          const { data: svs } = await supabase.from("ticket_services").select("*").in("ticket_id", ids).eq("is_deleted", false);
          for (const s of svs ?? []) list.push({
            date: s.created_at, description: `Service: ${s.service_type}`, ref: "",
            debit: Number(s.sale_price), credit: 0,
          });
          const { data: rfs } = await supabase.from("refunds").select("*").in("ticket_id", ids).eq("is_deleted", false);
          for (const r of rfs ?? []) if (Number(r.customer_refund_amount) > 0)
            list.push({ date: r.created_at, description: "Refund to buyer", ref: "", debit: 0, credit: Number(r.customer_refund_amount) });
        }
      }

      const { data: pays } = await supabase.from("payments").select("*").eq("party_type", partyType).eq("party_id", partyId).eq("is_deleted", false).order("created_at");
      for (const p of pays ?? []) {
        if (partyType === "supplier") {
          // out = we paid them → debit (reduces credit balance)
          if (p.direction === "out") list.push({ date: p.created_at, description: `Payment out (${p.method})`, ref: p.reference ?? "", debit: Number(p.amount), credit: 0 });
          else list.push({ date: p.created_at, description: `Payment in (${p.method})`, ref: p.reference ?? "", debit: 0, credit: Number(p.amount) });
        } else {
          if (p.direction === "in") list.push({ date: p.created_at, description: `Payment received (${p.method})`, ref: p.reference ?? "", debit: 0, credit: Number(p.amount) });
          else list.push({ date: p.created_at, description: `Payment out (${p.method})`, ref: p.reference ?? "", debit: Number(p.amount), credit: 0 });
        }
      }

      list.sort((a, b) => a.date.localeCompare(b.date));
      setAllEntries(list);
    })();
  }, [partyId, partyType]);

  const { entries, openingAdjusted } = useMemo(() => {
    const fromTs = fromDate ? new Date(fromDate + "T00:00:00").getTime() : -Infinity;
    const toTs = toDate ? new Date(toDate + "T23:59:59").getTime() : Infinity;
    let openAdj = opening;
    const filtered: Entry[] = [];
    for (const e of allEntries) {
      const t = new Date(e.date).getTime();
      if (t < fromTs) openAdj += e.debit - e.credit;
      else if (t <= toTs) filtered.push(e);
    }
    return { entries: filtered, openingAdjusted: openAdj };
  }, [allEntries, opening, fromDate, toDate]);

  const totals = useMemo(() => {
    const d = entries.reduce((s, e) => s + e.debit, 0);
    const c = entries.reduce((s, e) => s + e.credit, 0);
    return { d, c, bal: openingAdjusted + d - c };
  }, [entries, openingAdjusted]);

  const partyName = parties.find((p) => p.id === partyId)?.name ?? "";
  const balanceLabel = partyType === "supplier"
    ? (totals.bal >= 0 ? "Closing — you owe" : "Closing — they owe")
    : (totals.bal >= 0 ? "Closing — they owe" : "You owe back");

  function exportPDF() {
    const rows: (string|number)[][] = [];
    if (opening) rows.push([new Date().toLocaleDateString(), "Opening balance", "", 0, 0]);
    let run = opening;
    for (const e of entries) {
      run = run + e.debit - e.credit;
      rows.push([new Date(e.date).toLocaleDateString(), e.description, e.ref, e.debit, e.credit]);
    }
    buildLedgerPDF({
      title: `Statement — ${partyName}`,
      subtitle: `${partyType.replace("_", "-")} statement`,
      filters: `Opening: ${fmt(opening)}`,
      columns: ["Date", "Description", "Ref", "Debit (SAR)", "Credit (SAR)"],
      rows,
      totals: [
        { label: "Total debit", value: totals.d },
        { label: "Total credit", value: totals.c },
        { label: balanceLabel, value: Math.abs(totals.bal) },
      ],
    });
  }

  let running = opening;

  return (
    <div>
      <PageHeader title="Statements" description="Debit / credit ledger per supplier, sub-agent, or customer." />
      <Card className="shadow-soft p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label>Party type</Label>
            <Select value={partyType} onValueChange={(v: any) => setPartyType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="supplier">Supplier</SelectItem>
                <SelectItem value="sub_agent">Sub-agent</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Party</Label>
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>{parties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {partyId && (
          <div className="flex justify-end mt-4">
            <Button onClick={exportPDF} variant="outline"><Download className="h-4 w-4 mr-1" /> Export PDF</Button>
          </div>
        )}
      </Card>

      {partyId && (
        <Card className="shadow-soft overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b bg-muted/40">
            <div>
              <div className="text-lg font-semibold">{partyName}</div>
              <div className="text-xs text-muted-foreground">Opening balance: {fmt(opening)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">{balanceLabel}</div>
              <div className={`text-2xl font-bold ${totals.bal >= 0 ? "text-success" : "text-warning"}`}>{fmt(Math.abs(totals.bal))}</div>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {opening !== 0 && (
                <TableRow className="bg-muted/30">
                  <TableCell>—</TableCell><TableCell colSpan={2}>Opening balance</TableCell>
                  <TableCell className="text-right">—</TableCell><TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(opening)}</TableCell>
                </TableRow>
              )}
              {entries.length === 0 && opening === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No transactions yet.</TableCell></TableRow>
              )}
              {entries.map((e, i) => {
                running = running + e.debit - e.credit;
                return (
                  <TableRow key={i} className="hover:bg-muted/40">
                    <TableCell className="text-sm">{new Date(e.date).toLocaleDateString()}</TableCell>
                    <TableCell>{e.description}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.ref}</TableCell>
                    <TableCell className="text-right">{e.debit ? fmt(e.debit) : "—"}</TableCell>
                    <TableCell className="text-right">{e.credit ? fmt(e.credit) : "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(running)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="flex justify-end gap-6 p-4 border-t bg-muted/30 text-sm">
            <div><span className="text-muted-foreground">Total debit:</span> <span className="font-semibold">{fmt(totals.d)}</span></div>
            <div><span className="text-muted-foreground">Total credit:</span> <span className="font-semibold">{fmt(totals.c)}</span></div>
          </div>
        </Card>
      )}
    </div>
  );
}
