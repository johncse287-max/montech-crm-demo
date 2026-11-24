import { useState, type FormEvent } from 'react'

type Campaign =
  | 'MCA / Business Funding'
  | 'Medicare'
  | 'Janitorial / Commercial Cleaning'
  | 'Healthcare'
  | 'Solar'
  | 'Air Duct Cleaning'

type Lead = {
  id: number
  companyName?: string | null
  website?: string | null
  businessAddress?: string | null
  email?: string | null
  phone?: string | null
  ownerName?: string | null
  decisionMaker?: string | null
  industry?: string | null
  city?: string | null
  state?: string | null
  source?: string | null
  status?: string | null
  notes?: string | null
}

type LeadsResponse = {
  success?: boolean
  count?: number
  leads?: Lead[]
  message?: string
}

const campaigns: Campaign[] = [
  'MCA / Business Funding',
  'Medicare',
  'Janitorial / Commercial Cleaning',
  'Healthcare',
  'Solar',
  'Air Duct Cleaning',
]

function matchesCampaign(lead: Lead, campaign: Campaign) {
  const industry = (lead.industry || '').toLowerCase()

  switch (campaign) {
    case 'MCA / Business Funding':
      return industry.includes('mca') || industry.includes('business funding')
    case 'Medicare':
      return industry.includes('medicare')
    case 'Janitorial / Commercial Cleaning':
      return industry.includes('janitorial') || industry.includes('commercial cleaning')
    case 'Healthcare':
      return industry.includes('healthcare')
    case 'Solar':
      return industry.includes('solar')
    case 'Air Duct Cleaning':
      return industry.includes('air duct')
    default:
      return false
  }
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export default function LeadGenerator() {
  const [campaign, setCampaign] = useState<Campaign>('MCA / Business Funding')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [limit, setLimit] = useState('25')
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const filteredLeads = leads
    .filter((lead) => matchesCampaign(lead, campaign))
    .filter((lead) => !city.trim() || (lead.city || '').toLowerCase().includes(city.trim().toLowerCase()))
    .filter((lead) => !state.trim() || (lead.state || '').toLowerCase().includes(state.trim().toLowerCase()))
    .slice(0, Number(limit))

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setLeads([])

    try {
      const response = await fetch('/api/leads')
      if (!response.ok) throw new Error(`API request failed (${response.status})`)

      const data = (await response.json()) as LeadsResponse
      if (!Array.isArray(data.leads)) throw new Error('The leads API returned an unexpected response.')

      setLeads(data.leads)
      const matches = data.leads
        .filter((lead) => matchesCampaign(lead, campaign))
        .filter((lead) => !city.trim() || (lead.city || '').toLowerCase().includes(city.trim().toLowerCase()))
        .filter((lead) => !state.trim() || (lead.state || '').toLowerCase().includes(state.trim().toLowerCase()))
        .slice(0, Number(limit))

      setMessage(`${matches.length} demo lead(s) found. These are existing fictional records only.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load demo leads.')
    } finally {
      setLoading(false)
    }
  }

  function handleExportCsv() {
    if (!filteredLeads.length) {
      setMessage('No filtered demo leads to export.')
      return
    }

    const headers = [
      'Company Name', 'Website', 'Business Address', 'Email', 'Phone',
      'Owner Name', 'Decision Maker', 'Industry', 'City', 'State', 'Source', 'Status', 'Notes',
    ]
    const rows = filteredLeads.map((lead) => [
      lead.companyName || '', lead.website || '', lead.businessAddress || '',
      lead.email || '', lead.phone || '', lead.ownerName || '',
      lead.decisionMaker || '', lead.industry || '', lead.city || '',
      lead.state || '', lead.source || '', lead.status || '', lead.notes || '',
    ])
    downloadCsv('montech-demo-leads.csv', headers, rows)
  }

  function handleExportViciDialCsv() {
    if (!filteredLeads.length) {
      setMessage('No filtered demo leads to export.')
      return
    }

    const headers = ['vendor_lead_code', 'phone_number', 'first_name', 'last_name', 'email', 'address1', 'city', 'state', 'comments']
    const rows = filteredLeads.map((lead) => [
      String(lead.id),
      lead.phone || '',
      lead.ownerName || lead.decisionMaker || '',
      '',
      lead.email || '',
      lead.businessAddress || '',
      lead.city || '',
      lead.state || '',
      `${lead.companyName || ''} | ${lead.industry || ''}`,
    ])
    downloadCsv('montech-vicidial-demo-leads.csv', headers, rows)
  }

  return (
    <section className="placeholder-panel">
      <div className="placeholder-icon">⌕</div>
      <h2>Demo Lead Generator</h2>
      <p>Explore and export existing fictional demo leads.</p>

      <form className="lead-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            Campaign
            <select value={campaign} onChange={(event) => setCampaign(event.target.value as Campaign)}>
              {campaigns.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label>
            City (optional)
            <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="e.g. Houston" />
          </label>

          <label>
            State (optional)
            <input value={state} onChange={(event) => setState(event.target.value)} placeholder="e.g. Texas" />
          </label>

          <label>
            Maximum records
            <select value={limit} onChange={(event) => setLimit(event.target.value)}>
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </label>
        </div>

        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? 'Searching...' : 'Search Demo Leads'}
          </button>
          <button className="secondary-button" type="button" onClick={handleExportCsv} disabled={!filteredLeads.length}>
            Export CSV
          </button>
          <button className="secondary-button" type="button" onClick={handleExportViciDialCsv} disabled={!filteredLeads.length}>
            Export VICIdial CSV
          </button>
        </div>
      </form>

      {message && <p role="status">{message}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Industry</th>
              <th>Phone</th>
              <th>Email</th>
              <th>City</th>
              <th>State</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.map((lead) => (
              <tr key={lead.id}>
                <td>{lead.companyName || '—'}</td>
                <td>{lead.industry || '—'}</td>
                <td>{lead.phone || '—'}</td>
                <td>{lead.email || '—'}</td>
                <td>{lead.city || '—'}</td>
                <td>{lead.state || '—'}</td>
                <td>{lead.status || '—'}</td>
              </tr>
            ))}
            {!filteredLeads.length && (
              <tr>
                <td colSpan={7}>No demo leads loaded. Choose filters and click Search Demo Leads.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="muted">
        Demo mode only: this page reads existing fictional records from the local CRM database.
        It does not scrape websites, call external lead providers, or create or save leads.
      </p>
    </section>
  )
}
