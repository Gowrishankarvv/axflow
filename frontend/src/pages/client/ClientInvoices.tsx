
import React, { useState, useEffect } from 'react'
import { FileTextIcon, DownloadIcon } from 'lucide-react'
import api from '../../lib/api'

export default function ClientInvoices() {
    const [invoices, setInvoices] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchInvoices()
    }, [])

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

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
                <p className="text-gray-500">View and download your monthly invoices</p>
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
                                <th className="px-6 py-4 font-semibold text-gray-700">Billing Period</th>
                                <th className="px-6 py-4 font-semibold text-gray-700">Project</th>
                                <th className="px-6 py-4 font-semibold text-gray-700">Date Uploaded</th>
                                <th className="px-6 py-4 font-semibold text-gray-700 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {invoices.map(inv => (
                                <tr key={inv.id} className="hover:bg-gray-50 transition">
                                    <td className="px-6 py-4 text-gray-900 font-medium">
                                        {new Date(inv.billing_period).toLocaleDateString('default', { month: 'long', year: 'numeric' })}
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        {inv.project || 'All Projects'}
                                    </td>
                                    <td className="px-6 py-4 text-gray-500">
                                        {new Date(inv.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {inv.file_url && (
                                            <a
                                                href={inv.file_url}
                                                target="_blank"
                                                className="inline-flex items-center gap-2 px-3 py-1.5 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition font-medium text-sm"
                                            >
                                                <DownloadIcon className="w-4 h-4" /> Download PDF
                                            </a>
                                        )}
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
