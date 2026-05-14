import React, { useEffect, useMemo, useState } from 'react'
import api, { getCached } from '../lib/api'
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
  PointElement,
  LineElement,
} from 'chart.js'
import { Bar, Pie } from 'react-chartjs-2'
import { ChevronLeftIcon, ChevronRightIcon, ArrowDownTrayIcon, FunnelIcon, ClockIcon, ArrowTrendingUpIcon, ChartBarIcon } from '@heroicons/react/24/outline'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
)

export default function TeamTime({ me }: { me?: any }) {
  const [users, setUsers] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [daily, setDaily] = useState<{ labels: string[]; hours: number[] }>({ labels: [], hours: [] })
  const [distribution, setDistribution] = useState<{ labels: string[]; hours: number[] }>({ labels: [], hours: [] })
  const [report, setReport] = useState<any[]>([])
  const [tagSummary, setTagSummary] = useState<any[]>([])
  const [taskMatrix, setTaskMatrix] = useState<any[]>([])
  interface Totals {
    overall_hours: number;
    billable_hours: number;
    non_billable_hours: number;
    per_user_hours: Record<string, number>;
    per_project_hours: Record<string, number>;
  }

  const [totals, setTotals] = useState<Totals>({
    overall_hours: 0,
    billable_hours: 0,
    non_billable_hours: 0,
    per_user_hours: {},
    per_project_hours: {}
  })
  const [loading, setLoading] = useState(true)

  // Filtering state
  const [selectedUser, setSelectedUser] = useState<string>(me?.role === 'employee' ? me?.id : '')
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [billableFilter, setBillableFilter] = useState<'all' | 'billable' | 'non-billable'>('all')
  const selectedPeriod = 'month'

  function ymd(d: Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  async function load() {
    const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
    const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0)
    const params: any = {
      start_date: ymd(monthStart),
      end_date: ymd(monthEnd)
    }
    if (selectedUser) params.user_id = selectedUser
    if (selectedProject) params.project_id = selectedProject
    if (billableFilter !== 'all') params.billable = billableFilter === 'billable'

    const res = await getCached('/reports/team-summary/', { params }, { ttlMs: 60 * 1000 })
    const data = res.data || {}
    setUsers(data.users || [])
    setProjects(data.projects || [])
    setReport(data.report || [])
    setDaily(data.daily || { labels: [], hours: [] })
    setDistribution(data.distribution || { labels: [], hours: [] })
    setTotals(data.totals || { overall_hours: 0 })
    setTagSummary(data.tag_summary || [])
    setTaskMatrix(data.task_matrix || [])
    setLoading(false)
  }

  useEffect(() => { setLoading(true); load() }, [selectedDate, selectedUser, selectedProject, billableFilter])

  const projectHours = useMemo(() => {
    if (!selectedProject) return 0
    const hoursMap = totals?.per_project_hours || {}
    return parseFloat(String(hoursMap[String(selectedProject)] || 0))
  }, [totals, selectedProject])

  const thresholdHours = useMemo(() => {
    if (!selectedProject) return 0
    const project = projects.find((p: any) => String(p.id) === String(selectedProject))
    return project ? parseFloat(project.monthly_threshold_hours) || 0 : 0
  }, [projects, selectedProject])

  const userThresholdHours = useMemo(() => {
    if (!selectedUser) return 0
    const u = users.find((x: any) => String(x.id) === String(selectedUser))
    return u ? parseFloat(u.monthly_threshold_hours) || 0 : 0
  }, [users, selectedUser])

  const userHours = useMemo(() => {
    if (!selectedUser) return 0
    const hoursMap = totals?.per_user_hours || {}
    return parseFloat(String(hoursMap[String(selectedUser)] || 0))
  }, [totals, selectedUser])

  const userProgressPercentage = userThresholdHours > 0 ? Math.min((userHours / userThresholdHours) * 100, 100) : 0
  const progressPercentage = thresholdHours > 0 ? Math.min((projectHours / thresholdHours) * 100, 100) : 0
  // Helpers to compute date buckets for the selected period
  // All daily aggregation is computed server-side

  // Colors for pie charts
  const COLORS = [
    '#EA3535', '#9DB604', '#0036C0', '#F3AC42', '#933AC9', '#4AD8D8', '#C0035E', '#67F90E', '#4A99E2', '#E8D312',
    '#B140E6', '#27D8A3', '#F94566', '#B2DB0F', '#3877F3', '#DD4DB5', '#3BD365', '#206DC7', '#CF03E1', '#45F8AD',
    '#F4291C', '#DAE650', '#5277FD', '#BC7E06', '#AF3BCC', '#2FD0DA', '#DB3398', '#4CF710', '#2881C1', '#D4CD2E',
    '#B82FCE', '#34D6AF', '#EB4E61', '#97F81C', '#334EDD', '#ED50B8', '#2EEF6F', '#017FC7', '#DE17D6', '#44C697',
    '#FA3014', '#9BE94E', '#0019FE', '#C6A245', '#8C58FC', '#18ACC0', '#E9258F', '#3BD714', '#47C6FC', '#F1D850',
    '#6300E0', '#21BEA2', '#C23C44', '#7CDC31', '#2E34B5', '#FD36DD', '#35B46F', '#2891B3', '#CA01CE', '#51EEA3',
    '#F0502D', '#BABD27', '#3C38F0', '#DCAF11', '#5013B4', '#45D3F3', '#DF0352', '#41F324', '#2D65B8', '#F98700',
    '#8741BE', '#27E4CE', '#D23665', '#C2F041', '#1A08E6', '#EE47CA', '#2BD770', '#4EEC4B', '#8032CE', '#26B635',
    '#C1522F', '#A7ED36', '#2E65B8', '#BD5E1A', '#693EE3', '#01C0B4', '#D93C7E', '#1AC50B', '#45F8AD', '#BC6311',
    '#BB4CE2', '#0CE92F', '#EB732F', '#B0E245', '#5E4AD9', '#3BD365', '#C76237', '#2DC74F', '#EB2C5A', '#06CB0E'
  ]

  async function handleExport(kind: 'xlsx' | 'pdf') {
    const start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
    const end = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0)

    const params = { export: kind, start_date: ymd(start), end_date: ymd(end) }
    const res = await api.get('/time-entries/export/', { params, responseType: 'blob' })
    const blob = new Blob([res.data], { type: kind === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = kind === 'xlsx' ? 'team_time_report.xlsx' : 'team_time_report.pdf'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6 bg-gradient-to-br from-gray-50 to-white min-h-screen">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-2"></div>
            <div className="h-4 w-64 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded mb-4"></div>
              <div className="h-64 bg-gray-100 rounded-lg"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const totalHours = totals?.overall_hours || 0

  return (
    <div className="p-6 space-y-6 bg-gradient-to-br from-gray-50 to-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <ChartBarIcon className="w-6 h-6 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            {me?.role === 'employee' ? 'My Report' : 'Reports'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-white rounded-lg px-4 py-2 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <ClockIcon className="w-4 h-4" />
              <span className="font-medium">{formatDecimalHours(totalHours)}</span>
              <span className="text-gray-400">this month</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <FunnelIcon className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-gray-800">Filters & Date Range</h2>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {me?.role !== 'employee' && (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide">Users</label>
              <select
                className="border border-gray-200 rounded-lg px-4 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
              >
                <option value="">All Users</option>
                {users.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.first_name || u.username || u.name || `User #${u.id}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide">Projects</label>
            <select
              className="border border-gray-200 rounded-lg px-4 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
            >
              <option value="">All Projects</option>
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide">Billable Status</label>
            <select
              className="border border-gray-200 rounded-lg px-4 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              value={billableFilter}
              onChange={(e) => setBillableFilter(e.target.value as any)}
            >
              <option value="all">All Status</option>
              <option value="billable">Billable Only</option>
              <option value="non-billable">Non-Billable Only</option>
            </select>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                const newDate = new Date(selectedDate)
                newDate.setMonth(newDate.getMonth() - 1)
                setSelectedDate(newDate)
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            >
              <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
            </button>

            <select
              value={selectedDate.getMonth()}
              onChange={(e) => {
                const newDate = new Date(selectedDate)
                newDate.setMonth(parseInt(e.target.value))
                setSelectedDate(newDate)
              }}
              className="border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i}>
                  {new Date(0, i).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>

            <select
              value={selectedDate.getFullYear()}
              onChange={(e) => {
                const newDate = new Date(selectedDate)
                newDate.setFullYear(parseInt(e.target.value))
                setSelectedDate(newDate)
              }}
              className="border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {Array.from({ length: 10 }, (_, i) => {
                const year = new Date().getFullYear() - 2 + i
                return (
                  <option key={year} value={year}>
                    {year}
                  </option>
                )
              })}
            </select>

            <button
              onClick={() => {
                const newDate = new Date(selectedDate)
                newDate.setMonth(newDate.getMonth() + 1)
                setSelectedDate(newDate)
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            >
              <ChevronRightIcon className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg"
              onClick={() => handleExport('xlsx')}
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              XLSX
            </button>
            <button
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transform hover:scale-105 transition-all duration-200 shadow-md hover:shadow-lg"
              onClick={() => handleExport('pdf')}
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bar Chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow duration-300">
          <div className="flex items-center gap-2 mb-6">
            <ArrowTrendingUpIcon className="w-5 h-5 text-blue-600" />
            <h2 className="font-semibold text-gray-800">Daily Hours Overview</h2>
          </div>
          <div className="h-80">
            {(() => {
              const hasData = (daily.hours || []).some(h => h > 0)
              return hasData ? (
                <Bar
                  data={{
                    labels: (daily.labels || []).map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                    datasets: [{
                      label: 'Hours',
                      data: daily.hours,
                      backgroundColor: 'rgba(59, 130, 246, 0.8)',
                      borderColor: 'rgb(59, 130, 246)',
                      borderWidth: 2,
                      borderRadius: 4,
                      borderSkipped: false,
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'top' as const },
                      tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.9)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: 'rgba(59, 130, 246, 1)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        callbacks: {
                          label: (context: any) => formatDecimalHours(context.parsed.y)
                        }
                      }
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        grid: {
                          color: 'rgba(0, 0, 0, 0.05)',
                        },
                        ticks: {
                          callback: (value: any) => formatDecimalHours(value)
                        }
                      },
                      x: {
                        grid: {
                          display: false,
                        }
                      }
                    },
                    animation: { duration: 800, easing: 'easeInOutQuart' as const },
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <ClockIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No time data available</p>
                    <p className="text-sm text-gray-400">Adjust your filters to see results</p>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Weekly Breakdown */}
          {(() => {
            const hasData = (daily.hours || []).some(h => h > 0)
            if (!hasData) return null

            // Calculate weekly totals
            const weeks: { start: Date, end: Date, total: number, weekNum: number }[] = []
            const labels = daily.labels || []
            const hours = daily.hours || []

            if (labels.length === 0) return null

            // Assume labels are sorted dates
            // We want to group by week (Monday start)
            // Or simpler: just chunk by 7 days if it's a full month view? 
            // Better: Use actual dates to determine weeks

            let currentWeek: { start: Date, end: Date, total: number } | null = null

            labels.forEach((dateStr, idx) => {
              const date = new Date(dateStr)
              const hour = hours[idx] || 0

              // If no current week, start one
              if (!currentWeek) {
                currentWeek = { start: date, end: date, total: hour }
              } else {
                // Check if this date belongs to the same week (Monday-Sunday)
                // A simple way is to check if the difference in days is < 7 AND if we haven't crossed a Monday
                // Actually, let's just use standard week numbers or check day of week

                const prevDate = new Date(labels[idx - 1])
                // If current date is a Monday, and it's not the same as start date (which could be a Monday), start new week
                // But wait, the first day of the month might be a Wednesday.

                const isMonday = date.getDay() === 1

                if (isMonday && date.getTime() !== currentWeek.start.getTime()) {
                  // Push old week
                  weeks.push({
                    start: currentWeek.start,
                    end: currentWeek.end,
                    total: currentWeek.total,
                    weekNum: weeks.length + 1
                  })
                  // Start new week
                  currentWeek = { start: date, end: date, total: hour }
                } else {
                  // Extend current week
                  currentWeek.end = date
                  currentWeek.total += hour
                }
              }
            })

            if (currentWeek) {
              const cw = currentWeek as { start: Date, end: Date, total: number }
              weeks.push({
                start: cw.start,
                end: cw.end,
                total: cw.total,
                weekNum: weeks.length + 1
              })
            }

            return (
              <div className="mt-6 pt-6 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Weekly Breakdown</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {weeks.map((week) => (
                    <div key={week.weekNum} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">
                        Week {week.weekNum}
                      </div>
                      <div className="text-xs text-gray-400 mb-2">
                        {week.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {week.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      <div className="text-lg font-bold text-gray-900">
                        {formatDecimalHours(week.total)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Pie Chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow duration-300">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-5 h-5 bg-gradient-to-r from-purple-500 to-pink-500 rounded"></div>
            <h2 className="font-semibold text-gray-800">
              {selectedProject && me?.role !== 'employee' ? 'User Distribution' : 'Project Distribution'}
            </h2>
          </div>
          <div className="h-80">
            {(() => {
              const labels = distribution.labels || []
              const values = distribution.hours || []
              const hasData = values.some(v => v > 0)

              return hasData ? (
                <Pie
                  data={{
                    labels,
                    datasets: [{
                      data: values,
                      backgroundColor: COLORS,
                      borderColor: 'white',
                      borderWidth: 3,
                      hoverOffset: 15,
                      hoverBorderWidth: 4,
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom' as const,
                        labels: {
                          padding: 20,
                          usePointStyle: true,
                          pointStyle: 'circle'
                        }
                      },
                      tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.9)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: 'rgba(59, 130, 246, 1)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        callbacks: {
                          label: (context: any) => {
                            const value = context.parsed as number
                            const total = (context.dataset.data as number[]).reduce((a, b) => a + b, 0)
                            const pct = total ? Math.round((value / total) * 1000) / 10 : 0
                            return `${context.label}: ${formatDecimalHours(value)} (${pct}%)`
                          },
                        },
                      },
                    },
                    animation: {
                      animateRotate: true,
                      animateScale: true,
                      duration: 1000,
                      easing: 'easeInOutQuart' as const
                    },
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-gradient-to-r from-purple-100 to-pink-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <div className="w-6 h-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"></div>
                    </div>
                    <p className="text-gray-500">No project data available</p>
                    <p className="text-sm text-gray-400">Adjust your filters to see results</p>
                  </div>
                </div>
              )
            })()}
          </div>
          {selectedProject && thresholdHours > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
                <span className="font-medium">Project Hours Progress</span>
                <span>{formatDecimalHours(projectHours)}/{formatDecimalHours(thresholdHours)} worked</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
            </div>
          )}
          {selectedUser && userThresholdHours > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
                <span className="font-medium">User Hours Progress</span>
                <span>{formatDecimalHours(userHours)}/{formatDecimalHours(userThresholdHours)} worked</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-green-500 to-teal-500 h-3 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${userProgressPercentage}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Task Matrix & Tag Summary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Task Hours Matrix */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow duration-300">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <span className="text-2xl">📋</span>
            </div>
            <h2 className="font-semibold text-gray-800">
              Task Hours Summary
            </h2>
          </div>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900">Task Matrix</h3>
              <div className="text-sm text-gray-500 space-x-4">
                <span>Total: <span className="font-medium text-gray-900">{formatDecimalHours(totals.overall_hours)}</span></span>
                <span className="text-green-600">Billable: <span className="font-medium">{formatDecimalHours(totals.billable_hours)}</span></span>
                <span className="text-gray-600">Non-Billable: <span className="font-medium">{formatDecimalHours(totals.non_billable_hours)}</span></span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">Project / Task</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Users</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-40">Total</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {taskMatrix.map((project: any) => (
                    <React.Fragment key={project.id}>
                      <tr className="bg-gray-50">
                        <td className="px-6 py-3 text-sm font-bold text-gray-900" colSpan={2}>
                          {project.name}
                        </td>
                        <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right">
                          {formatDecimalHours(project.total_hours)}
                        </td>
                      </tr>
                      {project.tasks.map((task: any) => (
                        <tr key={task.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 text-sm text-gray-500 pl-10">
                            {task.title}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            <div className="flex flex-wrap gap-2">
                              {task.users.map((u: any) => (
                                <span key={u.id} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {u.name}: {formatDecimalHours(u.total_hours)}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900 text-right font-medium">
                            {formatDecimalHours(task.total_hours)}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Tag Summary Section */}
        {
          tagSummary.length > 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow duration-300 h-fit">
              <div className="flex items-center gap-2 mb-6">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <span className="text-2xl">🏷️</span>
                </div>
                <h2 className="font-semibold text-gray-800">
                  Tags Summary
                </h2>
              </div>

              <div className="space-y-4">
                {/* Phase Tags */}
                {tagSummary.some((t: any) => t.category === 'phase') && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Phase</h3>
                    <div className="space-y-3">
                      {tagSummary
                        .filter((tag: any) => tag.category === 'phase')
                        .map((tag: any) => {
                          const maxHours = Math.max(...tagSummary.map((t: any) => t.total_hours), 1)
                          const percentage = (tag.total_hours / maxHours) * 100
                          return (
                            <div key={tag.id} className="group">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                  {tag.emoji} {tag.name}
                                </span>
                                <span className="text-sm font-semibold text-gray-900">{tag.formatted}</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                                <div
                                  className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full transition-all duration-1000 ease-out group-hover:opacity-90"
                                  style={{ width: `${Math.min(percentage, 100)}%` }}
                                  title={`${tag.emoji} ${tag.name} — ${tag.formatted} this month`}
                                ></div>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}

                {/* Task Tags */}
                {tagSummary.some((t: any) => t.category === 'task') && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Task</h3>
                    <div className="space-y-3">
                      {tagSummary
                        .filter((tag: any) => tag.category === 'task')
                        .map((tag: any) => {
                          const maxHours = Math.max(...tagSummary.map((t: any) => t.total_hours), 1)
                          const percentage = (tag.total_hours / maxHours) * 100
                          return (
                            <div key={tag.id} className="group">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                  {tag.emoji} {tag.name}
                                </span>
                                <span className="text-sm font-semibold text-gray-900">{tag.formatted}</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                                <div
                                  className="bg-gradient-to-r from-blue-500 to-cyan-500 h-3 rounded-full transition-all duration-1000 ease-out group-hover:opacity-90"
                                  style={{ width: `${Math.min(percentage, 100)}%` }}
                                  title={`${tag.emoji} ${tag.name} — ${tag.formatted} this month`}
                                ></div>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}

                {/* System Tags (Untagged) */}
                {tagSummary.filter((tag: any) => tag.category === 'system').length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">System</h3>
                    <div className="space-y-3">
                      {tagSummary
                        .filter((tag: any) => tag.category === 'system')
                        .map((tag: any) => {
                          const maxHours = Math.max(...tagSummary.map((t: any) => t.total_hours), 1)
                          const percentage = (tag.total_hours / maxHours) * 100
                          return (
                            <div key={tag.id} className="group">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                  {tag.emoji} {tag.name}
                                </span>
                                <span className="text-sm font-semibold text-gray-900">{tag.formatted}</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                                <div
                                  className="bg-gradient-to-r from-gray-400 to-gray-600 h-3 rounded-full transition-all duration-1000 ease-out group-hover:opacity-90"
                                  style={{ width: `${Math.min(percentage, 100)}%` }}
                                  title={`${tag.emoji} ${tag.name} — ${tag.formatted} this month`}
                                ></div>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center justify-center h-full min-h-[200px]">
              <div className="text-center text-gray-500">
                <span className="text-2xl block mb-2">🏷️</span>
                No tag data available
              </div>
            </div>
          )
        }
      </div >

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }
      `}</style>
    </div >
  )
}

function parseISODurationSeconds(dur: string) {
  // Expect format like HH:MM:SS
  const parts = dur.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

function formatDuration(d: any) {
  if (typeof d === 'string') return d
  return ''
}
