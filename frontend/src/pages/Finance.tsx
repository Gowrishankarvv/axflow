import React, { useEffect, useMemo, useState } from 'react'
import api from '../lib/api'
import {
    Wallet, TrendingUp, TrendingDown, AlertTriangle, IndianRupee,
    BarChart3, Lock, Plus, X,
    Briefcase, StickyNote, CheckCircle2, XCircle, Clock
} from 'lucide-react'

// Keep in sync with backend TRANSACTION_CATEGORY_CHOICES.
const CATEGORY_OPTIONS: { value: string; label: string; flow: 'income' | 'expense' | 'both' }[] = [
    { value: 'income', label: 'Income', flow: 'income' },
    { value: 'expense', label: 'Expense (General)', flow: 'expense' },
    { value: 'misc', label: 'Miscellaneous Expense', flow: 'expense' },
    { value: 'server', label: 'Server Cost', flow: 'expense' },
    { value: 'api', label: 'API Cost', flow: 'expense' },
    { value: 'salary', label: 'Salary', flow: 'expense' },
    { value: 'tools', label: 'Tools Cost', flow: 'expense' },
    { value: 'ta', label: 'TA (Travel Allowance)', flow: 'expense' },
    { value: 'client_meeting', label: 'Client Meeting', flow: 'expense' },
    { value: 'rent', label: 'Rent', flow: 'expense' },
    { value: 'food', label: 'Food', flow: 'expense' },
]

type Summary = {
    currency: string
    balance: number
    income_total: number
    expense_total: number
    income_this_month: number
    expense_this_month: number
    net_this_month: number
    category_breakdown_this_month: { category: string; total: number }[]
    recent_transactions: any[]
    pending_salary_approvals: number
}

type Transaction = {
    id: number
    flow: 'income' | 'expense'
    category: string
    category_label: string
    amount: number | string
    currency: string
    description: string
    note: string
    occurred_on: string
    project: number | null
    project_name: string | null
    created_by_name: string | null
    created_at: string
}

type Salary = {
    id: number
    employee: number
    employee_name: string
    amount: number | string
    gross_amount: number | string | null
    salary_cut: number | string
    salary_cut_days: number
    period_month: number | null
    period_year: number | null
    note: string
    status: 'processed' | 'approved' | 'rejected'
    employee_response_at: string | null
    employee_response_note: string
    processed_by: number | null
    processed_by_name: string | null
    processed_at: string
}

type MiscExpense = {
    id: number
    spent_for: string
    amount: number | string
    note: string
    occurred_on: string
    created_by_name: string | null
}

type ProjectBudget = {
    id: number
    project: number
    project_name: string
    planned_amount: number | string
    currency: string
    note: string
    actual_spend: number
    remaining: number
}

type ExpenseType = {
    id: number
    scope: 'internal' | 'external'
    name: string
    is_builtin: boolean
    requires_person: boolean
}

type ProjectExpense = {
    id: number
    project: number
    scope: 'internal' | 'external'
    expense_type: number
    expense_type_name: string
    requires_person: boolean
    amount: number | string
    note: string
    person_name: string
    person_role: string
    occurred_on: string
    created_by_name: string | null
}

type Project = { id: number; name: string }
type Employee = { id: number; first_name: string; username: string; role?: string }

type Tab = 'overview' | 'transactions' | 'misc' | 'salary' | 'budgets'

