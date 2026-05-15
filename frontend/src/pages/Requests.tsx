
import React, { useEffect, useState } from 'react'
import api, { getCached } from '../lib/api'
import { FileText, CheckCircle, XCircle, Clock, IndianRupee, Download, Calendar, AlertTriangle, ClockIcon } from 'lucide-react'
import { useAppData } from '../lib/AppDataContext'

type ExtensionRequest = {
    id: number
    task: number
    task_title: string
    project_id: number
    project_name: string
    requester: number
    requester_name: string
    current_due_date: string | null
    requested_due_date: string
    reason: string
    status: 'pending' | 'approved' | 'rejected'
    decided_by: number | null
    decided_by_name: string | null
    decided_at: string | null
    decision_note: string
    created_at: string
}


type Leave = {
    id: number
    user: number
    user_name: string
    start_date: string
    end_date: string
    reason: string
    status: 'pending' | 'approved' | 'rejected' | 'cancelled'
    leave_type: '' | 'casual' | 'medical' | 'emergency'
    is_salary_cut: boolean | null
    rejection_reason: string
    total_days: number
    created_at: string
}

export default function Requests() {
    const { data, currentProjectId } = useAppData()
    const me = data?.me
    const isManagerOrSuper = me?.role === 'manager' || me?.role === 'superuser'

    const [activeTab, setActiveTab] = useState<'data' | 'leave' | 'extension'>('data')
    const [requests, setRequests] = useState<any[]>([])
    const [leaves, setLeaves] = useState<Leave[]>([])
    const [extensions, setExtensions] = useState<ExtensionRequest[]>([])
    const [loading, setLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState('all')

    // Extension review modal state
    const [reviewingExtension, setReviewingExtension] = useState<ExtensionRequest | null>(null)
    const [extensionAction, setExtensionAction] = useState<'approve' | 'reject' | null>(null)
    const [extensionNote, setExtensionNote] = useState('')

    // Data-request modal state
    const [selectedRequest, setSelectedRequest] = useState<any | null>(null)
    const [estimateForm, setEstimateForm] = useState({ cost: '', notes: '' })
    const [showModal, setShowModal] = useState(false)

    // Leave approval/rejection modal state
    const [reviewingLeave, setReviewingLeave] = useState<Leave | null>(null)
    const [leaveAction, setLeaveAction] = useState<'approve' | 'reject' | null>(null)
    const [approveForm, setApproveForm] = useState<{ leave_type: 'casual' | 'medical' | 'emergency', is_salary_cut: boolean, approval_note: string }>({
        leave_type: 'casual', is_salary_cut: false, approval_note: ''
    })
    const [rejectReason, setRejectReason] = useState('')
    const [monthUsage, setMonthUsage] = useState<{ approved_days_in_month: number, remaining_free: number } | null>(null)

    async function load() {
        setLoading(true)
        try {
            const tasks: Promise<any>[] = [api.get('/requests/').then(r => {
                setRequests((r.data as any).results || r.data || [])
            })]
            if (isManagerOrSuper) {
                tasks.push(api.get('/leaves/').then(r => {
                    const payload: any = r.data
                    setLeaves(payload.results || payload || [])
                }))
            }
            // Extension requests are visible to everyone -- managers see all,
            // employees see their own.
            tasks.push(api.get('/extension-requests/').then(r => {
                const payload: any = r.data
                setExtensions(payload.results || payload || [])
            }).catch(() => { /* non-fatal */ }))
            await Promise.all(tasks)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    async function decideExtension() {
        if (!reviewingExtension || !extensionAction) return
        try {
            const url = `/extension-requests/${reviewingExtension.id}/${extensionAction}/`
            const res = await api.post(url, { decision_note: extensionNote })
            setExtensions(prev => prev.map(x => x.id === reviewingExtension.id ? (res.data as ExtensionRequest) : x))
            setReviewingExtension(null)
            setExtensionAction(null)
            setExtensionNote('')
        } catch (e: any) {
            alert('Failed: ' + (e?.response?.data ? JSON.stringify(e.response.data) : e.message))
        }
    }

    useEffect(() => { load() }, [isManagerOrSuper])

    const filteredRequests = requests.filter(r => {
        if (currentProjectId && r.project !== currentProjectId) return false
        if (statusFilter === 'all') return true
        return r.status === statusFilter
    })

    const pendingLeaves = leaves.filter(l => l.status === 'pending')
    const decidedLeaves = leaves.filter(l => l.status !== 'pending')
    const pendingExtensions = extensions.filter(e => e.status === 'pending')
    const decidedExtensions = extensions.filter(e => e.status !== 'pending')

    function openReview(req: any) {
        setSelectedRequest(req)
        setEstimateForm({ cost: req.estimated_cost || '', notes: req.estimation_notes || '' })
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
            alert('Download failed')
        }
    }

    async function openLeaveReview(leave: Leave, action: 'approve' | 'reject') {
        setReviewingLeave(leave)
        setLeaveAction(action)
        setRejectReason('')
        setMonthUsage(null)
        if (action === 'approve') {
            // Fetch current-month usage to suggest a salary-cut default
            const month = new Date(leave.start_date)
            try {
                const res = await getCached('/leaves/month_usage/', {
                    params: { user_id: leave.user, year: month.getFullYear(), month: month.getMonth() + 1 }
                })
                const usage = res.data as any
                setMonthUsage(usage)
                // Default: salary cut = true if user has already used their 1 free day this month
                setApproveForm({
                    leave_type: 'casual',
                    is_salary_cut: usage.approved_days_in_month >= 1,
                    approval_note: ''
                })
            } catch {
                setApproveForm({ leave_type: 'casual', is_salary_cut: false, approval_note: '' })
            }
        }
    }

    async function submitApprove(e: React.FormEvent) {
        e.preventDefault()
        if (!reviewingLeave) return
        try {
            await api.post(`/leaves/${reviewingLeave.id}/approve/`, approveForm)
            setReviewingLeave(null)
            setLeaveAction(null)
            await load()
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Failed to approve')
        }
    }

    async function submitReject(e: React.FormEvent) {
        e.preventDefault()
        if (!reviewingLeave) return
        if (!rejectReason.trim()) { alert('Please enter a rejection reason.'); return }
        try {
            await api.post(`/leaves/${reviewingLeave.id}/reject/`, { rejection_reason: rejectReason })
            setReviewingLeave(null)
            setLeaveAction(null)
            await load()
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Failed to reject')
        }
    }

    return (
        <div className="p-6 space-y-6 bg-white min-h-screen">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-h3 font-extrabold text-[#0E141C]">Requests</h1>
                    <p className="text-gray-1">Review incoming requests from clients and employees.</p>
                </div>
            </div>

            {/* Tab bar — only shown to managers/superusers (others only see data requests anyway) */}
            <div className="flex gap-1 border-b border-gray-200">
                <TabButton active={activeTab === 'data'} onClick={() => setActiveTab('data')}>
                    Data Requests
                </TabButton>
                {isManagerOrSuper && (
                    <TabButton active={activeTab === 'leave'} onClick={() => setActiveTab('leave')}>
                        <span className="flex items-center gap-2">
                            Leave Requests
                            {pendingLeaves.length > 0 && (
                                <span className="bg-red-600 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingLeaves.length}</span>
                            )}
                        </span>
                    </TabButton>
                )}
                <TabButton active={activeTab === 'extension'} onClick={() => setActiveTab('extension')}>
                    <span className="flex items-center gap-2">
                        Extension Requests
                        {isManagerOrSuper && pendingExtensions.length > 0 && (
                            <span className="bg-red-600 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingExtensions.length}</span>
                        )}
                    </span>
                </TabButton>
            </div>

            {activeTab === 'data' && (
                <DataRequestsView
                    loading={loading}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    filteredRequests={filteredRequests}
                    openReview={openReview}
                    downloadAll={downloadAll}
                />
            )}

            {activeTab === 'leave' && isManagerOrSuper && (
                <LeaveRequestsView
                    loading={loading}
                    pending={pendingLeaves}
                    decided={decidedLeaves}
                    onApprove={(l) => openLeaveReview(l, 'approve')}
                    onReject={(l) => openLeaveReview(l, 'reject')}
                />
            )}

            {activeTab === 'extension' && (
                <ExtensionRequestsView
                    loading={loading}
                    pending={pendingExtensions}
                    decided={decidedExtensions}
                    isManager={isManagerOrSuper}
                    onApprove={(e) => { setReviewingExtension(e); setExtensionAction('approve'); setExtensionNote('') }}
                    onReject={(e) => { setReviewingExtension(e); setExtensionAction('reject'); setExtensionNote('') }}
                />
            )}

            {/* Extension review modal */}
            {reviewingExtension && extensionAction && (
                <ExtensionReviewModal
                    ext={reviewingExtension}
                    action={extensionAction}
                    note={extensionNote}
                    setNote={setExtensionNote}
                    onClose={() => { setReviewingExtension(null); setExtensionAction(null) }}
                    onSubmit={decideExtension}
                />
            )}

            {/* Data request modal */}
            {showModal && selectedRequest && (
                <DataRequestModal
                    selectedRequest={selectedRequest}
                    estimateForm={estimateForm}
                    setEstimateForm={setEstimateForm}
                    onClose={() => setShowModal(false)}
                    onSubmit={submitEstimate}
                />
            )}

            {/* Leave approve modal */}
            {reviewingLeave && leaveAction === 'approve' && (
                <ApproveLeaveModal
                    leave={reviewingLeave}
                    form={approveForm}
                    setForm={setApproveForm}
                    monthUsage={monthUsage}
                    onClose={() => { setReviewingLeave(null); setLeaveAction(null) }}
                    onSubmit={submitApprove}
                />
            )}

            {/* Leave reject modal */}
            {reviewingLeave && leaveAction === 'reject' && (
                <RejectLeaveModal
                    leave={reviewingLeave}
                    reason={rejectReason}
                    setReason={setRejectReason}
                    onClose={() => { setReviewingLeave(null); setLeaveAction(null) }}
                    onSubmit={submitReject}
                />
            )}
        </div>
    )
}

function TabButton({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`px-4 py-2 text-sm font-bold transition-colors border-b-2 -mb-px ${active ? 'border-[#0066FF] text-[#0066FF]' : 'border-transparent text-gray-1 hover:text-[#0E141C]'}`}
        >
            {children}
        </button>
    )
}

// ---------------- Data Requests View (the original UI, extracted) ----------------

function DataRequestsView({
    loading, statusFilter, setStatusFilter, filteredRequests, openReview, downloadAll
}: any) {
    return (
        <>
            <div className="flex items-center gap-2 bg-white border border-gray-200 p-1">
                {['all', 'pending_review', 'pending_approval', 'approved', 'in_progress', 'completed'].map((s: string) => (
                    <button
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className={`px-3 py-1.5 text-sm font-bold transition-colors ${statusFilter === s
                            ? 'bg-blue-50 text-[#0066FF] border-b-2 border-[#0066FF]'
                            : 'text-gray-1 hover:text-[#0E141C] hover:bg-gray-3'
                            }`}
                    >
                        {s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </button>
                ))}
            </div>

            <div className="bg-white border border-gray-200 shadow-sm overflow-hidden">
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
                                {filteredRequests.map((r: any) => (
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
        </>
    )
}

// ---------------- Leave Requests View ----------------

function LeaveRequestsView({ loading, pending, decided, onApprove, onReject }: {
    loading: boolean,
    pending: Leave[],
    decided: Leave[],
    onApprove: (l: Leave) => void,
    onReject: (l: Leave) => void,
}) {
    if (loading) {
        return <div className="p-12 text-center text-gray-1">Loading leave requests...</div>
    }
    return (
        <div className="space-y-6">
            <section>
                <h2 className="text-sm font-bold text-[#0E141C] uppercase tracking-wide mb-3 flex items-center gap-2">
                    Pending Approval
                    {pending.length > 0 && (
                        <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full">{pending.length}</span>
                    )}
                </h2>
                {pending.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-gray-200 rounded-xl text-gray-1">
                        No pending leave requests. 🎉
                    </div>
                ) : (
                    <div className="space-y-3">
                        {pending.map(l => (
                            <LeaveCard
                                key={l.id}
                                leave={l}
                                actions={(
                                    <>
                                        <button
                                            onClick={() => onApprove(l)}
                                            className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700"
                                        >
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => onReject(l)}
                                            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700"
                                        >
                                            Reject
                                        </button>
                                    </>
                                )}
                            />
                        ))}
                    </div>
                )}
            </section>

            <section>
                <h2 className="text-sm font-bold text-[#0E141C] uppercase tracking-wide mb-3">Recent decisions</h2>
                {decided.length === 0 ? (
                    <div className="p-6 text-center text-gray-1 border border-dashed border-gray-200 rounded-xl">No decisions yet.</div>
                ) : (
                    <div className="space-y-2">
                        {decided.slice(0, 20).map(l => (
                            <LeaveCard key={l.id} leave={l} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}

function LeaveCard({ leave, actions }: { leave: Leave, actions?: React.ReactNode }) {
    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[#0E141C]">{leave.user_name}</span>
                        <span className="text-sm text-gray-1">·</span>
                        <span className="text-sm text-gray-1">{leave.start_date} → {leave.end_date}</span>
                        <span className="text-xs text-gray-2">({leave.total_days} day{leave.total_days === 1 ? '' : 's'})</span>
                        <LeaveStatusBadge status={leave.status} />
                        {leave.status === 'approved' && leave.leave_type && (
                            <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full capitalize">{leave.leave_type}</span>
                        )}
                        {leave.status === 'approved' && leave.is_salary_cut && (
                            <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <IndianRupee className="w-3 h-3" /> Salary cut
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{leave.reason}</p>
                    {leave.status === 'rejected' && leave.rejection_reason && (
                        <div className="mt-2 text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2">
                            <span className="font-semibold">Rejected:</span> {leave.rejection_reason}
                        </div>
                    )}
                </div>
                {actions && <div className="flex gap-2 items-start">{actions}</div>}
            </div>
        </div>
    )
}

function LeaveStatusBadge({ status }: { status: string }) {
    const variants: Record<string, { className: string, icon: any, label: string }> = {
        pending: { className: 'bg-yellow-50 text-yellow-700', icon: Clock, label: 'Pending' },
        approved: { className: 'bg-green-50 text-green-700', icon: CheckCircle, label: 'Approved' },
        rejected: { className: 'bg-red-50 text-red-700', icon: XCircle, label: 'Rejected' },
        cancelled: { className: 'bg-gray-100 text-gray-600', icon: XCircle, label: 'Cancelled' },
    }
    const v = variants[status] || variants.pending
    const I = v.icon
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${v.className}`}>
            <I className="w-3 h-3" /> {v.label}
        </span>
    )
}

// ---------------- Modals ----------------

function DataRequestModal({ selectedRequest, estimateForm, setEstimateForm, onClose, onSubmit }: any) {
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg overflow-hidden animate-slideUp">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-3">
                    <h3 className="font-bold text-[#0E141C]">Review Request #{selectedRequest.id}</h3>
                    <button onClick={onClose} className="text-gray-2 hover:text-[#0E141C]">
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
                    <form onSubmit={onSubmit} className="space-y-4">
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
                            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 bg-gray-3 text-[#0E141C] rounded-lg font-bold hover:bg-gray-200 transition-colors">
                                Cancel
                            </button>
                            <button type="submit" className="flex-1 px-4 py-2.5 bg-[#0066FF] text-white rounded-lg font-bold hover:bg-[#0066FF]/90 transition-colors shadow-lg shadow-blue-200/50">
                                Submit Estimate
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

function ApproveLeaveModal({ leave, form, setForm, monthUsage, onClose, onSubmit }: any) {
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-green-50">
                    <h3 className="font-bold text-green-900 flex items-center gap-2"><CheckCircle className="w-5 h-5" /> Approve Leave</h3>
                    <button onClick={onClose}><XCircle className="w-5 h-5 text-gray-500 hover:text-gray-800" /></button>
                </div>
                <form onSubmit={onSubmit} className="p-5 space-y-4">
                    <div className="text-sm space-y-1">
                        <div><span className="text-gray-500">Employee:</span> <span className="font-medium">{leave.user_name}</span></div>
                        <div><span className="text-gray-500">Dates:</span> <span className="font-medium">{leave.start_date} → {leave.end_date}</span> <span className="text-gray-400">({leave.total_days} day{leave.total_days === 1 ? '' : 's'})</span></div>
                        <div className="text-gray-700 mt-2 bg-gray-50 p-2 rounded">{leave.reason}</div>
                    </div>

                    {monthUsage && (
                        <div className="text-xs bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-3 py-2 flex items-center gap-2">
                            <Calendar className="w-4 h-4 flex-shrink-0" />
                            <span>
                                Approved this month so far: <b>{monthUsage.approved_days_in_month}</b>.
                                Free quota remaining: <b>{monthUsage.remaining_free}</b>.
                            </span>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Leave type</label>
                        <select
                            value={form.leave_type}
                            onChange={e => setForm({ ...form, leave_type: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            required
                        >
                            <option value="casual">Casual</option>
                            <option value="medical">Medical</option>
                            <option value="emergency">Emergency</option>
                        </select>
                    </div>

                    <div>
                        <label className="flex items-start gap-2 cursor-pointer text-sm">
                            <input
                                type="checkbox"
                                checked={form.is_salary_cut}
                                onChange={e => setForm({ ...form, is_salary_cut: e.target.checked })}
                                className="mt-1"
                            />
                            <span>
                                <span className="font-medium text-gray-900 flex items-center gap-1">
                                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                                    Mark as salary-cut leave
                                </span>
                                <span className="text-xs text-gray-500 block mt-0.5">
                                    Default checked if this user already used their 1 free day this month.
                                </span>
                            </span>
                        </label>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
                        <textarea
                            value={form.approval_note}
                            onChange={e => setForm({ ...form, approval_note: e.target.value })}
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g. Approved with conditions…"
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">Approve</button>
                    </div>
                </form>
            </div>
        </div>
    )
}

function RejectLeaveModal({ leave, reason, setReason, onClose, onSubmit }: any) {
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-red-50">
                    <h3 className="font-bold text-red-900 flex items-center gap-2"><XCircle className="w-5 h-5" /> Reject Leave</h3>
                    <button onClick={onClose}><XCircle className="w-5 h-5 text-gray-500 hover:text-gray-800" /></button>
                </div>
                <form onSubmit={onSubmit} className="p-5 space-y-4">
                    <div className="text-sm space-y-1">
                        <div><span className="text-gray-500">Employee:</span> <span className="font-medium">{leave.user_name}</span></div>
                        <div><span className="text-gray-500">Dates:</span> <span className="font-medium">{leave.start_date} → {leave.end_date}</span></div>
                        <div className="text-gray-700 mt-2 bg-gray-50 p-2 rounded">{leave.reason}</div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Rejection reason (required)</label>
                        <textarea
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                            placeholder="Explain why this leave can't be granted…"
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Reject</button>
                    </div>
                </form>
            </div>
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

function ExtensionRequestsView({
    loading, pending, decided, isManager, onApprove, onReject,
}: {
    loading: boolean
    pending: ExtensionRequest[]
    decided: ExtensionRequest[]
    isManager: boolean
    onApprove: (e: ExtensionRequest) => void
    onReject: (e: ExtensionRequest) => void
}) {
    if (loading) {
        return <div className="bg-white rounded-xl p-8 text-center text-gray-1">Loading extension requests…</div>
    }
    if (pending.length === 0 && decided.length === 0) {
        return (
            <div className="bg-white rounded-xl p-8 text-center text-gray-1">
                <ClockIcon className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                <p>No extension requests yet.</p>
                <p className="text-xs mt-1">Assignees can submit extensions from the project page.</p>
            </div>
        )
    }
    return (
        <div className="space-y-6">
            {pending.length > 0 && (
                <div>
                    <h2 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Pending {isManager && `(${pending.length})`}</h2>
                    <div className="space-y-2">
                        {pending.map(e => (
                            <ExtensionRow key={e.id} ext={e} isManager={isManager} onApprove={onApprove} onReject={onReject} />
                        ))}
                    </div>
                </div>
            )}
            {decided.length > 0 && (
                <div>
                    <h2 className="text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">History</h2>
                    <div className="space-y-2">
                        {decided.map(e => (
                            <ExtensionRow key={e.id} ext={e} isManager={isManager} onApprove={onApprove} onReject={onReject} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

function ExtensionRow({
    ext, isManager, onApprove, onReject,
}: {
    ext: ExtensionRequest
    isManager: boolean
    onApprove: (e: ExtensionRequest) => void
    onReject: (e: ExtensionRequest) => void
}) {
    const badge =
        ext.status === 'pending' ? 'bg-amber-100 text-amber-800'
        : ext.status === 'approved' ? 'bg-emerald-100 text-emerald-800'
        : 'bg-rose-100 text-rose-800'
    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-[#0E141C]">{ext.task_title}</span>
                    <span className="text-xs text-gray-500">· {ext.project_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge}`}>
                        {formatStatus(ext.status)}
                    </span>
                </div>
                <div className="text-sm text-gray-700">
                    <span className="text-gray-500">Requested by</span> <strong>{ext.requester_name}</strong>{' '}
                    <span className="text-gray-500">·</span>{' '}
                    <span className="text-gray-500">From</span> {ext.current_due_date || '—'}{' '}
                    <span className="text-gray-500">→ To</span> <strong>{ext.requested_due_date}</strong>
                </div>
                {ext.reason && <p className="text-sm text-gray-600 mt-1 italic">"{ext.reason}"</p>}
                {ext.status !== 'pending' && ext.decided_by_name && (
                    <p className="text-xs text-gray-500 mt-1">
                        {formatStatus(ext.status)} by {ext.decided_by_name}
                        {ext.decision_note && ` — "${ext.decision_note}"`}
                    </p>
                )}
            </div>
            {isManager && ext.status === 'pending' && (
                <div className="flex gap-2 flex-shrink-0">
                    <button
                        onClick={() => onApprove(ext)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
                        Approve
                    </button>
                    <button
                        onClick={() => onReject(ext)}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700">
                        Reject
                    </button>
                </div>
            )}
        </div>
    )
}

function ExtensionReviewModal({
    ext, action, note, setNote, onClose, onSubmit,
}: {
    ext: ExtensionRequest
    action: 'approve' | 'reject'
    note: string
    setNote: (s: string) => void
    onClose: () => void
    onSubmit: () => void
}) {
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6">
                <h3 className="text-lg font-bold mb-1">
                    {action === 'approve' ? 'Approve extension' : 'Reject extension'}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                    Task: <strong>{ext.task_title}</strong><br />
                    From <strong>{ext.current_due_date || '—'}</strong> to <strong>{ext.requested_due_date}</strong>
                </p>
                <label className="block text-sm font-medium mb-1">
                    Note <span className="text-gray-400 text-xs">(optional)</span>
                </label>
                <textarea
                    rows={3}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
                    placeholder={action === 'approve' ? 'Anything to communicate to the assignee?' : 'Why is this being rejected?'} />
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
                    <button
                        onClick={onSubmit}
                        className={`px-4 py-2 text-white rounded-lg font-medium ${action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                        {action === 'approve' ? 'Approve' : 'Reject'}
                    </button>
                </div>
            </div>
        </div>
    )
}
