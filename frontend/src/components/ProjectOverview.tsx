import React, { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { PieChart as PieIcon } from 'lucide-react'
import { getCached } from '../lib/api'
import { formatDecimalHours } from '../lib/formatUtils'

// Mirror of backend/src/core/permissions.py:EXECUTIVE_POSITIONS — keep in sync.
const EXECUTIVE_POSITIONS = ['CEO', 'CFO', 'COO', 'CMO', 'Executive']

// Super admins and executives see everyone's project breakdown; everyone else
// (employees and non-executive managers) sees only their own.
function canSeeEveryone(me: any) {
  return !!me && (me.role === 'superuser' || EXECUTIVE_POSITIONS.includes(me?.position))
}

// Slice colours, in legend order. Reused round-robin if a user has worked on
// more projects than colours.
const PALETTE = [
  '#EA3535', // red
  '#9ACD32', // olive
  '#1D4ED8', // blue
  '#F59E0B', // amber
  '#A855F7', // purple
  '#22D3EE', // cyan
  '#EC4899', // pink
  '#14B8A6', // teal
  '#6366F1', // indigo
  '#F97316', // orange
]

type Slice = { name: string; hours: number }

export default function ProjectOverview({ me }: { me?: any }) {
  const [slices, setSlices] = useState<Slice[]>([])
  const [loading, setLoading] = useState(true)

  const everyone = canSeeEveryone(me)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      // Project distribution comes from /reports/team-summary/. Without a
      // project filter the backend returns project→hours in `distribution`.
      // Non-privileged users are scoped to their own entries via user_id=me.
      const params: any = {}
      if (!everyone) params.user_id = 'me'
      const res = await getCached('/reports/team-summary/', { params }, { ttlMs: 30 * 1000 })
      if (cancelled) return
      const dist = res.data?.distribution || { labels: [], hours: [] }
      const next: Slice[] = (dist.labels || []).map((label: string, i: number) => ({
        name: label || 'No Project',
        hours: Number(dist.hours?.[i] || 0),
      })).filter((s: Slice) => s.hours > 0)
      setSlices(next)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [everyone])

  const total = useMemo(() => slices.reduce((sum, s) => sum + s.hours, 0), [slices])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-in slide-in-from-bottom duration-500 delay-300">
      <div className="flex items-center gap-2 mb-6">
        <div className="p-1.5 bg-pink-100 rounded-md">
          <PieIcon className="w-5 h-5 text-pink-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Project Overview</h2>
        <span className="ml-auto text-xs text-gray-500">
          {everyone ? 'All projects · this month' : 'Your projects · this month'}
        </span>
      </div>

      {loading ? (
        <div className="h-72 flex items-center justify-center text-gray-500">Loading data...</div>
      ) : slices.length === 0 ? (
        <div className="h-72 flex flex-col items-center justify-center text-center">
          <PieIcon className="w-10 h-10 text-gray-300 mb-3" />
          <h3 className="text-base font-semibold text-gray-900">No project hours yet</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-xs">
            Log time against a project this month and it will show up here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="hours"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius="90%"
                  stroke="#fff"
                  strokeWidth={2}
                  animationDuration={600}
                >
                  {slices.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                  }}
                  formatter={(value: any, name: any) => {
                    const pct = total > 0 ? Math.round((Number(value) / total) * 100) : 0
                    return [`${formatDecimalHours(Number(value))} (${pct}%)`, name]
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend — colour dot + project name + share, like the reference. */}
          <div className="mt-4 w-full grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
            {slices.map((s, i) => {
              const pct = total > 0 ? Math.round((s.hours / total) * 100) : 0
              return (
                <div key={i} className="flex items-center gap-2 text-sm min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                  />
                  <span className="text-gray-700 truncate">{s.name}</span>
                  <span className="ml-auto text-gray-400 shrink-0">{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
