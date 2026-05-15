import React, { useEffect, useMemo, useState } from 'react'
import api from '../lib/api'
import { useAppData } from '../lib/AppDataContext'
import {
  Bug, Lightbulb, Plus, X, Paperclip, Trash2, CheckCircle2,
  Clock, AlertCircle, Send, Filter,
} from 'lucide-react'

type Ticket = {
  id: number
  kind: 'bug' | 'feature'
  kind_display: string
  title: string
  description: string
  attachment: string | null
  attachment_url: string | null
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  status_display: string
  resolution_note: string
  resolved_by: number | null
  resolved_by_name: string | null
  resolved_at: string | null
  created_by: number
  created_by_name: string
  created_at: string
  updated_at: string
}

const STATUS_STYLE: Record<string, { badge: string; bar: string; icon: any }> = {
  open:        { badge: 'bg-amber-100 text-amber-800',     bar: 'bg-amber-400',   icon: AlertCircle },
  in_progress: { badge: 'bg-blue-100 text-blue-800',       bar: 'bg-blue-400',    icon: Clock },
  resolved:    { badge: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500', icon: CheckCircle2 },
  closed:      { badge: 'bg-gray-200 text-gray-700',       bar: 'bg-gray-400',    icon: CheckCircle2 },
}

const STATUS_OPTIONS: Array<{ v: Ticket['status']; l: string }> = [
  { v: 'open', l: 'Open' },
  { v: 'in_progress', l: 'In Progress' },
  { v: 'resolved', l: 'Resolved' },
  { v: 'closed', l: 'Closed' },
]

export default function Tickets() {
  const { data } = useAppData()
  const me = data?.me
  const isManager = me?.role === 'manager' || me?.role === 'superuser'

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'mine' | 'all'>(isManager ? 'all' : 'mine')
  const [statusFilter, setStatusFilter] = useState<string>('')

  // Submit modal state
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<{ kind: 'bug' | 'feature'; title: string; description: string; attachment: File | null }>({
    kind: 'bug', title: '', description: '', attachment: null,
  })
  const [submitting, setSubmitting] = useState(false)

  // Manager status-update modal
  const [reviewing, setReviewing] = useState<Ticket | null>(null)
  const [reviewStatus, setReviewStatus] = useState<Ticket['status']>('in_progress')
  const [reviewNote, setReviewNote] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await api.get('/tickets/', { params: { page_size: 200 } })
      setTickets((res.data as any).results || res.data || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    return tickets.filter(t => {
      if (!isManager) return true // employees only get their own from the API
      if (tab === 'mine' && t.created_by !== me?.id) return false
      if (statusFilter && t.status !== statusFilter) return false
      return true
    })
  }, [tickets, tab, statusFilter, me?.id, isManager])

  const counts = useMemo(() => {
    const c = { open: 0, in_progress: 0, resolved: 0, closed: 0 } as Record<string, number>
    tickets.forEach(t => { c[t.status] = (c[t.status] || 0) + 1 })
    return c
  }, [tickets])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title || !form.description) {
      alert('Title and description are required.')
      return
    }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('kind', form.kind)
      fd.append('title', form.title)
      fd.append('description', form.description)
      if (form.attachment) fd.append('attachment', form.attachment)
      const res = await api.post('/tickets/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setTickets(prev => [res.data as Ticket, ...prev])
      setForm({ kind: 'bug', title: '', description: '', attachment: null })
      setShowForm(false)
    } catch (e: any) {
      alert('Failed: ' + (e?.response?.data ? JSON.stringify(e.response.data) : e.message))
    } finally { setSubmitting(false) }
  }

  async function updateStatus() {
    if (!reviewing) return
    try {
      const res = await api.post(`/tickets/${reviewing.id}/update_status/`, {
        status: reviewStatus, resolution_note: reviewNote,
      })
      setTickets(prev => prev.map(x => x.id === reviewing.id ? (res.data as Ticket) : x))
      setReviewing(null)
      setReviewNote('')
    } catch (e: any) {
      alert('Failed: ' + (e?.response?.data ? JSON.stringify(e.response.data) : e.message))
    }
  }

  async function remove(id: number) {
    if (!confirm('Delete this ticket?')) return
    try {
      await api.delete(`/tickets/${id}/`)
      setTickets(prev => prev.filter(x => x.id !== id))
    } catch (e: any) {
      alert('Failed: ' + (e?.response?.data?.detail || e.message))
    }
  }

  function openReview(t: Ticket) {
    setReviewing(t)
    setReviewStatus(t.status === 'open' ? 'in_progress' : t.status)
    setReviewNote(t.resolution_note || '')
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bug / Feature Tickets</h1>
            <p className="text-sm text-gray-500 mt-1">
              {isManager
                ? 'Track and resolve bug reports and feature requests from the team.'
                : 'Report a bug or request a feature. You\'ll be notified when status changes.'}
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0066FF] text-white font-medium hover:bg-blue-700 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Raise a Ticket
          </button>
        </div>

        {/* Tab bar for managers */}
        {isManager && (
          <div className="flex items-center gap-1 border-b border-gray-200 mb-4">
            <button
              onClick={() => setTab('all')}
              className={`px-4 py-2 text-sm font-bold transition-colors border-b-2 -mb-px ${tab === 'all' ? 'border-[#0066FF] text-[#0066FF]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              All Tickets <span className="ml-1 text-xs text-gray-400">{tickets.length}</span>
            </button>
            <button
              onClick={() => setTab('mine')}
              className={`px-4 py-2 text-sm font-bold transition-colors border-b-2 -mb-px ${tab === 'mine' ? 'border-[#0066FF] text-[#0066FF]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              My Tickets <span className="ml-1 text-xs text-gray-400">{tickets.filter(t => t.created_by === me?.id).length}</span>
            </button>
          </div>
        )}

        {/* Status filter pills */}
        <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4 flex flex-wrap gap-2 items-center">
          <Filter className="w-4 h-4 text-gray-400" />
          <button
            onClick={() => setStatusFilter('')}
            className={`px-3 py-1 rounded-md text-xs font-medium border ${statusFilter === '' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
            All
          </button>
          {STATUS_OPTIONS.map(s => (
            <button
              key={s.v}
              onClick={() => setStatusFilter(s.v === statusFilter ? '' : s.v)}
              className={`px-3 py-1 rounded-md text-xs font-medium border ${statusFilter === s.v ? 'bg-gray-900 text-white border-gray-900' : `${STATUS_STYLE[s.v].badge} border-transparent`}`}>
              {s.l} <span className="ml-1 opacity-70">{counts[s.v] || 0}</span>
            </button>
          ))}
        </div>

        {/* Ticket list */}
        {loading ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <Bug className="w-10 h-10 mx-auto text-gray-300 mb-3" />
            <h3 className="font-semibold text-gray-700">No tickets yet</h3>
            <p className="text-sm text-gray-500 mt-1">Found a bug or have an idea? Click "Raise a Ticket" above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(t => {
              const sty = STATUS_STYLE[t.status] || STATUS_STYLE.open
              const Icon = t.kind === 'bug' ? Bug : Lightbulb
              const StatusIcon = sty.icon
              return (
                <div key={t.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden flex">
                  <div className={`w-1 ${sty.bar}`}></div>
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Icon className={`w-4 h-4 ${t.kind === 'bug' ? 'text-rose-600' : 'text-indigo-600'}`} />
                          <span className="font-bold text-gray-900">{t.title}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sty.badge} inline-flex items-center gap-1`}>
                            <StatusIcon className="w-3 h-3" />
                            {t.status_display}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700">
                            {t.kind_display}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap mb-2">{t.description}</p>
                        {t.attachment_url && (
                          <a href={t.attachment_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mb-2">
                            <Paperclip className="w-3 h-3" /> View attachment
                          </a>
                        )}
                        {t.resolution_note && (
                          <div className="mt-2 p-2 bg-gray-50 rounded text-sm text-gray-700">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Resolution note:</span>{' '}
                            {t.resolution_note}
                          </div>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                          Raised by {t.created_by_name} · {new Date(t.created_at).toLocaleDateString()}
                          {t.resolved_at && t.resolved_by_name && (
                            <> · {t.status_display} by {t.resolved_by_name} on {new Date(t.resolved_at).toLocaleDateString()}</>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        {isManager && (
                          <button
                            onClick={() => openReview(t)}
                            className="px-3 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200">
                            Update Status
                          </button>
                        )}
                        {(isManager || (t.created_by === me?.id && t.status === 'open')) && (
                          <button
                            onClick={() => remove(t.id)}
                            className="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-lg hover:bg-red-200 inline-flex items-center gap-1">
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Submit modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Raise a Ticket</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <div className="flex gap-2">
                  {(['bug', 'feature'] as const).map(k => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setForm({ ...form, kind: k })}
                      className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors ${form.kind === k ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {k === 'bug' ? <Bug className="w-4 h-4" /> : <Lightbulb className="w-4 h-4" />}
                      {k === 'bug' ? 'Bug' : 'Feature Request'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
                <input
                  required
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder={form.kind === 'bug' ? 'e.g. Login button does nothing on Safari' : 'e.g. Export reports as PDF'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description *</label>
                <textarea
                  required
                  rows={5}
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder={form.kind === 'bug' ? 'What happened? What did you expect? Steps to reproduce?' : 'What problem would this solve? How should it work?'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Attachment <span className="text-gray-400 font-normal">(optional — screenshot, log, etc.)</span>
                </label>
                <input
                  type="file"
                  onChange={e => setForm({ ...form, attachment: e.target.files?.[0] || null })}
                  className="w-full text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 px-4 py-2 bg-[#0066FF] text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-60">
                  <Send className="w-4 h-4" /> {submitting ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manager review modal */}
      {reviewing && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Update Status</h3>
              <button onClick={() => setReviewing(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="mb-4 bg-gray-50 p-3 rounded-lg text-sm">
              <p className="font-medium text-gray-900">{reviewing.title}</p>
              <p className="text-gray-600 mt-1 text-xs">Raised by {reviewing.created_by_name}</p>
            </div>
            <label className="block text-xs font-medium text-gray-600 mb-1">New status</label>
            <select
              value={reviewStatus}
              onChange={e => setReviewStatus(e.target.value as Ticket['status'])}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3">
              {STATUS_OPTIONS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
            </select>
            <label className="block text-xs font-medium text-gray-600 mb-1">Resolution note <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              rows={3}
              value={reviewNote}
              onChange={e => setReviewNote(e.target.value)}
              placeholder="Visible to the submitter."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setReviewing(null)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={updateStatus} className="px-4 py-2 bg-[#0066FF] text-white rounded-lg font-medium hover:bg-blue-700">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
