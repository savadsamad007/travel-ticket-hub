import sql from "mssql";

let pool;

export async function getMssql() {
  if (pool) return pool;
  pool = await sql.connect({
    server: process.env.MSSQL_HOST || "tail5d65d5.ts.net",
    port: Number(process.env.MSSQL_PORT || 1433),
    database: process.env.MSSQL_DB || "skybird",
    user: process.env.MSSQL_USER || "sa",
    password: process.env.MSSQL_PASSWORD || "Amaan@791601",
    options: {
      encrypt: process.env.MSSQL_ENCRYPT === "true",
      trustServerCertificate: process.env.MSSQL_TRUST_CERT !== "false",
    },
    requestTimeout: 30000,
  });
  return pool;
}

// Make sure the sync state table + a target table both exist.
// Target tables are created with NVARCHAR(MAX) columns inferred from a sample row.
export async function ensureTable(table, sampleRow) {
  const p = await getMssql();

  // Bridge bookkeeping table
  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'sync_state')
    CREATE TABLE sync_state (
      table_name NVARCHAR(128) PRIMARY KEY,
      last_pulled_at DATETIME2 NULL,
      last_pushed_at DATETIME2 NULL
    );
  `);

  const exists = await p.request()
    .input("t", sql.NVarChar, table)
    .query("SELECT 1 AS x FROM sys.tables WHERE name = @t");

  if (exists.recordset.length === 0) {
    const cols = Object.keys(sampleRow || { id: "" })
      .map((c) => `[${c}] NVARCHAR(MAX) NULL`)
      .join(", ");
    const create = `
      CREATE TABLE [${table}] (
        [id] NVARCHAR(64) NOT NULL PRIMARY KEY,
        ${cols.replace(/\[id\] NVARCHAR\(MAX\) NULL,?\s*/, "")}
      );
    `;
    await p.request().query(create);
    console.log(`  ✔ created MSSQL table [${table}]`);
  } else if (sampleRow) {
    // Add any new columns we haven't seen yet
    const existing = await p.request()
      .input("t", sql.NVarChar, table)
      .query("SELECT name FROM sys.columns WHERE object_id = OBJECT_ID(@t)");
    const have = new Set(existing.recordset.map((r) => r.name.toLowerCase()));
    for (const c of Object.keys(sampleRow)) {
      if (!have.has(c.toLowerCase())) {
        await p.request().query(`ALTER TABLE [${table}] ADD [${c}] NVARCHAR(MAX) NULL`);
        console.log(`  + added column [${table}].[${c}]`);
      }
    }
  }
}

export async function upsertRow(table, row) {
  const p = await getMssql();
  const cols = Object.keys(row);
  const setClause = cols.filter((c) => c !== "id").map((c) => `[${c}] = src.[${c}]`).join(", ");
  const insertCols = cols.map((c) => `[${c}]`).join(", ");
  const insertVals = cols.map((c) => `src.[${c}]`).join(", ");
  const params = cols.map((c) => `@${c} AS [${c}]`).join(", ");

  const req = p.request();
  for (const c of cols) {
    const v = row[c];
    req.input(c, sql.NVarChar, v === null || v === undefined ? null : String(typeof v === "object" ? JSON.stringify(v) : v));
  }

  await req.query(`
    MERGE [${table}] AS tgt
    USING (SELECT ${params}) AS src
    ON tgt.[id] = src.[id]
    WHEN MATCHED THEN UPDATE SET ${setClause || "[id] = src.[id]"}
    WHEN NOT MATCHED THEN INSERT (${insertCols}) VALUES (${insertVals});
  `);
}

export async function getWatermark(table, kind /* 'pulled' | 'pushed' */) {
  const p = await getMssql();
  const col = kind === "pulled" ? "last_pulled_at" : "last_pushed_at";
  const r = await p.request()
    .input("t", sql.NVarChar, table)
    .query(`SELECT ${col} AS ts FROM sync_state WHERE table_name = @t`);
  return r.recordset[0]?.ts ? new Date(r.recordset[0].ts).toISOString() : null;
}

export async function setWatermark(table, kind, iso) {
  const p = await getMssql();
  const col = kind === "pulled" ? "last_pulled_at" : "last_pushed_at";
  await p.request()
    .input("t", sql.NVarChar, table)
    .input("ts", sql.DateTime2, new Date(iso))
    .query(`
      MERGE sync_state AS tgt
      USING (SELECT @t AS table_name) AS src
      ON tgt.table_name = src.table_name
      WHEN MATCHED THEN UPDATE SET ${col} = @ts
      WHEN NOT MATCHED THEN INSERT (table_name, ${col}) VALUES (@t, @ts);
    `);
}

export async function listLocalChanges(table, sinceIso, watermarkCol) {
  const p = await getMssql();
  const req = p.request();
  let where = "";
  if (sinceIso) {
    req.input("since", sql.NVarChar, sinceIso);
    where = `WHERE [${watermarkCol}] > @since`;
  }
  const r = await req.query(`SELECT TOP 500 * FROM [${table}] ${where} ORDER BY [${watermarkCol}] ASC`);
  return r.recordset;
}
