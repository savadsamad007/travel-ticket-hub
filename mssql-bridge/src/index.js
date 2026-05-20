import "dotenv/config";
import { TABLES } from "./tables.js";
import { ensureTable, upsertRow, getWatermark, setWatermark, listLocalChanges, getMssql } from "./mssql.js";
import { fetchSince, upsertRows } from "./supabase.js";

const DIRECTION = (process.env.SYNC_DIRECTION || "two-way").toLowerCase();
const INTERVAL_MS = (Number(process.env.SYNC_INTERVAL_SECONDS) || 60) * 1000;
const ONCE = process.argv.includes("--once");

function lastTs(rows, col) {
  if (!rows.length) return null;
  const ts = rows[rows.length - 1][col];
  return ts ? new Date(ts).toISOString() : null;
}

async function pull(table, watermark) {
  const since = await getWatermark(table, "pulled");
  const rows = await fetchSince(table, watermark, since);
  if (!rows.length) return 0;
  await ensureTable(table, rows[0]);
  for (const r of rows) await upsertRow(table, r);
  const newSince = lastTs(rows, watermark);
  if (newSince) await setWatermark(table, "pulled", newSince);
  return rows.length;
}

async function push(table, watermark) {
  await ensureTable(table, null);
  const since = await getWatermark(table, "pushed");
  let rows;
  try {
    rows = await listLocalChanges(table, since, watermark);
  } catch (e) {
    // Table likely empty / column missing on first run — skip silently
    return 0;
  }
  if (!rows.length) return 0;
  // Coerce: numeric/json fields stored as NVARCHAR get parsed back to native
  const clean = rows.map((r) => {
    const o = {};
    for (const k of Object.keys(r)) {
      let v = r[k];
      if (typeof v === "string") {
        if (/^-?\d+(\.\d+)?$/.test(v) && !["id", "phone", "vat_number", "ticket_no", "pnr"].includes(k)) {
          v = Number(v);
        } else if ((v.startsWith("{") && v.endsWith("}")) || (v.startsWith("[") && v.endsWith("]"))) {
          try { v = JSON.parse(v); } catch {}
        }
      }
      o[k] = v;
    }
    return o;
  });
  await upsertRows(table, clean);
  const newSince = lastTs(rows, watermark);
  if (newSince) await setWatermark(table, "pushed", newSince);
  return rows.length;
}

async function runOnce() {
  const stamp = new Date().toISOString();
  console.log(`\n[${stamp}] sync run (direction=${DIRECTION})`);
  for (const { name, watermark } of TABLES) {
    try {
      let pulled = 0, pushed = 0;
      if (DIRECTION === "pull" || DIRECTION === "two-way") pulled = await pull(name, watermark);
      if (DIRECTION === "push" || DIRECTION === "two-way") pushed = await push(name, watermark);
      if (pulled || pushed) console.log(`  ${name.padEnd(20)} ↓${pulled}  ↑${pushed}`);
    } catch (e) {
      console.error(`  ${name}: ${e.message}`);
    }
  }
}

async function main() {
  console.log("Skybird MSSQL ↔ Supabase bridge");
  console.log(`MSSQL: ${process.env.MSSQL_USER}@${process.env.MSSQL_HOST}:${process.env.MSSQL_PORT}/${process.env.MSSQL_DB}`);
  console.log(`Interval: ${INTERVAL_MS / 1000}s`);
  await getMssql();
  console.log("✔ Connected to MSSQL");
  await runOnce();
  if (ONCE) { process.exit(0); }
  setInterval(runOnce, INTERVAL_MS);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
