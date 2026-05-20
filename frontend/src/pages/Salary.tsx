import React, { useEffect, useMemo, useState } from 'react'
import api from '../lib/api'
import {
    Wallet, Plus, X, Lock, History, Edit3, AlertTriangle, Search,
} from 'lucide-react'

type Revision = {
    id: number
    employee: number
    employee_name: string
    amount: number | string
    currency: string
    effective_from: string
    note: string
    created_by_name: string | null
    created_at: string
}

type SalaryCut = {
    year: number
    month: number
    days_in_month: number
    salary_cut_days: number
    per_day: number
    gross_amount: number
    salary_cut: number
    net_amount: number
}

type RosterRow = {
    employee_id: number
    employee_name: string
    email: string
    role: string
    position: string
    current_salary: Revision | null
    salary_cut: SalaryCut | null
}

export default function Salary() {
    const [roster, setRoster] = useState<RosterRow[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')

    const [editingRow, setEditingRow] = useState<RosterRow | null>(null)
    const [historyRow, setHistoryRow] = useState<RosterRow | null>(null)

    async function load() {
        setLoading(true)
        try {
            const { data } = await api.get('/salary/records/roster/')
            setRoster(data as RosterRow[])
        } catch (err: any) {
            if (err?.response?.status === 403) {
                setError("You don't have access to the Salary module.")
            } else {
                setError(err?.response?.data?.detail || 'Failed to load salaries.')
            }
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return roster
        return roster.filter(r =>
            r.employee_name.toLowerCase().includes(q) ||
            (r.email || '').toLowerCase().includes(q) ||
            (r.position || '').toLowerCase().includes(q)
        )
    }, [roster, search])

    if (loading) {
        return <div className="p-10 text-center text-gray-500">Loading salaries…</div>
    }
    if (error) {
        return (
            <div className="p-10 max-w-md mx-auto">
                <div className="text-center py-12 border border-red-200 bg-red-50 rounded-xl">
                    <Lock className="w-10 h-10 mx-auto mb-3 text-red-500" />
                    <p className="text-red-800 font-medium">{error}</p>
                </div>
            </div>
        )
    }

    const configuredCount = roster.filter(r => r.current_salary).length

    return (
        <div className="p-6 md:p-10 w-full space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-neutral-100 rounded-lg">
                    <Wallet className="w-6 h-6 text-neutral-900" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Salary</h1>
                    <p className="text-sm text-gray-500">
                        Set each employee's salary. Finance uses these amounts when processing payroll.
                    </p>
                </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
                <KpiCard label="Employees" value={String(roster.length)} />
                <KpiCard label="Salary configured" value={String(configuredCount)} accent="emerald" />
                <KpiCard label="Pending setup" value={String(roster.length - configuredCount)} accent="rose" />
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neutral-100 focus:border-neutral-400 transition-all"
                        placeholder="Search by name, email, position…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <tr>
                            <th className="text-left px-4 py-3">Employee</th>
                            <th className="text-left px-4 py-3">Position</th>
                            <th className="text-right px-4 py-3">Current Salary</th>
                            <th className="text-right px-4 py-3">Salary Cut (this month)</th>
                            <th className="text-right px-4 py-3">Net Payable</th>
                            <th className="text-left px-4 py-3 pl-4">Since</th>
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && (
                            <tr><td colSpan={7} className="text-center py-8 text-gray-400">No employees match.</td></tr>
                        )}
                        {filtered.map(r => (
                            <tr key={r.employee_id} className="border-t border-gray-100">
                                <td className="px-4 py-3">
                                    <div className="font-medium text-gray-900">{r.employee_name}</div>
                                    <div className="text-xs text-gray-500">{r.email}</div>
                                </td>
                                <td className="px-4 py-3 text-gray-600">{r.position || '—'}</td>
                                <td className="px-4 py-3 text-right font-mono">
                                    {r.current_salary
                                        ? formatINR(parseFloat(String(r.current_salary.amount)), r.current_salary.currency)
                                        : <span className="text-rose-600 text-xs font-medium">Not set</span>}
                                </td>
                                <td className="px-4 py-3 text-right font-mono">
                                    {r.salary_cut && r.salary_cut.salary_cut > 0 ? (
                                        <div>
                                            <div className="text-rose-600">
                                                −{formatINR(r.salary_cut.salary_cut, r.current_salary?.currency)}
                                            </div>
                                            <div className="text-[11px] text-gray-400 font-sans">
                                                {r.salary_cut.salary_cut_days} day(s) · {formatINR(r.salary_cut.per_day, r.current_salary?.currency)}/day
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="text-gray-400 text-xs">—</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right font-mono">
                                    {r.salary_cut
                                        ? <span className={r.salary_cut.salary_cut > 0 ? 'font-semibold text-emerald-700' : ''}>
                                            {formatINR(r.salary_cut.net_amount, r.current_salary?.currency)}
                                          </span>
                                        : <span className="text-gray-400 text-xs">—</span>}
                                </td>
                                <td className="px-4 py-3 text-gray-500 text-xs">
                                    {r.current_salary ? r.current_salary.effective_from : '—'}
                                </td>
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                    <button
                                        onClick={() => setEditingRow(r)}
                                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-violet-600 text-white hover:bg-violet-700"
                                    >
                                        {r.current_salary ? <><Edit3 className="w-3 h-3" /> Update</> : <><Plus className="w-3 h-3" /> Set</>}
                                    </button>
                                    {r.current_salary && (
                                        <button
                                            onClick={() => setHistoryRow(r)}
                                            className="inline-flex items-center gap-1 text-xs px-2 py-1 ml-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                                        >
                                            <History className="w-3 h-3" /> History
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {editingRow && (
                <RevisionForm
                    row={editingRow}
                    onClose={() => setEditingRow(null)}
                    onSaved={async () => { setEditingRow(null); await load() }}
                />
            )}
            {historyRow && (
                <HistoryModal
                    row={historyRow}
                    onClose={() => setHistoryRow(null)}
                />
            )}
        </div>
    )
}

function RevisionForm({
    row, onClose, onSaved,
}: {
    row: RosterRow
    onClose: () => void
    onSaved: () => void
}) {
    const existing = row.current_salary
    const [form, setForm] = useState({
        amount: existing ? String(existing.amount) : '',
        effective_from: todayISO(),
        note: '',
    })
    const [submitting, setSubmitting] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        setErr(null)
        if (!form.amount || parseFloat(form.amount) <= 0) {
            setErr('Enter a positive salary amount.')
            return
        }
        if (!form.effective_from) {
            setErr('Effective date is required.')
            return
        }
        setSubmitting(true)
        try {
            await api.post('/salary/records/', {
                employee: row.employee_id,
                amount: parseFloat(form.amount),
                effective_from: form.effective_from,
                note: form.note,
            })
            onSaved()
        } catch (e: any) {
            setErr(e?.response?.data?.detail || 'Failed to save.')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Modal title={existing ? `Update salary — ${row.employee_name}` : `Set salary — ${row.employee_name}`} onClose={onClose}>
            <form onSubmit={submit} className="space-y-3">
                {existing && (
                    <div className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-2">
                        <span className="text-gray-500">Current: </span>
                        <span className="font-mono font-semibold">
                            {formatINR(parseFloat(String(existing.amount)), existing.currency)}
                        </span>
                        <span className="text-gray-500"> (since {existing.effective_from})</span>
                    </div>
                )}
                <Field label="New Salary Amount">
                    <input
                        type="number" step="0.01" min="0"
                        value={form.amount}
                        onChange={e => setForm({ ...form, amount: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        autoFocus
                    />
                </Field>
                <Field label="Effective From">
                    <input
                        type="date"
                        value={form.effective_from}
                        onChange={e => setForm({ ...form, effective_from: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                </Field>
                <Field label="Note (optional)">
                    <input
                        value={form.note}
                        onChange={e => setForm({ ...form, note: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        placeholder="e.g. Annual revision, promotion…"
                    />
                </Field>
                {existing && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 flex gap-1.5">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>This creates a new revision. Older revisions are kept for history.</span>
                    </div>
                )}
                {err && <div className="text-xs text-red-600">{err}</div>}
                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300">Cancel</button>
                    <button type="submit" disabled={submitting} className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white disabled:opacity-50">
                        {submitting ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </form>
        </Modal>
    )
}

function HistoryModal({ row, onClose }: { row: RosterRow; onClose: () => void }) {
    const [revisions, setRevisions] = useState<Revision[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        api.get('/salary/records/', { params: { employee: row.employee_id } })
            .then(r => {
                const data: any = r.data
                setRevisions((data.results || data || []) as Revision[])
            })
            .finally(() => setLoading(false))
    }, [row.employee_id])

    return (
        <Modal title={`Salary history — ${row.employee_name}`} onClose={onClose}>
            {loading ? (
                <div className="text-center py-6 text-gray-500 text-sm">Loading…</div>
            ) : revisions.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm border border-dashed border-gray-200 rounded-lg">
                    No revisions yet.
                </div>
            ) : (
                <ul className="divide-y divide-gray-100">
                    {revisions.map(r => (
                        <li key={r.id} className="py-3 flex justify-between items-start">
                            <div>
                                <div className="font-mono font-semibold text-gray-900">
                                    {formatINR(parseFloat(String(r.amount)), r.currency)}
                                </div>
                                <div className="text-xs text-gray-500">
                                    From {r.effective_from}
                                    {r.created_by_name ? ` · by ${r.created_by_name}` : ''}
                                </div>
                                {r.note && <div className="text-xs text-gray-600 mt-1 italic">{r.note}</div>}
                            </div>
                            <div className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</div>
                        </li>
                    ))}
                </ul>
            )}
        </Modal>
    )
}

// --- Reusable bits ----------------------------------------------------------
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-900">{title}</h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>
                <div className="p-4">{children}</div>
            </div>
        </div>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="block text-xs font-medium text-gray-700 mb-1">{label}</span>
            {children}
        </label>
    )
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: 'emerald' | 'rose' }) {
    const text = accent === 'emerald' ? 'text-emerald-700' : accent === 'rose' ? 'text-rose-700' : 'text-gray-900'
    return (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">{label}</div>
            <div className={`text-2xl font-bold ${text}`}>{value}</div>
        </div>
    )
}

function formatINR(n: number, currency = 'INR') {
    try {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
    } catch {
        return `${currency} ${(n || 0).toLocaleString()}`
    }
}

function todayISO(): string {
    const d = new Date()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${day}`
}
