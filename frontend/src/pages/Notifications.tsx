import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { Bell, CheckCheck, FileText, Circle, Calendar } from 'lucide-react'

type Notification = {
    id: number
    kind: string
    title: string
    message: string
    link: string
    is_read: boolean
    read_at: string | null
    created_at: string
    actor_name: string | null
}

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'unread'>('all')
    const navigate = useNavigate()

    async function load() {
        setLoading(true)
        try {
            const params: any = { page_size: 100 }
            if (filter === 'unread') params.is_read = 'false'
            const res = await api.get('/notifications/', { params })
            const payload: any = res.data
            setNotifications(payload.results || payload || [])
        } catch (e) {
            console.error('Failed to load notifications', e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [filter])

    async function markAllRead() {
        try {
            await api.post('/notifications/mark_all_read/')
            await load()
        } catch (e) {
            console.error('Failed to mark all read', e)
        }
    }

    async function handleClick(n: Notification) {
        // Mark as read (best-effort) and navigate.
        if (!n.is_read) {
            try {
                await api.patch(`/notifications/${n.id}/`, { is_read: true })
            } catch (e) {
                console.error('Failed to mark notification read', e)
            }
        }
        if (n.link) navigate(n.link)
    }

    const unreadCount = notifications.filter(n => !n.is_read).length

    return (
        <div className="p-6 md:p-10 max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                        <Bell className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
                        <p className="text-sm text-gray-500">
                            {filter === 'unread'
                                ? `${unreadCount} unread`
                                : `${notifications.length} total · ${unreadCount} unread`}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                        <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterButton>
                        <FilterButton active={filter === 'unread'} onClick={() => setFilter('unread')}>Unread</FilterButton>
                    </div>
                    {unreadCount > 0 && (
                        <button
                            onClick={markAllRead}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                        >
                            <CheckCheck className="w-4 h-4" /> Mark all read
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-500">Loading…</div>
            ) : notifications.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-gray-200 rounded-xl">
                    <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">
                        {filter === 'unread' ? 'No unread notifications. 🎉' : 'No notifications yet.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {notifications.map(n => (
                        <NotificationRow key={n.id} n={n} onClick={() => handleClick(n)} />
                    ))}
                </div>
            )}
        </div>
    )
}

function FilterButton({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${active ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
        >
            {children}
        </button>
    )
}

function NotificationRow({ n, onClick }: { n: Notification, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`w-full text-left flex items-start gap-3 p-4 rounded-xl border transition-colors ${n.is_read
                ? 'bg-white border-gray-100 hover:bg-gray-50'
                : 'bg-blue-50/50 border-blue-100 hover:bg-blue-50'
                }`}
        >
            <div className={`flex-shrink-0 p-2 rounded-lg ${n.is_read ? 'bg-gray-100' : 'bg-blue-100'}`}>
                {iconForKind(n.kind, n.is_read)}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h3 className={`text-sm ${n.is_read ? 'font-medium text-gray-700' : 'font-bold text-gray-900'}`}>
                        {n.title}
                    </h3>
                    {!n.is_read && <Circle className="w-2 h-2 fill-blue-500 text-blue-500" />}
                </div>
                <p className="text-sm text-gray-600 mt-0.5 break-words">{n.message}</p>
                <div className="text-xs text-gray-400 mt-1">{timeAgo(n.created_at)}</div>
            </div>
        </button>
    )
}

function iconForKind(kind: string, isRead: boolean) {
    const cls = isRead ? 'text-gray-500' : 'text-blue-600'
    switch (kind) {
        case 'request_submitted':
            return <FileText className={`w-4 h-4 ${cls}`} />
        case 'leave_submitted':
            return <Calendar className={`w-4 h-4 ${cls}`} />
        default:
            return <Bell className={`w-4 h-4 ${cls}`} />
    }
}

function timeAgo(iso: string) {
    const then = new Date(iso).getTime()
    const now = Date.now()
    const seconds = Math.floor((now - then) / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
    return new Date(iso).toLocaleDateString()
}
