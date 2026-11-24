
import { useCallback, useEffect, useState } from 'react'
import './App.css'
import LeadGenerator from './LeadGenerator'
import Campaigns from './Campaigns'

const API_BASE = ''

type ApiStatus =
  | { state: 'checking' }
  | { state: 'online'; leadCount: number | null }
  | { state: 'offline' }

type LeadsStatus =
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'error'; message: string }

// Shape returned by GET /api/leads (only the fields this screen uses).
type Lead = {
  id: number
  companyName: string
  industry: string | null
  city: string | null
  state: string | null
  source: string | null
  status: string
  ownerName: string | null
  decisionMaker: string | null
  licenseNumber: string | null
  expirationDate: string | null
}

type ApiResult = {
  success?: boolean
  message?: string
  leads?: Lead[]
  lead?: Lead
}

// These match the statuses allowed by the SQLite table and the backend.
const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'verified', label: 'Verified' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'converted', label: 'Converted' },
  { value: 'disqualified', label: 'Disqualified' },
]

function statusLabel(value: string) {
  return STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value
}

function contactLine(lead: Lead) {
  return lead.decisionMaker || lead.ownerName || 'No contact on file'
}

function locationLine(lead: Lead) {
  return [lead.city, lead.state].filter(Boolean).join(', ') || ' '
}

async function api(path: string, init?: RequestInit): Promise<ApiResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, init)
  } catch {
    throw new Error(
      'Cannot reach the demo API. Please try again shortly.',
    )
  }

  let data: ApiResult = {}
  try {
    data = (await response.json()) as ApiResult
  } catch {
    // The response was not JSON; fall through to the HTTP status check.
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.message || `The API returned HTTP ${response.status}.`)
  }
  return data
}

