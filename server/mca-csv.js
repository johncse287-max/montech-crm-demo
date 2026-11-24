import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { db } from './db.js'

const CSV_PATH = fileURLToPath(
  new URL('../overture-houston-prospects-clean.csv', import.meta.url),
)

function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      if (row.some((value) => value.trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (quoted) throw new Error('CSV contains an unclosed quoted field.')

  if (field.length || row.length) {
    row.push(field)
    if (row.some((value) => value.trim() !== '')) rows.push(row)
  }

  if (!rows.length) return []

  const headers = rows.shift().map((value) =>
    value.trim().replace(/^\uFEFF/, ''),
  )

  return rows.map((values) =>
    Object.fromEntries(
      headers.map((header, index) => [
        header,
        (values[index] ?? '').trim(),
      ]),
    ),
  )
}

function makeLead(record) {
  const identity = [
    record.business_name,
    record.website,
    record.phone,
    record.email,
    record.longitude,
    record.latitude,
  ].map((value) => String(value ?? '').trim().toLowerCase()).join('|')

  const sourceRecordId = `OVERTURE-${createHash('sha256')
    .update(identity)
    .digest('hex')
    .slice(0, 32)}`

  return {
    companyName: record.business_name.trim(),
    website: record.website || null,
    businessAddress: null,
    email: record.email || null,
    phone: record.phone || null,
    ownerName: null,
    decisionMaker: null,
    industry: record.category || 'Business directory listing',
    city: 'Houston',
    state: 'Texas',
    source: 'Overture Maps CSV export',
    status: 'new',
    notes: 'Directory listing only. MCA funding need and decision-maker identity are not verified. Location is inferred from the Houston-area source file.',
    sourceRecordId,
    dataSourceUrl: 'https://overturemaps.org/',
  }
}

export function registerMcaCsvRoute(app) {
  app.get('/api/leads/mca-csv', async (req, res) => {
    const limit = Number(req.query.limit ?? 25)

    if (![25, 50, 100, 250, 500].includes(limit)) {
      return res.status(400).json({
        success: false,
        message: 'Limit must be 25, 50, 100, 250, or 500.',
      })
    }

    try {
      const csv = (await readFile(CSV_PATH, 'utf8')).replace(/^\uFEFF/, '')
      const leads = parseCSV(csv)
        .filter((record) => record.business_name)
        .slice(0, limit)
        .map(makeLead)

      res.json({
        success: true,
        source: 'Overture Maps CSV export',
        sourceUrl: 'https://overturemaps.org/',
        storage: 'CSV read-only; no SQLite records changed',
        count: leads.length,
        savedOrUpdated: 0,
        message: `${leads.length} directory records loaded. MCA suitability and owner identities are not verified.`,
        leads: leads.map((lead, index) => ({ ...lead, id: index + 1 })),
      })
    } catch (error) {
      console.error('MCA CSV search failed:', error)
      res.status(500).json({
        success: false,
        message: 'Could not read the MCA CSV file. Check that it exists in the project root and is readable.',
      })
    }
  })

  const findBySourceId = db.prepare(
    'SELECT id FROM leads WHERE source_record_id = ?',
  )

  const findExisting = db.prepare(`
    SELECT id FROM leads
    WHERE lower(trim(company_name)) = lower(trim(?))
      AND (
        (phone IS NOT NULL AND phone = ?)
        OR (email IS NOT NULL AND lower(email) = lower(?))
        OR (website IS NOT NULL AND lower(website) = lower(?))
      )
    LIMIT 1
  `)

  const insertLead = db.prepare(`
    INSERT INTO leads (
      company_name, website, business_address, email, phone,
      owner_name, decision_maker, industry, city, state, source,
      status, notes, source_record_id, data_source_url, updated_at
    ) VALUES (
      @companyName, @website, NULL, @email, @phone,
      NULL, NULL, @industry, @city, @state, @source,
      'new', @notes, @sourceRecordId, @dataSourceUrl, datetime('now')
    )
  `)

  const saveBatch = db.transaction((leads) => {
    let inserted = 0
    let duplicates = 0

    for (const lead of leads) {
      if (findBySourceId.get(lead.sourceRecordId)) {
        duplicates += 1
        continue
      }

      if (findExisting.get(
        lead.companyName,
        lead.phone ?? '',
        lead.email ?? '',
        lead.website ?? '',
      )) {
        duplicates += 1
        continue
      }

      insertLead.run(lead)
      inserted += 1
    }

    return { inserted, duplicates }
  })

  app.post('/api/leads/mca-csv/save', (req, res) => {
    const leads = req.body?.leads

    if (
      !Array.isArray(leads) ||
      leads.length < 1 ||
      leads.length > 100
    ) {
      return res.status(400).json({
        success: false,
        message: 'Provide between 1 and 100 MCA CSV leads.',
      })
    }

    try {
      const cleanLeads = leads.map((lead) => {
        if (
          typeof lead?.companyName !== 'string' ||
          !lead.companyName.trim() ||
          typeof lead?.sourceRecordId !== 'string' ||
          !lead.sourceRecordId.startsWith('OVERTURE-')
        ) {
          throw new Error('Invalid MCA lead or source ID.')
        }

        return {
          companyName: lead.companyName.trim().slice(0, 200),
          website: typeof lead.website === 'string' ? lead.website.slice(0, 200) : null,
          email: typeof lead.email === 'string' ? lead.email.slice(0, 200) : null,
          phone: typeof lead.phone === 'string' ? lead.phone.slice(0, 50) : null,
          industry: typeof lead.industry === 'string' ? lead.industry.slice(0, 150) : 'Business directory listing',
          city: 'Houston',
          state: 'Texas',
          source: 'Overture Maps CSV export',
          status: 'new',
          notes: 'Directory listing only. MCA funding need and decision-maker identity are not verified.',
          sourceRecordId: lead.sourceRecordId,
          dataSourceUrl: 'https://overturemaps.org/',
        }
      })

      const result = saveBatch(cleanLeads)

      res.json({
        success: true,
        ...result,
        failed: 0,
        message: `Saved ${result.inserted} new leads; skipped ${result.duplicates} duplicates.`,
      })
    } catch (error) {
      console.error('MCA CSV save failed:', error)
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Unable to save MCA leads.',
      })
    }
  })
}

