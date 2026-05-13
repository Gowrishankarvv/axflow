import React, { useEffect, useState } from 'react'
import api from '../lib/api'
import {
    Wallet, TrendingUp, TrendingDown, Receipt, Users as UsersIcon,
    AlertTriangle, IndianRupee, BarChart3, Lock
} from 'lucide-react'

type Summary = {
    currency: string
    revenue_this_month: number
    expenses_this_month: number
    net_profit_this_month: number
    outstanding_invoices_count: number
    outstanding_invoices_total: number
    payroll_due_this_month: number
    recent_transactions: any[]
    note?: string
}

export default function Finance() {
    const [summary, setSummary] = useState<Summary | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        api.get('/finance/summary/')
            .then(res => setSummary(res.data as Summary))
            .catch(err => {
                if (err?.response?.status === 403) {
                    setError("You don't have access to the Finance module.")
                } else {
                    setError(err?.response?.data?.detail || 'Failed to load finance data.')
                }
            })
            .finally(() => setLoading(false))
    }, [])

    if (loading) {
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
    const cur = (n: number) => formatINR(n, s.currency)

    return (
        <div className="p-6 md:p-10 max-w-6xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                    <Wallet className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
                    <p className="text-sm text-gray-500">Executive overview. Visible only to executives & superusers.</p>
                </div>
            </div>

            {s.note && (
                <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{s.note}</span>
                </div>
            )}

            {/* Top KPI cards */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    label="Revenue (this month)"
                    value={cur(s.revenue_this_month)}
                    icon={TrendingUp}
                    accent="emerald"
                />
                <KpiCard
                    label="Expenses (this month)"
                    value={cur(s.expenses_this_month)}
                    icon={TrendingDown}
                    accent="rose"
                />
                <KpiCard
                    label="Net Profit (this month)"
                    value={cur(s.net_profit_this_month)}
                    icon={BarChart3}
                    accent={s.net_profit_this_month >= 0 ? 'emerald' : 'rose'}
                />
                <KpiCard
                    label="Payroll Due"
                    value={cur(s.payroll_due_this_month)}
                    icon={UsersIcon}
                    accent="blue"
                />
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* Outstanding invoices */}
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Outstanding Invoices</h2>
                        <Receipt className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <div className="text-3xl font-bold text-gray-900">{s.outstanding_invoices_count}</div>
                        <div className="text-sm text-gray-500">invoice{s.outstanding_invoices_count === 1 ? '' : 's'} unpaid</div>
                    </div>
                    <div className="text-sm text-gray-700 mt-1">
                        Total: <span className="font-semibold">{cur(s.outstanding_invoices_total)}</span>
                    </div>
                </div>

                {/* Recent transactions */}
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
                            {s.recent_transactions.map((t: any, i: number) => (
                                <li key={i} className="flex justify-between text-sm">
                                    <span className="text-gray-700">{t.label || '—'}</span>
                                    <span className="font-mono">{cur(t.amount || 0)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    )
}

function KpiCard({ label, value, icon: Icon, accent }: {
    label: string, value: string, icon: any, accent: 'emerald' | 'rose' | 'blue'
}) {
    const palette = {
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600' },
        rose: { bg: 'bg-rose-50', text: 'text-rose-700', iconBg: 'bg-rose-100', iconText: 'text-rose-600' },
        blue: { bg: 'bg-blue-50', text: 'text-blue-700', iconBg: 'bg-blue-100', iconText: 'text-blue-600' },
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

function formatINR(n: number, currency = 'INR') {
    try {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
    } catch {
        return `${currency} ${n.toLocaleString()}`
    }
}
