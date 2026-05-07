import React, { useEffect, useState } from 'react'
import api from '../lib/api'
import { UserPlusIcon, PencilIcon, TrashIcon, BookmarkIcon as XMarkIcon } from 'lucide-react'

export default function Admin() {
  const [users, setUsers] = useState<any[]>([])
  const [error, setError] = useState('')
  const [editingUser, setEditingUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    username: '',
    password: '',
    position: '',
    monthly_threshold_hours: 0,
    role: 'employee',
    manager: '',
    is_active: true
  })
  const [me, setMe] = useState<any>(null)
  const [syncingSlack, setSyncingSlack] = useState(false)
  const [slackSyncResult, setSlackSyncResult] = useState<any>(null)

  async function load() {
    setLoading(true)
    try {
      // First get current user to check if superuser
      const meRes = await api.get('/auth/me/')
      setMe(meRes.data)
      const isSuperuser = meRes.data.role === 'superuser'

      // If superuser, fetch all users including inactive
      const url = isSuperuser ? '/users/?page_size=1000&include_inactive=true' : '/users/?page_size=1000'
      const res = await api.get(url)
      setUsers(res.data.results || res.data)
    } catch (error) {
      console.error('Failed to load users:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    try {
      const payload: any = { ...form }
      if (!payload.username) payload.username = payload.email
      const { password, ...rest } = payload
      const sendPayload = password ? { ...rest, password } : rest

      if (editingUser) {
        await api.patch(`/users/${editingUser.id}/`, sendPayload)
        setEditingUser(null)
      } else {
        await api.post('/users/', sendPayload)
      }

      setForm({ first_name: '', last_name: '', email: '', username: '', password: '', position: '', monthly_threshold_hours: 0, role: 'employee', manager: '', is_active: true })
      await load()
    } catch (err: any) {
      const detail = err?.response?.data
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail))
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: number) {
    if (!confirm('Are you sure you want to delete this user?')) return
    await api.delete(`/users/${id}/`)
    await load()
  }

  function startEdit(user: any) {
    setEditingUser(user)
    setForm({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      username: user.username || '',
      password: '',
      position: user.position || '',
      monthly_threshold_hours: user.monthly_threshold_hours || 0,
      role: user.role || 'employee',
      manager: user.manager || '',
      is_active: user.is_active ?? true
    })
  }

  function cancelEdit() {
    setEditingUser(null)
    setForm({ first_name: '', last_name: '', email: '', username: '', password: '', position: '', monthly_threshold_hours: 0, role: 'employee', manager: '', is_active: true })
  }

  async function syncSlackTaskTracker() {
    setError('')
    setSyncingSlack(true)
    setSlackSyncResult(null)
    try {
      const res = await api.post('/slack/task-tracker/sync/', {})
      setSlackSyncResult(res.data?.stats || null)
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Slack sync failed'
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail))
    } finally {
      setSyncingSlack(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 min-h-screen bg-gray-50">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-48 mb-8"></div>
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <div className="grid md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 min-h-screen bg-gray-50 animate-in fade-in duration-300">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-blue-100 rounded-lg">
            <UserPlusIcon className="w-6 h-6 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
        </div>

        {(me?.role === 'superuser' || me?.role === 'manager') && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Shark Tracker</h2>
                <p className="text-sm text-gray-600">Sync per-user parent threads and task replies to Slack.</p>
              </div>
              <button
                type="button"
                onClick={syncSlackTaskTracker}
                disabled={syncingSlack}
                className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {syncingSlack ? 'Syncing...' : 'Sync Task Tracker'}
              </button>
            </div>
            {slackSyncResult && (
              <div className="mt-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                Synced users: {slackSyncResult.users_processed}, threads created: {slackSyncResult.threads_created}, replies created: {slackSyncResult.replies_created}, replies updated: {slackSyncResult.replies_updated}, replies completed: {slackSyncResult.replies_completed}
              </div>
            )}
          </div>
        )}

        {/* User Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8 transform transition-all duration-200 hover:shadow-md">
          <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
            {editingUser ? (
              <>
                <PencilIcon className="w-5 h-5 text-blue-600" />
                Edit User
              </>
            ) : (
              <>
                <UserPlusIcon className="w-5 h-5 text-green-600" />
                Create New User
              </>
            )}
          </h2>

          <form onSubmit={submit} className="space-y-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="group">
                <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                <input
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 group-hover:border-gray-300"
                  placeholder="Enter first name"
                  value={form.first_name}
                  onChange={e => setForm({ ...form, first_name: e.target.value })}
                />
              </div>

              <div className="group">
                <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                <input
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 group-hover:border-gray-300"
                  placeholder="Enter last name"
                  value={form.last_name}
                  onChange={e => setForm({ ...form, last_name: e.target.value })}
                />
              </div>

              <div className="group">
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 group-hover:border-gray-300"
                  placeholder="Enter email address"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div className="group">
                <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                <input
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 group-hover:border-gray-300"
                  placeholder="Optional username"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                />
              </div>

              <div className="group">
                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                <input
                  type="password"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 group-hover:border-gray-300"
                  placeholder="Set password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                />
              </div>

              <div className="group">
                <label className="block text-sm font-medium text-gray-700 mb-2">Position</label>
                <select
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 group-hover:border-gray-300"
                  value={form.position}
                  onChange={e => setForm({ ...form, position: e.target.value })}
                >
                  <option value="">Select Position</option>

                  <optgroup label="Development">
                    <option value="Flutter Intern">Flutter Intern</option>
                    <option value="Flutter Junior Dev">Flutter Junior Dev</option>
                    <option value="Flutter Senior Dev">Flutter Senior Dev</option>
                    <option value="Django Intern">Django Intern</option>
                    <option value="Django Junior Dev">Django Junior Dev</option>
                    <option value="Django Senior Dev">Django Senior Dev</option>
                    <option value="React Intern">React Intern</option>
                    <option value="React Junior Dev">React Junior Dev</option>
                    <option value="React Senior Dev">React Senior Dev</option>
                  </optgroup>

                  <optgroup label="Design">
                    <option value="UI/UX Intern">UI/UX Intern</option>
                    <option value="UI/UX Junior Dev">UI/UX Junior Dev</option>
                    <option value="UI/UX Senior Dev">UI/UX Senior Dev</option>
                    <option value="Graphics Designer Intern">Graphics Designer Intern</option>
                    <option value="Graphics Designer Junior">Graphics Designer Junior</option>
                    <option value="Graphics Designer Senior">Graphics Designer Senior</option>
                    <option value="Video Editor Intern">Video Editor Intern</option>
                    <option value="Video Editor Junior">Video Editor Junior</option>
                    <option value="Video Editor Senior">Video Editor Senior</option>
                  </optgroup>

                  <optgroup label="Management & Strategy">
                    <option value="Project Manager Intern">Project Manager Intern</option>
                    <option value="Project Manager Junior">Project Manager Junior</option>
                    <option value="Project Manager Senior">Project Manager Senior</option>
                    <option value="Product Researcher Intern">Product Researcher Intern</option>
                    <option value="Product Researcher Junior">Product Researcher Junior</option>
                    <option value="Product Researcher Senior">Product Researcher Senior</option>
                    <option value="Business Developer Intern">Business Developer Intern</option>
                    <option value="Business Developer Junior">Business Developer Junior</option>
                    <option value="Business Developer Senior">Business Developer Senior</option>
                  </optgroup>

                  <optgroup label="Operations & HR">
                    <option value="HR Intern">HR Intern</option>
                    <option value="HR Junior">HR Junior</option>
                    <option value="HR Senior">HR Senior</option>
                  </optgroup>

                  <optgroup label="Executive">
                    <option value="CEO">CEO</option>
                    <option value="CFO">CFO</option>
                    <option value="COO">COO</option>
                    <option value="CMO">CMO</option>
                    <option value="Executive">Executive</option>
                  </optgroup>

                  <optgroup label="General">
                    <option value="Intern">Intern</option>
                    <option value="Junior">Junior</option>
                    <option value="Senior">Senior</option>
                  </optgroup>
                </select>
              </div>

              <div className="group">
                <label className="block text-sm font-medium text-gray-700 mb-2">Threshold Hours</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 group-hover:border-gray-300"
                  placeholder="Enter monthly threshold hours"
                  value={form.monthly_threshold_hours}
                  onChange={e => setForm({ ...form, monthly_threshold_hours: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div className="group">
                <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                <select
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 group-hover:border-gray-300"
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value })}
                >
                  <option value="">Select Role</option>
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="superuser">Superuser</option>
                </select>
              </div>

              <div className="group">
                <label className="block text-sm font-medium text-gray-700 mb-2">Manager</label>
                <select
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 group-hover:border-gray-300"
                  value={form.manager}
                  onChange={e => setForm({ ...form, manager: e.target.value })}
                >
                  <option value="">No manager</option>
                  {users
                    .filter((u: any) => u.id !== editingUser?.id)
                    .map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.first_name || u.username}
                      </option>
                    ))}
                </select>
              </div>

              {me?.role === 'superuser' && (
                <div className="group">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <div className="flex items-center h-[42px]">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={form.is_active}
                        onChange={e => setForm({ ...form, is_active: e.target.checked })}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      <span className="ml-3 text-sm font-medium text-gray-700">
                        {form.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    {editingUser ? 'Updating...' : 'Creating...'}
                  </>
                ) : (
                  <>
                    {editingUser ? 'Update User' : 'Create User'}
                  </>
                )}
              </button>

              {editingUser && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="inline-flex items-center px-6 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200 transform hover:scale-105"
                >
                  <XMarkIcon className="w-4 h-4 mr-2" />
                  Cancel
                </button>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg animate-in slide-in-from-top duration-300">
                {error}
              </div>
            )}
          </form>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Team Members ({users.length})</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-4 px-6 font-medium text-gray-900">Name</th>
                  <th className="text-left py-4 px-6 font-medium text-gray-900">Email</th>
                  <th className="text-left py-4 px-6 font-medium text-gray-900">Role</th>
                  <th className="text-left py-4 px-6 font-medium text-gray-900">Position</th>
                  <th className="text-left py-4 px-6 font-medium text-gray-900">Threshold Hours</th>
                  <th className="text-left py-4 px-6 font-medium text-gray-900">Manager</th>
                  <th className="text-left py-4 px-6 font-medium text-gray-900">Status</th>
                  <th className="text-left py-4 px-6 font-medium text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u, index) => {
                  const manager = users.find(m => m.id === u.manager)
                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-gray-50 transition-colors duration-150 animate-in fade-in slide-in-from-bottom duration-300"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <td className="py-4 px-6">
                        <div className="font-medium text-gray-900">
                          {u.first_name || u.username}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-gray-600">
                        {u.email}
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${u.role === 'superuser' ? 'bg-red-100 text-red-800' :
                          u.role === 'manager' ? 'bg-blue-100 text-blue-800' :
                            'bg-green-100 text-green-800'
                          } transition-all duration-200 hover:scale-105`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-gray-600">
                        {u.position || '-'}
                      </td>
                      <td className="py-4 px-6 text-gray-600">
                        {u.monthly_threshold_hours || 0}
                      </td>
                      <td className="py-4 px-6 text-gray-600">
                        {manager ? (manager.first_name || manager.username) : '-'}
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${u.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                          }`}>
                          {u.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <button
                            className="inline-flex items-center p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200 hover:scale-110"
                            onClick={() => startEdit(u)}
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button
                            className="inline-flex items-center p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 hover:scale-110"
                            onClick={() => remove(u.id)}
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