function csvCell(value: string) {
  // Prefix spreadsheet formula characters so exported text is not executed as a formula.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

const navigation = [
  { label: 'Overview', icon: 'OV' },
  { label: 'Leads', icon: 'LD' },
  { label: 'Lead Generator', icon: 'LG' },
  { label: 'Campaigns', icon: 'CP' },
  { label: 'Call Center', icon: 'CC' },
  { label: 'Appointments', icon: 'AP' },
  { label: 'Team & Agents', icon: 'TM' },
  { label: 'Reports', icon: 'RP' },
  { label: 'Settings', icon: 'ST' },
]

function App() {
  const [activePage, setActivePage] = useState('Overview')
  const [leads, setLeads] = useState<Lead[]>([])
  const [leadsStatus, setLeadsStatus] = useState<LeadsStatus>({ state: 'loading' })
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [company, setCompany] = useState('')
  const [contact, setContact] = useState('')
  const [industry, setIndustry] = useState('Solar')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [noticeError, setNoticeError] = useState(false)
  const [apiStatus, setApiStatus] = useState<ApiStatus>({ state: 'checking' })

  function showNotice(message: string, isError = false) {
    setNotice(message)
    setNoticeError(isError)
  }

  const loadLeads = useCallback(async () => {
    try {
      const data = await api('/api/leads')
      setLeads(data.leads ?? [])
      setLeadsStatus({ state: 'ready' })
    } catch (error) {
      setLeadsStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Unable to load leads.',
      })
    }
  }, [])

  // Load saved leads when the CRM opens, and refresh whenever the user changes page
  // (this also picks up records saved by the Lead Generator).
  useEffect(() => {
    let cancelled = false

    async function refreshLeads() {
      try {
        const data = await api('/api/leads')
        if (cancelled) return
        setLeads(data.leads ?? [])
        setLeadsStatus({ state: 'ready' })
      } catch (error) {
        if (cancelled) return
        setLeadsStatus({
          state: 'error',
          message: error instanceof Error ? error.message : 'Unable to load leads.',
        })
      }
    }

    refreshLeads()

    return () => {
      cancelled = true
    }
  }, [activePage])

  useEffect(() => {
    let cancelled = false

    async function checkApi() {
      try {
        const response = await fetch(`${API_BASE}/api/health`)
        const data = await response.json()
        if (cancelled) return

        if (response.ok && data.success && data.database === 'connected') {
          setApiStatus({
            state: 'online',
            leadCount: typeof data.leadCount === 'number' ? data.leadCount : null,
          })
        } else {
          setApiStatus({ state: 'offline' })
        }
      } catch {
        if (!cancelled) setApiStatus({ state: 'offline' })
      }
    }

    checkApi()
    const timer = setInterval(checkApi, 15000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const filteredLeads = leads.filter((lead) =>
    `${lead.companyName} ${contactLine(lead)} ${lead.industry ?? ''} ${locationLine(lead)} ${statusLabel(lead.status)}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )

  const statsReady = leadsStatus.state === 'ready' || leads.length > 0
  const countByStatus = (status: string) =>
    statsReady ? leads.filter((lead) => lead.status === status).length : ' '

  const emptyMessage =
    leadsStatus.state === 'loading'
      ? 'Loading leads from the local database...'
      : leadsStatus.state === 'error' && leads.length === 0
        ? 'Leads could not be loaded.'
        : leads.length === 0
          ? 'No leads saved yet. Use Add lead or the Lead Generator.'
          : 'No leads match your search.'

  async function addLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!company.trim() || saving) return

    setSaving(true)
    try {
      await api('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: company.trim(),
          ownerName: contact.trim() || undefined,
          industry,
          source: 'Manual entry',
          status: 'new',
        }),
      })
      await loadLeads()
      setCompany('')
      setContact('')
      setShowForm(false)
      showNotice('Lead saved to the local SQLite database.')
    } catch (error) {
      showNotice(
        `Lead was not saved: ${error instanceof Error ? error.message : 'unknown error'}`,
        true,
      )
    } finally {
      setSaving(false)
    }
  }

  function exportLeads() {
    const header = [
      'Company', 'Contact', 'Industry', 'City', 'State',
      'Status', 'Source', 'Licence number', 'Licence expiry',
    ]
    const rows = leads.map((lead) => [
      lead.companyName,
      lead.decisionMaker || lead.ownerName || '',
      lead.industry ?? '',
      lead.city ?? '',
      lead.state ?? '',
      statusLabel(lead.status),
      lead.source ?? '',
      lead.licenseNumber ?? '',
      lead.expirationDate ?? '',
    ])

    const csv = [header, ...rows]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n')

    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'montech-leads.csv'
    link.click()
    URL.revokeObjectURL(url)
    showNotice('Lead CSV exported.')
  }

  async function updateLeadStatus(id: number, status: string) {
    const previous = leads.find((lead) => lead.id === id)?.status
    if (previous === undefined || previous === status) return

    setLeads((current) =>
      current.map((lead) => (lead.id === id ? { ...lead, status } : lead)),
    )

    try {
      await api(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
    } catch (error) {
      setLeads((current) =>
        current.map((lead) => (lead.id === id ? { ...lead, status: previous } : lead)),
      )
      showNotice(
        `Status was not saved: ${error instanceof Error ? error.message : 'unknown error'}`,
        true,
      )
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div>
            <strong>MONTECH</strong>
            <span>GLOBAL SERVICES</span>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace">
          <div className="workspace-avatar">M</div>
          <div>
            <strong>MONTECH Team</strong>
            <span>Business workspace</span>
          </div>
          <span className="workspace-chevron"> </span>
        </div>

        <div className="nav-label">WORKSPACE MENU</div>
        <nav className="navigation">
          {navigation.map((item) => (
            <button
              key={item.label}
              className={`nav-item ${activePage === item.label ? 'active' : ''}`}
              onClick={() => {
                setActivePage(item.label)
                setNotice('')
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
              {item.label === 'Leads' && (
                <span className="nav-count">{leads.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="security-note">
            <span> </span>
            <div>
              <strong>
                {apiStatus.state === 'online'
                  ? 'Demo API online'
                  : apiStatus.state === 'checking'
                    ? 'Checking demo API...'
                    : 'Demo API offline'}
              </strong>
              <small>
                {apiStatus.state === 'online'
                  ? apiStatus.leadCount === null
                    ? 'Demo database connected'
                    : `Demo database connected   ${apiStatus.leadCount} stored records`
                  : apiStatus.state === 'checking'
                    ? 'Connecting to demo database...'
                    : 'Demo service is temporarily unavailable'}
              </small>
              <small>Public demo   Fictional sample data</small>
            </div>
          </div>
          <div className="profile">
            <div className="profile-avatar">MR</div>
            <div>
              <strong>Workspace Admin</strong>
              <span>Administrator</span>
            </div>
            <span className="more"> </span>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <span>/</span> {activePage}
          </div>
          <div className="topbar-right">
            <span className="demo-badge"><i /> Local CRM</span>
            <button
              className="icon-button"
              aria-label="Notifications"
              onClick={() => showNotice('Notifications are not connected yet.')}
            >
               
            </button>
            <div className="profile-avatar top-avatar">AD</div>
          </div>
        </header>

        <div className="page-content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow">BUSINESS OPERATIONS</div>
              <h1>
                {activePage === 'Overview' ? 'Good morning, Team' : activePage}
              </h1>
              <p className="subtitle">
                {activePage === 'Overview'
                  ? 'Here is what is happening across your workspace today.'
                  : `Manage your ${activePage.toLowerCase()} in one place.`}
              </p>
            </div>
            <div className="date-label">  &nbsp; Workspace overview</div>
          </div>

          {notice && (
            <div className={`notice${noticeError ? ' error' : ''}`}>
              {notice}
              <button onClick={() => setNotice('')}> </button>
            </div>
          )}

          {leadsStatus.state === 'error' &&
            (activePage === 'Overview' || activePage === 'Leads') && (
              <div className="notice error">
                Could not load leads from the local database: {leadsStatus.message}
                <button
                  onClick={() => {
                    setLeadsStatus({ state: 'loading' })
                    loadLeads()
                  }}
                >
                  Retry
                </button>
              </div>
            )}

          {activePage === 'Overview' && (
            <>
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-top">
                    <span>Total leads</span>
                    <span className="stat-icon blue"> </span>
                  </div>
                  <div className="stat-value">{statsReady ? leads.length : ' '}</div>
                  <div className="stat-foot">Stored in local SQLite <span> </span></div>
                </div>

                <div className="stat-card">
                  <div className="stat-top">
                    <span>Qualified leads</span>
                    <span className="stat-icon green"> </span>
                  </div>
                  <div className="stat-value">{countByStatus('qualified')}</div>
                  <div className="stat-foot">Marked qualified</div>
                </div>

                <div className="stat-card">
                  <div className="stat-top">
                    <span>Contacted leads</span>
                    <span className="stat-icon orange"> </span>
                  </div>
                  <div className="stat-value">{countByStatus('contacted')}</div>
                  <div className="stat-foot">Outreach started</div>
                </div>

                <div className="stat-card">
                  <div className="stat-top">
                    <span>Team members</span>
                    <span className="stat-icon purple"> </span>
                  </div>
                  <div className="stat-value"> </div>
                  <div className="stat-foot">Not configured yet</div>
                </div>
              </div>

              <div className="section-heading">
                <div>
                  <h2>Lead pipeline</h2>
                  <p>Track prospects from first contact to qualification.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setActivePage('Leads')}
                >
                  View all leads  
                </button>
              </div>

              <div className="pipeline-grid">
                {[
                  { title: 'New', value: 'new', color: 'blue' },
                  { title: 'Contacted', value: 'contacted', color: 'purple' },
                  { title: 'Qualified', value: 'qualified', color: 'green' },
                  { title: 'Converted', value: 'converted', color: 'orange' },
                ].map((stage) => {
                  const count = leads.filter(
                    (lead) => lead.status === stage.value,
                  ).length

                  return (
                    <button
                      className="pipeline-card"
                      key={stage.title}
                      onClick={() => {
                        setActivePage('Leads')
                        setSearch(stage.title)
                      }}
                    >
                      <div>
                        <span className={`stage-dot ${stage.color}`} />
                        {stage.title}
                        <span className="stage-arrow"> </span>
                      </div>
                      <strong>{count}</strong>
                      <small>leads in stage</small>
                      <div className="pipeline-track">
                        <span
                          className={stage.color}
                          style={{
                            width: `${leads.length ? (count / leads.length) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="section-heading recent-heading">
                <div>
                  <h2>Recent leads</h2>
                  <p>Your latest prospect records.</p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => {
                    setActivePage('Leads')
                    setShowForm(true)
                  }}
                >
                    Add lead
                </button>
              </div>

              <LeadTable
                leads={leads.slice(0, 4)}
                onStatusChange={updateLeadStatus}
                emptyMessage={emptyMessage}
              />
            </>
          )}

          {activePage === 'Leads' && (
            <>
              <div className="toolbar">
                <input
                  aria-label="Search leads"
                  placeholder="   Search companies, contacts, industry..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <button className="secondary-button" onClick={exportLeads}>
                    Export CSV
                </button>
                <button
                  className="primary-button"
                  onClick={() => setShowForm(!showForm)}
                >
                    Add lead
                </button>
              </div>

              {showForm && (
                <form className="lead-form" onSubmit={addLead}>
                  <h3>Add a prospect</h3>
                  <div className="form-grid">
                    <label>
                      Company name
                      <input
                        required
                        value={company}
                        onChange={(event) => setCompany(event.target.value)}
                        placeholder="Business name"
                      />
                    </label>
                    <label>
                      Contact name (optional)
                      <input
                        value={contact}
                        onChange={(event) => setContact(event.target.value)}
                        placeholder="Contact person"
                      />
                    </label>
                    <label>
                      Industry
                      <select
                        value={industry}
                        onChange={(event) => setIndustry(event.target.value)}
                      >
                        <option>Solar</option>
                        <option>Janitorial</option>
                        <option>MCA</option>
                        <option>Healthcare</option>
                        <option>Other</option>
                      </select>
                    </label>
                  </div>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setShowForm(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="primary-button" disabled={saving}>
                      {saving ? 'Saving...' : 'Save lead'}
                    </button>
                  </div>
                </form>
              )}

              <div className="table-heading">
                <div>
                  <h2>
                    All leads <span className="count-pill">{filteredLeads.length}</span>
                  </h2>
                  <p>Prospect records for your campaigns.</p>
                </div>
              </div>

              <LeadTable
                leads={filteredLeads}
                onStatusChange={updateLeadStatus}
                emptyMessage={emptyMessage}
              />
            </>
          )}

          {activePage === 'Lead Generator' && <LeadGenerator />}
          {activePage === 'Campaigns' && <Campaigns />}

          {!['Overview', 'Leads', 'Lead Generator', 'Campaigns'].includes(activePage) && (
            <div className="placeholder-panel">
              <div className="placeholder-icon"> </div>
              <h2>{activePage}</h2>
              <p>This module is planned for the next development phase.</p>
              <p className="placeholder-muted">
                This module is not connected yet. Leads, new leads and status
                changes use your local SQLite database. No production data has
                been changed.
              </p>
              <button
                className="secondary-button"
                onClick={() => setActivePage('Overview')}
              >
                  Back to overview
              </button>
            </div>
          )}

          <footer className="footer">
            <span>MONTECH Global Services   Internal CRM</span>
            <span>Local CRM   Phase 1</span>
          </footer>
        </div>
      </main>

      {showForm && activePage !== 'Leads' && (
        <div className="floating-form-note">
          Open the Leads page to complete the new lead form.
        </div>
      )}
    </div>
  )
}

function LeadTable({
  leads,
  onStatusChange,
  emptyMessage,
}: {
  leads: Lead[]
  onStatusChange: (id: number, status: string) => void
  emptyMessage: string
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>COMPANY / CONTACT</th>
            <th>INDUSTRY</th>
            <th>LOCATION</th>
            <th>STATUS</th>
            <th>SOURCE</th>
          </tr>
        </thead>
        <tbody>
          {leads.length === 0 ? (
            <tr>
              <td colSpan={5} className="empty-state">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            leads.map((lead) => (
              <tr key={lead.id}>
                <td>
                  <div className="company-cell">
                    <div className="company-avatar">{lead.companyName.slice(0, 1)}</div>
                    <div>
                      <strong>{lead.companyName}</strong>
                      <span>{contactLine(lead)}</span>
                    </div>
                  </div>
                </td>
                <td>{lead.industry || ' '}</td>
                <td>{locationLine(lead)}</td>
                <td>
                  <select
                    className={`status-select status-${lead.status}`}
                    value={lead.status}
                    onChange={(event) =>
                      onStatusChange(lead.id, event.target.value)
                    }
                    aria-label={`Status for ${lead.companyName}`}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{lead.source || ' '}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export default App







