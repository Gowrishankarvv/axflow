import React, { useEffect, useMemo, useState } from 'react'
import api from '../lib/api'
import {
  Plus, Search, X, Trash2, Save, Video, FileText, IndianRupee,
  Users as UsersIcon, Filter, Building2, KeyRound, Copy, CheckCircle2, ExternalLink
} from 'lucide-react'
import { Link } from 'react-router-dom'

type Lead = {
  id: number
  date: string
  name: string
  contact_details: string
  source: string
  source_display: string
  lead_type: string
  lead_type_display: string
  work_type: string
  work_type_display: string
  enquiry_video_link: string
  requirements: string
  remarks: string
  suggestion: string
  reason_not_proceed: string
  assigned_to: number | null
  assigned_to_name: string | null
  last_followed_up: string | null
  status: string
  status_display: string
  status_description: string
  invoice_status: string
  invoice_status_display: string
  invoice_amount: string | number
  invoice_date: string | null
  invoice_notes: string
  invoice_file_url: string
  client_name: string
  client_domain: string
  client_contact_email: string
  client_admin_name: string
  client_admin_email: string
  client: number | null
  client_id: number | null
  client_record_name: string | null
  generated_temp_password?: string
  created_by: number | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

const SOURCE_OPTIONS = [
  { v: 'whatsapp', l: 'WhatsApp' },
  { v: 'instagram', l: 'Instagram' },
  { v: 'facebook', l: 'Facebook' },
  { v: 'linkedin', l: 'LinkedIn' },
  { v: 'email', l: 'Email' },
  { v: 'phone', l: 'Phone Call' },
  { v: 'website', l: 'Website' },
  { v: 'other', l: 'Other' },
]

const LEAD_TYPE_OPTIONS = [
  { v: 'ad', l: 'Advertisement' },
  { v: 'social_media', l: 'Social Media' },
  { v: 'personal_reference', l: 'Personal Reference' },
  { v: 'cold_outreach', l: 'Cold Outreach' },
  { v: 'event', l: 'Event / Conference' },
  { v: 'inbound', l: 'Inbound Inquiry' },
  { v: 'other', l: 'Other' },
]

const WORK_TYPE_OPTIONS = [
  { v: 'app', l: 'Mobile App' },
  { v: 'web', l: 'Web Development' },
  { v: 'design', l: 'Design / Branding' },
  { v: 'marketing', l: 'Marketing' },
  { v: 'data', l: 'Data / Analytics' },
  { v: 'consulting', l: 'Consulting' },
  { v: 'other', l: 'Other' },
]

const STATUS_OPTIONS = [
  { v: 'pending', l: 'Pending' },
  { v: 'in_discussion', l: 'In Discussion' },
  { v: 'ongoing', l: 'Ongoing' },
  { v: 'converted', l: 'Converted' },
  { v: 'cancelled', l: 'Cancelled' },
  { v: 'rejected', l: 'Rejected' },
]

const INVOICE_STATUS_OPTIONS = [
  { v: 'none', l: 'Not Generated' },
  { v: 'draft', l: 'Draft' },
  { v: 'sent', l: 'Sent' },
  { v: 'paid', l: 'Paid' },
  { v: 'overdue', l: 'Overdue' },
]

// Status -> Tailwind color tokens. Used for row tint and badge.
// `row` fills the entire <tr>; `bar` is the left accent strip; `badge` is the inline dropdown pill.
const STATUS_STYLE: Record<string, { row: string; badge: string; bar: string }> = {
  pending:       { row: 'bg-amber-100   hover:bg-amber-200',   badge: 'bg-amber-200 text-amber-900',     bar: 'bg-amber-500' },
  in_discussion: { row: 'bg-blue-100    hover:bg-blue-200',    badge: 'bg-blue-200 text-blue-900',       bar: 'bg-blue-500' },
  ongoing:       { row: 'bg-indigo-100  hover:bg-indigo-200',  badge: 'bg-indigo-200 text-indigo-900',   bar: 'bg-indigo-500' },
  converted:     { row: 'bg-emerald-100 hover:bg-emerald-200', badge: 'bg-emerald-200 text-emerald-900', bar: 'bg-emerald-600' },
  cancelled:     { row: 'bg-gray-200    hover:bg-gray-300',    badge: 'bg-gray-300 text-gray-800',       bar: 'bg-gray-500' },
  rejected:      { row: 'bg-rose-100    hover:bg-rose-200',    badge: 'bg-rose-200 text-rose-900',       bar: 'bg-rose-500' },
}

function emptyLead(): Partial<Lead> {
  const today = new Date().toISOString().slice(0, 10)
  return {
    date: today,
    name: '',
    contact_details: '',
    source: 'other',
    lead_type: 'other',
    work_type: 'other',
    enquiry_video_link: '',
    requirements: '',
    remarks: '',
    suggestion: '',
    reason_not_proceed: '',
    assigned_to: null,
    last_followed_up: null,
    status: 'pending',
    status_description: '',
    invoice_status: 'none',
    invoice_amount: '0.00',
    invoice_date: null,
    invoice_notes: '',
    invoice_file_url: '',
    client_name: '',
    client_domain: '',
    client_contact_email: '',
    client_admin_name: '',
    client_admin_email: '',
  }
}

export default function CRM() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [users, setUsers] = useState<Array<{ id: number; first_name: string; last_name: string; username: string }>>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  const [selected, setSelected] = useState<Lead | null>(null)
  const [draft, setDraft] = useState<Partial<Lead> | null>(null)
  const [saving, setSaving] = useState(false)
  const [isNew, setIsNew] = useState(false)
  // Shown after a lead is converted and the backend auto-created an admin login.
  const [credentialModal, setCredentialModal] = useState<{ clientName: string; email: string; password: string } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get('/leads/', { params: { page_size: 200 } })
      const data = (res.data as any).results || res.data
      setLeads(data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function loadUsers() {
    try {
      const res = await api.get('/users/light/')
      setUsers((res.data as any).results || res.data || [])
    } catch (e) { /* non-fatal */ }
  }

  useEffect(() => { load(); loadUsers() }, [])

  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (statusFilter && l.status !== statusFilter) return false
      if (search) {
        const s = search.toLowerCase()
        if (!(l.name.toLowerCase().includes(s)
          || l.contact_details.toLowerCase().includes(s)
          || (l.requirements || '').toLowerCase().includes(s))) return false
      }
      return true
    })
  }, [leads, statusFilter, search])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    leads.forEach(l => { c[l.status] = (c[l.status] || 0) + 1 })
    return c
  }, [leads])

  function openNew() {
    setIsNew(true)
    setSelected(null)
    setDraft(emptyLead())
  }

  function openRow(l: Lead) {
    setIsNew(false)
    setSelected(l)
    setDraft({ ...l })
  }

  function closeDrawer() {
    setSelected(null)
    setDraft(null)
    setIsNew(false)
  }

  async function save() {
    if (!draft) return
    if (!draft.name || !draft.date) {
      alert('Name and date are required.')
      return
    }
    setSaving(true)
    try {
      const payload: any = { ...draft }
      // Backend expects null, not empty string for date / FK fields
      if (!payload.last_followed_up) payload.last_followed_up = null
      if (!payload.invoice_date) payload.invoice_date = null
      if (payload.assigned_to === '' || payload.assigned_to === undefined) payload.assigned_to = null

      let saved: Lead | null = null
      if (isNew) {
        const res = await api.post('/leads/', payload)
        saved = res.data as Lead
        setLeads(prev => [saved as Lead, ...prev])
      } else if (selected) {
        const res = await api.patch(`/leads/${selected.id}/`, payload)
        saved = res.data as Lead
        setLeads(prev => prev.map(x => x.id === selected.id ? (saved as Lead) : x))
      }
      // Show credentials modal if the backend just provisioned an admin login.
      if (saved?.generated_temp_password && saved.client_admin_email) {
        setCredentialModal({
          clientName: saved.client_record_name || saved.client_name || saved.name,
          email: saved.client_admin_email,
          password: saved.generated_temp_password,
        })
      }
      closeDrawer()
    } catch (e: any) {
      console.error(e)
      alert('Failed to save: ' + (e?.response?.data ? JSON.stringify(e.response.data) : e.message))
    } finally { setSaving(false) }
  }

  async function remove(id: number) {
    const lead = leads.find(x => x.id === id)
    const msg = lead?.client_id
      ? `Delete this lead?\n\nThis lead is linked to client "${lead.client_record_name}". ` +
        `The client record and any client login users will also be deleted.`
      : 'Delete this lead?'
    if (!confirm(msg)) return
    try {
      await api.delete(`/leads/${id}/`)
      setLeads(prev => prev.filter(x => x.id !== id))
      if (selected?.id === id) closeDrawer()
    } catch (e) { console.error(e); alert('Failed to delete') }
  }

  // Quick inline status change from the table
  async function quickStatusChange(l: Lead, status: string) {
    // Guard: converting inline without client details set leads to confusion.
    // Nudge the user to open the drawer so they can fill the Client section.
    if (status === 'converted' && !l.client_id && !l.client_name) {
      if (!confirm(
        'Mark this lead as converted? A new Client record will be created using the lead name. ' +
        'To set a domain or admin login, click the row to open details instead.'
      )) return
    }
    try {
      const res = await api.patch(`/leads/${l.id}/`, { status })
      const saved = res.data as Lead
      setLeads(prev => prev.map(x => x.id === l.id ? saved : x))
      if (saved?.generated_temp_password && saved.client_admin_email) {
        setCredentialModal({
          clientName: saved.client_record_name || saved.client_name || saved.name,
          email: saved.client_admin_email,
          password: saved.generated_temp_password,
        })
      }
    } catch (e: any) {
      console.error(e)
      alert('Failed to update: ' + (e?.response?.data ? JSON.stringify(e.response.data) : e.message))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">CRM</h1>
            <p className="text-sm text-gray-500 mt-1">Track leads and projects across all sources.</p>
          </div>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0066FF] text-white font-medium hover:bg-blue-700 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> New Lead
          </button>
        </div>

        {/* Status summary pills */}
        <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter('')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border ${statusFilter === '' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
            All <span className="ml-1 opacity-70">{leads.length}</span>
          </button>
          {STATUS_OPTIONS.map(s => (
            <button
              key={s.v}
              onClick={() => setStatusFilter(s.v === statusFilter ? '' : s.v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                statusFilter === s.v
                  ? 'bg-gray-900 text-white border-gray-900'
                  : `${STATUS_STYLE[s.v].badge} border-transparent hover:opacity-80`
              }`}>
              {s.l} <span className="ml-1 opacity-70">{counts[s.v] || 0}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4 flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, contact, or requirement…"
            className="flex-1 outline-none text-sm bg-transparent" />
          {(search || statusFilter) && (
            <button
              onClick={() => { setSearch(''); setStatusFilter('') }}
              className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-3 w-2"></th>
                  <th className="text-left px-3 py-3">Date</th>
                  <th className="text-left px-3 py-3">Name</th>
                  <th className="text-left px-3 py-3">Contact</th>
                  <th className="text-left px-3 py-3">Source</th>
                  <th className="text-left px-3 py-3">Type</th>
                  <th className="text-left px-3 py-3">Work</th>
                  <th className="text-left px-3 py-3">Assigned</th>
                  <th className="text-left px-3 py-3">Last F/U</th>
                  <th className="text-left px-3 py-3">Status</th>
                  <th className="text-left px-3 py-3">Client</th>
                  <th className="text-left px-3 py-3">Invoice</th>
                  <th className="text-left px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={13} className="py-10 text-center text-gray-400">Loading leads…</td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={13} className="py-12 text-center text-gray-400">
                    No leads yet. Click "+ New Lead" to add one.
                  </td></tr>
                )}
                {!loading && filtered.map(l => {
                  const sty = STATUS_STYLE[l.status] || STATUS_STYLE.pending
                  return (
                    <tr
                      key={l.id}
                      onClick={() => openRow(l)}
                      className={`cursor-pointer transition-colors border-t border-gray-100 ${sty.row}`}>
                      <td className={`w-1 ${sty.bar}`}></td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">{l.date}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-900">{l.name}</td>
                      <td className="px-3 py-2.5 text-gray-600 truncate max-w-[160px]">{l.contact_details}</td>
                      <td className="px-3 py-2.5 text-gray-600">{l.source_display}</td>
                      <td className="px-3 py-2.5 text-gray-600">{l.lead_type_display}</td>
                      <td className="px-3 py-2.5 text-gray-600">{l.work_type_display}</td>
                      <td className="px-3 py-2.5 text-gray-600">{l.assigned_to_name || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{l.last_followed_up || '—'}</td>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <select
                          value={l.status}
                          onChange={e => quickStatusChange(l, e.target.value)}
                          className={`text-xs font-medium rounded-full px-2.5 py-1 border-0 cursor-pointer ${sty.badge} focus:ring-2 focus:ring-offset-1 focus:ring-blue-300`}>
                          {STATUS_OPTIONS.map(s => (
                            <option key={s.v} value={s.v}>{s.l}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        {l.client_id ? (
                          <Link
                            to="/clients"
                            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900">
                            <Building2 className="w-3 h-3" />
                            {l.client_record_name || 'View client'}
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </Link>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                        {l.invoice_status === 'none'
                          ? <span className="text-gray-400 text-xs">—</span>
                          : <span className="inline-flex items-center gap-1 text-xs">
                              <IndianRupee className="w-3 h-3" />
                              {Number(l.invoice_amount || 0).toLocaleString('en-IN')}
                              <span className="ml-1 text-gray-400">· {l.invoice_status_display}</span>
                            </span>
                        }
                      </td>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => remove(l.id)}
                          className="text-gray-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-gray-400 mt-3">
          Tip: click any row to open the full details panel. Use the status dropdown to update inline.
        </p>
      </div>

      {/* Side Drawer */}
      {draft && (
        <LeadDrawer
          draft={draft}
          setDraft={setDraft}
          isNew={isNew}
          saving={saving}
          onClose={closeDrawer}
          onSave={save}
          users={users}
        />
      )}

      {/* Credentials modal -- shown once after auto-provisioning a client admin */}
      {credentialModal && (
        <CredentialModal
          info={credentialModal}
          onClose={() => setCredentialModal(null)}
        />
      )}
    </div>
  )
}

function CredentialModal({
  info, onClose,
}: { info: { clientName: string; email: string; password: string }; onClose: () => void }) {
  const [copied, setCopied] = useState<'email' | 'password' | 'both' | null>(null)

  function copy(text: string, key: 'email' | 'password' | 'both') {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in duration-200">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900">Client created</h3>
            <p className="text-sm text-gray-600 mt-1">
              <span className="font-medium">{info.clientName}</span> is now in the Clients module.
              Share these credentials with them — they'll be asked to set their own password on first login.
            </p>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-xs font-medium text-gray-500 mb-1">Login email</div>
            <div className="flex items-center justify-between gap-2">
              <code className="text-sm text-gray-900 break-all">{info.email}</code>
              <button onClick={() => copy(info.email, 'email')} className="text-gray-500 hover:text-gray-900 p-1 rounded">
                {copied === 'email' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="text-xs font-medium text-amber-800 mb-1 flex items-center gap-1">
              <KeyRound className="w-3 h-3" /> Temporary password
            </div>
            <div className="flex items-center justify-between gap-2">
              <code className="text-sm font-mono text-amber-900 break-all">{info.password}</code>
              <button onClick={() => copy(info.password, 'password')} className="text-amber-700 hover:text-amber-900 p-1 rounded">
                {copied === 'password' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-amber-700 mt-2">
              This password is shown only once. Copy it now.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => copy(`Email: ${info.email}\nTemporary password: ${info.password}`, 'both')}
            className="text-xs font-medium text-gray-700 hover:text-gray-900 inline-flex items-center gap-1">
            <Copy className="w-3 h-3" /> {copied === 'both' ? 'Copied!' : 'Copy both'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#0066FF] text-white font-medium hover:bg-blue-700">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function LeadDrawer({
  draft, setDraft, isNew, saving, onClose, onSave, users
}: {
  draft: Partial<Lead>
  setDraft: (d: Partial<Lead>) => void
  isNew: boolean
  saving: boolean
  onClose: () => void
  onSave: () => void
  users: Array<{ id: number; first_name: string; last_name: string; username: string }>
}) {
  function set<K extends keyof Lead>(k: K, v: any) {
    setDraft({ ...draft, [k]: v })
  }

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 animate-in fade-in duration-200" />
      <aside className="fixed right-0 top-0 bottom-0 w-full md:w-[640px] bg-white shadow-2xl z-50 overflow-y-auto animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-5 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {isNew ? 'New Lead' : draft.name}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isNew ? 'Capture all the details below.' : 'Edit and save when ready.'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Basic */}
          <Section title="Basic">
            <Grid>
              <Field label="Date *">
                <input type="date" value={draft.date || ''} onChange={e => set('date', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Name *">
                <input value={draft.name || ''} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="e.g. Acme Corp" />
              </Field>
              <Field label="Contact details" colSpan={2}>
                <input value={draft.contact_details || ''} onChange={e => set('contact_details', e.target.value)} className={inputCls} placeholder="Phone, email, or both" />
              </Field>
            </Grid>
          </Section>

          {/* Source / Classification */}
          <Section title="Source & Type">
            <Grid>
              <Field label="Source">
                <select value={draft.source || 'other'} onChange={e => set('source', e.target.value)} className={inputCls}>
                  {SOURCE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </Field>
              <Field label="Lead type">
                <select value={draft.lead_type || 'other'} onChange={e => set('lead_type', e.target.value)} className={inputCls}>
                  {LEAD_TYPE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </Field>
              <Field label="Work type">
                <select value={draft.work_type || 'other'} onChange={e => set('work_type', e.target.value)} className={inputCls}>
                  {WORK_TYPE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </Field>
              <Field label="Enquiry video link">
                <div className="relative">
                  <Video className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input value={draft.enquiry_video_link || ''} onChange={e => set('enquiry_video_link', e.target.value)} className={inputCls + ' pl-9'} placeholder="https://…" />
                </div>
              </Field>
            </Grid>
          </Section>

          {/* Assignment */}
          <Section title="Assignment & Follow-up">
            <Grid>
              <Field label="Assigned to">
                <select
                  value={draft.assigned_to ?? ''}
                  onChange={e => set('assigned_to', e.target.value === '' ? null : Number(e.target.value))}
                  className={inputCls}>
                  <option value="">— Unassigned —</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {(u.first_name + ' ' + u.last_name).trim() || u.username}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Last followed up">
                <input type="date" value={draft.last_followed_up || ''} onChange={e => set('last_followed_up', e.target.value || null)} className={inputCls} />
              </Field>
            </Grid>
          </Section>

          {/* Detail text fields */}
          <Section title="Details">
            <Field label="Requirements">
              <textarea rows={3} value={draft.requirements || ''} onChange={e => set('requirements', e.target.value)} className={inputCls} placeholder="What does the client need?" />
            </Field>
            <Field label="Remarks">
              <textarea rows={2} value={draft.remarks || ''} onChange={e => set('remarks', e.target.value)} className={inputCls} placeholder="Internal notes" />
            </Field>
            <Field label="Suggestion">
              <textarea rows={2} value={draft.suggestion || ''} onChange={e => set('suggestion', e.target.value)} className={inputCls} placeholder="What we recommend" />
            </Field>
          </Section>

          {/* Client provisioning */}
          <Section title="Client Details" icon={<Building2 className="w-4 h-4 text-gray-500" />}>
            {draft.client_id ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-emerald-900">
                    Linked to client: {draft.client_record_name}
                  </div>
                  <div className="text-xs text-emerald-700 mt-0.5">
                    This lead has been converted. Manage the client record from the Clients page.
                  </div>
                  <Link to="/clients" className="text-xs font-medium text-emerald-800 hover:text-emerald-950 inline-flex items-center gap-1 mt-2">
                    Open Clients <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500 -mt-1">
                Fill these in now so we can auto-create the Client record the moment you mark this lead as <strong>Converted</strong>.
              </p>
            )}
            <Grid>
              <Field label="Company name">
                <input value={draft.client_name || ''} onChange={e => set('client_name', e.target.value)} className={inputCls}
                  placeholder={`Defaults to "${draft.name || 'lead name'}"`} disabled={!!draft.client_id} />
              </Field>
              <Field label="Domain">
                <input value={draft.client_domain || ''} onChange={e => set('client_domain', e.target.value)} className={inputCls}
                  placeholder="acme.com" disabled={!!draft.client_id} />
              </Field>
              <Field label="Client contact email" colSpan={2}>
                <input type="email" value={draft.client_contact_email || ''} onChange={e => set('client_contact_email', e.target.value)} className={inputCls}
                  placeholder="hello@acme.com" disabled={!!draft.client_id} />
              </Field>
              <Field label="Admin name">
                <input value={draft.client_admin_name || ''} onChange={e => set('client_admin_name', e.target.value)} className={inputCls}
                  placeholder="Jane Doe" disabled={!!draft.client_id} />
              </Field>
              <Field label="Admin email (creates login)">
                <input type="email" value={draft.client_admin_email || ''} onChange={e => set('client_admin_email', e.target.value)} className={inputCls}
                  placeholder="jane@acme.com" disabled={!!draft.client_id} />
              </Field>
            </Grid>
            {!draft.client_id && draft.client_admin_email && (
              <p className="text-xs text-gray-500 -mt-1 flex items-center gap-1">
                <KeyRound className="w-3 h-3" />
                A temporary password will be generated when the lead is converted.
              </p>
            )}
          </Section>

          {/* Status */}
          <Section title="Status">
            <Grid>
              <Field label="Current status">
                <select value={draft.status || 'pending'} onChange={e => set('status', e.target.value)} className={inputCls}>
                  {STATUS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </Field>
              <Field label="">
                <div className={`px-3 py-2 rounded-md text-xs font-medium ${STATUS_STYLE[(draft.status as string) || 'pending']?.badge}`}>
                  {STATUS_OPTIONS.find(s => s.v === draft.status)?.l || 'Pending'}
                </div>
              </Field>
            </Grid>
            <Field label="Status description">
              <textarea rows={3} value={draft.status_description || ''} onChange={e => set('status_description', e.target.value)} className={inputCls}
                placeholder="Describe where things stand in detail…" />
            </Field>
            {(draft.status === 'cancelled' || draft.status === 'rejected') && (
              <Field label="Reason for not proceeding">
                <textarea rows={2} value={draft.reason_not_proceed || ''} onChange={e => set('reason_not_proceed', e.target.value)} className={inputCls} />
              </Field>
            )}
          </Section>

          {/* Invoice */}
          <Section title="Invoice" icon={<FileText className="w-4 h-4 text-gray-500" />}>
            <Grid>
              <Field label="Invoice status">
                <select value={draft.invoice_status || 'none'} onChange={e => set('invoice_status', e.target.value)} className={inputCls}>
                  {INVOICE_STATUS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </Field>
              <Field label="Amount (INR)">
                <div className="relative">
                  <IndianRupee className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="number" step="0.01" value={String(draft.invoice_amount ?? '0.00')} onChange={e => set('invoice_amount', e.target.value)} className={inputCls + ' pl-9'} />
                </div>
              </Field>
              <Field label="Invoice date">
                <input type="date" value={draft.invoice_date || ''} onChange={e => set('invoice_date', e.target.value || null)} className={inputCls} />
              </Field>
              <Field label="Invoice file URL">
                <input value={draft.invoice_file_url || ''} onChange={e => set('invoice_file_url', e.target.value)} className={inputCls} placeholder="https://…" />
              </Field>
            </Grid>
            <Field label="Invoice notes">
              <textarea rows={2} value={draft.invoice_notes || ''} onChange={e => set('invoice_notes', e.target.value)} className={inputCls} />
            </Field>
          </Section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-100 font-medium">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0066FF] text-white font-medium hover:bg-blue-700 disabled:opacity-60">
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : isNew ? 'Create lead' : 'Save changes'}
          </button>
        </div>
      </aside>
    </>
  )
}

const inputCls = "w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
        {icon}
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
}

function Field({ label, colSpan, children }: { label: string; colSpan?: number; children: React.ReactNode }) {
  const cs = colSpan === 2 ? 'sm:col-span-2' : ''
  return (
    <div className={cs}>
      {label && <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>}
      {children}
    </div>
  )
}
