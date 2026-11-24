import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentFile = fileURLToPath(import.meta.url)
const currentDir = dirname(currentFile)

export const DB_PATH = resolve(
  currentDir,
  '..',
  'data',
  'montech-crm.sqlite',
)

mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = new Database(DB_PATH)

db.pragma('foreign_keys = ON')
db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 5000')

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    website TEXT,
    business_address TEXT,
    email TEXT,
    phone TEXT,
    owner_name TEXT,
    decision_maker TEXT,
    industry TEXT,
    city TEXT,
    state TEXT,
    source TEXT,
    status TEXT NOT NULL DEFAULT 'new'
      CHECK (status IN (
        'new', 'verified', 'contacted',
        'qualified', 'converted', 'disqualified'
      )),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

const existingColumns = new Set(
  db.prepare('PRAGMA table_info(leads)').all().map((column) => column.name),
)

const newColumns = {
  source_record_id: 'TEXT',
  license_number: 'TEXT',
  license_type: 'TEXT',
  qualification: 'TEXT',
  expiration_date: 'TEXT',
  postal_code: 'TEXT',
  data_source_url: 'TEXT',
  data_checked_at: 'TEXT',
}

for (const [column, type] of Object.entries(newColumns)) {
  if (!existingColumns.has(column)) {
    db.exec(`ALTER TABLE leads ADD COLUMN "${column}" ${type}`)
  }
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_source_record_id
  ON leads(source_record_id)
  WHERE source_record_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_leads_company_name
  ON leads(company_name);

  CREATE INDEX IF NOT EXISTS idx_leads_status
  ON leads(status);

  CREATE INDEX IF NOT EXISTS idx_leads_location
  ON leads(city, state);

  CREATE INDEX IF NOT EXISTS idx_leads_industry
  ON leads(industry);
`)

console.log('MONTECH CRM SQLite initialized:', DB_PATH)
// Public demo data: fictional records only, reset when the UTC date changes.
const demoLeads = [
  ['Demo Solar One', 'Solar', 'Houston', 'Texas'],
  ['Demo Solar Two', 'Solar', 'Austin', 'Texas'],
  ['Demo Solar Three', 'Solar', 'Dallas', 'Texas'],
  ['Demo Medicare One', 'Medicare Insurance', 'Houston', 'Texas'],
  ['Demo Medicare Two', 'Medicare Insurance', 'San Antonio', 'Texas'],
  ['Demo Medicare Three', 'Medicare Insurance', 'Austin', 'Texas'],
  ['Demo Cleaning One', 'Janitorial / Commercial Cleaning', 'Dallas', 'Texas'],
  ['Demo Cleaning Two', 'Janitorial / Commercial Cleaning', 'Houston', 'Texas'],
  ['Demo Cleaning Three', 'Janitorial / Commercial Cleaning', 'Austin', 'Texas'],
  ['Demo Healthcare One', 'Healthcare', 'Miami', 'Florida'],
  ['Demo Healthcare Two', 'Healthcare', 'Orlando', 'Florida'],
  ['Demo Healthcare Three', 'Healthcare', 'Tampa', 'Florida'],
  ['Demo Air Duct One', 'Air Duct Cleaning', 'Phoenix', 'Arizona'],
  ['Demo Air Duct Two', 'Air Duct Cleaning', 'Tucson', 'Arizona'],
  ['Demo Air Duct Three', 'Air Duct Cleaning', 'Mesa', 'Arizona'],
  ['Demo Funding One', 'MCA / Business Funding', 'New York', 'New York'],
  ['Demo Funding Two', 'MCA / Business Funding', 'Buffalo', 'New York'],
  ['Demo Funding Three', 'MCA / Business Funding', 'Albany', 'New York'],
]

db.exec(`
  CREATE TABLE IF NOT EXISTS demo_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`)

const todayUtc = new Date().toISOString().slice(0, 10)
const lastSeedDate = db.prepare(
  "SELECT value FROM demo_meta WHERE key = 'seed_date'",
).get()?.value

if (lastSeedDate !== todayUtc) {
  const resetDemo = db.transaction(() => {
    db.prepare('DELETE FROM leads').run()

    const insertDemoLead = db.prepare(`
      INSERT INTO leads (
        company_name, email, phone, industry, city, state,
        source, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?)
    `)

    demoLeads.forEach(([name, industry, city, state], index) => {
      const number = String(index + 1).padStart(3, '0')
      insertDemoLead.run(
        name,
        `contact${number}@demo.invalid`,
        `+1-202-555-${String(1000 + index).slice(1)}`,
        industry,
        city,
        state,
        'MONTECH Demo Dataset',
        'Fictional sample record for demonstration only.',
      )
    })

    db.prepare(`
      INSERT INTO demo_meta (key, value)
      VALUES ('seed_date', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(todayUtc)
  })

  resetDemo()
  console.log(`Demo data reset for UTC date ${todayUtc}`)
}
