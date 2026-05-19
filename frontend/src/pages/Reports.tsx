import React, { useEffect, useMemo, useState } from 'react'
import { getCached } from '../lib/api'
import { formatDecimalHours } from '../lib/formatUtils'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { ChartBarIcon, FolderIcon, BanknotesIcon, FunnelIcon } from '@heroicons/react/24/outline'
import ProjectOverview from '../components/ProjectOverview'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement)

// Mirror of backend/src/core/permissions.py:EXECUTIVE_POSITIONS — keep in sync.
const EXECUTIVE_POSITIONS = ['CEO', 'CFO', 'COO', 'CMO', 'Executive']
const isExecutive = (me: any) =>
  !!me && (me.role === 'superuser' || EXECUTIVE_POSITIONS.includes(me?.position))
const isManager = (me: any) => !!me && (me.role === 'manager' || me.role === 'superuser')

// Exact h/m from a raw second count (no decimal-hour rounding loss).
function fmtHM(seconds: number): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0 && m === 0) return s > 0 ? '<1m' : '0m'
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function ymd(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type TabKey = 'time' | 'project' | 'finance'

export default function Reports({ me }: { me?: any }) {
  const tabs = useMemo(() => {
    const list: { key: TabKey; label: string; icon: any }[] = [
      { key: 'time', label: 'Time Report', icon: ChartBarIcon },
    ]
    if (isManager(me)) list.push({ key: 'project', label: 'Project Report', icon: FolderIcon })
    if (isExecutive(me)) list.push({ key: 'finance', label: 'Finance Report', icon: BanknotesIcon })
    return list
  }, [me])

  const [active, setActive] = useState<TabKey>('time')

  return (
    <div className="p-6 space-y-6 bg-gradient-to-br from-gray-50 to-white min-h-screen">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-lg">
          <ChartBarIcon className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500">
            {isExecutive(me)
              ? 'Time, project and finance reporting.'
              : isManager(me)
                ? 'Time and project reporting for your team.'
                : 'Your time report.'}
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-gray-200">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active === t.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {active === 'time' && <TimeReport me={me} />}
      {active === 'project' && isManager(me) && <ProjectReport />}
      {active === 'finance' && isExecutive(me) && <FinanceReport />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Time report — day-wise filter over all visible users.
// ---------------------------------------------------------------------------
function TimeReport({ me }: { me?: any }) {
  const [mode, setMode] = useState<'range' | 'day'>('range')
  const today = new Date()
  const [day, setDay] = useState(ymd(today))
  const [start, setStart] = useState(ymd(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [end, setEnd] = useState(ymd(new Date(today.getFullYear(), today.getMonth() + 1, 0)))
  const [userOptions, setUserOptions] = useState<any[]>([])
  const [selectedUser, setSelectedUser] = useState(me?.role === 'employee' ? String(me?.id || '') : '')
  const [daily, setDaily] = useState<{ labels: string[]; hours: number[]; seconds: number[] }>({ labels: [], hours: [], seconds: [] })
  const [perUser, setPerUser] = useState<any[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [totals, setTotals] = useState<any>({ total_hours: 0, users: 0, sessions: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      // Worked-hours report sourced from clock-in/out sessions.
      const params: any = mode === 'day' ? { day } : { start_date: start, end_date: end }
      if (selectedUser) params.user_id = selectedUser
      const res = await getCached('/reports/clock-summary/', { params }, { ttlMs: 30 * 1000 })
      if (cancelled) return
      const data = res.data || {}
      const report = data.report || []
      setPerUser(report)
      setRows(data.rows || [])
      setDaily(data.daily || { labels: [], hours: [], seconds: [] })
      setTotals(data.totals || { total_hours: 0, users: 0, sessions: 0 })
      // Build the user dropdown from the unfiltered ("All users") fetch so
      // every clocked user stays selectable.
      if (!selectedUser) {
        setUserOptions(report.map((r: any) => ({ id: r.user_id, name: r.user_name })))
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [mode, day, start, end, selectedUser])

  const chartData = {
    labels: daily.labels,
    datasets: [
      {
        label: 'Worked',
        data: daily.hours,
        backgroundColor: '#3877F3',
        borderRadius: 4,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `Worked: ${fmtHM(daily.seconds[ctx.dataIndex] ?? 0)}`,
        },
      },
    },
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <FunnelIcon className="w-4 h-4 text-gray-400" />
          Filter
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Mode</label>
          <select
            value={mode}
            onChange={e => setMode(e.target.value as 'range' | 'day')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="range">Date range</option>
            <option value="day">Single day</option>
          </select>
        </div>
        {mode === 'day' ? (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Day</label>
            <input
              type="date"
              value={day}
              onChange={e => setDay(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={start}
                onChange={e => setStart(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={end}
                onChange={e => setEnd(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </>
        )}
        {me?.role !== 'employee' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">User</label>
            <select
              value={selectedUser}
              onChange={e => setSelectedUser(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[160px]"
            >
              <option value="">All users</option>
              {userOptions.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Project Overview — always visible, independent of clock-session data */}
      <ProjectOverview me={me} />

      {loading ? (
        <div className="h-72 bg-gray-100 rounded-2xl animate-pulse" />
      ) : perUser.length === 0 && daily.labels.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 flex flex-col items-center justify-center text-center">
          <ChartBarIcon className="w-10 h-10 text-gray-300 mb-3" />
          <h3 className="text-lg font-semibold text-gray-900">No worked time</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-md">
            No clock-in/out sessions were found for this {mode === 'day' ? 'day' : 'period'}
            {selectedUser ? ' for the selected user' : ''}. Try a different
            date range.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Total Worked" value={fmtHM(totals.total_seconds || 0)} />
            <StatCard label="Users" value={String(totals.users || 0)} />
            <StatCard label="Sessions" value={String(totals.sessions || 0)} />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Worked hours per day</h3>
            <div className="h-72">
              {daily.labels.length ? (
                <Bar data={chartData} options={chartOptions} />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                  No sessions for this period.
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 text-gray-600 text-sm font-medium">Per user</div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3">User</th>
                  <th className="text-right px-4 py-3">Worked</th>
                  <th className="text-right px-4 py-3">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {perUser.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">No data.</td></tr>
                )}
                {perUser.map((u, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-4 py-3 text-gray-900">{u.user_name}</td>
                    <td className="px-4 py-3 text-right">{fmtHM(u.total_seconds)}</td>
                    <td className="px-4 py-3 text-right">{u.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 text-gray-600 text-sm font-medium">Sessions</div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">User</th>
                  <th className="text-left px-4 py-3">In</th>
                  <th className="text-left px-4 py-3">Out</th>
                  <th className="text-right px-4 py-3">Worked</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No sessions.</td></tr>
                )}
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-4 py-3 text-gray-900">{r.date}</td>
                    <td className="px-4 py-3 text-gray-700">{r.user_name}</td>
                    <td className="px-4 py-3">{r.clock_in || '—'}</td>
                    <td className="px-4 py-3">
                      {r.open
                        ? <span className="text-amber-600 font-medium">Active</span>
                        : (r.clock_out || '—')}
                    </td>
                    <td className="px-4 py-3 text-right">{fmtHM(r.worked_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Project report.
// ---------------------------------------------------------------------------
function ProjectReport() {
  const [rows, setRows] = useState<any[]>([])
  const [totals, setTotals] = useState<any>({ projects: 0, total_hours: 0, open_tasks: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const res = await getCached('/reports/project-summary/', {}, { ttlMs: 30 * 1000 })
      if (cancelled) return
      const data = res.data || {}
      setRows(data.report || [])
      setTotals(data.totals || { projects: 0, total_hours: 0, open_tasks: 0 })
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) return <div className="h-72 bg-gray-100 rounded-2xl animate-pulse" />

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Projects" value={String(totals.projects)} />
        <StatCard label="Total Hours (this month)" value={formatDecimalHours(totals.total_hours || 0)} />
        <StatCard label="Open Tasks" value={String(totals.open_tasks)} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3">Project</th>
              <th className="text-left px-4 py-3">Client</th>
              <th className="text-right px-4 py-3">Hours</th>
              <th className="text-left px-4 py-3 min-w-[160px]">Task progress</th>
              <th className="text-right px-4 py-3">Team</th>
              <th className="text-right px-4 py-3">Budget (spent / planned)</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No projects.</td></tr>
            )}
            {rows.map(p => (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="px-4 py-3 text-gray-900 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-gray-600">{p.client || '—'}</td>
                <td className="px-4 py-3 text-right">{formatDecimalHours(p.total_hours)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[80px]">
                      <div
                        className="h-full bg-green-500"
                        style={{ width: `${p.tasks.completion_pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {p.tasks.done}/{p.tasks.total} ({p.tasks.completion_pct}%)
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">{p.team_size}</td>
                <td className="px-4 py-3 text-right">
                  ₹{p.budget.spent.toLocaleString()} / ₹{p.budget.planned.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Finance report — income vs expense comparison.
// ---------------------------------------------------------------------------
function FinanceReport() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const res = await getCached('/reports/finance-summary/', {}, { ttlMs: 30 * 1000 })
      if (cancelled) return
      setData(res.data || null)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) return <div className="h-72 bg-gray-100 rounded-2xl animate-pulse" />
  if (!data) return <div className="text-gray-400 text-sm">No finance data.</div>

  const series = data.series || { labels: [], income: [], expense: [] }
  const fmt = (n: number) => `₹${Number(n || 0).toLocaleString()}`

  const chartData = {
    labels: series.labels,
    datasets: [
      { label: 'Income', data: series.income, backgroundColor: '#27D8A3', borderRadius: 4 },
      { label: 'Expense', data: series.expense, backgroundColor: '#EA3535', borderRadius: 4 },
    ],
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard label="Balance" value={fmt(data.totals.balance)} />
        <StatCard label="Income (range)" value={fmt(data.totals.range_income)} />
        <StatCard label="Expense (range)" value={fmt(data.totals.range_expense)} />
        <StatCard label="Net (range)" value={fmt(data.totals.range_net)} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Income vs Expense</h3>
        <p className="text-xs text-gray-500 mb-4">
          Monthly comparison · {data.range?.start} → {data.range?.end}
        </p>
        <div className="h-80">
          {series.labels.length ? (
            <Bar
              data={chartData}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
              No transactions in this period.
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 text-gray-600 text-sm font-medium">
          Expense breakdown by category
        </div>
        <table className="w-full text-sm">
          <tbody>
            {(data.category_breakdown || []).length === 0 && (
              <tr><td className="px-4 py-6 text-center text-gray-400">No expenses recorded.</td></tr>
            )}
            {(data.category_breakdown || []).map((c: any, i: number) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-4 py-3 text-gray-900 capitalize">{String(c.category).replace('_', ' ')}</td>
                <td className="px-4 py-3 text-right">{fmt(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  )
}
