import React, { useEffect, useMemo, useState } from 'react'
import api from '../lib/api'
import { FileTextIcon, PlusIcon, DownloadIcon, XCircleIcon, Trash2, CheckCircle } from 'lucide-react'

type Item = { description: string; quantity: string; rate: string }

const STATUS_BADGE: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-800',
  paid: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
}

const STATUS_LABEL: Record<string, string> = {
  requested: 'Payment Requested',
  paid: 'Marked Paid',
  completed: 'Completed',
}

const money = (n: any, ccy = 'INR') =>
  `${ccy === 'INR' ? '₹' : ccy + ' '}${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

export default function Invoices() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const [form, setForm] = useState({
    client: '',
    project: '',
    currency: 'INR',
    due_date: '',
    notes: '',
  })
  const [items, setItems] = useState<Item[]>([{ description: '', quantity: '1', rate: '' }])

  const total = useMemo(
    () => items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.rate) || 0), 0),
    [items]
  )

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [invRes, clientsRes] = await Promise.all([
        api.get('/invoices/'),
        api.get('/clients/'),
      ])
      setInvoices(invRes.data.results || invRes.data || [])
      setClients(clientsRes.data.results || clientsRes.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function fetchProjects(clientId: string) {
    if (!clientId) { setProjects([]); return }
    try {
      const res = await api.get('/projects/?page_size=1000')
      const all = res.data.results || res.data || []
      setProjects(all.filter((p: any) => p.client === parseInt(clientId)))
    } catch (e) { console.error(e) }
  }

  const setItem = (i: number, key: keyof Item, val: string) =>
    setItems(prev => prev.map((it, idx) => (idx === i ? { ...it, [key]: val } : it)))
  const addItem = () => setItems(prev => [...prev, { description: '', quantity: '1', rate: '' }])
  const removeItem = (i: number) =>
    setItems(prev => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.client) { alert('Select a client'); return }
    const cleanItems = items
      .filter(it => it.description.trim() && Number(it.rate) > 0)
      .map(it => ({ description: it.description.trim(), quantity: Number(it.quantity) || 1, rate: Number(it.rate) }))
    if (cleanItems.length === 0) { alert('Add at least one line item with a description and rate'); return }

    setSubmitting(true)
    try {
      await api.post('/invoices/', {
        client: Number(form.client),
        project: form.project ? Number(form.project) : null,
        currency: form.currency,
        due_date: form.due_date || null,
        notes: form.notes,
        items: cleanItems,
      })
      setShowModal(false)
      setForm({ client: '', project: '', currency: 'INR', due_date: '', notes: '' })
      setItems([{ description: '', quantity: '1', rate: '' }])
      loadData()
    } catch (e: any) {
      console.error(e)
      alert(e?.response?.data?.detail || 'Failed to generate invoice')
    } finally {
      setSubmitting(false)
    }
  }

  async function downloadInvoice(inv: any) {
    try {
      const res = await api.get(`/invoices/${inv.id}/download/`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${inv.invoice_number || 'invoice'}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert('Failed to download invoice')
    }
  }

  async function markCompleted(inv: any) {
    if (!window.confirm(`Mark invoice ${inv.invoice_number} as completed? This posts the income.`)) return
    setBusyId(inv.id)
    try {
      await api.post(`/invoices/${inv.id}/mark-completed/`)
      loadData()
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Failed to complete invoice')
    } finally {
      setBusyId(null)
    }
  }

  const handleClientChange = (clientId: string) => {
    setForm({ ...form, client: clientId, project: '' })
    fetchProjects(clientId)
  }

  const visible = invoices.filter(i => statusFilter === 'all' || i.status === statusFilter)

  return (
    <div className="p-6 w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h3 font-extrabold text-[#0E141C]">Manage Invoices</h1>
          <p className="text-gray-1">Generate, deliver and track client invoices</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-6 py-3 bg-neutral-900 text-white font-bold rounded-lg hover:bg-neutral-800 transition shadow-sm"
        >
          <PlusIcon className="w-5 h-5" />
          Generate Invoice
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {['all', 'requested', 'paid', 'completed'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${statusFilter === s
              ? 'bg-neutral-900 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
          >
            {s === 'all' ? 'All' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-1">Loading invoices...</div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center">
            <FileTextIcon className="w-12 h-12 text-gray-2 mx-auto mb-3" />
            <p className="text-gray-1">No invoices found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 font-bold text-[#0E141C]">Invoice #</th>
                  <th className="px-6 py-4 font-bold text-[#0E141C]">Client</th>
                  <th className="px-6 py-4 font-bold text-[#0E141C]">Project</th>
                  <th className="px-6 py-4 font-bold text-[#0E141C] text-right">Amount</th>
                  <th className="px-6 py-4 font-bold text-[#0E141C]">Status</th>
                  <th className="px-6 py-4 font-bold text-[#0E141C] text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visible.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 font-medium text-[#0E141C]">{inv.invoice_number}</td>
                    <td className="px-6 py-4 text-gray-1">
                      {inv.client_name || clients.find(c => c.id === inv.client)?.name || `Client #${inv.client}`}
                    </td>
                    <td className="px-6 py-4 text-gray-1">{inv.project_name || '—'}</td>
                    <td className="px-6 py-4 text-right font-semibold text-[#0E141C]">
                      {money(inv.total, inv.currency)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[inv.status] || 'bg-gray-100 text-gray-700'}`}>
                        {STATUS_LABEL[inv.status] || inv.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => downloadInvoice(inv)}
                          className="inline-flex items-center gap-1 text-sm text-neutral-900 font-bold hover:underline"
                        >
                          <DownloadIcon className="w-4 h-4" /> Download
                        </button>
                        {inv.status === 'paid' && (
                          <button
                            onClick={() => markCompleted(inv)}
                            disabled={busyId === inv.id}
                            className="inline-flex items-center gap-1 text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-green-700 disabled:opacity-60 transition-colors"
                          >
                            <CheckCircle className="w-4 h-4" />
                            {busyId === inv.id ? 'Working…' : 'Mark Completed'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
              <h3 className="font-bold text-[#0E141C]">Generate Invoice</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-2 hover:text-[#0E141C]">
                <XCircleIcon className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[#0E141C] mb-1">Client</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-neutral-400"
                    value={form.client}
                    onChange={e => handleClientChange(e.target.value)}
                    required
                  >
                    <option value="">Select Client</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#0E141C] mb-1">Project (optional)</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-neutral-400"
                    value={form.project}
                    onChange={e => setForm({ ...form, project: e.target.value })}
                    disabled={!form.client}
                  >
                    <option value="">None</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#0E141C] mb-1">Currency</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-neutral-400"
                    value={form.currency}
                    onChange={e => setForm({ ...form, currency: e.target.value })}
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#0E141C] mb-1">Due date (optional)</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-neutral-400"
                    value={form.due_date}
                    onChange={e => setForm({ ...form, due_date: e.target.value })}
                  />
                </div>
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-bold text-[#0E141C]">Line items</label>
                  <button type="button" onClick={addItem} className="text-sm text-neutral-900 font-medium hover:underline inline-flex items-center gap-1">
                    <PlusIcon className="w-4 h-4" /> Add item
                  </button>
                </div>
                <div className="space-y-2">
                  {items.map((it, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-neutral-400"
                        placeholder="Description"
                        value={it.description}
                        onChange={e => setItem(i, 'description', e.target.value)}
                      />
                      <input
                        type="number" min="0" step="0.01"
                        className="w-20 px-2 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-neutral-400"
                        placeholder="Qty"
                        value={it.quantity}
                        onChange={e => setItem(i, 'quantity', e.target.value)}
                      />
                      <input
                        type="number" min="0" step="0.01"
                        className="w-28 px-2 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-neutral-400"
                        placeholder="Rate"
                        value={it.rate}
                        onChange={e => setItem(i, 'rate', e.target.value)}
                      />
                      <span className="w-24 text-right text-sm text-gray-600">
                        {money((Number(it.quantity) || 0) * (Number(it.rate) || 0), form.currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="text-gray-400 hover:text-red-600 disabled:opacity-30"
                        disabled={items.length === 1}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
                  <span className="font-bold text-[#0E141C]">Total: {money(total, form.currency)}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-[#0E141C] mb-1">Notes (optional)</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-neutral-400"
                  rows={2}
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 text-[#0E141C] bg-gray-100 hover:bg-gray-200 rounded-lg font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-neutral-900 text-white rounded-lg font-bold hover:bg-neutral-800 transition disabled:opacity-70"
                >
                  {submitting ? 'Generating…' : 'Generate & Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
