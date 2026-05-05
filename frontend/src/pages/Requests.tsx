
import React, { useEffect, useState } from 'react'
import api, { getCached } from '../lib/api'
import { FileText, CheckCircle, XCircle, Clock, IndianRupee, Download, Filter } from 'lucide-react'
import { useAppData } from '../lib/AppDataContext'


export default function Requests() {
    const { data, currentProjectId } = useAppData()
    const [requests, setRequests] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState('all')

    // Modal State
    const [selectedRequest, setSelectedRequest] = useState<any | null>(null)
    const [estimateForm, setEstimateForm] = useState({ cost: '', notes: '' })
    const [showModal, setShowModal] = useState(false)

    async function load() {
        setLoading(true)
        try {
            const res = await api.get('/requests/')
            setRequests((res.data as any).results || res.data || [])
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    const filteredRequests = requests.filter(r => {
        if (currentProjectId && r.project !== currentProjectId) return false
        if (statusFilter === 'all') return true
        return r.status === statusFilter
    })

    function openReview(req: any) {
        setSelectedRequest(req)
        setEstimateForm({
            cost: req.estimated_cost || '',
            notes: req.estimation_notes || ''
        })
        setShowModal(true)
    }

    async function submitEstimate(e: React.FormEvent) {
        e.preventDefault()
        if (!selectedRequest) return

        try {
            await api.post(`/requests/${selectedRequest.id}/estimate/`, {
                estimated_cost: parseFloat(estimateForm.cost),
                estimation_notes: estimateForm.notes
            })
            setShowModal(false)
            load()
        } catch (err: any) {
            alert('Failed to update request')
        }
    }

    async function downloadAll(req: any) {
        try {
            const response = await api.get(`/requests/${req.id}/download_all/`, { responseType: 'blob' })
            const blob = new Blob([response.data], { type: 'application/zip' })
            const link = document.createElement('a')
            link.href = window.URL.createObjectURL(blob)
            link.download = `Request_${req.id}_Files.zip`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
        } catch (e) {
            console.error("Download failed", e)
            alert('Download failed')
        }
    }

    return (
        <div className="p-6 space-y-6 bg-white min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-h3 font-extrabold text-[#0E141C]">Client Requests</h1>
                    <p className="text-gray-1">Review and estimate incoming work requests</p>
                </div>
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-none p-1">
                    {['all', 'pending_review', 'pending_approval', 'approved', 'in_progress', 'completed'].map(s => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`px-3 py-1.5 rounded-none text-sm font-bold transition-colors ${statusFilter === s
                                ? 'bg-blue-50 text-[#0066FF] border-b-2 border-[#0066FF]'
                                : 'text-gray-1 hover:text-[#0E141C] hover:bg-gray-3'
                                }`}
                        >
                            {s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-none border border-gray-200 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-gray-1">Loading requests...</div>
                ) : filteredRequests.length === 0 ? (
                    <div className="p-12 text-center">
                        <FileText className="w-12 h-12 text-gray-2 mx-auto mb-3" />
                        <p className="text-gray-1">No requests found matching filters.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-3 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-4 font-bold text-[#0E141C]">ID</th>
                                    <th className="px-6 py-4 font-bold text-[#0E141C]">Client / Requester</th>
                                    <th className="px-6 py-4 font-bold text-[#0E141C]">Request Details</th>
                                    <th className="px-6 py-4 font-bold text-[#0E141C]">Status</th>
                                    <th className="px-6 py-4 font-bold text-[#0E141C]">Files</th>
                                    <th className="px-6 py-4 font-bold text-[#0E141C] text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredRequests.map(r => (
                                    <tr key={r.id} className="hover:bg-gray-50 transition">
                                        <td className="px-6 py-4 text-gray-1">#{r.id}</td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-[#0E141C]">{r.requester_name}</div>
                                            <div className="text-xs text-gray-1">{r.project_name || 'No Project'}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-[#0E141C]">{r.title || 'Untitled'}</div>
                                            <div className="text-sm text-gray-1 max-w-xs truncate">{r.description}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${getStatusColor(r.status)}`}>
                                                {formatStatus(r.status)}
                                            </span>
                                            {r.estimated_cost && (
                                                <div className="text-xs text-gray-1 mt-1 flex items-center gap-1 font-mono">
                                                    <IndianRupee className="w-3 h-3" /> {r.estimated_cost}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {(r.file_url || (r.files && r.files.length > 0)) ? (
                                                <button
                                                    onClick={() => downloadAll(r)}
                                                    className="inline-flex items-center gap-1 text-sm text-[#0066FF] font-bold hover:underline"
                                                >
                                                    <Download className="w-4 h-4" /> Download All
                                                </button>
                                            ) : <span className="text-gray-2 text-sm">-</span>}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {r.status === 'pending_review' && (
                                                <button
                                                    onClick={() => openReview(r)}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#0066FF] text-white rounded-lg text-sm font-bold hover:bg-[#0066FF]/90 transition shadow-sm"
                                                >
                                                    Review & Estimate
                                                </button>
                                            )}
                                            {r.status !== 'pending_review' && (
                                                <button
                                                    onClick={() => openReview(r)}
                                                    className="text-gray-2 hover:text-[#0E141C] font-bold text-sm"
                                                >
                                                    Edit Details
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showModal && selectedRequest && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg overflow-hidden animate-slideUp">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-3">
                            <h3 className="font-bold text-[#0E141C]">Review Request #{selectedRequest.id}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-2 hover:text-[#0E141C]">
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <h4 className="font-bold text-[#0066FF] mb-1">{selectedRequest.title}</h4>
                                <p className="text-sm text-blue-900">{selectedRequest.description}</p>
                                {selectedRequest.file_url && (
                                    <a href={selectedRequest.file_url} target="_blank" className="inline-block mt-3 text-sm font-bold text-[#0066FF] hover:underline">
                                        Download Attached File
                                    </a>
                                )}
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-center">
                                    <div className="text-xs text-gray-500 font-bold uppercase">Outlets</div>
                                    <div className="text-lg font-extrabold text-[#0E141C]">{selectedRequest.analysis_outlet_count || '-'}</div>
                                </div>
                                <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-center">
                                    <div className="text-xs text-gray-500 font-bold uppercase">Images</div>
                                    <div className="text-lg font-extrabold text-[#0E141C]">{selectedRequest.analysis_image_count || '-'}</div>
                                </div>
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-center">
                                    <div className="text-xs text-blue-600 font-bold uppercase">Auto Estimate</div>
                                    <div className="text-lg font-extrabold text-[#0066FF]">₹{selectedRequest.auto_estimated_cost_inr || '0.00'}</div>
                                </div>
                            </div>

                            <form onSubmit={submitEstimate} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-[#0E141C] mb-1">Estimated Cost (₹)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-2 font-bold">₹</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full pl-9 px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0066FF] focus:border-[#0066FF] font-mono"
                                            placeholder="0.00"
                                            value={estimateForm.cost}
                                            onChange={e => setEstimateForm({ ...estimateForm, cost: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-[#0E141C] mb-1">Estimation Notes / Terms</label>
                                    <textarea
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0066FF] focus:border-[#0066FF]"
                                        rows={4}
                                        placeholder="Explain the scope and cost breakdown..."
                                        value={estimateForm.notes}
                                        onChange={e => setEstimateForm({ ...estimateForm, notes: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="pt-2 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowModal(false)}
                                        className="flex-1 px-4 py-2.5 bg-gray-3 text-[#0E141C] rounded-lg font-bold hover:bg-gray-200 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 px-4 py-2.5 bg-[#0066FF] text-white rounded-lg font-bold hover:bg-[#0066FF]/90 transition-colors shadow-lg shadow-blue-200/50"
                                    >
                                        Submit Estimate
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function getStatusColor(status: string) {
    switch (status) {
        case 'pending_review': return 'bg-yellow-100 text-yellow-800'
        case 'pending_approval': return 'bg-orange-100 text-orange-800'
        case 'approved': return 'bg-blue-100 text-blue-800'
        case 'in_progress': return 'bg-indigo-100 text-indigo-800'
        case 'completed': return 'bg-green-100 text-green-800'
        case 'rejected': return 'bg-red-100 text-red-800'
        default: return 'bg-gray-100 text-gray-800'
    }
}

function formatStatus(status: string) {
    return status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}
