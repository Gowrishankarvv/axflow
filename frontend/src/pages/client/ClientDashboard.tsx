import React, { useEffect, useState } from 'react'
import { FileTextIcon } from 'lucide-react'
import api from '../../lib/api'
import { Link } from 'react-router-dom'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

export default function ClientDashboard() {
    const [summary, setSummary] = useState<any | null>(null)
    const [loading, setLoading] = useState(true)

    // Filters
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

    useEffect(() => {
        fetchDashboardData(selectedMonth, selectedYear)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMonth, selectedYear])

    async function fetchDashboardData(month: number, year: number) {
        try {
            setLoading(true)
            const { data } = await api.get('/client/dashboard/summary/', { params: { month, year } })
            setSummary(data)
        } catch (e) {
            console.error(e)
            setSummary(null)
        } finally {
            setLoading(false)
        }
    }

    // Chart Data Preparation
    const requestStatusData = React.useMemo(() => {
        const sc = summary?.status_counts || {}
        const counts: Record<string, number> = {
            'Pending Review': Number(sc.pending_review || 0),
            'Pending Approval': Number(sc.pending_approval || 0),
            'Approved': Number(sc.approved || 0),
            'In Progress': Number(sc.in_progress || 0),
            'Completed': Number(sc.completed || 0),
        }
        return Object.keys(counts).map(key => ({ name: key, value: counts[key] })).filter(d => d.value > 0)
    }, [summary])

    // Real Data for Image Progress
    const imageProgressData = React.useMemo(() => {
        const ic = summary?.image_counts || {}
        const counts: Record<string, number> = {
            'Review': Number(ic.review || 0),
            'To Do': Number(ic.todo || 0),
            'In Progress': Number(ic.in_progress || 0),
            'Completed': Number(ic.completed || 0),
        }
        return Object.keys(counts).map(key => ({ name: key, value: counts[key] })).filter(d => d.value > 0)
    }, [summary])

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
                    <p className="text-gray-500 mt-1">Overview of your request progress.</p>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-3">
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                        className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 font-medium focus:ring-2 focus:ring-neutral-700 outline-none"
                    >
                        {Array.from({ length: 12 }, (_, i) => (
                            <option key={i} value={i}>
                                {new Date(0, i).toLocaleString('default', { month: 'long' })}
                            </option>
                        ))}
                    </select>

                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                        className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 font-medium focus:ring-2 focus:ring-neutral-700 outline-none"
                    >
                        {Array.from({ length: 6 }, (_, i) => {
                            const y = new Date().getFullYear() - i
                            return <option key={y} value={y}>{y}</option>
                        })}
                    </select>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-20 text-gray-400">Loading dashboard...</div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Requests Chart */}
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 min-h-[400px] flex flex-col">
                        <h3 className="text-gray-900 font-bold text-lg mb-6 text-center">Requests Status</h3>
                        {requestStatusData.length > 0 ? (
                            <div className="flex-1 w-full min-h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={requestStatusData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={4}
                                            dataKey="value"
                                            stroke="none"
                                            label={({ name, value }) => `${name}: ${value}`}
                                        >
                                            {requestStatusData.map((entry, index) => {
                                                let color = '#9ca3af' // Default gray
                                                const s = entry.name.toLowerCase()

                                                if (s.includes('review')) {
                                                    color = '#a855f7' // Purple
                                                } else if (s.includes('pending approval') || s.includes('approval')) {
                                                    color = '#f59e0b' // Amber
                                                } else if (s.includes('approved')) {
                                                    color = '#3b82f6' // Blue
                                                } else if (s.includes('in progress')) {
                                                    color = '#6366f1' // Indigo
                                                } else if (s.includes('completed')) {
                                                    color = '#22c55e' // Green
                                                } else if (s.includes('rejected')) {
                                                    color = '#ef4444' // Red
                                                }

                                                return <Cell key={`cell-${index}`} fill={color} />
                                            })}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#fff', borderColor: '#e5e7eb', color: '#111827', borderRadius: '0.5rem' }}
                                            itemStyle={{ color: '#111827' }}
                                        />
                                        <Legend
                                            verticalAlign="bottom"
                                            height={36}
                                            iconType="circle"
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center flex-1 text-gray-500">
                                No requests for selected period
                            </div>
                        )}
                    </div>

                    {/* Image Progress Chart */}
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 min-h-[400px] flex flex-col">
                        <div className="mb-6 text-center">
                            <h3 className="text-gray-900 font-bold text-lg">Image Progress</h3>

                            {/* Summary Count - Displaying total images if available */}
                            {imageProgressData.length > 0 && (
                                <p className="text-sm text-gray-500 mt-1">
                                    Total Images: {imageProgressData.reduce((acc, curr) => acc + curr.value, 0)}
                                </p>
                            )}
                        </div>

                        {imageProgressData.length > 0 ? (
                            <div className="flex-1 w-full min-h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={imageProgressData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={4}
                                            dataKey="value"
                                            stroke="none"
                                            label={({ value }) => `${value}`}
                                        >
                                            {imageProgressData.map((entry, index) => {
                                                let color = '#9ca3af'
                                                const s = entry.name.toLowerCase()
                                                if (s === 'completed') color = '#22c55e' // Green
                                                else if (s === 'review') color = '#ef4444' // Red
                                                else if (s === 'in progress') color = '#3b82f6' // Blue
                                                else if (s === 'to do') color = '#f59e0b' // Amber
                                                return <Cell key={`cell-${index}`} fill={color} />
                                            })}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#fff', borderColor: '#e5e7eb', color: '#111827', borderRadius: '0.5rem' }}
                                            itemStyle={{ color: '#111827' }}
                                        />
                                        <Legend
                                            verticalAlign="bottom"
                                            height={36}
                                            iconType="circle"
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center flex-1 text-gray-500">
                                No image data for selected period
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-8">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h2 className="font-semibold text-gray-900">Recent Data Requests</h2>
                    <Link to="/requests" className="text-neutral-900 hover:text-neutral-900 text-sm font-medium">View All</Link>
                </div>
                <div className="divide-y divide-gray-100">
                    {(summary?.recent_requests || []).length === 0 ? (
                        <div className="p-8 text-center text-gray-500">No requests found for this period.</div>
                    ) : (
                        (summary?.recent_requests || []).map((req: any) => (
                            <div key={req.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition">
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-lg ${getStatusColor(req.status)} bg-opacity-10`}>
                                        <FileTextIcon className={`w-5 h-5 ${getStatusColor(req.status)}`} />
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-gray-900">{req.title || 'Untitled Request'}</h3>
                                        <p className="text-sm text-gray-500 line-clamp-1">{req.description}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(req.status)}`}>
                                        {formatStatus(req.status)}
                                    </span>
                                    <div className="text-xs text-gray-400 mt-1">{new Date(req.created_at).toLocaleDateString()}</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}

function getStatusColor(status: string) {
    switch (status) {
        case 'pending_review': return 'text-yellow-600'
        case 'pending_approval': return 'text-orange-600'
        case 'approved': return 'text-neutral-900'
        case 'in_progress': return 'text-neutral-900'
        case 'completed': return 'text-green-600'
        case 'rejected': return 'text-red-600'
        default: return 'text-gray-600'
    }
}

function getStatusBadge(status: string) {
    switch (status) {
        case 'pending_review': return 'bg-yellow-100 text-yellow-800'
        case 'pending_approval': return 'bg-orange-100 text-orange-800'
        case 'approved': return 'bg-neutral-100 text-neutral-900'
        case 'in_progress': return 'bg-neutral-100 text-neutral-900'
        case 'completed': return 'bg-green-100 text-green-800'
        case 'rejected': return 'bg-red-100 text-red-800'
        default: return 'bg-gray-100 text-gray-800'
    }
}

function formatStatus(status: string) {
    return status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}
