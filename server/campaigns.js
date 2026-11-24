
import express from 'express'
import { db } from './db.js'

const router = express.Router()

const ALLOWED_STATUSES = ['active', 'paused', 'completed']

// Separate campaign table. Does not modify leads or demo seed data.
db.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    industry TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'paused', 'completed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_campaigns_status
  ON campaigns(status);
`)

const SELECT_CAMPAIGN = `
  SELECT
    id,
    name,
    industry,
    description,
    status,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM campaigns
`

// GET all campaigns
router.get('/', (req, res) => {
  try {
    const campaigns = db.prepare(`
      ${SELECT_CAMPAIGN}
      ORDER BY id DESC
    `).all()

    return res.json({
      success: true,
      count: campaigns.length,
      campaigns,
    })
  } catch (error) {
    console.error('Campaign list error:', error)
    return res.status(500).json({
      success: false,
      message: 'Unable to load campaigns.',
    })
  }
})

// CREATE campaign
router.post('/', (req, res) => {
  const name = typeof req.body?.name === 'string'
    ? req.body.name.trim()
    : ''

  const industry = typeof req.body?.industry === 'string'
    ? req.body.industry.trim()
    : ''

  const description = typeof req.body?.description === 'string'
    ? req.body.description.trim()
    : ''

  if (!name || name.length > 100) {
    return res.status(400).json({
      success: false,
      message: 'Campaign name is required (max 100 characters).',
    })
  }

  if (!industry || industry.length > 80) {
    return res.status(400).json({
      success: false,
      message: 'Industry is required (max 80 characters).',
    })
  }

  if (description.length > 500) {
    return res.status(400).json({
      success: false,
      message: 'Description must be 500 characters or fewer.',
    })
  }

  try {
    const result = db.prepare(`
      INSERT INTO campaigns (name, industry, description)
      VALUES (?, ?, ?)
    `).run(name, industry, description)

    const campaign = db.prepare(
      `${SELECT_CAMPAIGN} WHERE id = ?`,
    ).get(Number(result.lastInsertRowid))

    return res.status(201).json({
      success: true,
      message: 'Campaign created successfully.',
      campaign,
    })
  } catch (error) {
    console.error('Campaign create error:', error)
    return res.status(500).json({
      success: false,
      message: 'Unable to create campaign.',
    })
  }
})

// UPDATE campaign
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id)

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({
      success: false,
      message: 'Invalid campaign ID.',
    })
  }

  const existing = db.prepare(
    'SELECT * FROM campaigns WHERE id = ?',
  ).get(id)

  if (!existing) {
    return res.status(404).json({
      success: false,
      message: 'Campaign not found.',
    })
  }

  const name = req.body?.name === undefined
    ? existing.name
    : req.body.name

  const industry = req.body?.industry === undefined
    ? existing.industry
    : req.body.industry

  const description = req.body?.description === undefined
    ? existing.description
    : req.body.description

  const status = req.body?.status === undefined
    ? existing.status
    : req.body.status

  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > 100
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid campaign name.',
    })
  }

  if (
    typeof industry !== 'string' ||
    !industry.trim() ||
    industry.trim().length > 80
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid industry.',
    })
  }

  if (
    typeof description !== 'string' ||
    description.length > 500
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid description.',
    })
  }

  if (
    typeof status !== 'string' ||
    !ALLOWED_STATUSES.includes(status)
  ) {
    return res.status(400).json({
      success: false,
      message: `Status must be: ${ALLOWED_STATUSES.join(', ')}.`,
    })
  }

  try {
    db.prepare(`
      UPDATE campaigns
      SET
        name = ?,
        industry = ?,
        description = ?,
        status = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name.trim(),
      industry.trim(),
      description.trim(),
      status,
      id,
    )

    const campaign = db.prepare(
      `${SELECT_CAMPAIGN} WHERE id = ?`,
    ).get(id)

    return res.json({
      success: true,
      message: 'Campaign updated successfully.',
      campaign,
    })
  } catch (error) {
    console.error('Campaign update error:', error)
    return res.status(500).json({
      success: false,
      message: 'Unable to update campaign.',
    })
  }
})

export default router
