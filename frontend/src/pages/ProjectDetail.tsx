import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api, { getCached } from '../lib/api'
import { ArrowLeft, Plus, Calendar, User, CheckCircle, Clock, AlertCircle, Target, Users, FileText, IndianRupee } from 'lucide-react'

export default function ProjectDetail({ me }: { me?: any }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const projectId = Number(id)
  const [project, setProject] = useState<any>(null)
  const [tasks, setTasks] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [assignedUsers, setAssignedUsers] = useState<number[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [tf, setTf] = useState({
    title: '',
    description: '',
    assignees: [] as number[],
    due_date: '',
    actual_start_date: '',
    planned_start_date: '',
    planned_end_date: '',
    status: 'todo' as 'todo' | 'pending' | 'in_progress' | 'done',
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editTaskTarget, setEditTaskTarget] = useState<any | null>(null)
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    assignees: [] as number[],
    due_date: '',
    actual_start_date: '',
    planned_start_date: '',
    planned_end_date: '',
    status: 'todo' as 'todo' | 'pending' | 'in_progress' | 'done',
  })
  const [showAddTask, setShowAddTask] = useState(false)
  const [showMoreTaskOptions, setShowMoreTaskOptions] = useState(false)
  const [showMoreEditOptions, setShowMoreEditOptions] = useState(false)
  const [requests, setRequests] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [estimateTarget, setEstimateTarget] = useState<any | null>(null)
  const [estimateForm, setEstimateForm] = useState({ cost: '', notes: '' })
  // Extension request modal state
  const [extensionFor, setExtensionFor] = useState<any | null>(null)
  const [extensionForm, setExtensionForm] = useState<{ requested_due_date: string; reason: string }>({ requested_due_date: '', reason: '' })

  // Main tab in the project page -- tasks (default) vs credentials. Credentials
  // is only available to manager/superuser.
  const [mainTab, setMainTab] = useState<'tasks' | 'credentials'>('tasks')
  // Credential modal state
  const [credentials, setCredentials] = useState<any[]>([])
  const [credentialsLoading, setCredentialsLoading] = useState(false)
  const [editingCredential, setEditingCredential] = useState<any | null>(null)
  const [credentialForm, setCredentialForm] = useState<any>({
    kind: 'other', kind_custom: '', label: '', username: '', secret: '', url: '', notes: '',
  })
  const [revealedSecrets, setRevealedSecrets] = useState<Set<number>>(new Set())

  async function load() {
    setError('')
    try {
      const [p, t, u, r, clientsRes] = await Promise.all([
        getCached(`/projects/${projectId}/`),
        getCached(`/tasks/`, { params: { project: projectId, page_size: 1000 } }),
        getCached('/users/light/'),

        api.get('/requests/', { params: { project: projectId } }),
        (me?.role === 'manager' || me?.role === 'superuser') ? api.get('/clients/') : Promise.resolve({ data: [] })
      ])
      setProject(p.data as any)
      setTasks((t.data as any).results || t.data as any)
      setUsers(u.data as any)
      const reqData = (r as any).data
      setRequests(reqData?.results || reqData || [])
      const clientsData = (clientsRes as any)?.data
      setClients(clientsData?.results || clientsData || [])
      console.info('[cache] Project detail:', p.from, '| Tasks:', t.from, '| Users:', u.from)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load project')
    }
    try {
      if (me?.role === 'manager' || me?.role === 'superuser') {
        const a = await getCached(`/assignments/`, { params: { project: projectId, page_size: 1000 } })
        const items = (a.data as any).results || a.data as any
        console.info('[cache] Assignments:', a.from)
        setAssignments(items)
        setAssignedUsers(items.map((x: any) => x.assignee))
      } else {
        // For employees, infer assigned users from tasks list
        const infer = Array.from(new Set((tasks || []).flatMap((t: any) => t.assignees_ids || []).filter(Boolean))) as number[]
        setAssignedUsers(infer)
      }
    } catch {
      // ignore for employees / restricted roles
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { if (projectId) load() }, [projectId])

  // Restrict employee view to assigned projects and own tasks
  const visibleTasks = useMemo(() => {
    if (me?.role === 'employee') {
      // Employees: show only own tasks
      return tasks.filter((t: any) => t.assignees_ids?.includes(me.id))
    }
    return tasks
  }, [tasks, me?.role, me?.id, assignedUsers])

  async function addTask(e: React.FormEvent) {
    e.preventDefault()
    const payload: any = {
      project: projectId,
      title: tf.title,
      description: tf.description,
      assignees: tf.assignees,
      due_date: tf.due_date || null,
      status: tf.status,
    }
    if (tf.actual_start_date) payload.actual_start_date = tf.actual_start_date
    if (tf.planned_start_date) payload.planned_start_date = tf.planned_start_date
    if (tf.planned_end_date) payload.planned_end_date = tf.planned_end_date

    await api.post('/tasks/', payload)
    setTf({
      title: '',
      description: '',
      assignees: [],
      due_date: '',
      actual_start_date: '',
      planned_start_date: '',
      planned_end_date: '',
      status: 'todo',
    })
    setShowAddTask(false)
    // Force clear cache for this project's tasks
    try {
      const { Cache } = await import('../lib/cache')
      Cache.remove(Cache.key('/tasks/', { project: projectId, page_size: 1000 }))
    } catch { }
    await load()
  }

  async function updateStatus(taskId: number, status: 'todo' | 'pending' | 'in_progress' | 'done') {
    await api.patch(`/tasks/${taskId}/`, { status })
    try {
      const { Cache } = await import('../lib/cache')
      Cache.remove(Cache.key('/tasks/', { project: projectId, page_size: 1000 }))
    } catch { }
    await load()
  }

  async function addUserToProject(userId: number) {
    await api.post('/assignments/', { project: projectId, assignee: userId })
    await load()
  }

  async function removeUserFromProject(assignmentId: number) {
    if (!confirm('Remove this user from project? Their tasks will be unassigned.')) return
    await api.delete(`/assignments/${assignmentId}/`)
    await load()
  }

  const assignmentMap = useMemo(() => {
    const map: Record<number, number> = {}
    assignments.forEach((a: any) => { map[a.assignee] = a.id })
    return map
  }, [assignments])

  function openEditTask(t: any) {
    setEditTaskTarget(t)
    setEditForm({
      title: t.title || '',
      description: t.description || '',
      assignees: t.assignees_ids || [],
      due_date: t.due_date || '',
      actual_start_date: t.actual_start_date || '',
      planned_start_date: t.planned_start_date || '',
      planned_end_date: t.planned_end_date || '',
      status: (t.status || 'todo') as any,
    })
    // Reset more options visibility when opening edit
    setShowMoreEditOptions(false)
  }

  async function saveEditTask(e: React.FormEvent) {
    e.preventDefault()
    if (!editTaskTarget) return
    const payload: any = {
      title: editForm.title,
      description: editForm.description,
      status: editForm.status,
      due_date: editForm.due_date || null,
      assignees: editForm.assignees,
    }
    if (editForm.actual_start_date !== undefined) {
      payload.actual_start_date = editForm.actual_start_date || null
    }
    if (editForm.planned_start_date !== undefined) {
      payload.planned_start_date = editForm.planned_start_date || null
    }
    if (editForm.planned_end_date !== undefined) {
      payload.planned_end_date = editForm.planned_end_date || null
    }
    await api.patch(`/tasks/${editTaskTarget.id}/`, payload)
    setEditTaskTarget(null)
    try {
      const { Cache } = await import('../lib/cache')
      Cache.remove(Cache.key('/tasks/', { project: projectId, page_size: 1000 }))
    } catch { }
    await load()
  }

  function openEstimate(r: any) {
    setEstimateTarget(r)
    setEstimateForm({ cost: '', notes: '' })
  }

  async function submitEstimate(e: React.FormEvent) {
    e.preventDefault()
    if (!estimateTarget) return
    if (!confirm('Submit estimate? This will notify the client.')) return

    await api.post(`/requests/${estimateTarget.id}/estimate/`, {
      estimated_cost: parseFloat(estimateForm.cost),
      estimation_notes: estimateForm.notes
    })
    setEstimateTarget(null)
    await load()
  }

  function openExtension(t: any) {
    setExtensionFor(t)
    setExtensionForm({ requested_due_date: '', reason: '' })
  }

  async function loadCredentials() {
    if (!projectId) return
    setCredentialsLoading(true)
    try {
      const res = await api.get('/credentials/', { params: { project: projectId, page_size: 200 } })
      setCredentials((res.data as any).results || res.data || [])
    } catch (e) { console.error(e) }
    finally { setCredentialsLoading(false) }
  }

  function openNewCredential() {
    setEditingCredential({ id: null })
    setCredentialForm({ kind: 'other', kind_custom: '', label: '', username: '', secret: '', url: '', notes: '' })
  }

  function openEditCredential(c: any) {
    setEditingCredential(c)
    setCredentialForm({
      kind: c.kind || 'other',
      kind_custom: c.kind_custom || '',
      label: c.label || '',
      username: c.username || '',
      secret: c.secret || '',
      url: c.url || '',
      notes: c.notes || '',
    })
  }

  async function saveCredential(e: React.FormEvent) {
    e.preventDefault()
    if (!editingCredential) return
    if (!credentialForm.label) {
      alert('Label is required.')
      return
    }
    try {
      const payload = { ...credentialForm, project: projectId }
      if (editingCredential.id) {
        const res = await api.patch(`/credentials/${editingCredential.id}/`, payload)
        setCredentials(prev => prev.map(x => x.id === editingCredential.id ? res.data : x))
      } else {
        const res = await api.post('/credentials/', payload)
        setCredentials(prev => [res.data as any, ...prev])
      }
      setEditingCredential(null)
    } catch (err: any) {
      alert('Failed to save: ' + (err?.response?.data ? JSON.stringify(err.response.data) : err.message))
    }
  }

  async function deleteCredential(id: number) {
    if (!confirm('Delete this credential? This cannot be undone.')) return
    try {
      await api.delete(`/credentials/${id}/`)
      setCredentials(prev => prev.filter(x => x.id !== id))
    } catch (e: any) {
      alert('Failed to delete: ' + e.message)
    }
  }

  function toggleSecretReveal(id: number) {
    setRevealedSecrets(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // Load credentials lazily when the user first switches to that tab.
  useEffect(() => {
    if (mainTab === 'credentials' && credentials.length === 0 && !credentialsLoading) {
      loadCredentials()
    }
  }, [mainTab, projectId])

  async function submitExtension(e: React.FormEvent) {
    e.preventDefault()
    if (!extensionFor) return
    if (!extensionForm.requested_due_date) {
      alert('Pick a new due date.')
      return
    }
    try {
      await api.post('/extension-requests/', {
        task: extensionFor.id,
        requested_due_date: extensionForm.requested_due_date,
        reason: extensionForm.reason,
      })
      setExtensionFor(null)
      alert('Extension request submitted. You\'ll be notified when it\'s reviewed.')
    } catch (err: any) {
      alert('Failed to submit: ' + (err?.response?.data ? JSON.stringify(err.response.data) : err.message))
    }
  }

  if (loading || !project) {
    return (
      <div className="p-6 space-y-6 bg-gradient-to-br from-gray-50 to-white min-h-screen">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-8 h-8 bg-gray-200 rounded-lg animate-pulse"></div>
          <div className="h-8 w-32 bg-gray-200 rounded animate-pulse"></div>
        </div>
        {error && <div className="text-red-600">{error}</div>}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 animate-pulse">
          <div className="h-8 w-64 bg-gray-200 rounded mb-4"></div>
          <div className="h-4 w-96 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 w-48 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  const completedTasks = visibleTasks.filter(t => t.status === 'done').length
  const inProgressTasks = visibleTasks.filter(t => t.status === 'in_progress').length
  const pendingTasks = visibleTasks.filter(t => t.status === 'pending').length
  const todoTasks = visibleTasks.filter(t => t.status === 'todo').length
  const totalTasks = visibleTasks.length
  const progressPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

  // Simple project timeline progress (today between start and end/due)
  let timelinePct: number | null = null
  if (project?.start_date && (project.end_date || project.due_date)) {
    const start = new Date(project.start_date).getTime()
    const end = new Date(project.end_date || project.due_date).getTime()
    const today = Date.now()
    if (end > start) {
      const pct = ((today - start) / (end - start)) * 100
      timelinePct = Math.max(0, Math.min(100, pct))
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': return 'bg-green-100 text-green-800 border-green-200'
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'in_progress': return 'bg-blue-100 text-blue-800 border-blue-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'done': return <CheckCircle className="w-4 h-4" />
      case 'pending': return <AlertCircle className="w-4 h-4" />
      case 'in_progress': return <Clock className="w-4 h-4" />
      default: return <AlertCircle className="w-4 h-4" />
    }
  }

  return (
    <div className="p-6 space-y-6 bg-gradient-to-br from-gray-50 to-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 font-medium transition-colors duration-200 hover:bg-white px-4 py-2 rounded-lg"
          onClick={() => navigate('/projects')}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Projects
        </button>
      </div>

      {/* Project Info Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">{project.name}</h1>
              <p className="text-blue-100 text-lg">{project.description}</p>
            </div>
            <div className="text-right">
              <div className="bg-white bg-opacity-20 rounded-lg px-4 py-2">
                <div className="text-sm opacity-90">Progress</div>
                <div className="text-2xl font-bold">{Math.round(progressPercentage)}%</div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-8">
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-8">
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <div className="text-2xl font-bold text-gray-800">{totalTasks}</div>
              <div className="text-sm text-gray-600 flex items-center justify-center gap-1">
                <Target className="w-3 h-3" />
                Total Tasks
              </div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-xl">
              <div className="text-2xl font-bold text-green-600">{completedTasks}</div>
              <div className="text-sm text-green-700 flex items-center justify-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Completed
              </div>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-xl">
              <div className="text-2xl font-bold text-blue-600">{inProgressTasks}</div>
              <div className="text-sm text-blue-700 flex items-center justify-center gap-1">
                <Clock className="w-3 h-3" />
                In Progress
              </div>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-xl">
              <div className="text-2xl font-bold text-yellow-600">{pendingTasks}</div>
              <div className="text-sm text-yellow-700 flex items-center justify-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Pending
              </div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-xl">
              <div className="text-2xl font-bold text-gray-800">{todoTasks}</div>
              <div className="text-sm text-gray-700 flex items-center justify-center gap-1">
                <AlertCircle className="w-3 h-3" />
                To Do
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          {totalTasks > 0 && (
            <div className="mb-8">
              <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
                <span className="font-medium">Project Progress</span>
                <span>{completedTasks}/{totalTasks} tasks completed</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Project Details & Timeline */}
          <div className="grid md:grid-cols-2 gap-6 text-sm text-gray-600">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                <span>Start: {project.start_date ? new Date(project.start_date).toLocaleDateString() : (project.created_at ? new Date(project.created_at).toLocaleDateString() : 'Not set')}</span>
              </div>
              {project.end_date && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <span>End: {new Date(project.end_date).toLocaleDateString()}</span>
                </div>
              )}
              {project.due_date && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <span>Due: {new Date(project.due_date).toLocaleDateString()}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-green-500" />
                <span>Assigned: {users.filter((u: any) => assignedUsers.includes(u.id)).map((u: any) => u.first_name || u.username).join(', ') || 'None'}</span>
              </div>
            </div>
            <div className="space-y-4">
              {timelinePct !== null && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-700">Timeline</span>
                    <span className="text-xs text-gray-500">{Math.round(timelinePct)}% elapsed</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-2.5 rounded-full bg-gradient-to-r from-emerald-400 via-blue-500 to-purple-600 transition-all duration-700 ease-out"
                      style={{ width: `${timelinePct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{new Date(project.start_date).toLocaleDateString()}</span>
                    <span>{new Date(project.end_date || project.due_date).toLocaleDateString()}</span>
                  </div>
                </div>
              )}
              {(me?.role === 'superuser' || me?.role === 'manager') && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-gray-700">Monthly Threshold (hours):</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      className="border rounded px-2 py-1 w-28"
                      value={project.monthly_threshold_hours || 0}
                      onChange={async (e) => {
                        const val = parseFloat(e.target.value || '0')
                        await api.patch(`/projects/${projectId}/`, { monthly_threshold_hours: val })
                        await load()
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-gray-700">Client:</label>
                    <select
                      className="border rounded px-2 py-1 max-w-[200px]"
                      value={project.client || ''}
                      onChange={async (e) => {
                        const cid = e.target.value ? parseInt(e.target.value) : null
                        await api.patch(`/projects/${projectId}/`, { client: cid })
                        await load()
                      }}
                    >
                      <option value="">No Client</option>
                      {clients.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-gray-700 font-medium">Billable:</label>
                    <button
                      onClick={async () => {
                        if (confirm(`Mark project as ${!project.billable ? 'Billable' : 'Non-Billable'}? This will update all existing time entries.`)) {
                          await api.patch(`/projects/${projectId}/`, { billable: !project.billable })
                          await load()
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${project.billable ? 'bg-blue-600' : 'bg-gray-200'}`}
                    >
                      <span
                        className={`${project.billable ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                      />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Task Form */}
      {(me?.role === 'manager' || me?.role === 'superuser' || me?.role === 'employee') && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="mb-6">
            <h3 className="font-semibold text-gray-800 mb-2">Project Members</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {users.filter((u: any) => assignedUsers.includes(u.id)).map((u: any) => (
                <span key={u.id} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 text-green-700 text-base border border-green-200" style={{ fontWeight: 500 }}>
                  {u.first_name || u.username}
                  <button
                    className="text-red-600 hover:text-red-700 text-lg font-bold ml-1"
                    title="Remove from project"
                    onClick={() => assignmentMap[u.id] && removeUserFromProject(assignmentMap[u.id])}
                    style={{ lineHeight: 1 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <select
                className="border rounded px-3 py-2"
                onChange={e => { const id = parseInt(e.target.value); if (id) addUserToProject(id) }}
                value=""
              >
                <option value="">Add user to project</option>
                {users.filter((u: any) => !assignedUsers.includes(u.id)).map((u: any) => (
                  <option key={u.id} value={u.id}>{u.first_name || u.username}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={() => setShowAddTask(!showAddTask)}
            className="w-full flex items-center justify-center gap-2 text-blue-600 hover:text-blue-700 font-medium p-4 hover:bg-blue-50 rounded-xl transition-all duration-200 border-2 border-dashed border-blue-200 hover:border-blue-300"
          >
            <Plus className="w-5 h-5" />
            Add New Task
          </button>

          {showAddTask && (
            <div className="mt-6 p-6 bg-gray-50 rounded-xl animate-slideDown">
              <form onSubmit={addTask} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Task Title</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                      placeholder="Enter task title"
                      value={tf.title}
                      onChange={e => setTf({ ...tf, title: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                    <select
                      className="w-full border border-gray-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                      value={tf.status}
                      onChange={e => setTf({ ...tf, status: e.target.value as any })}
                    >
                      <option value="todo">To Do</option>
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Completed</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    className="w-full border border-gray-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 resize-none"
                    placeholder="Task description"
                    rows={3}
                    value={tf.description}
                    onChange={e => setTf({ ...tf, description: e.target.value })}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {me?.role !== 'employee' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Assign to</label>
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2 mb-2">
                          {tf.assignees.map((userId: number) => {
                            const user = users.find(u => u.id === userId)
                            if (!user) return null
                            return (
                              <span key={userId} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm border border-blue-200">
                                {user.first_name || user.username}
                                <button
                                  className="text-blue-600 hover:text-blue-700"
                                  onClick={() => setTf({ ...tf, assignees: tf.assignees.filter(id => id !== userId) })}
                                >
                                  ×
                                </button>
                              </span>
                            )
                          })}
                        </div>
                        <select
                          className="w-full border border-gray-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                          value=""
                          onChange={e => {
                            const id = parseInt(e.target.value)
                            if (id && !tf.assignees.includes(id)) {
                              setTf({ ...tf, assignees: [...tf.assignees, id] })
                            }
                          }}
                        >
                          <option value="">Add assignee</option>
                          {users.filter((u: any) => assignedUsers.includes(u.id) && !tf.assignees.includes(u.id)).map((u: any) => (
                            <option key={u.id} value={u.id}>{u.first_name || u.username}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                      <input
                        type="date"
                        className="w-full border border-gray-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                        value={tf.planned_start_date}
                        onChange={e => setTf({ ...tf, planned_start_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Due Date</label>
                      <input
                        type="date"
                        className="w-full border border-gray-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                        value={tf.due_date}
                        onChange={e => setTf({ ...tf, due_date: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowMoreTaskOptions(v => !v)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                  {showMoreTaskOptions ? 'Hide advanced options' : 'More options'}
                </button>

                {showMoreTaskOptions && (
                  <div className="grid md:grid-cols-2 gap-4 mt-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Actual Start Date <span className="text-gray-400 text-xs">(optional)</span>
                      </label>
                      <input
                        type="date"
                        className="w-full border border-gray-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                        value={tf.actual_start_date}
                        onChange={e => setTf({ ...tf, actual_start_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Planned End Date <span className="text-gray-400 text-xs">(optional)</span>
                      </label>
                      <input
                        type="date"
                        className="w-full border border-gray-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                        value={tf.planned_end_date}
                        onChange={e => setTf({ ...tf, planned_end_date: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg px-6 py-3 font-medium hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    Create Task
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddTask(false)}
                    className="px-6 py-3 text-gray-600 hover:text-gray-800 font-medium hover:bg-gray-100 rounded-lg transition-all duration-200"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}


      {/* Data Requests Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">Data Requests</h2>
          <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-medium">
            {requests.length} {requests.length === 1 ? 'request' : 'requests'}
          </span>
        </div>

        {requests.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500">No data requests found for this project.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-3 font-semibold text-gray-600">Request</th>
                  <th className="py-3 font-semibold text-gray-600">Requester</th>
                  <th className="py-3 font-semibold text-gray-600">Status</th>
                  <th className="py-3 font-semibold text-gray-600">Cost</th>
                  <th className="py-3 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-gray-800">{r.title}</div>
                      {r.description && <div className="text-sm text-gray-500 truncate max-w-xs">{r.description}</div>}
                      {r.file && (
                        <a href={r.file} className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1">
                          <FileText className="w-3 h-3" /> View File
                        </a>
                      )}
                    </td>
                    <td className="py-3 text-gray-600 text-sm">
                      {r.requester_name || 'Client'}
                      <div className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</div>
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${r.status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' :
                        r.status === 'estimated' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                          r.status === 'rejected' ? 'bg-red-100 text-red-700 border-red-200' :
                            'bg-yellow-100 text-yellow-700 border-yellow-200'
                        }`}>
                        {r.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 text-gray-600 font-medium">
                      {r.estimated_cost ? `₹${r.estimated_cost}` : '-'}
                    </td>
                    <td className="py-3">
                      {r.status === 'pending' && (me?.role === 'manager' || me?.role === 'superuser') && (
                        <button
                          onClick={() => openEstimate(r)}
                          className="text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-medium transition-colors"
                        >
                          Provide Estimate
                        </button>
                      )}
                      {r.status === 'estimated' && (
                        <span className="text-xs text-gray-500 italic">Awaiting Approval</span>
                      )}
                      {r.status === 'approved' && (
                        <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Task Created
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tab bar -- Tasks (everyone) / Credentials (manager+superuser) */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          onClick={() => setMainTab('tasks')}
          className={`px-4 py-2 text-sm font-bold transition-colors border-b-2 -mb-px ${mainTab === 'tasks' ? 'border-[#0066FF] text-[#0066FF]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
          Tasks <span className="ml-1 text-xs text-gray-400">{tasks.length}</span>
        </button>
        {(me?.role === 'manager' || me?.role === 'superuser') && (
          <button
            onClick={() => setMainTab('credentials')}
            className={`px-4 py-2 text-sm font-bold transition-colors border-b-2 -mb-px ${mainTab === 'credentials' ? 'border-[#0066FF] text-[#0066FF]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            Credentials <span className="ml-1 text-xs text-gray-400">{credentials.length}</span>
          </button>
        )}
      </div>

      {/* Tasks List */}
      {mainTab === 'tasks' && (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">Tasks</h2>
          <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
            {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
          </span>
        </div>

        {visibleTasks.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-800 mb-2">No tasks yet</h3>
            <p className="text-gray-600">
              {me?.role === 'manager' || me?.role === 'superuser' ?
                "Create your first task to get started." :
                "Tasks will appear here once they're created."
              }
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleTasks.map((t: any, index) => (
              <div
                key={t.id}
                className={`border rounded-xl p-5 transition-all duration-300 hover:shadow-md ${getStatusColor(t.status)} border-opacity-50`}
                style={{
                  animationDelay: `${index * 100}ms`,
                  animation: 'fadeInUp 0.5s ease-out forwards'
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-gray-900">{t.title}</h3>
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(t.status)}`}>
                        {getStatusIcon(t.status)}
                        {t.status?.replace('_', ' ') || 'todo'}
                      </span>
                    </div>

                    {t.description && (
                      <p className="text-gray-700 mb-3 leading-relaxed">{t.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-2">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        <span>{t.assigned_user_names?.join(', ') || 'Unassigned'}</span>
                      </div>
                      {t.planned_start_date && (
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-blue-600" />
                          <span>Start: {new Date(t.planned_start_date).toLocaleDateString()}</span>
                        </div>
                      )}
                      {t.due_date && (
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          <span>Due: {new Date(t.due_date).toLocaleDateString()}</span>
                        </div>
                      )}
                      {t.user_total_hours && (
                        <div className="flex items-center gap-2 text-blue-600 font-medium">
                          <Clock className="w-4 h-4" />
                          <span>{t.user_total_hours}</span>
                        </div>
                      )}
                    </div>
                    {(t.actual_start_date || t.planned_end_date) && (
                      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 pt-2 border-t border-gray-200">
                        {t.actual_start_date && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-green-600" />
                            <span className="font-medium text-green-700">Actual Start:</span>
                            <span>{new Date(t.actual_start_date).toLocaleDateString()}</span>
                          </div>
                        )}
                        {t.planned_end_date && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-purple-600" />
                            <span className="font-medium text-purple-700">Planned End:</span>
                            <span>{new Date(t.planned_end_date).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Status updates only by assignee */}
                  {t.assignees_ids?.includes(me?.id) && (
                    <div className="flex gap-2 items-center">
                      <button
                        className="px-3 py-1 text-xs font-medium bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors duration-200"
                        onClick={() => updateStatus(t.id, 'todo')}
                      >
                        To Do
                      </button>
                      <button
                        className="px-3 py-1 text-xs font-medium bg-yellow-200 text-yellow-700 rounded-lg hover:bg-yellow-300 transition-colors duration-200"
                        onClick={() => updateStatus(t.id, 'pending')}
                      >
                        Pending
                      </button>
                      <button
                        className="px-3 py-1 text-xs font-medium bg-blue-200 text-blue-700 rounded-lg hover:bg-blue-300 transition-colors duration-200"
                        onClick={() => updateStatus(t.id, 'in_progress')}
                      >
                        In Progress
                      </button>
                      <button
                        className="px-3 py-1 text-xs font-medium bg-green-200 text-green-700 rounded-lg hover:bg-green-300 transition-colors duration-200"
                        onClick={() => updateStatus(t.id, 'done')}
                      >
                        Completed
                      </button>
                      {t.due_date && t.status !== 'done' && (
                        <button
                          className="px-3 py-1 text-xs font-medium bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition-colors duration-200 ml-2"
                          onClick={() => openExtension(t)}
                          title="Request a due date extension">
                          Request Extension
                        </button>
                      )}
                    </div>
                  )}
                  {/* Edit button based on role */}
                  <div className="flex items-center gap-2">
                    {me?.role === 'superuser' && (
                      <button
                        className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200"
                        onClick={() => openEditTask(t)}
                      >
                        Edit (Full)
                      </button>
                    )}
                    {me?.role === 'manager' && (
                      <button
                        className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200"
                        onClick={() => openEditTask(t)}
                      >
                        Edit
                      </button>
                    )}
                    {(me?.role === 'manager' || me?.role === 'superuser') && (
                      <button
                        className="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors duration-200"
                        onClick={async () => {
                          if (confirm('Delete this task?')) {
                            await api.delete(`/tasks/${t.id}/`);
                            try {
                              const { Cache } = await import('../lib/cache')
                              Cache.remove(Cache.key('/tasks/', { project: projectId, page_size: 1000 }))
                            } catch { }
                            await load()
                          }
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Credentials section -- manager/superuser only */}
      {mainTab === 'credentials' && (me?.role === 'manager' || me?.role === 'superuser') && (
        <CredentialsSection
          credentials={credentials}
          loading={credentialsLoading}
          revealedSecrets={revealedSecrets}
          onToggleReveal={toggleSecretReveal}
          onNew={openNewCredential}
          onEdit={openEditCredential}
          onDelete={deleteCredential}
        />
      )}

      {/* Credential form modal */}
      {editingCredential && (
        <CredentialModal
          form={credentialForm}
          setForm={setCredentialForm}
          isNew={!editingCredential.id}
          onClose={() => setEditingCredential(null)}
          onSubmit={saveCredential}
        />
      )}

      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            max-height: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            max-height: 600px;
            transform: translateY(0);
          }
        }
        
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-slideDown {
          animation: slideDown 0.4s ease-out forwards;
        }
      `}</style>
      {extensionFor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">Request Extension</h3>
              <button onClick={() => setExtensionFor(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="mb-4 bg-gray-50 p-3 rounded-lg text-sm">
              <p className="font-medium text-gray-900">{extensionFor.title}</p>
              <p className="text-gray-600 mt-1">
                Current due date: <strong>{extensionFor.due_date || '—'}</strong>
              </p>
            </div>
            <form onSubmit={submitExtension} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New due date</label>
                <input
                  type="date"
                  required
                  min={extensionFor.due_date || undefined}
                  value={extensionForm.requested_due_date}
                  onChange={e => setExtensionForm({ ...extensionForm, requested_due_date: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <textarea
                  rows={3}
                  required
                  value={extensionForm.reason}
                  onChange={e => setExtensionForm({ ...extensionForm, reason: e.target.value })}
                  placeholder="Why do you need more time?"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-400" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setExtensionFor(null)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium">Submit</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {estimateTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md animate-slideDown">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-800">Estimate Request</h3>
              <button
                onClick={() => setEstimateTarget(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="mb-6 bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-1">{estimateTarget.title}</h4>
              <p className="text-sm text-gray-600">{estimateTarget.description}</p>
            </div>

            <form onSubmit={submitEstimate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Cost (₹)</label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full border border-gray-200 rounded-lg pl-9 pr-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0.00"
                    value={estimateForm.cost}
                    onChange={e => setEstimateForm({ ...estimateForm, cost: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes / Breakdown</label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={3}
                  placeholder="Explain the cost estimation..."
                  value={estimateForm.notes}
                  onChange={e => setEstimateForm({ ...estimateForm, notes: e.target.value })}
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  className="flex-1 px-4 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                  onClick={() => setEstimateTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  Submit Estimate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editTaskTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-4">
              {me?.role === 'superuser' ? 'Edit Task (Full)' : 'Edit Task'}
            </h3>
            <form onSubmit={saveEditTask} className="space-y-4">
              {me?.role !== 'employee' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Title</label>
                    <input
                      className="w-full border rounded px-3 py-2"
                      value={editForm.title}
                      onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Description</label>
                    <textarea
                      className="w-full border rounded px-3 py-2"
                      rows={3}
                      value={editForm.description}
                      onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Assign to</label>
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2 mb-2">
                          {editForm.assignees.map((userId: number) => {
                            const user = users.find(u => u.id === userId)
                            if (!user) return null
                            return (
                              <span key={userId} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm border border-blue-200">
                                {user.first_name || user.username}
                                <button
                                  className="text-blue-600 hover:text-blue-700"
                                  onClick={() => setEditForm({ ...editForm, assignees: editForm.assignees.filter(id => id !== userId) })}
                                >
                                  ×
                                </button>
                              </span>
                            )
                          })}
                        </div>
                        <select
                          className="w-full border rounded px-3 py-2"
                          value=""
                          onChange={e => {
                            const id = parseInt(e.target.value)
                            if (id && !editForm.assignees.includes(id)) {
                              setEditForm({ ...editForm, assignees: [...editForm.assignees, id] })
                            }
                          }}
                        >
                          <option value="">Add assignee</option>
                          {users.filter((u: any) => assignedUsers.includes(u.id) && !editForm.assignees.includes(u.id)).map((u: any) => (
                            <option key={u.id} value={u.id}>{u.first_name || u.username}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">Start Date</label>
                        <input
                          type="date"
                          className="w-full border rounded px-3 py-2"
                          value={editForm.planned_start_date}
                          onChange={e => setEditForm({ ...editForm, planned_start_date: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Due Date</label>
                        <input
                          type="date"
                          className="w-full border rounded px-3 py-2"
                          value={editForm.due_date}
                          onChange={e => setEditForm({ ...editForm, due_date: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMoreEditOptions(v => !v)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 mt-2"
                  >
                    {showMoreEditOptions ? 'Hide advanced options' : 'More options'}
                  </button>
                  {showMoreEditOptions && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 pt-2 border-t">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Actual Start Date <span className="text-gray-400 text-xs">(optional)</span>
                        </label>
                        <input
                          type="date"
                          className="w-full border rounded px-3 py-2"
                          value={editForm.actual_start_date}
                          onChange={e => setEditForm({ ...editForm, actual_start_date: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Planned End Date <span className="text-gray-400 text-xs">(optional)</span>
                        </label>
                        <input
                          type="date"
                          className="w-full border rounded px-3 py-2"
                          value={editForm.planned_end_date}
                          onChange={e => setEditForm({ ...editForm, planned_end_date: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={editForm.status}
                  onChange={e => setEditForm({ ...editForm, status: e.target.value as any })}
                >
                  <option value="todo">To Do</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Completed</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  className="flex-1 bg-gray-200 text-gray-800 rounded px-4 py-2"
                  onClick={() => setEditTaskTarget(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="flex-1 bg-blue-600 text-white rounded px-4 py-2">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Credentials components ----------

const CRED_KIND_OPTIONS = [
  { v: 'google', l: 'Google' },
  { v: 'github', l: 'GitHub' },
  { v: 'aws', l: 'AWS' },
  { v: 'cdn', l: 'CDN' },
  { v: 'database', l: 'Database' },
  { v: 'ftp', l: 'FTP / SSH' },
  { v: 'smtp', l: 'SMTP / Email' },
  { v: 'dlt', l: 'DLT' },
  { v: 'api_key', l: 'API Key' },
  { v: 'other', l: 'Other' },
]

function CredentialsSection({
  credentials, loading, revealedSecrets, onToggleReveal, onNew, onEdit, onDelete,
}: {
  credentials: any[]
  loading: boolean
  revealedSecrets: Set<number>
  onToggleReveal: (id: number) => void
  onNew: () => void
  onEdit: (c: any) => void
  onDelete: (id: number) => void
}) {
  function copyToClipboard(text: string) {
    if (!text) return
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Credentials</h2>
          <p className="text-xs text-gray-500 mt-1">
            Stored in plain text. Only managers and superusers can see this tab.
          </p>
        </div>
        <button
          onClick={onNew}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0066FF] text-white font-medium hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> New Credential
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">Loading…</div>
      ) : credentials.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Target className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-800 mb-2">No credentials yet</h3>
          <p className="text-gray-600">Click "New Credential" to add the first one for this project.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {credentials.map(c => {
            const revealed = revealedSecrets.has(c.id)
            return (
              <div key={c.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-bold text-gray-900">{c.label}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium">
                        {c.kind_display || c.kind}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      {c.username && (
                        <Field label="Username">
                          <div className="flex items-center gap-2">
                            <code className="bg-gray-50 px-2 py-1 rounded text-gray-800 truncate flex-1">{c.username}</code>
                            <button onClick={() => copyToClipboard(c.username)} className="text-gray-500 hover:text-gray-800 text-xs">Copy</button>
                          </div>
                        </Field>
                      )}
                      {c.secret && (
                        <Field label="Password / Secret">
                          <div className="flex items-center gap-2">
                            <code className="bg-gray-50 px-2 py-1 rounded text-gray-800 truncate flex-1 font-mono">
                              {revealed ? c.secret : '•'.repeat(Math.min(c.secret.length, 12))}
                            </code>
                            <button onClick={() => onToggleReveal(c.id)} className="text-gray-500 hover:text-gray-800 text-xs">
                              {revealed ? 'Hide' : 'Reveal'}
                            </button>
                            <button onClick={() => copyToClipboard(c.secret)} className="text-gray-500 hover:text-gray-800 text-xs">Copy</button>
                          </div>
                        </Field>
                      )}
                      {c.url && (
                        <Field label="URL">
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 truncate block">
                            {c.url}
                          </a>
                        </Field>
                      )}
                    </div>
                    {c.notes && (
                      <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap italic">"{c.notes}"</p>
                    )}
                    <p className="mt-2 text-xs text-gray-400">
                      Added by {c.created_by_name || 'unknown'} on {new Date(c.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button onClick={() => onEdit(c)} className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Edit</button>
                    <button onClick={() => onDelete(c.id)} className="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-lg hover:bg-red-200">Delete</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-500 mb-1">{label}</div>
      {children}
    </div>
  )
}

function CredentialModal({
  form, setForm, isNew, onClose, onSubmit,
}: {
  form: any
  setForm: (f: any) => void
  isNew: boolean
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{isNew ? 'New Credential' : 'Edit Credential'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select
                value={form.kind}
                onChange={e => setForm({ ...form, kind: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                {CRED_KIND_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            {form.kind === 'other' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Custom type</label>
                <input
                  value={form.kind_custom}
                  onChange={e => setForm({ ...form, kind_custom: e.target.value })}
                  placeholder="e.g. Stripe"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Label *</label>
            <input
              required
              value={form.label}
              onChange={e => setForm({ ...form, label: e.target.value })}
              placeholder='e.g. "Production AWS"'
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Username / Account ID</label>
            <input
              value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Password / Token</label>
            <textarea
              rows={2}
              value={form.secret}
              onChange={e => setForm({ ...form, secret: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">URL</label>
            <input
              type="url"
              value={form.url}
              onChange={e => setForm({ ...form, url: e.target.value })}
              placeholder="https://…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-[#0066FF] text-white rounded-lg font-medium hover:bg-blue-700">
              {isNew ? 'Save credential' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
