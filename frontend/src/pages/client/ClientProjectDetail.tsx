import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Calendar, Users, CheckCircle2, Folder } from 'lucide-react'

import api, { getCached } from '../../lib/api'

type Task = {
  id: number
  status: string
  assignees_ids?: number[]
}

type Project = {
  id: number
  name: string
  description: string
  start_date: string | null
  end_date: string | null
  due_date: string | null
}

type UserLite = {
  id: number
  first_name: string
  last_name: string
  username: string
  position?: string
}

export default function ClientProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const projectId = Number(id)

  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<UserLite[]>([])
  const [assignedUserIds, setAssignedUserIds] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setError('')
    setLoading(true)
    try {
      const [p, t, u] = await Promise.all([
        getCached(`/projects/${projectId}/`),
        getCached(`/tasks/`, { params: { project: projectId, page_size: 1000 } }),
        api.get('/users/light/').catch(() => ({ data: [] })),
      ])
      setProject(p.data as Project)
      const taskList: Task[] = (t.data as any).results || (t.data as any)
      setTasks(taskList)
      setUsers((u.data as any) || [])
      // Infer assignees from the project's tasks (clients can't hit /assignments/).
      const ids = Array.from(new Set(taskList.flatMap(x => x.assignees_ids || []).filter(Boolean))) as number[]
      setAssignedUserIds(ids)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Unable to load this project.')
    } finally { setLoading(false) }
  }

  useEffect(() => { if (projectId) load() }, [projectId])

  const progress = useMemo(() => {
    if (tasks.length === 0) return { pct: 0, done: 0, total: 0 }
    const done = tasks.filter(t => t.status === 'done').length
    return { pct: Math.round((done / tasks.length) * 100), done, total: tasks.length }
  }, [tasks])

  const projectStatusLabel = useMemo(() => {
    if (!project) return ''
    if (progress.total === 0) return 'Not started'
    if (progress.done === progress.total) return 'Completed'
    if (progress.done > 0) return 'In Progress'
    return 'Planned'
  }, [project, progress])

  const assignees = users.filter(u => assignedUserIds.includes(u.id))

  if (loading) {
    return (
      <div className="p-6 min-h-screen bg-gradient-to-br from-gray-50 to-white">
        <div className="max-w-4xl mx-auto">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-6"></div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-pulse">
            <div className="h-8 w-64 bg-gray-200 rounded mb-4"></div>
            <div className="h-4 w-96 bg-gray-200 rounded mb-2"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="p-6 min-h-screen bg-gradient-to-br from-gray-50 to-white">
        <div className="max-w-4xl mx-auto">
          <button onClick={() => navigate('/projects')} className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Projects
          </button>
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-gray-500">
            {error || 'Project not found.'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <div className="max-w-4xl mx-auto space-y-6">
        <button
          onClick={() => navigate('/projects')}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm font-medium">
          <ArrowLeft className="w-4 h-4" /> Back to Projects
        </button>

        {/* Header card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 bg-neutral-100 rounded-lg">
              <Folder className="w-6 h-6 text-neutral-900" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
              {project.description && (
                <p className="text-gray-600 mt-1 whitespace-pre-wrap">{project.description}</p>
              )}
            </div>
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
              projectStatusLabel === 'Completed' ? 'bg-emerald-100 text-emerald-800'
              : projectStatusLabel === 'In Progress' ? 'bg-neutral-100 text-neutral-900'
              : projectStatusLabel === 'Planned' ? 'bg-amber-100 text-amber-800'
              : 'bg-gray-100 text-gray-700'
            }`}>
              {projectStatusLabel}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <DateBlock label="Start Date" date={project.start_date} icon="start" />
            <DateBlock label="Due Date" date={project.due_date || project.end_date} icon="due" />
          </div>
        </div>

        {/* Progress card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-800">Progress</h2>
          </div>

          <div className="flex items-end justify-between gap-3 mb-2">
            <div>
              <div className="text-4xl font-bold text-gray-900">{progress.pct}<span className="text-2xl text-gray-500">%</span></div>
              <div className="text-sm text-gray-500 mt-1">
                {progress.done} of {progress.total} tasks completed
              </div>
            </div>
          </div>

          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-neutral-700 to-emerald-500 transition-all duration-500"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
        </div>

        {/* Team card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-neutral-900" />
            <h2 className="text-lg font-semibold text-gray-800">Team Assigned</h2>
            <span className="ml-1 text-sm text-gray-400">{assignees.length}</span>
          </div>

          {assignees.length === 0 ? (
            <p className="text-sm text-gray-500">No team members assigned yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {assignees.map(u => {
                const displayName = (u.first_name + ' ' + u.last_name).trim() || u.username
                const initial = (u.first_name?.[0] || u.username[0] || '?').toUpperCase()
                return (
                  <div key={u.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg bg-gray-50">
                    <div className="w-10 h-10 bg-gradient-to-br from-neutral-700 to-neutral-900 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0">
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{displayName}</div>
                      {u.position && <div className="text-xs text-gray-500 truncate">{u.position}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DateBlock({ label, date, icon }: { label: string; date: string | null; icon: 'start' | 'due' }) {
  return (
    <div className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg bg-gray-50">
      <Calendar className={`w-5 h-5 ${icon === 'start' ? 'text-neutral-900' : 'text-amber-600'}`} />
      <div>
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</div>
        <div className="text-sm font-semibold text-gray-900">
          {date ? new Date(date).toLocaleDateString() : '—'}
        </div>
      </div>
    </div>
  )
}
