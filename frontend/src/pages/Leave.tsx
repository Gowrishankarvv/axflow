import React, { useEffect, useState } from 'react'
import api, { getCached } from '../lib/api'
import { Calendar, Plus, X, CheckCircle, XCircle, Clock, AlertTriangle, IndianRupee } from 'lucide-react'

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
    approval_note: string
    rejection_reason: string
    decided_by_name: string | null
    decided_at: string | null
    total_days: number
    created_at: string
}

type Summary = {
    by_status: Record<string, number>
    approved_days_by_type: Record<string, number>
    salary_cut_days_total: number
    salary_cut_leaves: Array<{
        id: number
        start_date: string
        end_date: string
        days: number
        leave_type: string
        reason: string
    }>
}

export default function LeavePage() {
    const [activeTab, setActiveTab] = useState<'leaves' | 'salary_cut'>('leaves')
    const [myLeaves, setMyLeaves] = useState<Leave[]>([])
    const [summary, setSummary] = useState<Summary | null>(null)
    const [loading, setLoading] = useState(true)
    const [showApplyModal, setShowApplyModal] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [form, setForm] = useState({ start_date: '', end_date: '', reason: '' })
    const [formError, setFormError] = useState<string | null>(null)

    async function load() {
        setLoading(true)
        try {
            const [leavesRes, summaryRes] = await Promise.all([
                getCached('/leaves/', { params: { user_id: 'me' } }),
                getCached('/leaves/summary/', { params: { user_id: 'me' } }),
            ])
            const leavesPayload: any = leavesRes.data
            setMyLeaves(leavesPayload.results || leavesPayload || [])
            setSummary(summaryRes.data as Summary)
        } catch (e) {
            console.error('Failed to load leaves', e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    async function submitApply(e: React.FormEvent) {
        e.preventDefault()
        setFormError(null)
        if (!form.start_date || !form.end_date || !form.reason.trim()) {
            setFormError('All fields are required.')
            return
        }
        if (form.end_date < form.start_date) {
            setFormError('End date must be on or after start date.')
            return
        }
        setSubmitting(true)
        try {
            await api.post('/leaves/', form)
            setShowApplyModal(false)
            setForm({ start_date: '', end_date: '', reason: '' })
            await load()
        } catch (err: any) {
            setFormError(err?.response?.data?.detail || 'Failed to submit leave request.')
        } finally {
            setSubmitting(false)
        }
    }

    async function cancelLeave(id: number) {
        if (!window.confirm('Cancel this pending leave request?')) return
        try {
            await api.post(`/leaves/${id}/cancel/`)
            await load()
        } catch (e: any) {
            alert(e?.response?.data?.detail || 'Failed to cancel.')
        }
    }

    const todayKey = new Date().toISOString().slice(0, 10)

    return (
        <div className="p-6 md:p-10 max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Leave</h1>
                    <p className="text-sm text-gray-500 mt-1">Apply for leave and track approvals.</p>
                </div>
                <button
                    onClick={() => setShowApplyModal(true)}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                    <Plus className="w-4 h-4 mr-2" /> Apply for Leave
                </button>
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 mb-6 border-b border-gray-200">
                <TabButton active={activeTab === 'leaves'} onClick={() => setActiveTab('leaves')}>Leaves</TabButton>
                <TabButton active={activeTab === 'salary_cut'} onClick={() => setActiveTab('salary_cut')}>Salary Cut</TabButton>
            </div>

            {loading && <div className="text-gray-500 py-12 text-center">Loading…</div>}

            {!loading && activeTab === 'leaves' && (
                <LeavesTab leaves={myLeaves} summary={summary} todayKey={todayKey} onCancel={cancelLeave} />
            )}

            {!loading && activeTab === 'salary_cut' && (
                <SalaryCutTab summary={summary} />
            )}

            {/* Apply Modal */}
            {showApplyModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
                        <div className="flex items-center justify-between p-5 border-b border-gray-200">
                            <h2 className="text-lg font-semibold">Apply for Leave</h2>
                            <button onClick={() => setShowApplyModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={submitApply} className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Start date</label>
                                <input
                                    type="date"
                                    value={form.start_date}
                                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">End date</label>
                                <input
                                    type="date"
                                    value={form.end_date}
                                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                                <textarea
                                    value={form.reason}
                                    onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                                    rows={4}
                                    placeholder="Why are you taking this leave?"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    required
                                />
                            </div>
                            {formError && (
                                <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                                    {formError}
                                </div>
                            )}
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setShowApplyModal(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
                                    Cancel
                                </button>
                                <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                    {submitting ? 'Submitting…' : 'Submit'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

function TabButton({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
        >
            {children}
        </button>
    )
}

function LeavesTab({ leaves, summary, todayKey, onCancel }: {
    leaves: Leave[], summary: Summary | null, todayKey: string, onCancel: (id: number) => void
}) {
    // Compute usage for current calendar month from approved leaves
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
    let approvedDaysThisMonth = 0
    leaves.forEach(l => {
        if (l.status !== 'approved') return
        const s = l.start_date > monthStart ? l.start_date : monthStart
        const e = l.end_date < monthEnd ? l.end_date : monthEnd
        if (s <= e) {
            approvedDaysThisMonth += Math.floor((new Date(e).getTime() - new Date(s).getTime()) / 86400000) + 1
        }
    })

    return (
        <div className="space-y-6">
            {/* Report cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="This month used" value={`${approvedDaysThisMonth} day${approvedDaysThisMonth === 1 ? '' : 's'}`} hint={`Free quota: 1`} />
                <StatCard label="Pending" value={String(summary?.by_status?.pending || 0)} />
                <StatCard label="Approved" value={String(summary?.by_status?.approved || 0)} />
                <StatCard label="Rejected" value={String(summary?.by_status?.rejected || 0)} />
            </div>

            {/* By-type breakdown */}
            {summary && Object.keys(summary.approved_days_by_type).length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Approved days by type</h3>
                    <div className="flex flex-wrap gap-3 text-sm">
                        {Object.entries(summary.approved_days_by_type).map(([type, days]) => (
                            <span key={type} className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 capitalize">
                                {type}: {days}d
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* History list */}
            <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Your leave history</h3>
                {leaves.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 border border-dashed border-gray-200 rounded-xl">
                        <Calendar className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                        <p>No leave requests yet.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {leaves.map(leave => (
                            <LeaveCard key={leave.id} leave={leave} todayKey={todayKey} onCancel={() => onCancel(leave.id)} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

function LeaveCard({ leave, todayKey, onCancel }: { leave: Leave, todayKey: string, onCancel: () => void }) {
    const isUpcoming = leave.start_date >= todayKey
    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">
                            {leave.start_date} → {leave.end_date}
                        </span>
                        <span className="text-xs text-gray-500">({leave.total_days} day{leave.total_days === 1 ? '' : 's'})</span>
                        <StatusBadge status={leave.status} />
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
                    {leave.status === 'approved' && leave.approval_note && (
                        <div className="mt-2 text-sm text-gray-600 italic">Note: {leave.approval_note}</div>
                    )}
                    {(leave.decided_by_name && leave.decided_at) && (
                        <div className="text-xs text-gray-400 mt-2">
                            {leave.status === 'approved' ? 'Approved' : leave.status === 'rejected' ? 'Rejected' : 'Decided'} by {leave.decided_by_name} on {new Date(leave.decided_at).toLocaleDateString()}
                        </div>
                    )}
                </div>
                {leave.status === 'pending' && isUpcoming && (
                    <button onClick={onCancel} className="text-xs text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded">
                        Cancel
                    </button>
                )}
            </div>
        </div>
    )
}

function StatusBadge({ status }: { status: string }) {
    const variants: Record<string, { className: string, icon: any, label: string }> = {
        pending: { className: 'bg-yellow-50 text-yellow-700', icon: Clock, label: 'Pending' },
        approved: { className: 'bg-green-50 text-green-700', icon: CheckCircle, label: 'Approved' },
        rejected: { className: 'bg-red-50 text-red-700', icon: XCircle, label: 'Rejected' },
        cancelled: { className: 'bg-gray-100 text-gray-600', icon: X, label: 'Cancelled' },
    }
    const v = variants[status] || variants.pending
    const I = v.icon
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${v.className}`}>
            <I className="w-3 h-3" /> {v.label}
        </span>
    )
}

function StatCard({ label, value, hint }: { label: string, value: string, hint?: string }) {
    return (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
            {hint && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
        </div>
    )
}

function SalaryCutTab({ summary }: { summary: Summary | null }) {
    const total = summary?.salary_cut_days_total || 0
    const leaves = summary?.salary_cut_leaves || []
    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-br from-red-50 to-amber-50 border border-red-200 rounded-xl p-6 flex items-center gap-4">
                <div className="p-3 bg-red-100 rounded-xl">
                    <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                    <div className="text-sm text-red-700 font-medium">Salary-cut-eligible leave days</div>
                    <div className="text-3xl font-bold text-red-900 mt-1">{total}</div>
                    <div className="text-xs text-red-700 mt-1">Across all approved leaves marked for salary cut.</div>
                </div>
            </div>

            <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Leaves contributing to salary cut</h3>
                {leaves.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 border border-dashed border-gray-200 rounded-xl">
                        <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-300" />
                        <p>No salary-cut leaves on record. 🎉</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {leaves.map(l => (
                            <div key={l.id} className="bg-white border border-gray-200 rounded-lg p-3 text-sm flex items-center justify-between flex-wrap gap-2">
                                <div>
                                    <div className="font-medium text-gray-900">{l.start_date} → {l.end_date} ({l.days}d)</div>
                                    <div className="text-xs text-gray-500 capitalize">{l.leave_type || 'unclassified'} — {l.reason}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
