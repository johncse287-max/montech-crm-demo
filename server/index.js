import express from 'express'
import { db } from './db.js'
import campaignsRouter from './campaigns.js'

const app = express()
const PORT = Number(process.env.PORT) || 3000
const DEMO_MAX_LEADS = 50

const ALLOWED_STATUSES = [
  'new', 'verified', 'contacted', 'qualified', 'converted', 'disqualified',
]

app.use(express.json({ limit: '100kb' }))
app.use('/api/campaigns', campaignsRouter)

app.get('/api/health', (req, res) => {
  try {
    const result = db.prepare('SELECT 1 AS ok').get()
    const { count: leadCount } = db.prepare('SELECT COUNT(*) AS count FROM leads').get()
    const databaseOk = result?.ok === 1

    res.json({
      success: databaseOk,
      service: 'MONTECH CRM API',
      mode: 'demo',
      database: databaseOk ? 'connected' : 'error',
      storage: 'demo SQLite',
      leadCount,
    })
  } catch (error) {
    console.error('Health check failed:', error)
    res.status(500).json({
      success: false,
      service: 'MONTECH CRM API',
      database: 'error',
    })
  }
})


app.get('/api/leads', (req, res) => {
  try {
    const leads = db.prepare(`
      SELECT
        id,
        company_name AS companyName,
        website,
        business_address AS businessAddress,
        email,
        phone,
        owner_name AS ownerName,
        decision_maker AS decisionMaker,
        industry,
        city,
        state,
        source,
        status,
        notes,
        source_record_id AS sourceRecordId,
        license_number AS licenseNumber,
        license_type AS licenseType,
        qualification,
        expiration_date AS expirationDate,
        postal_code AS postalCode,
        data_source_url AS dataSourceUrl,
        data_checked_at AS dataCheckedAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM leads
      ORDER BY id DESC
    `).all()

    res.json({
      success: true,
      count: leads.length,
      leads,
      storage: 'sqlite',
    })
  } catch (error) {
    console.error('Failed to read leads:', error)
    res.status(500).json({
      success: false,
      message: 'Unable to read leads from the local database.',
    })
  }
})

const LEAD_SELECT = `
  SELECT
    id,
    company_name AS companyName,
    website,
    business_address AS businessAddress,
    email,
    phone,
    owner_name AS ownerName,
    decision_maker AS decisionMaker,
    industry,
    city,
    state,
    source,
    status,
    notes,
    source_record_id AS sourceRecordId,
    license_number AS licenseNumber,
    license_type AS licenseType,
    qualification,
    expiration_date AS expirationDate,
    postal_code AS postalCode,
    data_source_url AS dataSourceUrl,
    data_checked_at AS dataCheckedAt,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM leads
`

const OPTIONAL_LEAD_FIELDS = {
  website: 200,
  businessAddress: 300,
  email: 200,
  phone: 50,
  ownerName: 150,
  decisionMaker: 150,
  industry: 150,
  city: 100,
  state: 100,
  source: 200,
  notes: 2000,
}

app.post('/api/leads', (req, res) => {
  const body = req.body ?? {}
  const companyName = body.companyName

  if (typeof companyName !== 'string' || !companyName.trim()) {
    return res.status(400).json({
      success: false,
      message: 'A valid company name is required.',
    })
  }

  if (companyName.trim().length > 200) {
    return res.status(400).json({
      success: false,
      message: 'Company name must be 200 characters or fewer.',
    })
  }

  const status = body.status ?? 'new'

  if (!ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid lead status.',
    })
  }

  const values = {}
  for (const [field, maxLength] of Object.entries(OPTIONAL_LEAD_FIELDS)) {
    const raw = body[field]
    if (raw === undefined || raw === null || raw === '') {
      values[field] = null
      continue
    }
    if (typeof raw !== 'string' || raw.trim().length > maxLength) {
      return res.status(400).json({
        success: false,
        message: `${field} must be text of ${maxLength} characters or fewer.`,
      })
    }
    values[field] = raw.trim() || null
  }

  try {
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM leads').get()

    if (count >= DEMO_MAX_LEADS) {
      return res.status(409).json({
        success: false,
        message: 'This public demo has reached its 50-lead limit. Please try again after the daily reset.',
      })
    }

    const existing = db.prepare(`
      SELECT id FROM leads
      WHERE lower(company_name) = lower(?)
        AND lower(COALESCE(city, '')) = lower(?)
    `).get(companyName.trim(), values.city ?? '')

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A lead with this company name and city already exists.',
        id: Number(existing.id),
      })
    }

    const result = db.prepare(`
      INSERT INTO leads (
        company_name, website, business_address, email, phone,
        owner_name, decision_maker, industry, city, state, source, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      companyName.trim(),
      values.website,
      values.businessAddress,
      values.email,
      values.phone,
      values.ownerName,
      values.decisionMaker,
      values.industry,
      values.city,
      values.state,
      values.source,
      status,
      values.notes,
    )

    const id = Number(result.lastInsertRowid)
    const lead = db.prepare(`${LEAD_SELECT} WHERE id = ?`).get(id)

    return res.status(201).json({
      success: true,
      message: 'Lead saved successfully.',
      id,
      lead,
    })
  } catch (error) {
    console.error('Failed to save lead:', error)
    return res.status(500).json({
      success: false,
      message: 'Unable to save lead to the local database.',
    })
  }
})

// Update the status of one lead. Only the status column is changed.
app.patch('/api/leads/:id', (req, res) => {
  const id = Number(req.params.id)
  const status = req.body?.status

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ success: false, message: 'Invalid lead id.' })
  }

  if (typeof status !== 'string' || !ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Status must be one of: ${ALLOWED_STATUSES.join(', ')}.`,
    })
  }

  try {
    const result = db.prepare(`
      UPDATE leads SET status = ?, updated_at = datetime('now') WHERE id = ?
    `).run(status, id)

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Lead not found.' })
    }

    const lead = db.prepare(`${LEAD_SELECT} WHERE id = ?`).get(id)
    return res.json({ success: true, lead })
  } catch (error) {
    console.error('Failed to update lead status:', error)
    return res.status(500).json({
      success: false,
      message: 'Unable to update the lead in the local database.',
    })
  }
})

// Unknown API routes return JSON instead of the default HTML "Cannot POST ..." page.
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: `No API route for ${req.method} ${req.originalUrl}.`,
  })
})

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Request body is not valid JSON.' })
  }
  console.error('Unhandled API error:', error)
  return res.status(500).json({ success: false, message: 'Unexpected server error.' })
})

// Express 5 passes listen errors (for example EADDRINUSE) to this callback, so check
// for an error before reporting success. Without this check a second copy of the
// server prints "running" and exits while an old copy still owns port 3000.
app.listen(PORT, '0.0.0.0', (error) => {
  if (error) {
    console.error(`MONTECH CRM API could not start on http://127.0.0.1:${PORT}: ${error.message}`)
    if (error.code === 'EADDRINUSE') {
      console.error('Port 3000 is already in use. Another copy of the API is probably still running.')
      console.error('Find it with: Get-NetTCPConnection -LocalPort 3000')
    }
    process.exit(1)
  }
  console.log(`MONTECH CRM API running at http://127.0.0.1:${PORT}`)
})






