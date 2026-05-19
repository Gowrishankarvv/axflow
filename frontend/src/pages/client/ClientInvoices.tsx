import React, { useState, useEffect } from 'react'
import { FileTextIcon, DownloadIcon, CheckCircle } from 'lucide-react'
import api from '../../lib/api'

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

export default function ClientInvoices() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)

  useEffect(() => { fetchInvoices() }, [])

  async function fetchInvoices() {
    try {
      const { data } = await api.get('/invoices/', { params: { page_size: 200 } })
      setInvoices((data as any).results || data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
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

  async function markPaid(inv: any) {
    if (!window.confirm(`Confirm you have paid invoice ${inv.invoice_number}?`)) return
    setBusyId(inv.id)
    try {
      await api.post(`/invoices/${inv.id}/mark-paid/`)
      fetchInvoices()
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Failed to update invoice')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-6 w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        <p className="text-gray-500">View, download and settle your invoices</p>
      </div>

      {loading ? (
        <div className="text-center py-10">Loading invoices...</div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <FileTextIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No invoices found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-gray-700">Invoice #</th>
                <th className="px-6 py-4 font-semibold text-gray-700">Project</th>
                <th className="px-6 py-4 font-semibold text-gray-700 text-right">Amount</th>
                <th className="px-6 py-4 font-semibold text-gray-700">Status</th>
                <th className="px-6 py-4 font-semibold text-gray-700 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50 transition">
                  <td className="px-6 py-4 text-gray-900 font-medium">{inv.invoice_number}</td>
                  <td className="px-6 py-4 text-gray-600">{inv.project_name || '—'}</td>
                  <td className="px-6 py-4 text-right font-semibold text-gray-900">
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
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-neutral-900 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition font-medium text-sm"
                      >
                        <DownloadIcon className="w-4 h-4" /> Download
                      </button>
                      {inv.status === 'requested' && (
                        <button
                          onClick={() => markPaid(inv)}
                          disabled={busyId === inv.id}
                          className="inline-flex items-center gap-1 text-sm bg-neutral-900 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-neutral-800 disabled:opacity-60 transition-colors"
                        >
                          <CheckCircle className="w-4 h-4" />
                          {busyId === inv.id ? 'Working…' : 'Mark as Paid'}
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
  )
}
