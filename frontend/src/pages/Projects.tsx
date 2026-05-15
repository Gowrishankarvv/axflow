import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { getCached } from '../lib/api'
import { Plus, Trash2, Calendar, User, CheckCircle, Clock, AlertCircle, FolderIcon, Pencil } from 'lucide-react'

export default function Projects({ me }: { me?: any }) {
  const [items, setItems] = useState<any[]>([])
  const [filteredItems, setFilteredItems] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [pform, setPform] = useState<{ name: string; description: string; client?: number | string; start_date?: string; end_date?: string }>({
    name: '',
    description: '',
  })
  const [tforms, setTforms] = useState<Record<number, { title: string; description: string; assignees: number[]; planned_start_date: string; due_date: string }>>({})
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<any[]>([])

  async function load() {
    try {
      const [combinedRes, usersRes, clientsRes] = await Promise.all([
        getCached('/projects/combined/', { params: {} }, { ttlMs: 60 * 1000 }),
        getCached('/users/light/', undefined, { ttlMs: 15 * 60 * 1000 }),
        (me?.role === 'superuser' || me?.role === 'manager') ? api.get('/clients/') : Promise.resolve({ data: [] })
      ])
      const data = (combinedRes.data || []).map((p: any) => ({
        ...p,
        tasks: p.tasks.map((t: any) => ({
          id: t.task_id,
          title: t.task_name,
          status: t.status,
          description: t.description,
          due_date: t.due_date,
          assigned_user_names: t.assigned_to.map((a: any) => a.name),
        })),
      }))
      setItems(data)
      setUsers((usersRes.data as any) as any)
      const clientsData = (clientsRes as any)?.data
      setClients(clientsData?.results || clientsData || [])
    } catch (err: any) {
      // Fallback to legacy endpoints if combined is unavailable (e.g., backend not deployed yet)
      try {
        const [projectsRes, usersRes, tasksRes, clientsRes] = await Promise.all([
          getCached('/projects/', { params: { page_size: 1000 } }, { ttlMs: 5 * 60 * 1000 }),
          getCached('/users/light/', undefined, { ttlMs: 15 * 60 * 1000 }),
          getCached('/tasks/', { params: { page_size: 10000 } }, { ttlMs: 60 * 1000 }),
          (me?.role === 'superuser' || me?.role === 'manager') ? api.get('/clients/') : Promise.resolve({ data: [] })
        ])
        const legacyProjects = ((projectsRes.data as any).results || projectsRes.data) as any[]
        const allTasks = (((tasksRes.data as any).results || tasksRes.data) as any[])
        const clientsData = (clientsRes as any)?.data
        const fetchedClients = clientsData?.results || clientsData || []
        // Group tasks by project and compute stats in one pass
        const byProject: Record<string, any[]> = {}
        for (const t of allTasks) {
          const pid = String(t.project)
          if (!byProject[pid]) byProject[pid] = []
          byProject[pid].push({
            id: t.id,
            title: t.title,
            status: t.status,
            description: t.description,
            due_date: t.due_date,
            assigned_user_names: t.assignees_names || t.assignees || [],
          })
        }
        const mapped = legacyProjects.map((p: any) => {
          const pid = String(p.id)
          const tasks = byProject[pid] || []
          const todo = tasks.filter((t: any) => t.status === 'todo' || t.status === 'pending').length
          const inprog = tasks.filter((t: any) => t.status === 'in_progress').length
          const done = tasks.filter((t: any) => t.status === 'done').length
          return {
            project_id: p.id,
            project_name: p.name,
            description: p.description,
            manager: null,
            tasks: tasks.map((t: any) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              description: t.description,
              due_date: t.due_date,
              assigned_user_names: t.assigned_user_names,
            })),
            stats: { todo_count: todo, in_progress_count: inprog, completed_count: done, total_tasks: tasks.length },
          }
        })
        setItems(mapped)
        setUsers((usersRes.data as any) as any)
        setClients(fetchedClients)
      } catch (e) {
        setItems([])
      }
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    const filtered = items.filter(item =>
      (item.project_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
    setFilteredItems(filtered)
  }, [items, searchQuery])

  async function addProject(e: React.FormEvent) {
    e.preventDefault()
    await api.post('/projects/', pform)
    setPform({ name: '', description: '' })
    await load()
  }

  async function deleteProject(id: number) {
    await api.delete(`/projects/${id}/`)
    await load()
  }

  async function addTask(projectId: number, e: React.FormEvent, reloadTasks: () => void) {
    e.preventDefault()
    const tf = tforms[projectId] || { title: '', description: '', assignees: [], planned_start_date: '', due_date: '' }
    await api.post('/tasks/', {
      project: projectId,
      title: tf.title,
      description: tf.description,
      assignees: tf.assignees,
      planned_start_date: tf.planned_start_date || null,
      due_date: tf.due_date || null,
    })
    setTforms({ ...tforms, [projectId]: { title: '', description: '', assignees: [], planned_start_date: '', due_date: '' } })
    reloadTasks()
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Projects
          </h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded-lg mb-3"></div>
              <div className="h-4 bg-gray-200 rounded mb-4"></div>
              <div className="space-y-2">
                <div className="h-3 bg-gray-200 rounded"></div>
                <div className="h-3 bg-gray-200 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-8 bg-gradient-to-br from-gray-50 to-white min-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <FolderIcon className="w-6 h-6 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
        </div>
        <div className="text-sm text-gray-500 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100">
          {filteredItems.length} {filteredItems.length === 1 ? 'project' : 'projects'}
        </div>
      </div>

      {(me?.role === 'superuser' || me?.role === 'manager') && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-all duration-300">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
              <Plus className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-800">Create New Project</h2>
          </div>
          <form onSubmit={addProject} className="grid md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Project Name</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 placeholder-gray-400"
                placeholder="Enter project name"
                value={pform.name}
                onChange={e => setPform({ ...pform, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Description</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 placeholder-gray-400"
                placeholder="Project description"
                value={pform.description}
                onChange={e => setPform({ ...pform, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Client</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white"
                value={(pform as any).client || ''}
                onChange={e => setPform({ ...pform, client: e.target.value } as any)}
              >
                <option value="">No Client</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Start Date <span className="text-gray-400 text-xs">(optional)</span>
              </label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                value={pform.start_date || ''}
                onChange={e => setPform({ ...pform, start_date: e.target.value || undefined })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                End Date <span className="text-gray-400 text-xs">(optional)</span>
              </label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                value={pform.end_date || ''}
                onChange={e => setPform({ ...pform, end_date: e.target.value || undefined })}
              />
            </div>
            <div className="flex items-end">
              <button className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl px-6 py-3 font-medium hover:from-blue-700 hover:to-purple-700 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl">
                Create Project
              </button>
            </div>
          </form>
        </div >
      )
      }

      {/* Search Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search projects by name or description..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 placeholder-gray-400"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
            {filteredItems.length} of {items.length} projects
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredItems.map((p: any, index) => (
          <div
            key={p.project_id}
            className="transform hover:scale-105 transition-all duration-300"
            style={{
              animationDelay: `${index * 100}ms`,
              animation: 'fadeInUp 0.6s ease-out forwards'
            }}
          >
            <ProjectCard
              p={p}
              me={me}
              tforms={tforms}
              setTforms={setTforms}
              deleteProject={deleteProject}
              addTask={addTask}
              users={users}
            />
          </div>
        ))}

        {filteredItems.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
            <div className="w-24 h-24 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full flex items-center justify-center mb-4">
              <Plus className="w-12 h-12 text-blue-500" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">No projects yet</h3>
            <p className="text-gray-600 max-w-md">
              {me?.role === 'superuser' ?
                "Get started by creating your first project above." :
                "Projects will appear here once they're created."
              }
            </p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div >
  )
}

function ProjectCard({ p, me, tforms, setTforms, deleteProject, addTask, users }: any) {
  const [tasks, setTasks] = useState<any[]>(p.tasks || [])
  const [loading, setLoading] = useState(!Array.isArray(p.tasks))
  const [showAddTask, setShowAddTask] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState<string>(p.project_name)
  const [editDescription, setEditDescription] = useState<string>(p.description || '')

  const loadTasks = async () => {
    try {
      const res = await getCached(`/tasks/`, { params: { project: p.project_id || p.id, page_size: 1000 } }, { ttlMs: 60 * 1000 })
      const data = ((res.data as any).results || res.data) as any[]
      setTasks(data)
    } catch (e) {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    setTasks(Array.isArray(p.tasks) ? p.tasks : [])
    if (!Array.isArray(p.tasks)) {
      setLoading(true)
      loadTasks()
    }
  }, [p.project_id])

  async function deleteTask(taskId: number) {
    await api.delete(`/tasks/${taskId}/`)
    // Optimistic remove
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }

  const completedTasks = p.stats?.completed_count ?? tasks.filter((t: any) => t.status === 'done').length
  const totalTasks = p.stats?.total_tasks ?? tasks.length
  const progressPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': return 'text-green-600 bg-green-50'
      case 'pending': return 'text-yellow-600 bg-yellow-50'
      case 'in_progress': return 'text-blue-600 bg-blue-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'done': return <CheckCircle className="w-3 h-3" />
      case 'in_progress': return <Clock className="w-3 h-3" />
      default: return <AlertCircle className="w-3 h-3" />
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300 group">
      {/* Project Header */}
      <div className="p-6 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            {isEditing ? (
              <div className="space-y-2">
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Project name"
                />
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 resize-none"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  placeholder="Description (optional)"
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      await api.patch(`/projects/${p.project_id}/`, { name: editName, description: editDescription })
                      setIsEditing(false)
                    }}
                    className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors duration-200"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setIsEditing(false); setEditName(p.project_name); setEditDescription(p.description || '') }}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors duration-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2">
                  <Link to={me?.role === 'client' ? `/project-detail/${p.project_id}` : `/projects/${p.project_id}`} className="group/name block">
                    <h3 className="text-xl font-bold text-gray-800 mb-2 group-hover:text-blue-600 transition-colors duration-200">
                      {editName}
                    </h3>
                  </Link>
                  {p.client_name && (
                    <div className="absolute top-6 right-6 lg:static lg:ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                      {p.client_name}
                    </div>
                  )}
                  {(me?.role === 'superuser' || me?.role === 'manager') && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 p-1 rounded-md hover:bg-blue-50 transition-all duration-200 -mt-1"
                      title="Edit project"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">{editDescription}</p>
              </div>
            )}
          </div>
          {me?.role === 'superuser' && (
            <button
              onClick={() => deleteProject(p.project_id)}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition-all duration-200"
              title="Delete project"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Progress Bar */}
        {totalTasks > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
              <span>Progress</span>
              <span>{completedTasks}/{totalTasks} tasks</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* Add Task Form */}
      {(me?.role === 'manager' || me?.role === 'superuser') && (
        <div className="px-6 pb-4">
          <button
            onClick={() => setShowAddTask(!showAddTask)}
            className="w-full text-left text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2 p-3 hover:bg-blue-50 rounded-xl transition-all duration-200"
          >
            <Plus className="w-4 h-4" />
            Add new task
          </button>

          {showAddTask && (
            <div className="mt-3 p-4 bg-gray-50 rounded-xl space-y-3 animate-slideDown">
              <form onSubmit={(e) => { addTask(p.project_id, e, loadTasks); setShowAddTask(false) }} className="space-y-3">
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="Task title"
                  value={tforms[p.project_id || p.id]?.title || ''}
                  onChange={e =>
                    setTforms({
                      ...tforms,
                      [p.project_id || p.id]: {
                        ...(tforms[p.project_id || p.id] || { title: '', description: '', assignees: [], planned_start_date: '', due_date: '' }),
                        title: e.target.value,
                      },
                    })
                  }
                  required
                />
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 resize-none"
                  placeholder="Task description"
                  rows={2}
                  value={tforms[p.project_id || p.id]?.description || ''}
                  onChange={e =>
                    setTforms({
                      ...tforms,
                      [p.project_id || p.id]: {
                        ...(tforms[p.project_id || p.id] || { title: '', description: '', assignees: [], planned_start_date: '', due_date: '' }),
                        description: e.target.value,
                      },
                    })
                  }
                />
                <div className="grid grid-cols-1 gap-3">
                  <div className="grid grid-cols-[120px_1fr] items-center gap-3">
                    <label className="text-sm font-medium text-gray-700">Assign to</label>
                    <select
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                      value={tforms[p.project_id || p.id]?.assignees?.[0] || ''}
                      onChange={e =>
                        setTforms({
                          ...tforms,
                          [p.project_id || p.id]: {
                            ...(tforms[p.project_id || p.id] || { title: '', description: '', assignees: [], planned_start_date: '', due_date: '' }),
                            assignees: e.target.value ? [parseInt(e.target.value)] : [],
                          },
                        })
                      }
                    >
                      <option value="">Unassigned</option>
                      {users.map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.first_name || u.username || u.name || `User #${u.id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-center gap-3">
                    <label className="text-sm font-medium text-gray-700">Start Date</label>
                    <input
                      type="date"
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                      value={tforms[p.project_id || p.id]?.planned_start_date || ''}
                      onChange={e =>
                        setTforms({
                          ...tforms,
                          [p.project_id || p.id]: {
                            ...(tforms[p.project_id || p.id] || { title: '', description: '', assignees: [], planned_start_date: '', due_date: '' }),
                            planned_start_date: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-[120px_1fr] items-center gap-3">
                    <label className="text-sm font-medium text-gray-700">Due Date</label>
                    <input
                      type="date"
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                      value={tforms[p.project_id || p.id]?.due_date || ''}
                      onChange={e =>
                        setTforms({
                          ...tforms,
                          [p.project_id || p.id]: {
                            ...(tforms[p.project_id || p.id] || { title: '', description: '', assignees: [], planned_start_date: '', due_date: '' }),
                            due_date: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors duration-200"
                  >
                    Add Task
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddTask(false)}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors duration-200"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Tasks List */}
      <div className="px-6 pb-6">
        <div className="border-t border-gray-100 pt-4">
          <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            Tasks {totalTasks > 0 && <span className="text-gray-500 font-normal">({totalTasks})</span>}
          </h4>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse"></div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {tasks.map((t: any, index) => (
                <div
                  key={t.id}
                  className="group bg-gray-50 hover:bg-white border border-transparent hover:border-gray-200 rounded-lg p-3 transition-all duration-200"
                  style={{
                    animationDelay: `${index * 50}ms`,
                    animation: 'fadeInScale 0.3s ease-out forwards'
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h5 className="font-medium text-gray-800 text-sm truncate">{t.title}</h5>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(t.status)}`}>
                          {getStatusIcon(t.status)}
                          {t.status?.replace('_', ' ') || 'todo'}
                        </span>
                      </div>
                      {t.description && (
                        <p className="text-xs text-gray-600 mb-2 line-clamp-2">{t.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        {t.assigned_user_names && t.assigned_user_names.length > 0 && (
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            <span>{t.assigned_user_names.join(', ')}</span>
                          </div>
                        )}
                        {t.due_date && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>{new Date(t.due_date).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteTask(t.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1 hover:bg-red-50 rounded transition-all duration-200"
                      title="Delete task"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}

              {tasks.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No tasks yet</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            max-height: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            max-height: 300px;
            transform: translateY(0);
          }
        }
        
        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        .animate-slideDown {
          animation: slideDown 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  )
}
