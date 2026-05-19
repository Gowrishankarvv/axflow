import React, { useEffect, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { getCached } from '../lib/api'
import { formatDecimalHours } from '../lib/formatUtils'

// Mirror of backend/src/core/permissions.py:EXECUTIVE_POSITIONS — keep in sync.
const EXECUTIVE_POSITIONS = ['CEO', 'CFO', 'COO', 'CMO', 'Executive']

// Super admins and executives see everyone's task hours; everyone else
// (employees and non-executive managers) sees only their own.
function canSeeEveryone(me: any) {
  return !!me && (me.role === 'superuser' || EXECUTIVE_POSITIONS.includes(me?.position))
}

type MatrixUser = { id: number; name: string; total_hours: number }
type MatrixTask = { id: number | null; title: string; total_hours: number; users: MatrixUser[] }
type MatrixProject = { id: number; name: string; total_hours: number; tasks: MatrixTask[] }

export default function TaskHoursSummary({ me }: { me?: any }) {
  const [matrix, setMatrix] = useState<MatrixProject[]>([])
  const [totals, setTotals] = useState<{ overall_hours: number; billable_hours: number; non_billable_hours: number }>(
    { overall_hours: 0, billable_hours: 0, non_billable_hours: 0 }
  )
  const [loading, setLoading] = useState(true)

  const everyone = canSeeEveryone(me)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      // The task matrix is built by /reports/team-summary/. Non-privileged
      // users are scoped to their own time entries via user_id=me.
      const params: any = {}
      if (!everyone) params.user_id = 'me'
      const res = await getCached('/reports/team-summary/', { params }, { ttlMs: 30 * 1000 })
      if (cancelled) return
      setMatrix(res.data?.task_matrix || [])
      const t = res.data?.totals || {}
      setTotals({
        overall_hours: Number(t.overall_hours || 0),
        billable_hours: Number(t.billable_hours || 0),
        non_billable_hours: Number(t.non_billable_hours || 0),
      })
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [everyone])

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="p-1.5 bg-indigo-100 rounded-md">
          <ClipboardList className="w-5 h-5 text-indigo-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Task Hours Summary</h2>
        <span className="ml-auto text-xs text-gray-500">
          {everyone ? 'All users · this month' : 'Your tasks · this month'}
        </span>
      </div>

      <div className="border border-gray-100 rounded-xl overflow-hidden">
        {/* Task Matrix header with totals */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 border-b border-gray-100">
          <span className="font-semibold text-gray-900">Task Matrix</span>
          <span className="ml-auto text-sm text-gray-600">
            Total: <span className="font-semibold text-gray-900">{formatDecimalHours(totals.overall_hours)}</span>
          </span>
          <span className="text-sm text-green-600">
            Billable: <span className="font-semibold">{formatDecimalHours(totals.billable_hours)}</span>
          </span>
          <span className="text-sm text-gray-600">
            Non-Billable: <span className="font-semibold text-gray-900">{formatDecimalHours(totals.non_billable_hours)}</span>
          </span>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center text-gray-500">Loading data...</div>
        ) : matrix.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center px-6">
            <ClipboardList className="w-10 h-10 text-gray-300 mb-3" />
            <h3 className="text-base font-semibold text-gray-900">No task hours yet</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-sm">
              Add a task to a time slot in My Time and mark it done — logged task
              hours will show up here.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium uppercase text-xs tracking-wide">Project / Task</th>
                <th className="text-left px-4 py-3 font-medium uppercase text-xs tracking-wide">Users</th>
                <th className="text-right px-4 py-3 font-medium uppercase text-xs tracking-wide">Total</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map(project => (
                <React.Fragment key={project.id ?? project.name}>
                  {/* Project group row */}
                  <tr className="bg-gray-50/60 border-t border-gray-100">
                    <td className="px-4 py-3 font-semibold text-gray-900">{project.name}</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatDecimalHours(project.total_hours)}
                    </td>
                  </tr>
                  {/* Task rows */}
                  {project.tasks.map(task => (
                    <tr key={`${project.id}-${task.id ?? task.title}`} className="border-t border-gray-100">
                      <td className="px-4 py-3 pl-8 text-gray-700">{task.title}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {task.users.map(u => (
                            <span
                              key={u.id}
                              className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium"
                            >
                              {u.name}: {formatDecimalHours(u.total_hours)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 whitespace-nowrap">
                        {formatDecimalHours(task.total_hours)}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
