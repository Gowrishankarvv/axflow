import React, { useEffect, useMemo, useRef, useState } from 'react'
import api, { getCached } from '../lib/api'
import { useAppData } from '../lib/AppDataContext'
import { formatDecimalHours } from '../lib/formatUtils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, Clock as ClockIcon, Calendar as CalendarIcon, TrendingUp as TrendingUpIcon, Tag as TaskIcon, Download as DownloadIcon, Play as PlayIcon, Square as SquareIcon, Coffee as CoffeeIcon } from 'lucide-react'

export default function Dashboard() {
  const { data: appData, ready: appReady } = useAppData()
  const [data, setData] = useState<any[]>([])
  const [totals, setTotals] = useState<any>({ today: '--', week: '--', month: '--' })
  const [users, setUsers] = useState<any[]>([])
  const [me, setMe] = useState<any>(null)
  const [filterUser, setFilterUser] = useState<string>('me')
  const [assignedTasks, setAssignedTasks] = useState<any[]>([])
  const [thresholdNotifications, setThresholdNotifications] = useState<any[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [range, setRange] = useState<'week' | 'month'>('month')
  const [loading, setLoading] = useState(true)
  const [activeSession, setActiveSession] = useState<any>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [lunchElapsedTime, setLunchElapsedTime] = useState(0)
  const [allSessions, setAllSessions] = useState<any[]>([])
  const [sessionsPage, setSessionsPage] = useState(1)
  const [sessionsTotalPages, setSessionsTotalPages] = useState(1)
  const [dateRange, setDateRange] = useState<{ start: string, end: string } | null>(null)
  const [activeView, setActiveView] = useState<'individual' | 'team' | 'aggregated'>('individual')
  const [aggregatedSummary, setAggregatedSummary] = useState<any | null>(null)
  const [aggregatedLoading, setAggregatedLoading] = useState(false)
  const [aggregatedError, setAggregatedError] = useState<string | null>(null)
  const aggregatedRangeRef = useRef<string | null>(null)

  // Cache users and me data to avoid duplicate requests
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [meLoaded, setMeLoaded] = useState(false)

  useEffect(() => {
    if (appReady && appData?.me && !meLoaded) {
      setMe(appData.me)
      setMeLoaded(true)
    }
  }, [appReady, appData?.me, meLoaded])

  useEffect(() => {
    const cachedUsers = appData?.users
    if (appReady && Array.isArray(cachedUsers) && !usersLoaded) {
      setUsers(cachedUsers as any[])
      setUsersLoaded(true)
    }
  }, [appReady, appData?.users, usersLoaded])

  function ymd(d: Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  function parseISODurationSeconds(dur: string) {
    const parts = dur.split(':').map(Number)
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0
  }

  function enumerateDays(start: Date, end: Date) {
    const dates: string[] = []
    const d = new Date(start)
    while (d <= end) {
      dates.push(ymd(d))
      d.setDate(d.getDate() + 1)
    }
    return dates
  }

  function normalizeDateInput(value: any): Date | null {
    if (!value) return null
    if (value instanceof Date) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate())
    }
    if (typeof value === 'string') {
      const parts = value.split('-')
      if (parts.length === 3) {
        const [y, m, d] = parts.map(Number)
        if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
          return new Date(y, m - 1, d)
        }
      }
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime())
        ? null
        : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
    }
    if (typeof value === 'number') {
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime())
        ? null
        : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
    }
    return null
  }

  function buildChartRange(rawChart: any[], start: string, end: string) {
    const map = new Map<string, number>()
    rawChart.forEach((entry: any) => {
      const keyDate = normalizeDateInput(entry.date ?? entry.day)
      if (!keyDate) return
      const key = ymd(keyDate)
      map.set(key, typeof entry.hours === 'number' ? entry.hours : Number(entry.hours || 0))
    })
    const startDate = normalizeDateInput(start)
    const endDate = normalizeDateInput(end)
    if (!startDate || !endDate) return []
    const result: { date: string, hours: number }[] = []
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
    while (cursor <= endDate) {
      const key = ymd(cursor)
      result.push({ date: key, hours: map.get(key) ?? 0 })
      cursor.setDate(cursor.getDate() + 1)
    }
    return result
  }

  function buildTotalsFromChart(chart: { date: string, hours: number }[], _rangeEnd: string) {
    // "Today" and "This Week" are anchored on the *actual* current date, not the
    // chart's rangeEnd (which is the last day of the selected month). The Month
    // total is the sum of every chart entry, so it tracks whatever range the
    // chart covers.
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayKey = ymd(today)
    // Week runs Sunday (getDay() === 0) through today.
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - today.getDay())
    weekStart.setHours(0, 0, 0, 0)
    const totals = { today: 0, week: 0, month: 0 }
    chart.forEach((entry) => {
      const entryDate = normalizeDateInput(entry.date)
      if (!entryDate) return
      const entryKey = ymd(entryDate)
      if (entryKey === todayKey) {
        totals.today += entry.hours || 0
      }
      if (entryDate >= weekStart && entryDate <= today) {
        totals.week += entry.hours || 0
      }
      totals.month += entry.hours || 0
    })
    return {
      today: Number(totals.today.toFixed(2)),
      week: Number(totals.week.toFixed(2)),
      month: Number(totals.month.toFixed(2)),
    }
  }

  async function fetchReportSummaryData(start: string, end: string, userParam: string | null) {
    // Dashboard cards/chart show "hours worked" from clock-in/out sessions
    // (gross duration minus lunch break), not project-logged TimeEntry hours.
    // Same response shape as /reports/summary/, so chart + totals just work.
    const params = new URLSearchParams({ start_date: start, end_date: end })
    if (userParam) params.set('user_id', userParam)
    try {
      const res = await getCached(`/clock-sessions/worked_summary/?${params.toString()}`)
      const chart = buildChartRange(res.data || [], start, end)
      return {
        chart,
        totals: buildTotalsFromChart(chart, end)
      }
    } catch (error) {
      console.error('Failed to load worked summary data:', error)
      return null
    }
  }

  const canViewAggregatedUser = (userData: any | null) => {
    if (!userData) return false
    return userData.role === 'superuser' || userData.role === 'manager' || userData.role === 'employee'
  }

  const fetchAggregatedSummaryForRange = async (start: string, end: string, targetMe: any | null) => {
    if (!canViewAggregatedUser(targetMe)) {
      setAggregatedLoading(false)
      return null
    }
    setAggregatedError(null)
    setAggregatedLoading(true)
    try {
      const aggregatedParams = new URLSearchParams({ start_date: start, end_date: end })
      const { data } = await api.get(`/dashboard/summary/aggregated/?${aggregatedParams.toString()}`)
      const reportSummary = await fetchReportSummaryData(start, end, null)
      return {
        ...data,
        chart: reportSummary?.chart || buildChartRange(data.chart || [], start, end),
        totals: reportSummary?.totals || data.totals,
        assigned_tasks: data.assigned_tasks || []
      }
    } catch (error: any) {
      console.error('Failed to load aggregated summary:', error)
      setAggregatedError('Failed to load aggregated data.')
      return null
    } finally {
      setAggregatedLoading(false)
    }
  }

  async function fetchAll(path: string) {
    let url: any = path
    const items: any[] = []
    function toRelative(nextUrl: string) {
      try {
        const u = new URL(nextUrl, window.location.origin)
        const p = u.pathname + u.search
        return p.startsWith('/api/') ? p.replace('/api/', '/') : p
      } catch {
        return nextUrl
      }
    }
    while (url) {
      const res = await getCached(url)
      const data: any = res.data as any
      const chunk = data.results || data
      if (Array.isArray(chunk)) items.push(...chunk)
      url = data.next ? toRelative(data.next) : null
    }
    return items
  }

  const isOwner = me?.role === 'superuser'
  const isManager = me?.role === 'manager'
  const isEmployee = me?.role === 'employee'

  async function load(userIdFromUI?: string) {
    if (data.length === 0 && totals.today === '--') {
      setLoading(true)
    }
    try {
      const targetUser = userIdFromUI || filterUser || 'me'
      const today = new Date()
      const isCurrentMonthSelection =
        selectedDate.getFullYear() === today.getFullYear() &&
        selectedDate.getMonth() === today.getMonth()

      // If filtering for another user, we still use individual endpoints or a modified init?
      // For now, if it's 'me', use the optimized init.
      // If it's another user, we might need to fall back or update init to accept user_id (if allowed)

      // The init endpoint is a cached current-month snapshot, so use it only for that case.
      let resolvedStart: string | null = null
      let resolvedEnd: string | null = null

      if (targetUser === 'me' && range === 'month' && isCurrentMonthSelection) {
        // Optimized path
        const res = await getCached('/dashboard/init/')
        const initData = res.data as any

        if (initData.active_session !== undefined) {
          setActiveSession(initData.active_session)
        }
        if (initData.recent_sessions) {
          setAllSessions(initData.recent_sessions.results || [])
          setSessionsTotalPages(Math.ceil((initData.recent_sessions.count || 0) / 5))
        }
        if (initData.assigned_tasks) {
          setAssignedTasks(initData.assigned_tasks)
        }
        if (initData.summary) {
          const s = initData.summary
          // Re-normalize chart dates if needed, or trust backend
          // Backend sends ISO strings, buildChartRange expects that or Date objects
          // We can use buildChartRange to ensure all days are present
          const startDate = ymd(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
          const endDate = ymd(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0))
          resolvedStart = startDate
          resolvedEnd = endDate
          setDateRange({ start: startDate, end: endDate })

          if (s.threshold_notifications) setThresholdNotifications(s.threshold_notifications)

          // Fetch aggregated data for Team Dashboard
          // OPTIMIZATION: Don't eager load this. Let the useEffect handle it when user switches tabs.
          // const resolvedMe = initData.me || me || appData?.me
          // if (resolvedMe && (resolvedMe.role === 'manager' || resolvedMe.role === 'superuser')) {
          //   setAggregatedLoading(true)
          //   fetchAggregatedSummaryForRange(startDate, endDate, resolvedMe).then(agg => {
          //     if (agg) {
          //       setAggregatedSummary(agg)
          //       aggregatedRangeRef.current = `${startDate}_${endDate}`
          //     }
          //     setAggregatedLoading(false)
          //   })
          // }
        }
      } else {
        // Fallback to old logic for specific ranges/users if init doesn't support them yet
        // Or just keep it simple and only optimize the main dashboard load which is the critical path
        const params = new URLSearchParams()
        if (targetUser) params.set('user_id', targetUser)

        let startDate: string, endDate: string
        if (range === 'week') {
          const startOfWeek = new Date(selectedDate)
          startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay())
          startDate = ymd(startOfWeek)
          const endOfWeek = new Date(startOfWeek)
          endOfWeek.setDate(startOfWeek.getDate() + 6)
          endDate = ymd(endOfWeek)
        } else {
          startDate = ymd(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
          endDate = ymd(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0))
        }
        params.set('start_date', startDate)
        params.set('end_date', endDate)
        resolvedStart = startDate
        resolvedEnd = endDate
        setDateRange({ start: startDate, end: endDate })

        const safe = async <T,>(promise: Promise<T>, label: string): Promise<T | null> => {
          try {
            return await promise
          } catch (error) {
            console.error(`Failed to load ${label}:`, error)
            return null
          }
        }

        const summaryPromise = safe(getCached(`/dashboard/summary/?${params.toString()}`).then(res => res.data as any), 'summary')
        const mePromise = meLoaded
          ? Promise.resolve(me)
          : safe(getCached('/auth/me/').then(res => res.data as any), 'me')
        const usersPromise = usersLoaded
          ? Promise.resolve(users)
          : safe(getCached('/users/light/').then(res => res.data as any[]), 'users')
        const activeSessionPromise = safe(getCached('/clock-sessions/my_active/').then(res => res.data as any), 'active session')
        const sessionsPromise = safe(getCached(`/clock-sessions/`, { params: { user_id: targetUser, page: 1, page_size: 5 } }).then(res => res.data as any), 'sessions')
        const assignedTasksPromise = safe(getCached(`/tasks/my_notifications/`, { params: { page_size: 1000 } }).then(res => res.data as any), 'assigned tasks')

        const [
          summaryData,
          meData,
          usersData,
          activeSessionData,
          sessionsData,
          assignedTasksData,
        ] = await Promise.all([
          summaryPromise,
          mePromise,
          usersPromise,
          activeSessionPromise,
          sessionsPromise,
          assignedTasksPromise,
        ])

        if (!meLoaded && meData) {
          setMe(meData)
          setMeLoaded(true)
        }
        if (!usersLoaded && Array.isArray(usersData)) {
          setUsers(usersData)
          setUsersLoaded(true)
        }

        if (summaryData) {
          if (Array.isArray(summaryData.assigned_tasks)) setAssignedTasks(summaryData.assigned_tasks)
          if (Array.isArray(summaryData.threshold_notifications)) setThresholdNotifications(summaryData.threshold_notifications)
        }

        if (activeSessionData !== null) {
          setActiveSession(activeSessionData)
        }

        if (sessionsData) {
          const list = sessionsData.results || sessionsData
          setAllSessions(list)
          setSessionsTotalPages(Math.ceil((sessionsData.count || 0) / 5))
        }

        if ((!summaryData?.assigned_tasks || summaryData.assigned_tasks.length === 0) && assignedTasksData) {
          const tasksList = assignedTasksData.results || assignedTasksData
          setAssignedTasks(tasksList)
        }
      }
      if (resolvedStart && resolvedEnd) {
        const reportSummary = await fetchReportSummaryData(resolvedStart, resolvedEnd, targetUser)
        if (reportSummary) {
          setData(reportSummary.chart)
          setTotals(reportSummary.totals)
        }
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function loadAllSessions(page = 1) {
    try {
      const res = await getCached(`/clock-sessions/`, { params: { user_id: 'me', page, page_size: 5 } })
      const data: any = res.data as any
      setAllSessions(data.results || data)
      setSessionsTotalPages(Math.ceil((data.count || 0) / 5))
    } catch (error) {
      setAllSessions([])
      setSessionsTotalPages(1)
    }
  }

  async function handleClockIn() {
    try {
      const res = await api.post('/clock-sessions/clock_in/')
      setActiveSession(res.data)
    } catch (error) {
      console.error('Clock in failed:', error)
    }
  }

  async function handleClockOut() {
    try {
      const res = await api.post('/clock-sessions/clock_out/')
      setActiveSession(null)
      setElapsedTime(0)
      setLunchElapsedTime(0)
      // Refresh sessions
      loadAllSessions(sessionsPage)
    } catch (error) {
      console.error('Clock out failed:', error)
    }
  }

  async function handleStartLunch() {
    try {
      const res = await api.post('/clock-sessions/start_lunch/')
      setActiveSession(res.data)
    } catch (error) {
      console.error('Start lunch failed:', error)
    }
  }

  async function handleEndLunch() {
    try {
      const res = await api.post('/clock-sessions/end_lunch/')
      setActiveSession(res.data)
    } catch (error) {
      console.error('End lunch failed:', error)
    }
  }

  useEffect(() => { load(filterUser || undefined) }, [selectedDate, range, filterUser])

  useEffect(() => {
    if (activeView === 'individual') return
    if (!dateRange) return
    const targetMe = me || appData?.me || null
    if (!canViewAggregatedUser(targetMe)) return

    const rangeKey = `${dateRange.start}_${dateRange.end}`
    if (aggregatedRangeRef.current === rangeKey && aggregatedSummary) return

    aggregatedRangeRef.current = null
    setAggregatedSummary(null)
    fetchAggregatedSummaryForRange(dateRange.start, dateRange.end, targetMe).then(agg => {
      if (agg) {
        setAggregatedSummary(agg)
        aggregatedRangeRef.current = rangeKey
      }
    })
  }, [activeView, dateRange?.start, dateRange?.end, me, appData?.me])

  const requestAggregatedSummary = async () => {
    if (!dateRange) return
    const targetMe = me || appData?.me || null
    setAggregatedSummary(null)
    aggregatedRangeRef.current = null
    const aggregated = await fetchAggregatedSummaryForRange(dateRange.start, dateRange.end, targetMe)
    if (aggregated) {
      setAggregatedSummary(aggregated)
      aggregatedRangeRef.current = `${dateRange.start}_${dateRange.end}`
    }
  }

  useEffect(() => {
    if (activeSession) {
      const interval = setInterval(() => {
        const now = new Date()
        const start = new Date(activeSession.clock_in_time)
        // Subtract lunch break time so the visible timer pauses during lunch.
        const lunchStart = activeSession.lunch_start_time ? new Date(activeSession.lunch_start_time) : null
        const lunchEnd = activeSession.lunch_end_time ? new Date(activeSession.lunch_end_time) : null
        let lunchMs = 0
        if (lunchStart && lunchEnd) {
          lunchMs = lunchEnd.getTime() - lunchStart.getTime()
        } else if (lunchStart && !lunchEnd) {
          lunchMs = now.getTime() - lunchStart.getTime()
        }
        setElapsedTime(Math.max(0, Math.floor((now.getTime() - start.getTime() - lunchMs) / 1000)))
        if (lunchStart && !lunchEnd) {
          setLunchElapsedTime(Math.max(0, Math.floor((now.getTime() - lunchStart.getTime()) / 1000)))
        } else {
          setLunchElapsedTime(0)
        }
        // Auto clock out at 9PM (21:00)
        if (now.getHours() === 21 && now.getMinutes() === 0) {
          handleClockOut()
        }
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [activeSession])

  function exportFile(type: 'csv' | 'pdf') {
    const params = new URLSearchParams()
    params.set('period', 'month')
    const start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).toISOString().slice(0, 10)
    const end = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).toISOString().slice(0, 10)
    params.set('start_date', start)
    params.set('end_date', end)
    params.set('export', type)

    const isOwner = me?.role === 'superuser'
    const isManager = me?.role === 'manager'
    const isEmployee = me?.role === 'employee'

    if (isOwner) {
      if (filterUser) params.set('user_id', filterUser)
    } else if (isManager) {
      params.set('team', 'true')
      if (filterUser) params.set('user_id', filterUser)
    } else if (isEmployee) {
      params.set('user_id', String(me?.id))
    }

    window.open(`/api/reports/summary/?${params.toString()}`, '_blank')
  }

  const chartData = useMemo(() => {
    const sorted = [...data].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
    return sorted
  }, [data])

  const defaultSummary = useMemo(() => ({
    chart: chartData,
    totals,
    assigned_tasks: assignedTasks,
    threshold_notifications: thresholdNotifications
  }), [chartData, totals, assignedTasks, thresholdNotifications])

  let pendingView = false
  let resolvedSummary = defaultSummary
  if (activeView === 'team' || activeView === 'aggregated') {
    if (aggregatedSummary) {
      resolvedSummary = aggregatedSummary
    } else {
      pendingView = true
    }
  }

  if (pendingView) {
    resolvedSummary = {
      chart: [],
      totals: { today: '--', week: '--', month: '--' },
      assigned_tasks: [],
      threshold_notifications: []
    }
  }

  const currentTotals = resolvedSummary?.totals || { today: '--', week: '--', month: '--' }
  const currentChart = resolvedSummary?.chart || chartData
  const currentTasks = resolvedSummary?.assigned_tasks || []
  const currentThresholds = resolvedSummary?.threshold_notifications || []
  const viewLoading = pendingView && aggregatedLoading

  const formatHours = (value: number | string) => formatDecimalHours(value)

  if (loading) {
    return (
      <div className="p-6 min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-48"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl p-6 shadow-sm">
                  <div className="h-4 bg-gray-200 rounded mb-4"></div>
                  <div className="h-8 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="h-72 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>

        {(activeView === 'team' || activeView === 'aggregated') && aggregatedError && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold">Unable to load aggregated insights.</p>
              <p className="text-sm text-yellow-800">{aggregatedError}</p>
            </div>
            <button
              onClick={requestAggregatedSummary}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-all duration-200"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 min-h-screen bg-gray-50 animate-in fade-in duration-500">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <TrendingUpIcon className="w-6 h-6 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {(isOwner || isManager) && (
              <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden">
                {[
                  { key: 'individual', label: 'My Dashboard' },
                  { key: 'team', label: 'Team Dashboard' },
                  // { key: 'aggregated', label: 'Org Insights' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveView(tab.key as 'individual' | 'team' | 'aggregated')}
                    className={`px-4 py-2 text-sm font-medium transition-all duration-200 ${activeView === tab.key
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {(activeView === 'individual') && (isOwner || isManager) && (
              <select
                className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                value={filterUser}
                onChange={e => { setFilterUser(e.target.value); setActiveView('individual'); load(e.target.value) }}
              >
                <option value="me">Myself</option>
                {users.map((u: any) => <option key={u.id} value={String(u.id)}>{u.first_name || u.username}</option>)}
              </select>
            )}

            <div className="flex items-center gap-2 bg-white rounded-lg p-1 border border-gray-200">
              <button
                onClick={() => {
                  const newDate = new Date(selectedDate)
                  newDate.setMonth(newDate.getMonth() - 1)
                  setSelectedDate(newDate)
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-all duration-200 transform hover:scale-110"
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
                className="px-3 py-1 border-0 focus:ring-0 text-gray-700 font-medium"
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
                className="px-3 py-1 border-0 focus:ring-0 text-gray-700 font-medium"
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
                className="p-2 hover:bg-gray-100 rounded-lg transition-all duration-200 transform hover:scale-110"
              >
                <ChevronRightIcon className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* {(isOwner || isManager) && (
              <div className="flex gap-2">
                <button
                  className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-200 transform hover:scale-105"
                  onClick={()=>exportFile('xlsx')}
                >
                  <DownloadIcon className="w-4 h-4 mr-2" />
                  XLSX
                </button>
                <button 
                  className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-200 transform hover:scale-105" 
                  onClick={()=>exportFile('pdf')}
                >
                  <DownloadIcon className="w-4 h-4 mr-2" />
                  PDF
                </button>
              </div>
            )} */}
          </div>
        </div>

        {/* Threshold Notifications */}
        {currentThresholds.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 animate-in slide-in-from-top duration-500">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-red-100 rounded-lg">
                <TrendingUpIcon className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-lg font-semibold text-red-900">Threshold Exceeded Notifications</h2>
            </div>
            <div className="space-y-3">
              {currentThresholds.map((notif: any) => (
                <div key={notif.project_id} className="bg-white border border-red-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">{notif.project_name}</h3>
                      <p className="text-sm text-gray-600">
                        Threshold: {formatHours(notif.threshold)} | Current: {formatHours(notif.current_hours)} | Exceeded by: {formatHours(notif.exceeded_by)}
                      </p>
                    </div>
                    <div className="text-red-600 font-semibold">⚠️ Exceeded</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary Cards */}
        {viewLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-24 mb-3"></div>
                <div className="h-8 bg-gray-200 rounded w-32"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <SummaryCard
              title="Today"
              value={`${formatHours(currentTotals.today)}`}
              icon={<ClockIcon className="w-6 h-6" />}
              color="blue"
              delay="0"
            />
            <SummaryCard
              title="This Week"
              value={`${formatHours(currentTotals.week)}`}
              icon={<CalendarIcon className="w-6 h-6" />}
              color="green"
              delay="100"
            />
            <SummaryCard
              title="This Month"
              value={`${formatHours(currentTotals.month)}`}
              icon={<TrendingUpIcon className="w-6 h-6" />}
              color="purple"
              delay="200"
            />
          </div>
        )}

        {/* Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-in slide-in-from-bottom duration-500 delay-300">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">
            Time Summary for {selectedDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </h2>
          {viewLoading ? (
            <div className="h-80 flex items-center justify-center text-gray-500">Loading data...</div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={currentChart} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => {
                      if (!v) return ''
                      const [y, m, d] = v.split('-').map(Number)
                      return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    }}
                    stroke="#6b7280"
                    fontSize={12}
                    interval={1}
                  />
                  <YAxis stroke="#6b7280" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                    }}
                    formatter={(value: any) => [formatHours(value), 'Hours']}
                    labelFormatter={(label: any) => {
                      if (!label) return ''
                      const [y, m, d] = label.split('-').map(Number)
                      return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="hours"
                    fill="#3b82f6"
                    name="Hours"
                    radius={[4, 4, 0, 0]}
                    animationDuration={800}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {activeView === 'aggregated' && aggregatedSummary && !viewLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Hours by User</h3>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {(aggregatedSummary.per_user_hours || []).map((row: any) => (
                  <div key={row.user_id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100">
                    <span className="font-medium text-gray-900">{row.user_name}</span>
                    <span className="text-blue-600 font-semibold">{formatHours(row.hours)} h</span>
                  </div>
                ))}
                {(aggregatedSummary.per_user_hours || []).length === 0 && (
                  <p className="text-sm text-gray-500">No aggregated user data available.</p>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Projects</h3>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {(aggregatedSummary.projects || []).map((proj: any) => (
                  <div key={proj.project_id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100">
                    <span className="font-medium text-gray-900">{proj.project_name}</span>
                    <span className="text-purple-600 font-semibold">{formatHours(proj.hours)} h</span>
                  </div>
                ))}
                {(aggregatedSummary.projects || []).length === 0 && (
                  <p className="text-sm text-gray-500">No aggregated project data available.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Two Column Section: Tasks & Office Clock */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Assigned Tasks */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-in slide-in-from-left duration-500 delay-400">
            <div className="flex items-center gap-2 mb-6">
              <TaskIcon className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">Assigned Tasks ({currentTasks.length})</h2>
            </div>

            {viewLoading ? (
              <div className="text-center py-8 text-gray-500">
                Loading data...
              </div>
            ) : currentTasks.length > 0 ? (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {currentTasks.map((t: any, index) => (
                  <div
                    key={t.id}
                    className="border border-gray-100 rounded-lg p-4 hover:bg-gray-50 transition-all duration-200 animate-in slide-in-from-left"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900 mb-2">{t.title}</h3>
                        <div className="space-y-1 text-sm text-gray-600">
                          <div>Project: <span className="font-medium">{t.project_name}</span></div>
                          <div className="flex items-center gap-4">
                            <span>Status: <span className="font-medium">{t.status}</span></span>
                            <span>Due: <span className="font-medium">{t.due_date ? new Date(t.due_date).toLocaleDateString() : 'No due date'}</span></span>
                          </div>
                          <div>Assignees: <span className="font-medium">{t.assigned_user_names?.join(', ') || 'Unassigned'}</span></div>
                        </div>
                      </div>
                      <div className={`px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${t.status === 'completed' ? 'bg-green-100 text-green-800' :
                        t.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                        {t.status?.replace('_', ' ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <TaskIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No assigned tasks</p>
              </div>
            )}
          </div>

          {/* Right Column: Office Clock */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-in slide-in-from-right duration-500 delay-500">
            <div className="flex items-center gap-2 mb-6">
              <ClockIcon className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">Office Clock</h2>
            </div>

            {activeSession ? (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="text-sm text-gray-600 mb-2">
                    Clocked in at: {new Date(activeSession.clock_in_time).toLocaleString("en-US", { day: "numeric", month: "long", })}
                  </div>
                  <div className={`text-4xl font-bold mb-2 font-mono ${activeSession.lunch_start_time && !activeSession.lunch_end_time ? 'text-amber-500' : 'text-blue-600'}`}>
                    {Math.floor(elapsedTime / 3600).toString().padStart(2, '0')}:{Math.floor((elapsedTime % 3600) / 60).toString().padStart(2, '0')}:{(elapsedTime % 60).toString().padStart(2, '0')}
                  </div>
                  {activeSession.lunch_start_time && !activeSession.lunch_end_time && (
                    <div className="mb-4">
                      <div className="text-xs uppercase tracking-wide text-amber-600 font-semibold mb-1">
                        On lunch break — work timer paused
                      </div>
                      <div className="text-2xl font-bold font-mono text-amber-500">
                        {Math.floor(lunchElapsedTime / 3600).toString().padStart(2, '0')}:{Math.floor((lunchElapsedTime % 3600) / 60).toString().padStart(2, '0')}:{(lunchElapsedTime % 60).toString().padStart(2, '0')}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-amber-600/80">
                        Lunch elapsed
                      </div>
                    </div>
                  )}
                  {activeSession.lunch_start_time && activeSession.lunch_end_time && (
                    <div className="text-xs text-gray-500 mb-4">
                      Lunch: {Math.floor((activeSession.lunch_duration_seconds || 0) / 60)} min taken
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-3 flex-wrap mt-4">
                    {/* Lunch break controls: hidden once break has been taken */}
                    {!activeSession.lunch_start_time && (
                      <button
                        onClick={handleStartLunch}
                        className="inline-flex items-center px-5 py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-all duration-200 transform hover:scale-105 font-medium"
                      >
                        <CoffeeIcon className="w-5 h-5 mr-2" />
                        Start Lunch
                      </button>
                    )}
                    {activeSession.lunch_start_time && !activeSession.lunch_end_time && (
                      <button
                        onClick={handleEndLunch}
                        className="inline-flex items-center px-5 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-all duration-200 transform hover:scale-105 font-medium"
                      >
                        <CoffeeIcon className="w-5 h-5 mr-2" />
                        End Lunch
                      </button>
                    )}
                    <button
                      onClick={handleClockOut}
                      className="inline-flex items-center px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all duration-200 transform hover:scale-105 font-medium"
                    >
                      <SquareIcon className="w-5 h-5 mr-2" />
                      Clock Out
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="text-center">
                  <p className="text-gray-600 mb-6">
                    {new Date().toLocaleDateString("en-US",
                      {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                  </p>
                  <button
                    onClick={handleClockIn}
                    className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-200 transform hover:scale-105 font-medium"
                  >
                    <PlayIcon className="w-5 h-5 mr-2" />
                    Clock In
                  </button>
                </div>
              </div>
            )}

            {/* Recent Clock Sessions */}
            {allSessions.length > 0 && (
              <div className="mt-8 pt-6 border-t border-gray-100">
                <h3 className="text-sm font-medium text-gray-900 mb-4">Recent Sessions</h3>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {allSessions.map((session: any) => {
                    const seconds = typeof session.duration === 'string' ? parseISODurationSeconds(session.duration) : (session.duration?.seconds || 0)
                    const hours = Math.floor(seconds / 3600)
                    const minutes = Math.floor((seconds % 3600) / 60)
                    return (
                      <div key={session.id} className="text-sm bg-gray-50 p-3 rounded-lg">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium text-gray-900">{new Date(session.date).toLocaleDateString("en-US", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}</span>
                          <span className="text-blue-600 font-medium">
                            {session.clock_out_time ? `${hours}h ${minutes}m` : 'Ongoing'}
                          </span>
                        </div>
                        <div className="text-gray-600 text-xs">
                          {new Date(session.clock_in_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}
                          {session.clock_out_time && ` → ${new Date(session.clock_out_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}`}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {sessionsTotalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between">
                    <button
                      onClick={() => { const newPage = Math.max(1, sessionsPage - 1); setSessionsPage(newPage); loadAllSessions(newPage) }}
                      disabled={sessionsPage === 1}
                      className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-600">Page {sessionsPage} of {sessionsTotalPages}</span>
                    <button
                      onClick={() => { const newPage = Math.min(sessionsTotalPages, sessionsPage + 1); setSessionsPage(newPage); loadAllSessions(newPage) }}
                      disabled={sessionsPage === sessionsTotalPages}
                      className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ title, value, icon, color, delay }: {
  title: string,
  value: string,
  icon: React.ReactNode,
  color: string,
  delay: string
}) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600'
  }

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all duration-300 transform hover:scale-105 animate-in slide-in-from-bottom"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 text-sm font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color as keyof typeof colorClasses]}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
