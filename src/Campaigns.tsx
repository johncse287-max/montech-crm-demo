import { useCallback, useEffect, useState } from 'react'

type Campaign = {
  id: number
  name: string
  industry: string
  description: string
  status: 'active' | 'paused' | 'completed'
  created_at: string
  updated_at: string
}

type CampaignForm = {
  name: string
  industry: string
  description: string
}

const emptyForm: CampaignForm = {
  name: '',
  industry: 'MCA',
  description: '',
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<CampaignForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  const loadCampaigns = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/campaigns')
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to load campaigns.')
      }
      setCampaigns(data.campaigns ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load campaigns.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCampaigns()
  }, [loadCampaigns])

  function openNewForm() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
    setNotice('')
  }

  function openEditForm(campaign: Campaign) {
    setEditingId(campaign.id)
    setForm({
      name: campaign.name,
      industry: campaign.industry,
      description: campaign.description,
    })
    setShowForm(true)
    setNotice('')
  }

  async function saveCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setNotice('')
    try {
      const response = await fetch(
        editingId === null ? '/api/campaigns' : `/api/campaigns/${editingId}`,
        {
          method: editingId === null ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        },
      )
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to save campaign.')
      }
      setShowForm(false)
      setForm(emptyForm)
      setEditingId(null)
      setNotice(editingId === null ? 'Campaign created successfully.' : 'Campaign updated successfully.')
      await loadCampaigns()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Unable to save campaign.')
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(campaign: Campaign, status: Campaign['status']) {
    setNotice('')
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to update campaign.')
      }
      setNotice('Campaign status updated.')
      await loadCampaigns()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Unable to update status.')
    }
  }

  const activeCount = campaigns.filter((item) => item.status === 'active').length
  const pausedCount = campaigns.filter((item) => item.status === 'paused').length
  const completedCount = campaigns.filter((item) => item.status === 'completed').length

  return (
    <section className="campaigns-page">
      <div className="campaign-summary">
        <div className="campaign-summary-card">
          <span>Total campaigns</span>
          <strong>{campaigns.length}</strong>
        </div>
        <div className="campaign-summary-card">
          <span>Active</span>
          <strong>{activeCount}</strong>
        </div>
        <div className="campaign-summary-card">
          <span>Paused</span>
          <strong>{pausedCount}</strong>
        </div>
        <div className="campaign-summary-card">
          <span>Completed</span>
          <strong>{completedCount}</strong>
        </div>
      </div>

      <div className="section-heading">
        <div>
          <h2>Campaign Management</h2>
          <p>Create and manage your demo sales campaigns</p>
        </div>
        <button className="primary-button" onClick={openNewForm}>+ New Campaign</button>
      </div>

      {notice && <p className="campaign-notice">{notice}</p>}
      {error && (
        <div className="campaign-empty">
          <p>{error}</p>
          <button className="secondary-button" onClick={loadCampaigns}>Try again</button>
        </div>
      )}

      {showForm && (
        <form className="campaign-form" onSubmit={saveCampaign}>
          <div className="section-heading">
            <div>
              <h2>{editingId === null ? 'Create Campaign' : 'Edit Campaign'}</h2>
              <p>Enter campaign details below</p>
            </div>
          </div>
          <label>
            Campaign name
            <input
              required
              maxLength={100}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="e.g. Texas MCA Outreach"
            />
          </label>
          <label>
            Industry
            <select
              value={form.industry}
              onChange={(event) => setForm({ ...form, industry: event.target.value })}
            >
              {['MCA', 'Medicare', 'Solar', 'Janitorial', 'Healthcare', 'Air Duct Cleaning', 'Other'].map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Description
            <textarea
              maxLength={500}
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Describe the campaign objective..."
            />
          </label>
          <div className="campaign-form-actions">
            <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Saving...' : editingId === null ? 'Create Campaign' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>CAMPAIGN</th>
              <th>INDUSTRY</th>
              <th>STATUS</th>
              <th>CREATED</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5}>Loading campaigns...</td></tr>
            ) : campaigns.length === 0 ? (
              <tr><td colSpan={5}>
                <div className="campaign-empty">
                  <strong>No campaigns yet</strong>
                  <p>Create your first demo campaign to get started.</p>
                </div>
              </td></tr>
            ) : campaigns.map((campaign) => (
              <tr key={campaign.id}>
                <td>
                  <div className="company-cell">
                    <div className="company-avatar">CP</div>
                    <div>
                      <strong>{campaign.name}</strong>
                      <span>{campaign.description || 'No description'}</span>
                    </div>
                  </div>
                </td>
                <td>{campaign.industry}</td>
                <td>
                  <select
                    className={`campaign-status status-${campaign.status}`}
                    value={campaign.status}
                    onChange={(event) => updateStatus(campaign, event.target.value as Campaign['status'])}
                    aria-label={`Status for ${campaign.name}`}
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                  </select>
                </td>
                <td>{campaign.created_at ? new Date(`${campaign.created_at.replace(' ', 'T')}Z`).toLocaleDateString() : '—'}</td>
                <td><button className="text-button" onClick={() => openEditForm(campaign)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