export default function Finance() {
    const [tab, setTab] = useState<Tab>('overview')
    const [summary, setSummary] = useState<Summary | null>(null)
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [salaries, setSalaries] = useState<Salary[]>([])
    const [misc, setMisc] = useState<MiscExpense[]>([])
    const [budgets, setBudgets] = useState<ProjectBudget[]>([])
    const [projects, setProjects] = useState<Project[]>([])
    const [employees, setEmployees] = useState<Employee[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    async function loadSummary() {
        try {
            const { data } = await api.get('/finance/summary/')
            setSummary(data as Summary)
        } catch (err: any) {
            if (err?.response?.status === 403) {
                setError("You don't have access to the Finance module.")
            } else {
                setError(err?.response?.data?.detail || 'Failed to load finance data.')
            }
        }
    }

    async function loadAll() {
        setLoading(true)
        try {
            const [txn, sal, ms, bd, pr, us] = await Promise.all([
                api.get('/finance/transactions/'),
                api.get('/finance/salaries/'),
                api.get('/finance/misc-expenses/'),
                api.get('/finance/project-budgets/'),
                api.get('/projects/').catch(() => ({ data: [] })),
                api.get('/users/light/').catch(() => api.get('/users/')),
            ])
            setTransactions(unwrap(txn.data))
            setSalaries(unwrap(sal.data))
            setMisc(unwrap(ms.data))
            setBudgets(unwrap(bd.data))
            setProjects(unwrap(pr.data))
            setEmployees(unwrap(us.data).filter((u: any) => u.role !== 'client'))
        } catch (err: any) {
            console.error('Finance load error', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadSummary().then(loadAll)
    }, [])

    const cur = (n: number | string) =>
        formatINR(typeof n === 'string' ? parseFloat(n) : n, summary?.currency || 'INR')

    if (loading && !summary) {
        return <div className="p-10 text-center text-gray-500">Loading finance…</div>
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

    const s = summary!

    return (
        <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                    <Wallet className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
                    <p className="text-sm text-gray-500">Executive overview. Visible only to executives & superusers.</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
                {(['overview', 'transactions', 'misc', 'salary', 'budgets'] as Tab[]).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === t
                            ? 'border-emerald-600 text-emerald-700'
                            : 'border-transparent text-gray-500 hover:text-gray-900'
                            }`}
                    >
                        {tabLabel(t)}
                        {t === 'salary' && s.pending_salary_approvals > 0 && (
                            <span className="ml-2 inline-block min-w-[18px] h-[18px] px-1 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full">
                                {s.pending_salary_approvals}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {tab === 'overview' && <Overview s={s} cur={cur} />}
            {tab === 'transactions' && (
                <Transactions
                    transactions={transactions}
                    projects={projects}
                    cur={cur}
                    onChanged={async () => { await loadSummary(); await loadAll() }}
                />
            )}
            {tab === 'misc' && (
                <Misc
                    misc={misc}
                    cur={cur}
                    onChanged={async () => { await loadSummary(); await loadAll() }}
                />
            )}
            {tab === 'salary' && (
                <Salaries
                    salaries={salaries}
                    employees={employees}
                    cur={cur}
                    onChanged={async () => { await loadSummary(); await loadAll() }}
                />
            )}
            {tab === 'budgets' && (
                <Budgets
                    budgets={budgets}
                    projects={projects}
                    cur={cur}
                    onChanged={async () => { await loadSummary(); await loadAll() }}
                />
            )}
        </div>
    )
}

function tabLabel(t: Tab): string {
    switch (t) {
        case 'overview': return 'Overview'
        case 'transactions': return 'Income & Expenses'
        case 'misc': return 'Misc. Expenses'
        case 'salary': return 'Salaries'
        case 'budgets': return 'Project Budgets'
    }
}

// ---------------------------------------------------------------- Overview --
function Overview({ s, cur }: { s: Summary; cur: (n: any) => string }) {
    return (
        <div className="space-y-6">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    label="Balance"
                    value={cur(s.balance)}
                    icon={Wallet}
                    accent={s.balance >= 0 ? 'emerald' : 'rose'}
                />
                <KpiCard
                    label="Income (this month)"
                    value={cur(s.income_this_month)}
                    icon={TrendingUp}
                    accent="emerald"
                />
                <KpiCard
                    label="Expenses (this month)"
                    value={cur(s.expense_this_month)}
                    icon={TrendingDown}
                    accent="rose"
                />
                <KpiCard
                    label="Net (this month)"
                    value={cur(s.net_this_month)}
                    icon={BarChart3}
                    accent={s.net_this_month >= 0 ? 'emerald' : 'rose'}
                />
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">
                        Expense Breakdown (this month)
                    </h2>
                    {s.category_breakdown_this_month.length === 0 ? (
                        <div className="text-center py-6 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
                            No expenses yet this month.
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {s.category_breakdown_this_month.map((row) => (
                                <li key={row.category} className="flex justify-between text-sm">
                                    <span className="text-gray-700">{labelFor(row.category)}</span>
                                    <span className="font-mono">{cur(row.total)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Recent Transactions</h2>
                        <IndianRupee className="w-5 h-5 text-gray-400" />
                    </div>
                    {s.recent_transactions.length === 0 ? (
                        <div className="text-center py-6 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
                            No transactions yet.
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {s.recent_transactions.map((t: any) => (
                                <li key={t.id} className="flex justify-between text-sm">
                                    <span className="text-gray-700 truncate">
                                        <span className={`inline-block mr-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${t.flow === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                            }`}>
                                            {t.flow === 'income' ? '+' : '-'}
                                        </span>
                                        {t.description || t.category_label}
                                    </span>
                                    <span className="font-mono">{cur(t.amount)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    )
}

// ----------------------------------------------------------- Transactions --
function Transactions({
    transactions, projects, cur, onChanged,
}: {
    transactions: Transaction[]
    projects: Project[]
    cur: (n: any) => string
    onChanged: () => void
}) {
    const [showForm, setShowForm] = useState(false)
    const [flow, setFlow] = useState<'income' | 'expense'>('expense')
    const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all')

    const filtered = useMemo(
        () => filter === 'all' ? transactions : transactions.filter(t => t.flow === filter),
        [transactions, filter]
    )

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                    {(['all', 'income', 'expense'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1 text-xs font-medium rounded transition ${filter === f ? 'bg-white shadow text-gray-900' : 'text-gray-600'
                                }`}
                        >
                            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>
                <div className="flex-1" />
                <button
                    onClick={() => { setFlow('income'); setShowForm(true) }}
                    className="flex items-center gap-1 px-3 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                >
                    <Plus className="w-4 h-4" /> Income
                </button>
                <button
                    onClick={() => { setFlow('expense'); setShowForm(true) }}
                    className="flex items-center gap-1 px-3 py-2 text-sm font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700"
                >
                    <Plus className="w-4 h-4" /> Expense
                </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <tr>
                            <th className="text-left px-4 py-3">Date</th>
                            <th className="text-left px-4 py-3">Category</th>
                            <th className="text-left px-4 py-3">Description</th>
                            <th className="text-left px-4 py-3">Project</th>
                            <th className="text-right px-4 py-3">Amount</th>
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 && (
                            <tr><td colSpan={6} className="text-center py-8 text-gray-400">No transactions.</td></tr>
                        )}
                        {filtered.map(t => (
                            <tr key={t.id} className="border-t border-gray-100">
                                <td className="px-4 py-3 text-gray-600">{t.occurred_on}</td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${t.flow === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                        }`}>
                                        {t.category_label}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-gray-700">{t.description || '—'}</td>
                                <td className="px-4 py-3 text-gray-600">{t.project_name || '—'}</td>
                                <td className="px-4 py-3 text-right font-mono">{cur(t.amount)}</td>
                                <td className="px-4 py-3 text-right">
                                    <button
                                        onClick={async () => {
                                            if (!confirm('Delete this transaction?')) return
                                            await api.delete(`/finance/transactions/${t.id}/`)
                                            onChanged()
                                        }}
                                        className="text-xs text-gray-400 hover:text-red-600"
                                    >Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showForm && (
                <TransactionForm
                    flow={flow}
                    projects={projects}
                    onClose={() => setShowForm(false)}
                    onSaved={() => { setShowForm(false); onChanged() }}
                />
            )}
        </div>
    )
}

function TransactionForm({
    flow, projects, onClose, onSaved,
}: {
    flow: 'income' | 'expense'
    projects: Project[]
    onClose: () => void
    onSaved: () => void
}) {
    const categories = CATEGORY_OPTIONS.filter(c => c.flow === flow || c.flow === 'both')
    const [form, setForm] = useState({
        flow,
        category: categories[0]?.value || 'expense',
        amount: '',
        description: '',
        note: '',
        occurred_on: todayISO(),
        project: '',
    })
    const [submitting, setSubmitting] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        setErr(null)
        if (!form.amount || parseFloat(form.amount) <= 0) {
            setErr('Enter a positive amount.')
            return
        }
        setSubmitting(true)
        try {
            await api.post('/finance/transactions/', {
                ...form,
                amount: parseFloat(form.amount),
                project: form.project ? parseInt(form.project, 10) : null,
            })
            onSaved()
        } catch (e: any) {
            setErr(e?.response?.data?.detail || 'Failed to save.')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Modal title={`New ${flow}`} onClose={onClose}>
            <form onSubmit={submit} className="space-y-3">
                <Field label="Category">
                    <select
                        value={form.category}
                        onChange={e => setForm({ ...form, category: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                        {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                </Field>
                <Field label="Amount">
                    <input
                        type="number" step="0.01" min="0"
                        value={form.amount}
                        onChange={e => setForm({ ...form, amount: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        autoFocus
                    />
                </Field>
                <Field label="Description">
                    <input
                        value={form.description}
                        onChange={e => setForm({ ...form, description: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        placeholder="What's this for?"
                    />
                </Field>
                <Field label="Date">
                    <input
                        type="date"
                        value={form.occurred_on}
                        onChange={e => setForm({ ...form, occurred_on: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                </Field>
                <Field label="Project (optional)">
                    <select
                        value={form.project}
                        onChange={e => setForm({ ...form, project: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                        <option value="">— None —</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </Field>
                <Field label="Note (optional)">
                    <textarea
                        value={form.note}
                        onChange={e => setForm({ ...form, note: e.target.value })}
                        rows={2}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                </Field>
                {err && <div className="text-xs text-red-600">{err}</div>}
                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300">
                        Cancel
                    </button>
                    <button
                        type="submit" disabled={submitting}
                        className={`px-4 py-2 text-sm rounded-lg text-white ${flow === 'income' ? 'bg-emerald-600' : 'bg-rose-600'} disabled:opacity-50`}
                    >
                        {submitting ? 'Saving…' : `Save ${flow}`}
                    </button>
                </div>
            </form>
        </Modal>
    )
}

// ------------------------------------------------------------------ Misc --
function Misc({
    misc, cur, onChanged,
}: {
    misc: MiscExpense[]
    cur: (n: any) => string
    onChanged: () => void
}) {
    const [showForm, setShowForm] = useState(false)

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <button
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-1 px-3 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                >
                    <Plus className="w-4 h-4" /> Add Misc Expense
                </button>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
                {misc.length === 0 && (
                    <div className="col-span-2 text-center py-12 text-gray-400 border border-dashed border-gray-200 rounded-xl bg-white">
                        No miscellaneous expenses logged.
                    </div>
                )}
                {misc.map(m => (
                    <div key={m.id} className="bg-white border border-gray-200 rounded-xl p-4">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <div className="font-semibold text-gray-900">{m.spent_for}</div>
                                <div className="text-xs text-gray-500">{m.occurred_on}</div>
                            </div>
                            <div className="text-lg font-bold text-rose-600 font-mono">{cur(m.amount)}</div>
                        </div>
                        {m.note && (
                            <div className="text-sm text-gray-600 flex gap-1 mt-2">
                                <StickyNote className="w-3.5 h-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                                <span>{m.note}</span>
                            </div>
                        )}
                        <button
                            onClick={async () => {
                                if (!confirm('Delete this misc expense?')) return
                                await api.delete(`/finance/misc-expenses/${m.id}/`)
                                onChanged()
                            }}
                            className="mt-3 text-xs text-gray-400 hover:text-red-600"
                        >Delete</button>
                    </div>
                ))}
            </div>

            {showForm && <MiscForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); onChanged() }} />}
        </div>
    )
}

function MiscForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const [form, setForm] = useState({ spent_for: '', amount: '', note: '', occurred_on: todayISO() })
    const [submitting, setSubmitting] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        setErr(null)
        if (!form.spent_for.trim() || !form.amount) {
            setErr('Both "spent for" and amount are required.')
            return
        }
        setSubmitting(true)
        try {
            await api.post('/finance/misc-expenses/', { ...form, amount: parseFloat(form.amount) })
            onSaved()
        } catch (e: any) {
            setErr(e?.response?.data?.detail || 'Failed to save.')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Modal title="New Misc Expense" onClose={onClose}>
            <form onSubmit={submit} className="space-y-3">
                <Field label="Spent for">
                    <input
                        value={form.spent_for}
                        onChange={e => setForm({ ...form, spent_for: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        placeholder="e.g. Stationery for office"
                        autoFocus
                    />
                </Field>
                <Field label="Amount">
                    <input
                        type="number" step="0.01" min="0"
                        value={form.amount}
                        onChange={e => setForm({ ...form, amount: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                </Field>
                <Field label="Date">
                    <input
                        type="date"
                        value={form.occurred_on}
                        onChange={e => setForm({ ...form, occurred_on: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                </Field>
                <Field label="Note">
                    <textarea
                        rows={3}
                        value={form.note}
                        onChange={e => setForm({ ...form, note: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        placeholder="Optional context…"
                    />
                </Field>
                {err && <div className="text-xs text-red-600">{err}</div>}
                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300">Cancel</button>
                    <button type="submit" disabled={submitting} className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white disabled:opacity-50">
                        {submitting ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </form>
        </Modal>
    )
}

// -------------------------------------------------------------- Salaries --
function Salaries({
    salaries, employees, cur, onChanged,
}: {
    salaries: Salary[]
    employees: Employee[]
    cur: (n: any) => string
    onChanged: () => void
}) {
    const [showForm, setShowForm] = useState(false)
    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <button
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-1 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    <Plus className="w-4 h-4" /> Process Salary
                </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <tr>
                            <th className="text-left px-4 py-3">Employee</th>
                            <th className="text-left px-4 py-3">Period</th>
                            <th className="text-right px-4 py-3">Gross</th>
                            <th className="text-right px-4 py-3">Salary Cut</th>
                            <th className="text-right px-4 py-3">Net Paid</th>
                            <th className="text-left px-4 py-3">Status</th>
                            <th className="text-left px-4 py-3">Processed</th>
                        </tr>
                    </thead>
                    <tbody>
                        {salaries.length === 0 && (
                            <tr><td colSpan={7} className="text-center py-8 text-gray-400">No salaries processed yet.</td></tr>
                        )}
                        {salaries.map(s => (
                            <tr key={s.id} className="border-t border-gray-100">
                                <td className="px-4 py-3 text-gray-700">{s.employee_name}</td>
                                <td className="px-4 py-3 text-gray-600">
                                    {s.period_month && s.period_year
                                        ? `${monthName(s.period_month)} ${s.period_year}`
                                        : '—'}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-gray-600">
                                    {s.gross_amount != null ? cur(s.gross_amount) : '—'}
                                </td>
                                <td className="px-4 py-3 text-right font-mono">
                                    {Number(s.salary_cut) > 0
                                        ? <span className="text-rose-600">
                                            −{cur(s.salary_cut)}
                                            <span className="text-[11px] text-gray-400 ml-1">({s.salary_cut_days}d)</span>
                                          </span>
                                        : <span className="text-gray-400">—</span>}
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-semibold">{cur(s.amount)}</td>
                                <td className="px-4 py-3">
                                    <StatusBadge status={s.status} />
                                </td>
                                <td className="px-4 py-3 text-gray-500">
                                    {new Date(s.processed_at).toLocaleDateString()}
                                    {s.processed_by_name ? ` · by ${s.processed_by_name}` : ''}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showForm && (
                <SalaryForm
                    employees={employees}
                    cur={cur}
                    onClose={() => setShowForm(false)}
                    onSaved={() => { setShowForm(false); onChanged() }}
                />
            )}
        </div>
    )
}

function SalaryForm({
    employees, cur, onClose, onSaved,
}: {
    employees: Employee[]
    cur: (n: any) => string
    onClose: () => void
    onSaved: () => void
}) {
    const now = new Date()
    const [form, setForm] = useState({
        employee: '',
        amount: '',
        period_month: now.getMonth() + 1,
        period_year: now.getFullYear(),
        note: '',
    })
    const [configuredStatus, setConfiguredStatus] = useState<'idle' | 'loading' | 'configured' | 'missing'>('idle')
    const [cut, setCut] = useState<{
        salary_cut_days: number; per_day: number
        gross_amount: number; salary_cut: number; net_amount: number
    } | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    async function loadConfigured(employee: string, month: number, year: number) {
        if (!employee) {
            setConfiguredStatus('idle')
            setCut(null)
            return
        }
        setConfiguredStatus('loading')
        try {
            const { data } = await api.get('/salary/records/current/', {
                params: { employee, month, year },
            })
            setForm(f => ({ ...f, amount: String((data as any).amount) }))
            setCut((data as any).salary_cut || null)
            setConfiguredStatus('configured')
        } catch (e: any) {
            setCut(null)
            if (e?.response?.status === 404) {
                setConfiguredStatus('missing')
            } else {
                setConfiguredStatus('idle')
                setErr(e?.response?.data?.detail || 'Failed to load configured salary.')
            }
        }
    }

    async function onEmployeeChange(value: string) {
        setForm(f => ({ ...f, employee: value, amount: '' }))
        setErr(null)
        await loadConfigured(value, form.period_month, form.period_year)
    }

    // Re-evaluate the salary cut whenever the pay period changes.
    useEffect(() => {
        if (form.employee) {
            loadConfigured(form.employee, form.period_month, form.period_year)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.period_month, form.period_year])

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        setErr(null)
        if (!form.employee) {
            setErr('Please select an employee.')
            return
        }
        if (configuredStatus !== 'configured') {
            setErr('No salary is configured for this employee yet. Set one in the Salary module first.')
            return
        }
        setSubmitting(true)
        try {
            await api.post('/finance/salaries/', {
                employee: parseInt(form.employee, 10),
                amount: parseFloat(form.amount),
                period_month: form.period_month,
                period_year: form.period_year,
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
        <Modal title="Process Salary" onClose={onClose}>
            <form onSubmit={submit} className="space-y-3">
                <Field label="Employee">
                    <select
                        value={form.employee}
                        onChange={e => onEmployeeChange(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                        <option value="">— Select employee —</option>
                        {employees.map(u => (
                            <option key={u.id} value={u.id}>
                                {u.first_name || u.username}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Salary Amount (from Salary module)">
                    <input
                        type="text"
                        readOnly
                        value={
                            configuredStatus === 'loading' ? 'Loading…'
                                : configuredStatus === 'configured' ? form.amount
                                    : configuredStatus === 'missing' ? 'Not configured'
                                        : ''
                        }
                        placeholder="Select an employee first"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-100 text-gray-700 cursor-not-allowed"
                    />
                </Field>
                {configuredStatus === 'configured' && cut && (
                    <div className="text-xs border border-gray-200 rounded-lg overflow-hidden">
                        <Row label="Gross salary" value={cur(cut.gross_amount)} />
                        <Row
                            label={
                                cut.salary_cut_days > 0
                                    ? `Salary cut · ${cut.salary_cut_days} leave day(s) @ ${cur(cut.per_day)}/day`
                                    : 'Salary cut · no salary-cut leave this period'
                            }
                            value={cut.salary_cut > 0 ? `− ${cur(cut.salary_cut)}` : cur(0)}
                            rose={cut.salary_cut > 0}
                        />
                        <div className="flex justify-between px-3 py-2 bg-gray-50 font-semibold">
                            <span>Net to be paid</span>
                            <span className="font-mono">{cur(cut.net_amount)}</span>
                        </div>
                    </div>
                )}
                {configuredStatus === 'missing' && (
                    <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 flex gap-1.5">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>This employee has no configured salary. Open the Salary module to set one.</span>
                    </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Month">
                        <select
                            value={form.period_month}
                            onChange={e => setForm({ ...form, period_month: parseInt(e.target.value, 10) })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                <option key={m} value={m}>{monthName(m)}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Year">
                        <input
                            type="number"
                            value={form.period_year}
                            onChange={e => setForm({ ...form, period_year: parseInt(e.target.value, 10) })}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        />
                    </Field>
                </div>
                <Field label="Note (optional)">
                    <textarea
                        rows={2}
                        value={form.note}
                        onChange={e => setForm({ ...form, note: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                </Field>
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 flex gap-1.5">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>The employee will get a notification to approve once the amount is credited.</span>
                </div>
                {err && <div className="text-xs text-red-600">{err}</div>}
                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300">Cancel</button>
                    <button type="submit" disabled={submitting} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white disabled:opacity-50">
                        {submitting ? 'Saving…' : 'Process'}
                    </button>
                </div>
            </form>
        </Modal>
    )
}

// --------------------------------------------------------------- Budgets --
function Budgets({
    budgets, projects, cur, onChanged,
}: {
    budgets: ProjectBudget[]
    projects: Project[]
    cur: (n: any) => string
    onChanged: () => void
}) {
    const [showForm, setShowForm] = useState(false)
    const usedProjectIds = new Set(budgets.map(b => b.project))
    const availableProjects = projects.filter(p => !usedProjectIds.has(p.id))

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <button
                    onClick={() => setShowForm(true)}
                    disabled={availableProjects.length === 0}
                    className="flex items-center gap-1 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                    <Plus className="w-4 h-4" /> Add Budget
                </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                {budgets.length === 0 && (
                    <div className="col-span-2 text-center py-12 text-gray-400 border border-dashed border-gray-200 rounded-xl bg-white">
                        No project budgets defined.
                    </div>
                )}
                {budgets.map(b => {
                    const planned = parseFloat(String(b.planned_amount))
                    const pct = planned > 0 ? Math.min(100, (b.actual_spend / planned) * 100) : 0
                    const over = b.actual_spend > planned
                    return (
                        <div key={b.id} className="bg-white border border-gray-200 rounded-xl p-5">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <Briefcase className="w-4 h-4 text-indigo-600" />
                                    <span className="font-semibold text-gray-900">{b.project_name}</span>
                                </div>
                                <button
                                    onClick={async () => {
                                        if (!confirm('Delete this budget?')) return
                                        await api.delete(`/finance/project-budgets/${b.id}/`)
                                        onChanged()
                                    }}
                                    className="text-xs text-gray-400 hover:text-red-600"
                                >Delete</button>
                            </div>
                            <div className="text-sm text-gray-500 mb-3">
                                Spent <span className="font-mono font-semibold text-gray-900">{cur(b.actual_spend)}</span> of {cur(planned)}
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                <div
                                    className={`h-full ${over ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <div className="flex justify-between mt-2 text-xs">
                                <span className="text-gray-500">{pct.toFixed(0)}% used</span>
                                <span className={over ? 'text-rose-600 font-bold' : 'text-gray-600'}>
                                    {over ? `Over by ${cur(b.actual_spend - planned)}` : `Remaining ${cur(b.remaining)}`}
                                </span>
                            </div>
                            {b.note && <div className="text-xs text-gray-500 mt-3 italic">{b.note}</div>}
                        </div>
                    )
                })}
            </div>

            <ProjectExpenses projects={projects} cur={cur} onChanged={onChanged} />

            {showForm && (
                <BudgetForm
                    projects={availableProjects}
                    onClose={() => setShowForm(false)}
                    onSaved={() => { setShowForm(false); onChanged() }}
                />
            )}
        </div>
    )
}

// ------------------------------------------------ Internal/External spend --
function ProjectExpenses({
    projects, cur, onChanged,
}: {
    projects: Project[]
    cur: (n: any) => string
    onChanged: () => void
}) {
    const [projectId, setProjectId] = useState<string>('')
    const [types, setTypes] = useState<ExpenseType[]>([])
    const [expenses, setExpenses] = useState<ProjectExpense[]>([])
    const [loading, setLoading] = useState(false)

    async function loadTypes() {
        const { data } = await api.get('/finance/expense-types/')
        setTypes(unwrap(data))
    }

    async function loadExpenses(pid: string) {
        if (!pid) { setExpenses([]); return }
        setLoading(true)
        try {
            const { data } = await api.get('/finance/project-expenses/', { params: { project: pid } })
            setExpenses(unwrap(data))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { loadTypes() }, [])
    useEffect(() => { loadExpenses(projectId) }, [projectId])

    function refresh() {
        loadTypes()
        loadExpenses(projectId)
        onChanged()
    }

    return (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="font-semibold text-gray-900">Project Expenses</h3>
                    <p className="text-xs text-gray-500">Record actual internal & external spend per project.</p>
                </div>
                <select
                    value={projectId}
                    onChange={e => setProjectId(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[220px]"
                >
                    <option value="">— Select a project —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
            </div>

            {!projectId ? (
                <div className="text-center py-10 text-gray-400 border border-dashed border-gray-200 rounded-xl">
                    Select a project to manage its Internal and External expenses.
                </div>
            ) : loading ? (
                <div className="text-center py-10 text-gray-400">Loading expenses…</div>
            ) : (
                <div className="grid lg:grid-cols-2 gap-4">
                    <ScopePanel
                        scope="internal" projectId={projectId}
                        types={types.filter(t => t.scope === 'internal')}
                        expenses={expenses.filter(e => e.scope === 'internal')}
                        cur={cur} onChanged={refresh}
                    />
                    <ScopePanel
                        scope="external" projectId={projectId}
                        types={types.filter(t => t.scope === 'external')}
                        expenses={expenses.filter(e => e.scope === 'external')}
                        cur={cur} onChanged={refresh}
                    />
                </div>
            )}
        </div>
    )
}

function ScopePanel({
    scope, projectId, types, expenses, cur, onChanged,
}: {
    scope: 'internal' | 'external'
    projectId: string
    types: ExpenseType[]
    expenses: ProjectExpense[]
    cur: (n: any) => string
    onChanged: () => void
}) {
    const [showExpense, setShowExpense] = useState(false)
    const [showType, setShowType] = useState(false)

    const total = expenses.reduce((s, e) => s + parseFloat(String(e.amount) || '0'), 0)

    // Group expenses by type for a tidy breakdown.
    const byType = useMemo(() => {
        const m: Record<string, { name: string; total: number; items: ProjectExpense[] }> = {}
        for (const e of expenses) {
            const k = e.expense_type_name || '—'
            if (!m[k]) m[k] = { name: k, total: 0, items: [] }
            m[k].total += parseFloat(String(e.amount) || '0')
            m[k].items.push(e)
        }
        return Object.values(m).sort((a, b) => b.total - a.total)
    }, [expenses])

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className={`px-4 py-3 flex items-center justify-between ${scope === 'internal' ? 'bg-indigo-50' : 'bg-amber-50'}`}>
                <div>
                    <span className="font-semibold text-gray-900 capitalize">{scope}</span>
                    <span className="ml-2 text-sm text-gray-500">{cur(total)}</span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowType(true)}
                        className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50"
                    >+ Type</button>
                    <button
                        onClick={() => setShowExpense(true)}
                        className={`text-xs px-2 py-1 rounded text-white ${scope === 'internal' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                    >+ Expense</button>
                </div>
            </div>

            <div className="divide-y divide-gray-100">
                {byType.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">No {scope} expenses yet.</div>
                )}
                {byType.map(group => (
                    <div key={group.name} className="px-4 py-3">
                        <div className="flex justify-between text-sm font-medium text-gray-800">
                            <span>{group.name}</span>
                            <span className="font-mono">{cur(group.total)}</span>
                        </div>
                        <div className="mt-1 space-y-1">
                            {group.items.map(it => (
                                <div key={it.id} className="flex items-center justify-between text-xs text-gray-500">
                                    <span className="truncate">
                                        {it.person_name
                                            ? `${it.person_name}${it.person_role ? ` · ${it.person_role}` : ''}`
                                            : (it.note || '—')}
                                        <span className="text-gray-400"> · {it.occurred_on}</span>
                                    </span>
                                    <span className="flex items-center gap-2 shrink-0">
                                        <span className="font-mono text-gray-700">{cur(it.amount)}</span>
                                        <button
                                            onClick={async () => {
                                                if (!confirm('Delete this expense?')) return
                                                await api.delete(`/finance/project-expenses/${it.id}/`)
                                                onChanged()
                                            }}
                                            className="text-gray-400 hover:text-red-600"
                                        >Delete</button>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {showExpense && (
                <ExpenseForm
                    scope={scope} projectId={projectId} types={types}
                    onClose={() => setShowExpense(false)}
                    onSaved={() => { setShowExpense(false); onChanged() }}
                />
            )}
            {showType && (
                <AddTypeForm
                    scope={scope}
                    onClose={() => setShowType(false)}
                    onSaved={() => { setShowType(false); onChanged() }}
                />
            )}
        </div>
    )
}

function ExpenseForm({
    scope, projectId, types, onClose, onSaved,
}: {
    scope: 'internal' | 'external'
    projectId: string
    types: ExpenseType[]
    onClose: () => void
    onSaved: () => void
}) {
    const [form, setForm] = useState({
        expense_type: types[0]?.id ? String(types[0].id) : '',
        amount: '',
        note: '',
        person_name: '',
        person_role: '',
        occurred_on: todayISO(),
    })
    const [submitting, setSubmitting] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const selectedType = types.find(t => String(t.id) === form.expense_type)
    const needsPerson = !!selectedType?.requires_person

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        setErr(null)
        if (!form.expense_type || !form.amount) {
            setErr('Expense type and amount are required.')
            return
        }
        if (needsPerson && !form.person_name.trim()) {
            setErr('Employee name is required for this expense type.')
            return
        }
        setSubmitting(true)
        try {
            await api.post('/finance/project-expenses/', {
                project: parseInt(projectId, 10),
                scope,
                expense_type: parseInt(form.expense_type, 10),
                amount: parseFloat(form.amount),
                note: form.note,
                person_name: needsPerson ? form.person_name : '',
                person_role: needsPerson ? form.person_role : '',
                occurred_on: form.occurred_on,
            })
            onSaved()
        } catch (e: any) {
            const d = e?.response?.data
            setErr(typeof d === 'object' ? Object.values(d).flat().join(' ') : (d?.detail || 'Failed to save.'))
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Modal title={`New ${scope} expense`} onClose={onClose}>
            <form onSubmit={submit} className="space-y-3">
                <Field label="Expense Type">
                    <select
                        value={form.expense_type}
                        onChange={e => setForm({ ...form, expense_type: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                        <option value="">— Select type —</option>
                        {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                </Field>
                {needsPerson && (
                    <>
                        <Field label="Employee Name">
                            <input
                                value={form.person_name}
                                onChange={e => setForm({ ...form, person_name: e.target.value })}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            />
                        </Field>
                        <Field label="Role">
                            <input
                                value={form.person_role}
                                onChange={e => setForm({ ...form, person_role: e.target.value })}
                                placeholder="e.g. Freelance Designer"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            />
                        </Field>
                    </>
                )}
                <Field label="Amount">
                    <input
                        type="number" step="0.01" min="0"
                        value={form.amount}
                        onChange={e => setForm({ ...form, amount: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                </Field>
                <Field label="Date">
                    <input
                        type="date"
                        value={form.occurred_on}
                        onChange={e => setForm({ ...form, occurred_on: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                </Field>
                <Field label="Note (optional)">
                    <input
                        value={form.note}
                        onChange={e => setForm({ ...form, note: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                </Field>
                {err && <div className="text-xs text-red-600">{err}</div>}
                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300">Cancel</button>
                    <button type="submit" disabled={submitting} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white disabled:opacity-50">
                        {submitting ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </form>
        </Modal>
    )
}

function AddTypeForm({
    scope, onClose, onSaved,
}: {
    scope: 'internal' | 'external'
    onClose: () => void
    onSaved: () => void
}) {
    const [name, setName] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        setErr(null)
        if (!name.trim()) { setErr('Name is required.'); return }
        setSubmitting(true)
        try {
            await api.post('/finance/expense-types/', { scope, name: name.trim() })
            onSaved()
        } catch (e: any) {
            const d = e?.response?.data
            setErr(typeof d === 'object' ? Object.values(d).flat().join(' ') : (d?.detail || 'Failed to save.'))
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Modal title={`New ${scope} expense type`} onClose={onClose}>
            <form onSubmit={submit} className="space-y-3">
                <p className="text-xs text-gray-500">
                    This type is added to the shared {scope} catalogue and can be reused on any project.
                </p>
                <Field label="Type Name">
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder={scope === 'internal' ? 'e.g. Database Cost' : 'e.g. Travel'}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                </Field>
                {err && <div className="text-xs text-red-600">{err}</div>}
                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300">Cancel</button>
                    <button type="submit" disabled={submitting} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white disabled:opacity-50">
                        {submitting ? 'Saving…' : 'Add Type'}
                    </button>
                </div>
            </form>
        </Modal>
    )
}

function BudgetForm({
    projects, onClose, onSaved,
}: {
    projects: Project[]
    onClose: () => void
    onSaved: () => void
}) {
    const [form, setForm] = useState({
        project: projects[0]?.id ? String(projects[0].id) : '',
        planned_amount: '',
        note: '',
    })
    const [submitting, setSubmitting] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        setErr(null)
        if (!form.project || !form.planned_amount) {
            setErr('Project and planned amount are required.')
            return
        }
        setSubmitting(true)
        try {
            await api.post('/finance/project-budgets/', {
                project: parseInt(form.project, 10),
                planned_amount: parseFloat(form.planned_amount),
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
        <Modal title="New Project Budget" onClose={onClose}>
            <form onSubmit={submit} className="space-y-3">
                <Field label="Project">
                    <select
                        value={form.project}
                        onChange={e => setForm({ ...form, project: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    >
                        <option value="">— Select project —</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </Field>
                <Field label="Planned Amount">
                    <input
                        type="number" step="0.01" min="0"
                        value={form.planned_amount}
                        onChange={e => setForm({ ...form, planned_amount: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                </Field>
                <Field label="Note (optional)">
                    <textarea
                        rows={2}
                        value={form.note}
                        onChange={e => setForm({ ...form, note: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                </Field>
                {err && <div className="text-xs text-red-600">{err}</div>}
                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300">Cancel</button>
                    <button type="submit" disabled={submitting} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white disabled:opacity-50">
                        {submitting ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </form>
        </Modal>
    )
}

// ----------------------------------------------------------- Reusable UI --
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

function Row({ label, value, rose }: { label: string; value: string; rose?: boolean }) {
    return (
        <div className="flex justify-between px-3 py-2 border-b border-gray-100">
            <span className="text-gray-600">{label}</span>
            <span className={`font-mono ${rose ? 'text-rose-600' : 'text-gray-800'}`}>{value}</span>
        </div>
    )
}

function KpiCard({ label, value, icon: Icon, accent }: {
    label: string; value: string; icon: any; accent: 'emerald' | 'rose' | 'blue'
}) {
    const palette = {
        emerald: { iconBg: 'bg-emerald-100', iconText: 'text-emerald-600' },
        rose: { iconBg: 'bg-rose-100', iconText: 'text-rose-600' },
        blue: { iconBg: 'bg-blue-100', iconText: 'text-blue-600' },
    }[accent]
    return (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</span>
                <div className={`p-2 rounded-lg ${palette.iconBg}`}>
                    <Icon className={`w-4 h-4 ${palette.iconText}`} />
                </div>
            </div>
            <div className="text-2xl font-bold text-gray-900 font-mono">{value}</div>
        </div>
    )
}

function StatusBadge({ status }: { status: Salary['status'] }) {
    if (status === 'approved') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="w-3 h-3" /> Approved
            </span>
        )
    }
    if (status === 'rejected') {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700">
                <XCircle className="w-3 h-3" /> Rejected
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
            <Clock className="w-3 h-3" /> Pending Approval
        </span>
    )
}

// ----------------------------------------------------------------- Utils --
function formatINR(n: number, currency = 'INR') {
    try {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
    } catch {
        return `${currency} ${(n || 0).toLocaleString()}`
    }
}

function labelFor(category: string): string {
    return CATEGORY_OPTIONS.find(c => c.value === category)?.label || category
}

function monthName(m: number): string {
    return ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'][m - 1] || String(m)
}

function todayISO(): string {
    const d = new Date()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${day}`
}

function unwrap(data: any): any[] {
    if (!data) return []
    if (Array.isArray(data)) return data
    if (Array.isArray(data.results)) return data.results
    return []
}
