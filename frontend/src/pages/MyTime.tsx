import React, { useEffect, useMemo, useState, useRef } from 'react'
import api, { getCached } from '../lib/api'
import { Calendar, dateFnsLocalizer, View, Views } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay, addDays } from 'date-fns'
import { enUS } from 'date-fns/locale'
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'
import { Clock as ClockIcon, Plus as PlusIcon, X as XMarkIcon, Trash as TrashIcon, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, Pencil as PencilIcon, Sparkles } from 'lucide-react'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { 'en-US': enUS }
})

const DnDCalendar = withDragAndDrop(Calendar)

import { useAppData } from '../lib/AppDataContext'

function getPartsFromISO(iso: string) {
  if (!iso) return { date: '', time: '', ampm: 'AM' }
  const d = new Date(iso)
  if (isNaN(d.getTime())) return { date: '', time: '', ampm: 'AM' }

  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const dateStr = `${year}-${month}-${day}`

  let hours = d.getHours()
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  hours = hours ? hours : 12
  const timeStr = `${hours}:${minutes}`

  return { date: dateStr, time: timeStr, ampm }
}

function updateISOFromParts(currentIso: string, updates: { date?: string, time?: string, ampm?: string }) {
  const current = getPartsFromISO(currentIso)
  const date = updates.date !== undefined ? updates.date : current.date
  const time = updates.time !== undefined ? updates.time : current.time
  const ampm = updates.ampm !== undefined ? updates.ampm : current.ampm

  if (!date) return currentIso

  let [h, m] = (time || '12:00').split(':').map(Number)
  if (isNaN(h)) h = 12
  if (isNaN(m)) m = 0

  if (ampm === 'PM' && h < 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0

  const [year, month, day] = date.split('-').map(Number)
  const newDate = new Date(year, month - 1, day, h, m)

  const pad = (n: number) => String(n).padStart(2, '0')
  return `${newDate.getFullYear()}-${pad(newDate.getMonth() + 1)}-${pad(newDate.getDate())}T${pad(newDate.getHours())}:${pad(newDate.getMinutes())}`
}

const DateTimePicker = ({ label, value, onChange, required, showDate = true }: any) => {
  const [datePart, setDatePart] = useState('')
  const [timePart, setTimePart] = useState('')
  const [ampmPart, setAmpmPart] = useState<'AM' | 'PM'>('AM')

  useEffect(() => {
    const { date, time, ampm } = getPartsFromISO(value)
    setDatePart(date)
    setTimePart(time)
    setAmpmPart(ampm as any)
  }, [value])

  const handleDateChange = (e: any) => {
    const newDate = e.target.value
    setDatePart(newDate)
    onChange(updateISOFromParts(value, { date: newDate, time: timePart, ampm: ampmPart }))
  }

  const handleTimeChange = (e: any) => {
    const newTime = e.target.value
    setTimePart(newTime)
    if (/^\d{1,2}:\d{2}$/.test(newTime)) {
      onChange(updateISOFromParts(value, { date: datePart, time: newTime, ampm: ampmPart }))
    }
  }

  const handleTimeBlur = () => {
    const { time } = getPartsFromISO(value)
    if (!/^\d{1,2}:\d{2}$/.test(timePart)) {
      setTimePart(time)
    }
  }

  const toggleAmpm = () => {
    const newAmpm = ampmPart === 'AM' ? 'PM' : 'AM'
    setAmpmPart(newAmpm)
    onChange(updateISOFromParts(value, { date: datePart, time: timePart, ampm: newAmpm }))
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-gray-700">{label}</label>
      <div className="flex gap-2">
        {showDate && (
          <input
            type="date"
            className="flex-1 px-4 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-neutral-700 focus:border-transparent transition-all duration-75 bg-white/50 backdrop-blur-sm"
            value={datePart}
            onChange={handleDateChange}
            required={required}
          />
        )}
        <div className={`flex items-center bg-white border border-gray-200 rounded-2xl focus-within:ring-2 focus-within:ring-neutral-700 focus-within:border-transparent transition-all duration-75 overflow-hidden ${!showDate ? 'w-full' : ''}`}>
          <input
            type="text"
            className="flex-1 px-4 py-4 bg-transparent border-none outline-none ring-0 focus:ring-0 font-medium text-gray-900 placeholder-gray-400 min-w-0"
            style={{ border: 'none', boxShadow: 'none' }}
            placeholder="hh:mm"
            value={timePart}
            onChange={handleTimeChange}
            onBlur={handleTimeBlur}
            required={required}
          />
          <button
            type="button"
            onClick={toggleAmpm}
            className="px-4 py-4 bg-gray-50 hover:bg-gray-100 border-l border-gray-200 text-sm font-bold transition-colors text-gray-700 min-w-[4rem] h-full flex items-center justify-center"
          >
            {ampmPart}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MyTime() {
  const { data: appData, ready: appReady } = useAppData()
  const [entries, setEntries] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [assignedProjects, setAssignedProjects] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [tags, setTags] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [me, setMe] = useState<any>(null)
  const [selectedUserId, setSelectedUserId] = useState<string>('me')
  const [form, setForm] = useState({ project: '', task: '', start_datetime: '', end_datetime: '', description: '', repeatWeekly: false, user: '', tags: [] as number[], plan_item: '' as any, done: '' as any })
  // Today's daily plan (items the employee plans to complete today).
  const [planItems, setPlanItems] = useState<any[]>([])
  const [planTaskId, setPlanTaskId] = useState('')
  const [planDesc, setPlanDesc] = useState('')
  const [planBusy, setPlanBusy] = useState(false)
  const [myTasks, setMyTasks] = useState<any[]>([])
  const [editId, setEditId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  // Calendar-specific state
  const [view, setView] = useState<View>(Views.WEEK)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [showTimeEntryModal, setShowTimeEntryModal] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date, end: Date } | null>(null)
  const [calendarEvents, setCalendarEvents] = useState<any[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [eventToDelete, setEventToDelete] = useState<any>(null)
  const [showCommentDeleteConfirm, setShowCommentDeleteConfirm] = useState(false)
  const calendarRef = useRef<any>(null)

  // Tooltip state
  const [tooltip, setTooltip] = useState<{ show: boolean, x: number, y: number, description: string }>({ show: false, x: 0, y: 0, description: '' })
  const tooltipTimeoutRef = useRef<number | null>(null)

  // Action selection state
  const [showActionModal, setShowActionModal] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<any>(null)
  const [showCommentModal, setShowCommentModal] = useState(false)

  // Comments state
  const [commentText, setCommentText] = useState('')
  const [comments, setComments] = useState<any[]>([])
  const [commentsNext, setCommentsNext] = useState<string | null>(null)
  const [loadingComments, setLoadingComments] = useState(false)

  // Calendar time boundaries - show full 24 hours but scroll to 8 AM
  const minTime = useMemo(() => new Date(2023, 1, 1, 0, 0, 0), []) // 12:00 AM (midnight)
  const maxTime = useMemo(() => new Date(2023, 1, 1, 23, 59, 59), []) // 11:59 PM
  const scrollToTime = useMemo(() => new Date(2023, 1, 1, 8, 0, 0), []) // Scroll to 8:00 AM

  // Project colors matching reports
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

  // Dynamic height
  const dynamicHeight = useMemo(() => {
    if (view === Views.MONTH) return 900
    const counts = new Map<string, number>()
    for (const ev of calendarEvents) {
      const key = ymd(ev.start)
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    const maxInADay = counts.size ? Math.max(1, ...counts.values()) : 1
    const base = 800 // Increased base height for better spacing
    const extra = Math.max(0, maxInADay - 3) * 80 // More generous scaling for multiple entries
    return base + extra
  }, [calendarEvents, view])

  // Dynamic month cell height
  const maxEventsPerDay = useMemo(() => {
    const counts = new Map<string, number>()
    for (const ev of calendarEvents) {
      const key = ymd(ev.start)
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return Math.max(1, ...counts.values())
  }, [calendarEvents])

  const monthCellHeight = useMemo(() => 120 + maxEventsPerDay * 40, [maxEventsPerDay])

  function toRelative(nextUrl: string) {
    try {
      const u = new URL(nextUrl, window.location.origin)
      const path = u.pathname + u.search
      return path.startsWith('/api/') ? path.replace('/api/', '/') : path
    } catch {
      return nextUrl
    }
  }

  async function fetchAll(path: string) {
    let url: any = path
    const items: any[] = []
    while (url) {
      const res = await getCached(url)
      const data: any = res.data as any
      const chunk = data.results || data
      if (Array.isArray(chunk)) items.push(...chunk)
      url = data.next ? toRelative(data.next) : null
    }
    return items
  }

  function ymd(d: Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  function endOfDay(d: Date) {
    const x = new Date(d)
    x.setHours(23, 59, 59, 999)
    return x
  }

  function startOfDay(d: Date) {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
  }

  function splitByDay(entry: any) {
    const parts: any[] = []
    const s = new Date(entry.start_datetime)
    const e = new Date(entry.end_datetime)

    // same-day fast path
    if (s.toDateString() === e.toDateString()) {
      parts.push({ start: s, end: e })
      return parts
    }

    // first day segment
    parts.push({ start: s, end: endOfDay(s) })

    // middle full days (if any)
    let cur = new Date(startOfDay(addDays(s, 1)))
    while (cur < startOfDay(e)) {
      parts.push({ start: cur, end: endOfDay(cur) })
      cur = addDays(cur, 1)
    }

    // last day segment
    parts.push({ start: startOfDay(e), end: e })

    return parts
  }

  async function load() {
    try {
      let startDate: Date
      let endDate: Date
      if (view === Views.DAY) {
        startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate())
        endDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate())
      } else if (view === Views.WEEK) {
        const day = currentDate.getDay()
        startDate = new Date(currentDate)
        startDate.setDate(currentDate.getDate() - day)
        endDate = new Date(startDate)
        endDate.setDate(startDate.getDate() + 6)
      } else if (view === Views.MONTH) {
        startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
        endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
      } else {
        startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
        endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
      }

      // Prefer global aggregated data when looking at current month
      const aggRaw = localStorage.getItem('tt_cache:/app-initial-data/?lite=1')
      let usedAggregated = false
      if (aggRaw) {
        try {
          const agg = JSON.parse(aggRaw)
          const meta = agg?.data?.meta
          const startKey = String(meta?.start_date || '').slice(0, 7)
          const endKey = String(meta?.end_date || '').slice(0, 7)
          const thisKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`
          if (startKey === thisKey && endKey === thisKey && view === Views.MONTH) {
            const d = agg.data
            setMe(d.me)
            setUsers(d.users || [])
            setTags(d.tags || [])
            const list = (d.time_entries || []).filter((e: any) => {
              const uid = selectedUserId || 'me'
              if (uid === 'me') return String(e.user) === String(d.me.id)
              return String(e.user) === String(uid)
            })
            list.sort((a: any, b: any) => new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime())
            setEntries(list)
            setProjects(d.projects || [])
            setAssignedProjects(d.projects || [])
            usedAggregated = true
          }
        } catch { }
      }

      if (!usedAggregated) {
        const [meRes, e, p, u, _ap, tagsData] = await Promise.all([
          getCached('/auth/me/'),
          fetchAll(`/time-entries/?user_id=${selectedUserId || 'me'}&start_date=${ymd(startDate)}&end_date=${ymd(endDate)}&page_size=1000`),
          appReady && appData?.projects ? Promise.resolve(appData.projects) : fetchAll('/projects/?page_size=200'),
          appReady && appData?.users ? Promise.resolve(appData.users) : getCached('/users/light/'),
          Promise.resolve([]),
          appReady && appData?.tags ? Promise.resolve(appData.tags) : fetchAll('/tags/?page_size=100'),
        ])
        setMe(meRes.data as any)
        const resolvedUsers = Array.isArray(u) ? u : (u as any)?.data
        setUsers(resolvedUsers || [])
        setTags(Array.isArray(tagsData) ? tagsData : (tagsData as any[]))
        const entriesList = Array.isArray(e) ? e : []
        entriesList.sort((a: any, b: any) => new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime())
        setEntries(entriesList)
        const projectsArr = Array.isArray(p) ? p : (p as any[])
        setProjects(projectsArr)
        setAssignedProjects(projectsArr)
      }

      // Today's daily plan for the selected user (read-only unless it's "me").
      try {
        const pres = await api.get('/daily-plan/', { params: { user: selectedUserId || 'me', date: ymd(new Date()) } })
        const pd: any = pres.data
        setPlanItems(pd.results || pd || [])
      } catch { setPlanItems([]) }
      // Tasks the current user is assigned to (the plan-item picker).
      if (!selectedUserId || selectedUserId === 'me') {
        try {
          const tres = await api.get('/tasks/my_notifications/', { params: { page_size: 200 } })
          const td: any = tres.data
          setMyTasks(td.results || td || [])
        } catch { setMyTasks([]) }
      }
    } catch (error) {
      console.error('Failed to load time entries:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [currentDate, selectedUserId, view])

  useEffect(() => {
    if (form.project) {
      if (appReady && appData?.tasks) {
        const filtered = (appData.tasks as any[]).filter(t => String(t.project) === String(form.project))
        setTasks(filtered)
      } else {
        fetchAll(`/tasks/?project=${form.project}&page_size=200`).then(setTasks)
      }
    } else {
      setTasks([])
    }
  }, [form.project, appReady])

  function formatDuration(startDate: Date, endDate: Date): string {
    const durationMs = endDate.getTime() - startDate.getTime()
    const hours = Math.floor(durationMs / (1000 * 60 * 60))
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes.toString().padStart(2, '0')}m`
    } else if (hours > 0) {
      return `${hours}h 00m`
    } else {
      return `${minutes}m`
    }
  }

  useEffect(() => {
    const events = entries.flatMap((entry, idx) => {
      const color = getEventColor(entry.project || 0, idx)
      const segments = splitByDay(entry)
      return segments.map((seg, segIdx) => ({
        id: `${entry.id}-${segIdx}`,
        title: `${entry.manager_comment ? '💬 ' : ''}${entry.project_name || 'Project'} - ${entry.task_title || 'Task'}`,
        start: seg.start,
        end: seg.end,
        resource: entry,
        color
      }))
    })
    setCalendarEvents(events)
  }, [entries])

  const getEventColor = (projectId: number, index: number) => {
    const bgColor = COLORS[projectId % COLORS.length] || COLORS[index % COLORS.length] || COLORS[0]
    // Simple luminance check for contrast
    const luminance = (hex: string) => {
      const rgb = parseInt(hex.slice(1), 16)
      const r = (rgb >> 16) & 0xff
      const g = (rgb >> 8) & 0xff
      const b = rgb & 0xff
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const textColor = luminance(bgColor) > 128 ? '#1F2937' : '#FFFFFF' // Dark gray or white
    return { bgColor, textColor }
  }

  function toDatetimeLocal(d: Date) {
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  function parseDurationToSeconds(dur: string) {
    if (!dur) return 0
    let days = 0
    let timePart = dur
    if (dur.includes('day')) {
      const parts = dur.split(', ')
      if (parts.length === 2) {
        const daysStr = parts[0].replace(/ days?/, '')
        days = parseInt(daysStr, 10) || 0
        timePart = parts[1]
      }
    }
    const [h, m, s] = timePart.split(':').map(Number)
    return days * 86400 + (h || 0) * 3600 + (m || 0) * 60 + (s || 0)
  }

  const handleSelectSlot = ({ start, end }: { start: Date, end: Date }) => {
    setSelectedSlot({ start, end })
    const startStr = toDatetimeLocal(start)
    const endStr = toDatetimeLocal(end)
    setForm(f => ({ ...f, start_datetime: startStr, end_datetime: endStr, user: selectedUserId !== 'me' ? selectedUserId : '' }))
    setShowTimeEntryModal(true)
  }

  const handleSelectEvent = (event: any) => {
    setSelectedEntry(event.resource)
    setShowActionModal(true)
  }

  function resolveEntryTagIds(entry: any): number[] {
    if (Array.isArray(entry?.tag_ids)) return entry.tag_ids
    if (Array.isArray(entry?.tags)) return entry.tags
    if (Array.isArray(entry?.tag_names)) return entry.tag_names.map((t: any) => t.id)
    return []
  }

  const handleEditAction = () => {
    const entry = selectedEntry
    setEditId(entry.id)

    const start = new Date(entry.start_datetime)
    const end = new Date(entry.end_datetime)

    setForm({
      project: String(entry.project),
      task: entry.task || '',
      start_datetime: toDatetimeLocal(start),  // ✅ Localize time
      end_datetime: toDatetimeLocal(end),      // ✅ Localize time
      description: entry.description || '',
      repeatWeekly: false,
      user: String(entry.user) || 'me',
      tags: resolveEntryTagIds(entry),
      plan_item: entry.plan_item ? String(entry.plan_item) : '',
      done: entry.done === true ? 'true' : entry.done === false ? 'false' : '',
    })

    setShowActionModal(false)
    setShowTimeEntryModal(true)
  }

  const handleCommentAction = () => {
    const entry = selectedEntry
    setEditId(entry.id)
    setCommentText(entry.manager_comment || '')
    setShowActionModal(false)
    setShowCommentModal(true)
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    if (!form.project) {
      setError('Please select a project')
      setSaving(false)
      return
    }
    if (!form.task) {
      setError('Please select a task')
      setSaving(false)
      return
    }
    if (!form.tags || form.tags.length === 0) {
      setError('Please select at least one tag')
      setSaving(false)
      return
    }
    const startDate = new Date(form.start_datetime)
    const endDate = new Date(form.end_datetime)
    if (endDate <= startDate) {
      setError('End time must be after start time')
      setSaving(false)
      return
    }
    const newDurationSeconds = (endDate.getTime() - startDate.getTime()) / 1000
    const newHours = newDurationSeconds / 3600
    const projectId = Number(form.project)
    const project = projects.find((p: any) => p.id === projectId)
    if (!project) {
      setError('Invalid project')
      setSaving(false)
      return
    }
    const threshold = parseFloat(project.monthly_threshold_hours) || 0
    let confirmExceed = false
    if (threshold > 0) {
      const monthStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
      const monthEnd = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0)
      monthEnd.setHours(23, 59, 59, 999)
      let currentHours = 0
      let useLocalData = false
      try {
        const url = `/time-entries/summary/?project=${projectId}&start_date=${ymd(monthStart)}&end_date=${ymd(monthEnd)}`
        console.log('Fetching time summary:', url)
        const res = await api.get(url)
        if (!res.data?.total) {
          throw new Error('Invalid response: total duration missing')
        }
        const totalStr = res.data.total
        const currentSeconds = parseDurationToSeconds(totalStr)
        currentHours = currentSeconds / 3600
      } catch (err: any) {
        console.error('Failed to fetch project total hours:', err.message, err.response?.status, err.response?.data)
        useLocalData = true
        const localEntries = entries.filter(
          (e: any) =>
            e.project === projectId &&
            new Date(e.start_datetime) >= monthStart &&
            new Date(e.start_datetime) <= monthEnd
        )
        currentHours = localEntries.reduce((sum: number, e: any) => {
          const seconds = typeof e.duration === 'string' ? parseDurationToSeconds(e.duration) : (e.duration?.seconds || 0)
          return sum + seconds / 3600
        }, 0)
      }
      let adjustedCurrent = currentHours
      if (editId) {
        const oldEntry = entries.find((e: any) => e.id === editId)
        if (oldEntry && oldEntry.project === projectId) {
          const oldStart = new Date(oldEntry.start_datetime)
          const oldEnd = new Date(oldEntry.end_datetime)
          const oldSeconds = (oldEnd.getTime() - oldStart.getTime()) / 1000
          if (oldStart.getFullYear() === startDate.getFullYear() && oldStart.getMonth() === startDate.getMonth()) {
            adjustedCurrent -= oldSeconds / 3600
          }
        }
      }
      const wouldBeTotal = adjustedCurrent + newHours
      if (wouldBeTotal > threshold) {
        const message = useLocalData
          ? `Unable to verify project hours due to an error. Using local data (${adjustedCurrent.toFixed(2)} hours). Adding this entry would exceed the project's monthly threshold of ${threshold} hours (new total: ${wouldBeTotal.toFixed(2)}). Proceed anyway?`
          : `Adding this entry would exceed the project's monthly threshold of ${threshold} hours (current: ${adjustedCurrent.toFixed(2)}, new total: ${wouldBeTotal.toFixed(2)}). Proceed anyway?`
        const confirmProceed = window.confirm(message)
        if (!confirmProceed) {
          setError('Threshold exceed canceled by user.')
          setSaving(false)
          return
        }
        confirmExceed = true
      }
    }
    try {
      const payload: any = {
        project: Number(form.project),
        start_datetime: startDate.toISOString(),
        end_datetime: endDate.toISOString(),
        description: form.description,
        tags: form.tags || [],
      }
      if (confirmExceed) payload.confirm_exceed = true
      if (form.task) payload.task = Number(form.task)
      if (form.plan_item) payload.plan_item = Number(form.plan_item)
      if (form.done === 'true') payload.done = true
      else if (form.done === 'false') payload.done = false
      if (form.user && form.user !== 'me') {
        payload.user = Number(form.user)
      } else if (selectedUserId && selectedUserId !== 'me') {
        payload.user = Number(selectedUserId)
      }
      if (editId) {
        await api.patch(`/time-entries/${editId}/`, payload)
      } else if (form.repeatWeekly) {
        // Repeat the entry from the selected day to Friday of the same week
        const start = new Date(form.start_datetime);
        const end = new Date(form.end_datetime);

        // Start from the selected day
        const current = new Date(start);

        // Continue until Friday (day 5)
        for (
          let date = new Date(current);
          date.getDay() >= 1 && date.getDay() <= 5;
          date.setDate(date.getDate() + 1)
        ) {
          const newStart = new Date(date);
          newStart.setHours(start.getHours(), start.getMinutes(), 0, 0);

          const newEnd = new Date(date);
          newEnd.setHours(end.getHours(), end.getMinutes(), 0, 0);

          const weeklyPayload = {
            ...payload,
            start_datetime: newStart.toISOString(),
            end_datetime: newEnd.toISOString(),
          };

          await api.post('/time-entries/', weeklyPayload);
        }
      } else {
        await api.post('/time-entries/', payload)
      }
      setForm({ project: '', task: '', start_datetime: '', end_datetime: '', description: '', repeatWeekly: false, user: '', tags: [], plan_item: '', done: '' })
      setEditId(null)
      setSelectedSlot(null)
      setShowTimeEntryModal(false)
      await load()
    } catch (err: any) {
      const data = err?.response?.data
      setError(typeof data === 'string' ? data : JSON.stringify(data))
    } finally {
      setSaving(false)
    }
  }

  const closeModal = () => {
    setShowTimeEntryModal(false)
    setSelectedSlot(null)
    setEditId(null)
    setForm({ project: '', task: '', start_datetime: '', end_datetime: '', description: '', repeatWeekly: false, user: '', tags: [], plan_item: '', done: '' })
    setError('')
    setSelectedEntry(null)
  }

  const planEditable = (!selectedUserId || selectedUserId === 'me')

  async function addPlanItem(e: React.FormEvent) {
    e.preventDefault()
    if (!planTaskId || !planDesc.trim()) return
    setPlanBusy(true)
    try {
      await api.post('/daily-plan/', { task: Number(planTaskId), description: planDesc.trim() })
      setPlanTaskId('')
      setPlanDesc('')
      await load()
    } catch (err: any) {
      const d = err?.response?.data
      alert(typeof d === 'object' && d ? Object.values(d).flat().join('\n') : (d?.detail || 'Could not add plan item.'))
    } finally {
      setPlanBusy(false)
    }
  }

  async function deletePlanItem(id: number) {
    if (!confirm('Remove this plan item?')) return
    try {
      await api.delete(`/daily-plan/${id}/`)
      await load()
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Could not remove plan item.')
    }
  }

  const closeCommentModal = () => {
    setShowCommentModal(false)
    setEditId(null)
    setCommentText('')
    setSelectedEntry(null)
  }

  const closeActionModal = () => {
    setShowActionModal(false)
    setSelectedEntry(null)
  }

  async function remove(id: number) {
    await api.delete(`/time-entries/${id}/`)
    await load()
  }

  const handleDeleteEvent = (event: any) => {
    setEventToDelete(event)
    setShowDeleteConfirm(true)
  }

  const confirmDelete = async () => {
    if (eventToDelete) {
      await remove(eventToDelete.resource.id)
      setShowDeleteConfirm(false)
      setEventToDelete(null)
      closeModal()
    }
  }

  const clampToSameDay = (start: Date, end: Date, originalDurationMs?: number) => {
    const duration = originalDurationMs ?? Math.max(0, end.getTime() - start.getTime())
    let newEnd = new Date(start.getTime() + duration)
    if (newEnd.toDateString() !== start.toDateString()) {
      newEnd = new Date(start)
      newEnd.setHours(23, 59, 59, 999)
    }
    return { start, end: newEnd }
  }

  const handleEventDrop = async (data: any) => {
    const { event, start, end } = data;
    try {
      const durationMs = event.end.getTime() - event.start.getTime();
      const clamped = clampToSameDay(start, end, durationMs);
      const newStart = clamped.start;
      const newEnd = clamped.end;
      const dayChanged = event.start.toDateString() !== newStart.toDateString();
      const baseId = Number(event.id.toString().split('-')[0]);

      if (!dayChanged) {
        await api.patch(`/time-entries/${baseId}/`, {
          start_datetime: newStart.toISOString(),
          end_datetime: newEnd.toISOString(),
        });
      } else {
        const confirmRepeat = window.confirm(
          'Do you want to repeat this entry for the entire week at the same time?'
        );

        const payload: any = {
          project: event.resource.project,
          start_datetime: newStart.toISOString(),
          end_datetime: newEnd.toISOString(),
          description: event.resource.description || '',
        };
        if (event.resource.task) payload.task = event.resource.task;
        if (event.resource.user && event.resource.user !== 'me') {
          payload.user = event.resource.user;
        }

        if (confirmRepeat) {
          const startDate = new Date(newStart);
          const endDate = new Date(newEnd);

          // Repeat from selected day → Friday (Mon–Fri only)
          for (
            let date = new Date(startDate);
            date.getDay() >= 1 && date.getDay() <= 5;
            date.setDate(date.getDate() + 1)
          ) {
            const dayStart = new Date(date);
            dayStart.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);

            const dayEnd = new Date(date);
            dayEnd.setHours(endDate.getHours(), endDate.getMinutes(), 0, 0);

            const weeklyPayload = {
              ...payload,
              start_datetime: dayStart.toISOString(),
              end_datetime: dayEnd.toISOString(),
            };

            await api.post('/time-entries/', weeklyPayload);
          }
        } else {
          await api.post('/time-entries/', payload);
        }
      }

      await load();
    } catch (error) {
      console.error('Error updating time entry:', error);
      setError('Failed to update time entry');
    }
  }
  const handleEventResize = async (data: any) => {
    const { event, start, end } = data
    try {
      const { start: s, end: e } = clampToSameDay(start, end)
      const baseId = Number(event.id.toString().split('-')[0])
      await api.patch(`/time-entries/${baseId}/`, {
        start_datetime: s.toISOString(),
        end_datetime: e.toISOString()
      })
      await load()
    } catch (error) {
      console.error('Error updating time entry:', error)
      setError('Failed to update time entry')
    }
  }

  async function loadComments(initial = false) {
    if (loadingComments) return
    setLoadingComments(true)
    try {
      const url = commentsNext && !initial ? commentsNext : `/time-entries/comments/?user_id=${selectedUserId || 'me'}&page_size=20`
      const res = await api.get(url)
      const data = res.data
      const chunk = data.results || data
      const items = Array.isArray(chunk) ? chunk : []
      setComments(prev => initial ? items : [...prev, ...items])
      if (data.next) {
        const u = new URL(data.next, window.location.origin)
        const p = (u.pathname + u.search)
        setCommentsNext(p.startsWith('/api/') ? p.replace('/api/', '/') : p)
      } else {
        setCommentsNext(null)
      }
    } catch (e) {
      // ignore
    } finally {
      setLoadingComments(false)
    }
  }

  useEffect(() => {
    setComments([])
    setCommentsNext(null)
    loadComments(true)
  }, [selectedUserId])

  async function addManagerComment() {
    if (!editId) return
    try {
      await api.post(`/time-entries/${editId}/add_comment/`, { comment: commentText })
      setShowCommentModal(false)
      setCommentText('')
      setEditId(null)
      setSelectedEntry(null)
      await load()
      await loadComments(true)
    } catch (e) {
      console.error('Failed to add comment', e)
    }
  }

  async function deleteManagerComment() {
    if (!editId) return
    try {
      await api.post(`/time-entries/${editId}/delete_comment/`)
      await load()
      await loadComments(true)
      closeCommentModal()
    } catch (err: any) {
      setError('Failed to delete comment')
      console.error(err)
    }
  }

  const handleDeleteCommentAction = async () => {
    if (!selectedEntry) return
    try {
      await api.post(`/time-entries/${selectedEntry.id}/delete_comment/`)
      await load()
      setShowActionModal(false)
      setSelectedEntry(null)
    } catch (err: any) {
      setError('Failed to delete comment')
    }
  }

  if (loading) {
    return (
      <div className="p-6 min-h-screen bg-gradient-to-br from-slate-50 to-neutral-50">
        <div className="w-full">
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="h-12 w-12 bg-gradient-to-br from-neutral-700 to-purple-600 rounded-xl animate-pulse shadow-lg"></div>
                  <div className="absolute inset-0 bg-gradient-to-br from-neutral-700 to-purple-600 rounded-xl animate-pulse opacity-50 blur-sm"></div>
                </div>
                <div className="h-8 bg-gray-200 rounded-xl w-48 animate-pulse"></div>
              </div>
              <div className="flex gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 w-20 bg-gray-200 rounded-xl animate-pulse" style={{ animationDelay: `${i * 200}ms` }}></div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-xl h-96 animate-pulse border border-white/20 backdrop-blur-sm"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 min-h-screen bg-gradient-to-br from-slate-50 via-neutral-50 to-neutral-50">
      <div className="w-full space-y-8">
        {/* Enhanced Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-neutral-900 rounded-2xl">
              <ClockIcon className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-neutral-900">
                My Time
              </h1>
              <p className="text-gray-600 text-sm mt-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-neutral-700" />
                Manage your time like a pro
              </p>
            </div>
          </div>

          <div className="flex gap-2 items-center flex-wrap">
            {(me?.role === 'manager' || me?.role === 'superuser') && (
              <select
                className="px-4 py-2 border border-gray-200 rounded-2xl bg-white/70"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="me">My calendar</option>
                {users.map((u: any) => (
                  <option key={u.id} value={String(u.id)}>{u.first_name || u.username}</option>
                ))}
              </select>
            )}
            {[
              { view: Views.DAY, label: 'Day', icon: '📅' },
              { view: Views.WEEK, label: 'Week', icon: '🗓️' },
              { view: Views.MONTH, label: 'Month', icon: '📆' }
            ].map(({ view: viewType, label, icon }) => (
              <button
                key={label}
                className={`group px-6 py-3 rounded-2xl text-sm font-semibold transition-all duration-75 hover:scale-105 border backdrop-blur-sm ${view === viewType
                  ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                  : 'bg-white/70 text-gray-700 hover:bg-white/90 border-white/20 shadow-md hover:shadow-lg'
                  }`}
                onClick={() => setView(viewType)}
              >
                <span className="mr-2 group-hover:animate-bounce">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Today's Plan */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Today's Plan</h2>
              <p className="text-xs text-gray-500">
                {planEditable
                  ? 'What you plan to complete today, on your assigned tasks.'
                  : "Viewing the selected user's plan (read-only)."}
              </p>
            </div>
            <span className="text-xs font-medium text-gray-500">{ymd(new Date())}</span>
          </div>

          {planEditable && (
            <form onSubmit={addPlanItem} className="flex flex-col sm:flex-row gap-2 mb-4">
              <select
                value={planTaskId}
                onChange={(e) => setPlanTaskId(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-xl bg-white text-sm sm:w-64"
                required
              >
                <option value="">Select an assigned task…</option>
                {myTasks.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {(t.project_name ? t.project_name + ' — ' : '')}{t.title}
                  </option>
                ))}
              </select>
              <input
                value={planDesc}
                onChange={(e) => setPlanDesc(e.target.value)}
                placeholder="What will you complete today?"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl bg-white text-sm"
                required
              />
              <button
                type="submit"
                disabled={planBusy}
                className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-900 disabled:opacity-50"
              >
                {planBusy ? 'Adding…' : 'Add'}
              </button>
            </form>
          )}

          {planItems.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-400">
              No plan items for today{planEditable ? ' yet — add what you’ll work on.' : '.'}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {planItems.map((it: any) => (
                <li key={it.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{it.description}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {it.project_name} · {it.task_title}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {it.progress?.hours || 0}h logged · {it.progress?.done || 0} done
                      {it.progress?.not_done ? ` · ${it.progress.not_done} not done` : ''}
                    </div>
                  </div>
                  {planEditable && (
                    <button
                      onClick={() => deletePlanItem(it.id)}
                      className="text-xs text-gray-400 hover:text-red-600 shrink-0"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Enhanced Calendar Container */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 transition-shadow duration-75">
          <div className="calendar-wrapper">
            <DnDCalendar
              ref={calendarRef}
              localizer={localizer}
              events={calendarEvents}
              startAccessor={(event: any) => event.start}
              endAccessor={(event: any) => event.end}
              min={minTime}
              max={maxTime}
              scrollToTime={scrollToTime}
              style={{
                height: dynamicHeight,
                fontFamily: 'inherit'
              }}
              view={view}
              onView={setView}
              date={currentDate}
              onNavigate={setCurrentDate}
              selectable
              resizable
              dayLayoutAlgorithm="no-overlap"
              showAllEvents={true}
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectEvent}
              onDoubleClickEvent={handleDeleteEvent}
              onEventDrop={handleEventDrop}
              onEventResize={handleEventResize}
              showMultiDayTimes={true}
              eventPropGetter={(event: any) => ({
                style: {
                  backgroundColor: event.color.bgColor,
                  color: event.color.textColor,
                  borderRadius: '12px',
                  opacity: 0.95,
                  border: 'none',
                  fontSize: '13px',
                  padding: '6px 12px',
                  boxShadow: '0 8px 25px -8px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(8px)',
                  fontWeight: '500',
                  transition: 'all 0.05s ease',
                  cursor: 'pointer'
                }
              })}
              components={{
                toolbar: ({ label, onNavigate }) => (
                  <div className="flex items-center justify-between mb-8 pt-6 px-6 pb-6 border-b border-gray-100">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          onNavigate('PREV')
                        }}
                        className="group p-3 hover:bg-gray-50 rounded-2xl transition-all duration-75 hover:scale-110 hover:shadow-lg"
                      >
                        <ChevronLeftIcon className="w-6 h-6 text-gray-600 group-hover:text-neutral-900 transition-colors duration-75" />
                      </button>
                      <h2 className="text-2xl font-bold text-neutral-900">
                        {label}
                      </h2>
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          onNavigate('NEXT')
                        }}
                        className="group p-3 hover:bg-gray-50 rounded-2xl transition-all duration-75 hover:scale-110 hover:shadow-lg"
                      >
                        <ChevronRightIcon className="w-6 h-6 text-gray-600 group-hover:text-neutral-900 transition-colors duration-75" />
                      </button>
                    </div>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        onNavigate('TODAY')
                      }}
                      className="px-6 py-3 bg-neutral-900 text-white hover:bg-neutral-800 transition-all duration-75 shadow-sm font-semibold"
                      style={{ borderRadius: '0.5rem' }}
                    >
                      Today
                    </button>
                  </div>
                ),
                event: ({ event }: any) => {
                  const duration = formatDuration(event.start, event.end)
                  const projectName = event.resource.project_name || 'Project'
                  const taskName = event.resource.task_title || 'Task'

                  return (
                    <div
                      className="flex flex-col h-full"
                      onMouseEnter={(e) => {
                        if (tooltipTimeoutRef.current) {
                          clearTimeout(tooltipTimeoutRef.current)
                          tooltipTimeoutRef.current = null
                        }
                        setTooltip({
                          show: true,
                          x: e.clientX,
                          y: e.clientY,
                          description: event.resource.description || ''
                        })
                      }}
                      onMouseMove={(e) => {
                        setTooltip((prev) => ({
                          ...prev,
                          x: e.clientX,
                          y: e.clientY
                        }))
                      }}
                      onMouseLeave={() => {
                        tooltipTimeoutRef.current = setTimeout(() => {
                          setTooltip({ show: false, x: 0, y: 0, description: '' })
                        }, 300) as any
                      }}
                    >
                      <div className="font-semibold text-sm leading-tight">
                        {taskName}
                      </div>
                      <div className="text-xs opacity-90 leading-tight mt-0.5">
                        {projectName}
                      </div>
                      <div className="text-xs font-semibold mt-auto pt-1 leading-tight">
                        {duration}
                      </div>
                    </div>
                  )
                }
              }}
            />
          </div>
        </div>

        {/* Action Selection Modal */}
        {showActionModal && selectedEntry && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-3xl w-full max-w-md mx-4 border border-white/20">
              <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Select Action</h2>
                <button
                  onClick={closeActionModal}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-all duration-75 group"
                >
                  <XMarkIcon className="w-6 h-6 text-gray-500 group-hover:text-gray-700 transition-colors duration-75" />
                </button>
              </div>
              <div className="p-8">
                <div className="mb-6">
                  <h3 className="font-semibold text-gray-900 mb-2">
                    {selectedEntry.project_name || 'Project'} - {selectedEntry.task_title || 'Task'}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {new Date(selectedEntry.start_datetime).toLocaleString()} - {new Date(selectedEntry.end_datetime).toLocaleString()}
                  </p>
                </div>

                <div className="space-y-4">
                  <button
                    onClick={handleEditAction}
                    className="w-full flex items-center gap-4 p-4 bg-neutral-50 hover:bg-neutral-100 rounded-2xl transition-all duration-75 group"
                  >
                    <div className="p-3 bg-neutral-100 group-hover:bg-neutral-200 rounded-xl transition-colors duration-75">
                      <PencilIcon className="w-6 h-6 text-neutral-900" />
                    </div>
                    <div className="text-left">
                      <h4 className="font-semibold text-gray-900">Edit Time Entry</h4>
                      <p className="text-sm text-gray-600">Modify project, task, time, or description</p>
                    </div>
                  </button>

                  {(me?.role === 'manager' || me?.role === 'superuser') && (
                    <>
                      <button
                        onClick={handleCommentAction}
                        className="w-full flex items-center gap-4 p-4 bg-green-50 hover:bg-green-100 rounded-2xl transition-all duration-75 group"
                      >
                        <div className="p-3 bg-green-100 group-hover:bg-green-200 rounded-xl transition-colors duration-75">
                          <span className="text-4xl">💬</span>
                        </div>
                        <div className="text-left">
                          <h4 className="font-semibold text-gray-900">{selectedEntry.manager_comment ? 'Edit Comment' : 'Add Comment'}</h4>
                          <p className="text-sm text-gray-600">Leave a note for the employee</p>
                        </div>
                      </button>
                      {selectedEntry.manager_comment && (
                        <button
                          onClick={() => setShowCommentDeleteConfirm(true)}
                          className="w-full flex items-center gap-4 p-4 bg-red-50 hover:bg-red-100 rounded-2xl transition-all duration-75 group"
                        >
                          <div className="p-3 bg-red-100 group-hover:bg-red-200 rounded-xl transition-colors duration-75">
                            <TrashIcon className="w-6 h-6 text-red-600" />
                          </div>
                          <div className="text-left">
                            <h4 className="font-semibold text-gray-900">Delete Comment</h4>
                            <p className="text-sm text-gray-600">Remove the comment from this entry</p>
                          </div>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Comment Modal */}
        {showCommentModal && selectedEntry && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-3xl w-full max-w-lg mx-4 border border-white/20">
              <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-xl">
                    <span className="text-2xl">💬</span>
                  </div>
                  {selectedEntry.manager_comment ? 'Edit Comment' : 'Add Comment'}
                </h2>
                <button
                  onClick={closeCommentModal}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-all duration-75 group"
                >
                  <XMarkIcon className="w-6 h-6 text-gray-500 group-hover:text-gray-700 transition-colors duration-75" />
                </button>
              </div>

              <div className="p-8">
                <div className="mb-6 p-4 bg-gray-50 rounded-2xl">
                  <h3 className="font-semibold text-gray-900 mb-1">
                    {selectedEntry.project_name || 'Project'} - {selectedEntry.task_title || 'Task'}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {new Date(selectedEntry.start_datetime).toLocaleString()} - {new Date(selectedEntry.end_datetime).toLocaleString()}
                  </p>
                  {selectedEntry.description && (
                    <p className="text-sm text-gray-700 mt-2">
                      <span className="font-medium">Description:</span> {selectedEntry.description}
                    </p>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700">Manager Comment</label>
                    <textarea
                      className="w-full px-4 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-75 bg-white/50 backdrop-blur-sm"
                      rows={4}
                      placeholder="Leave a note for the employee..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button
                      type="button"
                      onClick={closeCommentModal}
                      className="flex-1 px-6 py-4 bg-gray-100 text-gray-700 rounded-2xl hover:bg-gray-200 transition-all duration-75 font-semibold hover:scale-[0.98]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={addManagerComment}
                      className="flex-1 px-6 py-4 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-2xl hover:from-green-700 hover:to-green-800 transition-all duration-75 font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[0.98] shadow-lg"
                      disabled={!commentText.trim()}
                    >
                      Save Comment
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Time Entry Modal */}
        {showTimeEntryModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-3xl w-full max-w-lg mx-4 border border-white/20 overflow-y-auto max-h-[90vh]">
              <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                  {editId ? (
                    <>
                      <div className="p-2 bg-neutral-100 rounded-xl">
                        <PencilIcon className="w-6 h-6 text-neutral-900" />
                      </div>
                      Edit Time Entry
                    </>
                  ) : (
                    <>
                      <div className="p-2 bg-green-100 rounded-xl">
                        <PlusIcon className="w-6 h-6 text-green-600" />
                      </div>
                      Add Time Entry
                    </>
                  )}
                </h2>
                <button
                  onClick={closeModal}
                  className="p-2 hover:bg-gray-100 rounded-xl transition-all duration-75 group"
                >
                  <XMarkIcon className="w-6 h-6 text-gray-500 group-hover:text-gray-700 transition-colors duration-75" />
                </button>
              </div>

              <form onSubmit={add} className="p-8 space-y-6">
                <div className="space-y-6">
                  {(me?.role === 'manager' || me?.role === 'superuser') && (
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">User *</label>
                      <select
                        className="w-full px-4 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-neutral-700 focus:border-transparent transition-all duration-75 bg-white/50 backdrop-blur-sm"
                        value={form.user || selectedUserId || 'me'}
                        onChange={(e) => setForm({ ...form, user: e.target.value })}
                        required
                      >
                        <option value="me">Myself</option>
                        {users.map((u: any) => (
                          <option key={u.id} value={String(u.id)}>
                            {u.first_name || u.username}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 ml-2">
                        Select which user this time entry is for
                      </p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700">Project *</label>
                    <select
                      className="w-full px-4 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-neutral-700 focus:border-transparent transition-all duration-75 bg-white/50 backdrop-blur-sm"
                      value={form.project}
                      onChange={(e) => setForm({ ...form, project: e.target.value, task: '' })}
                      required
                    >
                      <option value="">Select project</option>
                      {((me?.role === 'manager' || me?.role === 'superuser') ? projects : assignedProjects).map((p: any) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700">Task *</label>
                    <select
                      className="w-full px-4 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-neutral-700 focus:border-transparent transition-all duration-75 disabled:bg-gray-50 disabled:text-gray-500 bg-white/50 backdrop-blur-sm"
                      value={form.task}
                      onChange={(e) => setForm({ ...form, task: e.target.value })}
                      disabled={!form.project}
                      required
                    >
                      <option value="">Select task</option>
                      {tasks.map((t: any) => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                  </div>

                  {planItems.length > 0 && (
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-700">Plan item (today)</label>
                      <select
                        className="w-full px-4 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-neutral-700 focus:border-transparent transition-all duration-75 bg-white/50 backdrop-blur-sm"
                        value={form.plan_item}
                        onChange={(e) => {
                          const id = e.target.value
                          const pi = planItems.find((x: any) => String(x.id) === id)
                          setForm({
                            ...form,
                            plan_item: id,
                            ...(pi ? { project: String(pi.project), task: String(pi.task) } : {}),
                          })
                        }}
                      >
                        <option value="">— Not from plan —</option>
                        {planItems.map((pi: any) => (
                          <option key={pi.id} value={pi.id}>{pi.description} · {pi.task_title}</option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500">Linking a plan item auto-fills its project &amp; task.</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700">Completion</label>
                    <select
                      className="w-full px-4 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-neutral-700 focus:border-transparent transition-all duration-75 bg-white/50 backdrop-blur-sm"
                      value={form.done}
                      onChange={(e) => setForm({ ...form, done: e.target.value })}
                    >
                      <option value="">Unmarked</option>
                      <option value="true">Done</option>
                      <option value="false">Not done</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700">Description</label>
                    <input
                      className="w-full px-4 py-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-neutral-700 focus:border-transparent transition-all duration-75 bg-white/50 backdrop-blur-sm"
                      placeholder="What did you work on?"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700">
                      Tags <span className="text-red-500">*</span>
                    </label>

                    <select
                      className={`w-full px-4 py-4 border rounded-2xl focus:ring-2 focus:border-transparent transition-all duration-75 bg-white/50 backdrop-blur-sm ${form.tags.length === 0 ? 'border-red-300 focus:ring-red-500' : 'border-gray-200 focus:ring-neutral-700'
                        }`}
                      value={form.tags.length > 0 ? form.tags[0] : ''}
                      onChange={(e) => {
                        const selectedId = parseInt(e.target.value)
                        if (selectedId && !form.tags.includes(selectedId)) {
                          setForm({ ...form, tags: [...form.tags, selectedId] })
                        }
                        e.target.value = ''
                      }}
                      required
                    >
                      <option value="">Select a tag...</option>

                      {/* Group tags by category */}
                      {['phase', 'task', 'discipline', 'internal', 'system'].map((cat) => {
                        const categoryTags = tags.filter((t: any) => t.category === cat)
                        if (categoryTags.length === 0) return null
                        const label =
                          cat === 'phase'
                            ? 'Phases'
                            : cat === 'task'
                              ? 'Tasks'
                              : cat === 'discipline'
                                ? 'Disciplines'
                                : cat === 'internal'
                                  ? 'Internal'
                                  : 'System'
                        return (
                          <optgroup key={cat} label={label}>
                            {categoryTags.map((tag: any) => (
                              <option key={tag.id} value={tag.id}>
                                {tag.emoji} {tag.name}
                              </option>
                            ))}
                          </optgroup>
                        )
                      })}
                    </select>

                    {/* Show selected tags */}
                    {form.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {form.tags.map((tagId: number) => {
                          const tag = tags.find((t: any) => t.id === tagId)
                          if (!tag) return null
                          return (
                            <span
                              key={tagId}
                              className="inline-flex items-center gap-2 px-3 py-1 bg-neutral-100 text-neutral-900 rounded-xl text-sm font-medium"
                            >
                              {tag.emoji} {tag.name}
                              <button
                                type="button"
                                onClick={() => {
                                  setForm({ ...form, tags: form.tags.filter((t: number) => t !== tagId) })
                                }}
                                className="hover:text-neutral-900 transition-colors"
                              >
                                ×
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    )}

                    <p className={`text-xs ml-2 ${form.tags.length === 0 ? 'text-red-500' : 'text-gray-500'}`}>
                      {form.tags.length === 0
                        ? 'At least one tag is required'
                        : 'Select multiple tags from the dropdown'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <DateTimePicker
                      label="Start Time *"
                      value={form.start_datetime}
                      onChange={(val: string) => setForm({ ...form, start_datetime: val })}
                      required
                      showDate={false}
                    />
                    <DateTimePicker
                      label="End Time *"
                      value={form.end_datetime}
                      onChange={(val: string) => setForm({ ...form, end_datetime: val })}
                      required
                      showDate={false}
                    />
                  </div>

                  {!editId && (
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-5 h-5 text-neutral-900 bg-gray-100 border-gray-300 rounded focus:ring-neutral-700"
                          checked={form.repeatWeekly}
                          onChange={(e) => setForm({ ...form, repeatWeekly: e.target.checked })}
                        />
                        <span className="text-sm font-semibold text-gray-700">
                          Repeat for entire week (Mon-Fri) at same time
                        </span>
                      </label>
                      <p className="text-xs text-gray-500 ml-8">
                        Creates 5 entries, one for each day of the week at the same time slot
                      </p>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="bg-red-50/80 backdrop-blur-sm border border-red-200 text-red-800 px-6 py-4 rounded-2xl">
                    {error}
                  </div>
                )}

                <div className="flex gap-4 pt-6">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 px-6 py-4 bg-gray-100 text-gray-700 rounded-2xl hover:bg-gray-200 transition-all duration-75 font-semibold hover:scale-[0.98]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-4 bg-gradient-to-r from-neutral-900 to-purple-600 text-white rounded-2xl hover:from-neutral-900 hover:to-purple-700 transition-all duration-75 font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[0.98] shadow-lg"
                    disabled={saving}
                  >
                    {saving ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                        {editId ? 'Saving...' : 'Adding...'}
                      </div>
                    ) : (
                      editId ? 'Save Changes' : 'Add Entry'
                    )}
                  </button>
                  {editId && (
                    <button
                      type="button"
                      onClick={() => {
                        const evt = calendarEvents.find((e: any) => e.resource.id === editId)
                        if (evt) handleDeleteEvent(evt)
                      }}
                      className="px-6 py-4 bg-red-600 text-white rounded-2xl hover:bg-red-700 transition-all duration-75 font-semibold hover:scale-[0.98] shadow-lg"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Enhanced Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-3xl w-full max-w-md mx-4 border border-white/20">
              <div className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 bg-red-100 rounded-2xl">
                    <TrashIcon className="w-8 h-8 text-red-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">Delete Time Entry</h2>
                </div>

                <p className="text-gray-600 mb-8 text-lg">
                  Are you sure you want to delete this time entry? This action cannot be undone.
                </p>

                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false)
                      setEventToDelete(null)
                    }}
                    className="flex-1 px-6 py-4 bg-gray-100 text-gray-700 rounded-2xl hover:bg-gray-200 transition-all duration-75 font-semibold hover:scale-[0.98]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="flex-1 px-6 py-4 bg-red-600 text-white rounded-2xl hover:bg-red-700 transition-all duration-75 font-semibold hover:scale-[0.98] shadow-lg"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Comment Delete Confirmation Modal */}
        {showCommentDeleteConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-3xl w-full max-w-md mx-4 border border-white/20">
              <div className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 bg-red-100 rounded-2xl">
                    <TrashIcon className="w-8 h-8 text-red-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">Delete Comment</h2>
                </div>

                <p className="text-gray-600 mb-8 text-lg">
                  Are you sure you want to delete this comment? This action cannot be undone.
                </p>

                <div className="flex gap-4">
                  <button
                    onClick={() => setShowCommentDeleteConfirm(false)}
                    className="flex-1 px-6 py-4 bg-gray-100 text-gray-700 rounded-2xl hover:bg-gray-200 transition-all duration-75 font-semibold hover:scale-[0.98]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteCommentAction}
                    className="flex-1 px-6 py-4 bg-red-600 text-white rounded-2xl hover:bg-red-700 transition-all duration-75 font-semibold hover:scale-[0.98] shadow-lg"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Comments panel */}
      <div className="w-full mt-8">
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Latest Comments</h3>
            <span className="text-sm text-gray-500">{selectedUserId === 'me' ? 'My comments' : 'For selected user'}</span>
          </div>
          <div
            className="max-h-72 overflow-auto space-y-3 pr-2"
            onScroll={(e) => {
              const el = e.currentTarget as HTMLElement
              if (commentsNext && el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
                loadComments()
              }
            }}
          >
            {comments.length === 0 && !loadingComments && (
              <div className="text-gray-500">No comments yet.</div>
            )}
            {comments.map((c: any) => (
              <div key={c.id} className="p-3 border border-gray-100 rounded-xl">
                <div className="text-sm text-gray-600 mb-1">
                  {c.manager_comment_by_name || 'Manager'} · {c.manager_comment_at ? new Date(c.manager_comment_at).toLocaleString('en-US', { month: 'short', day: 'numeric' }) : ''}
                </div>
                <div className="text-gray-900">{c.manager_comment}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {c.project_name || 'Project'} · {new Date(c.start_datetime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true })} - {new Date(c.end_datetime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true })}
                </div>
              </div>
            ))}
            {loadingComments && (
              <div className="text-sm text-gray-500">Loading...</div>
            )}
          </div>
        </div>
      </div>

      {/* Custom Tooltip */}
      {tooltip.show && tooltip.description && (
        <div
          className="fixed z-50 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm max-w-xs pointer-events-auto"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
            marginTop: '-8px'
          }}
          onMouseEnter={() => {
            if (tooltipTimeoutRef.current) {
              clearTimeout(tooltipTimeoutRef.current)
              tooltipTimeoutRef.current = null
            }
          }}
          onMouseLeave={() => {
            setTooltip({ show: false, x: 0, y: 0, description: '' })
            if (tooltipTimeoutRef.current) {
              clearTimeout(tooltipTimeoutRef.current)
              tooltipTimeoutRef.current = null
            }
          }}
        >
          {tooltip.description}
          <div
            className="absolute w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"
            style={{
              left: '50%',
              top: '100%',
              transform: 'translateX(-50%)'
            }}
          ></div>
        </div>
      )}

      <style>{`
        /* Enhanced Calendar Styling */
        .calendar-wrapper .rbc-calendar {
          font-family: inherit;
          border-radius: 24px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.5);
          backdrop-filter: blur(10px);
          transition: height 0.3s ease;
        }

        .calendar-wrapper .rbc-header {
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          border-bottom: 1px solid #e2e8f0;
          padding: 16px 12px;
          font-weight: 700;
          color: #1e293b;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .calendar-wrapper .rbc-today {
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%) !important;
          border-radius: 12px !important;
        }

        .calendar-wrapper .rbc-current-time-indicator {
          background-color: #ef4444;
          height: 3px;
          border-radius: 2px;
          box-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
        }

        .calendar-wrapper .rbc-event {
          border: none !important;
          border-radius: 12px !important;
          padding: 10px 12px !important;
          font-size: 13px !important;
          font-weight: 500 !important;
          backdrop-filter: blur(8px) !important;
          transition: all 0.05s ease !important;
          line-height: 1.4 !important;
          margin: 8px 6px !important;
          max-width: calc(100% - 12px) !important;
          // overflow: visible !important;
        }

        .calendar-wrapper .rbc-event-content {
          height: 100% !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          // overflow: visible !important;
          padding-bottom: 4px !important;
        }

        .calendar-wrapper .rbc-event:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 12px 30px -8px rgba(0, 0, 0, 0.4) !important;
        }

        /* Improved drag styling with better visibility */
        .calendar-wrapper .rbc-addons-dnd .rbc-event.rbc-addons-dnd-dragging {
          background-color: #1f2937 !important;
          color: #ffffff !important;
          border: 2px solid #3b82f6 !important;
          box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.6) !important;
          font-weight: 700 !important;
          opacity: 0.9 !important;
          z-index: 1000 !important;
        }

        .calendar-wrapper .rbc-addons-dnd .rbc-event.rbc-addons-dnd-over {
          background-color: #374151 !important;
          color: #ffffff !important;
          border: 2px dashed #3b82f6 !important;
        }

        .calendar-wrapper .rbc-slot-selection {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%) !important;
          border: 2px dashed #3b82f6 !important;
          border-radius: 8px !important;
          backdrop-filter: blur(4px) !important;
        }

        .calendar-wrapper .rbc-time-slot {
          border-top: 1px solid #f1f5f9 !important;
          transition: background-color 0.05s ease !important;
        }

        .calendar-wrapper .rbc-time-slot:hover {
          background-color: #f8fafc !important;
        }

        .calendar-wrapper .rbc-timeslot-group {
          border-bottom: 1px solid #e2e8f0 !important;
          min-height: 80px !important;
        }

        .calendar-wrapper .rbc-time-header-gutter,
        .calendar-wrapper .rbc-time-gutter {
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%) !important;
          border-right: 1px solid #e2e8f0 !important;
        }

        .calendar-wrapper .rbc-time-header-content {
          border-left: 1px solid #e2e8f0 !important;
        }

        .calendar-wrapper .rbc-day-slot {
          border-right: 1px solid #f1f5f9 !important;
        }

        .calendar-wrapper .rbc-time-content {
          border-top: 1px solid #e2e8f0 !important;
        }

        .calendar-wrapper .rbc-allday-cell {
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%) !important;
        }
        .grid-cols-7 > div {
          min-height: 120px;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          padding: 4px;
        }
        .text-sm {
          font-size: 0.75rem;
        }
        .bg-yellow-200 {
          max-width: 100%;
          word-wrap: break-word;
          overflow: visible;
        }
        .grid-cols-7 > div:hover {
          background-color: #f9fafb;
        }
        /* Hide the all-day row in week view */
        .calendar-wrapper .rbc-time-view .rbc-allday-cell {
          display: none !important;
        }

        .calendar-wrapper .rbc-time-view .rbc-row {
          min-height: 0 !important;
        }

        .calendar-wrapper .rbc-time-view .rbc-row.rbc-row-segment {
          display: none !important;
        }

        /* Scrollbar Styling */
        .calendar-wrapper .rbc-time-view {
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 #f8fafc;
        }

        .calendar-wrapper .rbc-time-view::-webkit-scrollbar {
          width: 8px;
        }

        .calendar-wrapper .rbc-time-view::-webkit-scrollbar-track {
          background: #f8fafc;
          border-radius: 4px;
        }

        .calendar-wrapper .rbc-time-view::-webkit-scrollbar-thumb {
          background: linear-gradient(135deg, #cbd5e1, #94a3b8);
          border-radius: 4px;
        }

        .calendar-wrapper .rbc-time-view::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(135deg, #94a3b8, #64748b);
        }

        .calendar-wrapper .rbc-day-slot .rbc-events-container {
          margin: 0 6px !important;
        }

        .calendar-wrapper .rbc-day-slot .rbc-event {
          margin: 8px 4px !important;
          max-width: calc(100% - 8px) !important;
        }

        .calendar-wrapper .rbc-month-view .rbc-event {
          margin: 4px 6px !important;
          max-width: calc(100% - 12px) !important;
          overflow: hidden !important;
        }

        .calendar-wrapper .rbc-day-slot,
        .calendar-wrapper .rbc-month-row {
          overflow: hidden !important;
        }

        .calendar-wrapper .rbc-month-view .rbc-day-bg {
          height: ${monthCellHeight}px !important;
        }
        
        /* Multi-select styling */
        select[multiple] {
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 #f8fafc;
        }
        
        select[multiple]::-webkit-scrollbar {
          width: 8px;
        }
        
        select[multiple]::-webkit-scrollbar-track {
          background: #f8fafc;
          border-radius: 4px;
        }
        
        select[multiple]::-webkit-scrollbar-thumb {
          background: linear-gradient(135deg, #cbd5e1, #94a3b8);
          border-radius: 4px;
        }
        
        select[multiple]::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(135deg, #94a3b8, #64748b);
        }
        
        select[multiple] option {
          padding: 8px 12px;
        }
        
        select[multiple] option:checked {
          background: linear-gradient(to right, #3b82f6, #8b5cf6);
          color: white;
        }
      `}</style>
    </div>
  )
}
