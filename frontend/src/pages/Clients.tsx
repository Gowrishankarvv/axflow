import React, { useEffect, useState } from 'react'
import api, { getCached } from '../lib/api'
import { Plus, Search, Building, Mail, Globe, CheckCircle, XCircle, Trash2, Edit2, Users, KeyRound, Copy } from 'lucide-react'

type ClientLogin = {
    id: number
    first_name: string
    last_name: string
    email: string
    username: string
    is_active: boolean
    must_set_password: boolean
}

export default function Clients({ me }: { me?: any }) {
    const [clients, setClients] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [showModal, setShowModal] = useState(false)
    const [editingClient, setEditingClient] = useState<any | null>(null)
    const [form, setForm] = useState<{ name: string, domain: string, contact_email: string, is_active: boolean, logo: File | null }>({
        name: '', domain: '', contact_email: '', is_active: true, logo: null
    })

    // --- "Manage Logins" modal state ---
    const [loginsClient, setLoginsClient] = useState<any | null>(null)
    const [clientLogins, setClientLogins] = useState<ClientLogin[]>([])
    const [logToLoading, setLogToLoading] = useState(false)
    const [loginForm, setLoginForm] = useState<{ first_name: string, last_name: string, email: string, password: string }>({
        first_name: '', last_name: '', email: '', password: ''
    })
    const [showLoginForm, setShowLoginForm] = useState(false)
    const [generatedTempPassword, setGeneratedTempPassword] = useState<{ email: string, password: string } | null>(null)
    const [logToError, setLogToError] = useState<string | null>(null)

    async function load() {
        setLoading(true)
        try {
            const res = await getCached('/clients/', { params: { page_size: 100 } })
            setClients((res.data as any).results || res.data)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.domain?.toLowerCase().includes(search.toLowerCase()) ||
        c.contact_email?.toLowerCase().includes(search.toLowerCase())
    )

    function openCreate() {
        setEditingClient(null)
        setForm({ name: '', domain: '', contact_email: '', is_active: true, logo: null })
        setShowModal(true)
    }

    function openEdit(c: any) {
        setEditingClient(c)
        setForm({
            name: c.name,
            domain: c.domain || '',
            contact_email: c.contact_email || '',
            is_active: c.is_active,
            logo: null // reset file input
        })
        setShowModal(true)
    }

    async function save(e: React.FormEvent) {
        e.preventDefault()
        try {
            const formData = new FormData()
            formData.append('name', form.name)
            formData.append('domain', form.domain)
            formData.append('contact_email', form.contact_email)
            formData.append('is_active', String(form.is_active))
            if (form.logo) {
                formData.append('logo', form.logo)
            }
            if ((form as any).delete_logo) {
                formData.append('delete_logo', 'true')
            }
            // For new clients with admin user
            if (!editingClient && (form as any).admin_email) {
                formData.append('admin_email', (form as any).admin_email)
                formData.append('admin_name', (form as any).admin_name)
                formData.append('admin_password', (form as any).admin_password)
            }

            if (editingClient) {
                await api.patch(`/clients/${editingClient.id}/`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                })
            } else {
                await api.post('/clients/', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                })
            }
            setShowModal(false)
            // Clear cache
            try {
                const { Cache } = await import('../lib/cache')
                Cache.remove(Cache.key('/clients/', { page_size: 100 }))
            } catch { }
            await load()
        } catch (err: any) {
            alert(err.response?.data?.detail || 'Failed to save client')
        }
    }

    async function remove(id: number) {
        if (!confirm('Are you sure you want to delete this client? This action cannot be undone.')) return
        try {
            await api.delete(`/clients/${id}/`)
            try {
                const { Cache } = await import('../lib/cache')
                Cache.remove(Cache.key('/clients/', { page_size: 100 }))
            } catch { }
            await load()
        } catch (err: any) {
            alert(err.response?.data?.detail || 'Failed to delete client')
        }
    }

    // --- Per-client login management ---

    async function openLoginsModal(c: any) {
        setLoginsClient(c)
        setShowLoginForm(false)
        setGeneratedTempPassword(null)
        setLogToError(null)
        setLoginForm({ first_name: '', last_name: '', email: '', password: '' })
        await loadClientLogins(c.id)
    }

    async function loadClientLogins(clientId: number) {
        setLogToLoading(true)
        try {
            const res = await api.get('/users/', { params: { role: 'client', client_org: clientId, page_size: 200 } })
            const payload: any = res.data
            setClientLogins(payload.results || payload || [])
        } catch (e) {
            console.error('Failed to load client logins', e)
            setClientLogins([])
        } finally {
            setLogToLoading(false)
        }
    }

    async function createLogin(e: React.FormEvent) {
        e.preventDefault()
        if (!loginsClient) return
        setLogToError(null)
        const body: any = {
            first_name: loginForm.first_name,
            last_name: loginForm.last_name,
            email: loginForm.email,
            username: loginForm.email,
            role: 'client',
            client_org: loginsClient.id,
            is_active: true,
        }
        if (loginForm.password.trim()) body.password = loginForm.password.trim()
        try {
            const res = await api.post('/users/', body)
            const data = res.data as any
            // If admin left the password blank, backend minted a temp one and returned it once.
            if (data.generated_password) {
                setGeneratedTempPassword({ email: data.email, password: data.generated_password })
            } else {
                setGeneratedTempPassword(null)
            }
            setShowLoginForm(false)
            setLoginForm({ first_name: '', last_name: '', email: '', password: '' })
            await loadClientLogins(loginsClient.id)
        } catch (err: any) {
            const detail = err?.response?.data
            const text = typeof detail === 'string'
                ? detail
                : (detail?.detail || JSON.stringify(detail) || 'Failed to create login')
            setLogToError(text)
        }
    }

    async function toggleLoginActive(login: ClientLogin) {
        if (!loginsClient) return
        try {
            await api.patch(`/users/${login.id}/`, { is_active: !login.is_active })
            await loadClientLogins(loginsClient.id)
        } catch (err: any) {
            alert(err?.response?.data?.detail || 'Failed to update login')
        }
    }

    function copyToClipboard(text: string) {
        try { navigator.clipboard.writeText(text) } catch { }
    }

    return (
        <div className="p-6 space-y-6 bg-gradient-to-br from-gray-50 to-white min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
                    <p className="text-gray-500">Manage client organizations and access</p>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-900 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                >
                    <Plus className="w-5 h-5" />
                    Add Client
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="mb-6 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-neutral-100 focus:border-neutral-400 transition-all"
                        placeholder="Search clients..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                {loading ? (
                    <div className="text-center py-12 text-gray-500">Loading clients...</div>
                ) : filteredClients.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-gray-100 rounded-xl">
                        <Building className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">No clients found.</p>
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredClients.map(c => (
                            <div key={c.id} className="border border-gray-100 rounded-xl p-5 hover:shadow-md transition-shadow bg-white pb-14 relative">
                                <div className="flex items-start justify-between mb-4">
                                    {c.logo ? (
                                        <img src={c.logo} alt={c.name} className="w-12 h-12 rounded-lg object-contain bg-white border border-gray-100" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-lg bg-neutral-50 text-neutral-900 flex items-center justify-center font-bold text-xl">
                                            {c.name.substring(0, 2).toUpperCase()}
                                        </div>
                                    )}
                                    <div className={`px-2 py-1 rounded-full text-xs font-medium border ${c.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                        {c.is_active ? 'Active' : 'Inactive'}
                                    </div>
                                </div>

                                <h3 className="text-lg font-bold text-gray-900 mb-1">{c.name}</h3>

                                <div className="space-y-2 text-sm text-gray-600 mt-4">
                                    <div className="flex items-center gap-2">
                                        <Globe className="w-4 h-4 text-gray-400" />
                                        <span>{c.domain || 'No domain configured'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Mail className="w-4 h-4 text-gray-400" />
                                        <span>{c.contact_email || 'No contact email'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <CheckCircle className="w-4 h-4 text-gray-400" />
                                        <span>{new Date(c.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>

                                <div className="absolute bottom-4 right-4 flex gap-2">
                                    <button
                                        onClick={() => openLoginsModal(c)}
                                        className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                        title="Manage client logins"
                                    >
                                        <Users className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => openEdit(c)} className="p-2 text-gray-500 hover:text-neutral-900 hover:bg-neutral-50 rounded-lg transition-colors">
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => remove(c.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-slideDown overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                            <h3 className="font-bold text-gray-800">{editingClient ? 'Edit Client' : 'New Client'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={save} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                                <input
                                    className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-neutral-700 focus:border-transparent"
                                    placeholder="Acme Corp"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Domain (for auto-join)</label>
                                <input
                                    className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-neutral-700 focus:border-transparent"
                                    placeholder="acme.com"
                                    value={form.domain}
                                    onChange={e => setForm({ ...form, domain: e.target.value })}
                                />
                                <p className="text-xs text-gray-500 mt-1">Users with emails ending in this domain will be linked to this client.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Company Logo</label>
                                <div className="space-y-3">
                                    {(form.logo || (editingClient && editingClient.logo && !(form as any).delete_logo)) && (
                                        <div className="flex items-center gap-3">
                                            <div className="w-16 h-16 border rounded-lg p-1 bg-white flex items-center justify-center">
                                                <img
                                                    src={form.logo ? URL.createObjectURL(form.logo) : editingClient.logo}
                                                    alt="Logo Preview"
                                                    className="w-full h-full object-contain"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (form.logo) {
                                                        setForm({ ...form, logo: null })
                                                    } else {
                                                        setForm({ ...form, delete_logo: true } as any)
                                                    }
                                                }}
                                                className="text-red-600 hover:text-red-700 text-sm font-medium flex items-center gap-1"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                Remove Logo
                                            </button>
                                        </div>
                                    )}

                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-neutral-700 focus:border-transparent file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-neutral-50 file:text-neutral-900 hover:file:bg-neutral-100"
                                        onChange={e => {
                                            if (e.target.files && e.target.files[0]) {
                                                setForm({ ...form, logo: e.target.files[0], delete_logo: false } as any)
                                            }
                                        }}
                                    />
                                    <p className="text-xs text-gray-500">Supporting JPG, PNG, WEBP. Max size 2MB.</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                                <input
                                    type="email"
                                    className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-neutral-700 focus:border-transparent"
                                    placeholder="bills@acme.com"
                                    value={form.contact_email}
                                    onChange={e => setForm({ ...form, contact_email: e.target.value })}
                                />
                            </div>

                            {!editingClient && (
                                <div className="border-t border-gray-100 pt-4 mt-4">
                                    <h4 className="font-semibold text-gray-800 mb-2">Initial Admin User</h4>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Admin Name</label>
                                            <input
                                                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-neutral-700 focus:border-transparent"
                                                placeholder="John Doe"
                                                value={(form as any).admin_name || ''}
                                                onChange={e => setForm({ ...form, admin_name: e.target.value } as any)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email/Username</label>
                                            <input
                                                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-neutral-700 focus:border-transparent"
                                                placeholder="john@acme.com"
                                                value={(form as any).admin_email || ''}
                                                onChange={e => setForm({ ...form, admin_email: e.target.value } as any)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setForm(f => ({ ...f, admin_email: f.contact_email } as any))}
                                                className="text-xs text-neutral-900 hover:underline mt-1"
                                            >
                                                Copy from Contact Email
                                            </button>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                                            <input
                                                type="password"
                                                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-neutral-700 focus:border-transparent"
                                                placeholder="••••••••"
                                                value={(form as any).admin_password || ''}
                                                onChange={e => setForm({ ...form, admin_password: e.target.value } as any)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2.5 bg-neutral-900 text-white rounded-lg font-medium hover:bg-neutral-900 transition-colors shadow-lg shadow-neutral-200"
                                >
                                    Save Client
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {loginsClient && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-neutral-50 sticky top-0 z-10">
                            <div>
                                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                    <Users className="w-5 h-5 text-emerald-600" />
                                    {loginsClient.name} · Client Logins
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">Users that can log in and see {loginsClient.name}'s projects.</p>
                            </div>
                            <button onClick={() => setLoginsClient(null)} className="text-gray-400 hover:text-gray-600">
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* One-shot temp password banner */}
                            {generatedTempPassword && (
                                <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 space-y-2">
                                    <div className="flex items-start gap-2">
                                        <KeyRound className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold text-amber-900">Temporary password — save it now</div>
                                            <div className="text-xs text-amber-800 mt-1">
                                                This is the only time you'll see it. Share it with <b>{generatedTempPassword.email}</b>;
                                                they'll be forced to set their own password on first login.
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-md px-3 py-2">
                                        <code className="flex-1 text-sm font-mono break-all">{generatedTempPassword.password}</code>
                                        <button
                                            type="button"
                                            onClick={() => copyToClipboard(generatedTempPassword.password)}
                                            className="text-amber-700 hover:text-amber-900 p-1"
                                            title="Copy to clipboard"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setGeneratedTempPassword(null)}
                                        className="text-xs text-amber-700 hover:text-amber-900 underline"
                                    >
                                        I've saved it — dismiss
                                    </button>
                                </div>
                            )}

                            {/* Existing logins */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                                        Logins {clientLogins.length > 0 && <span className="text-gray-400 font-normal">({clientLogins.length})</span>}
                                    </h4>
                                    {!showLoginForm && (
                                        <button
                                            onClick={() => { setShowLoginForm(true); setLogToError(null) }}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
                                        >
                                            <Plus className="w-4 h-4" /> Create Login
                                        </button>
                                    )}
                                </div>

                                {logToLoading ? (
                                    <div className="text-center py-6 text-gray-500 text-sm">Loading…</div>
                                ) : clientLogins.length === 0 ? (
                                    <div className="text-center py-6 border border-dashed border-gray-200 rounded-lg text-gray-500 text-sm">
                                        No logins yet for {loginsClient.name}.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {clientLogins.map(u => (
                                            <div key={u.id} className="border border-gray-100 rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-gray-900 truncate">
                                                        {(u.first_name || u.last_name) ? `${u.first_name} ${u.last_name}`.trim() : u.username}
                                                    </div>
                                                    <div className="text-xs text-gray-500 truncate">{u.email}</div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                            {u.is_active ? 'Active' : 'Disabled'}
                                                        </span>
                                                        {u.must_set_password && (
                                                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Temp password</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => toggleLoginActive(u)}
                                                    className={`text-xs font-medium px-3 py-1.5 rounded-lg ${u.is_active
                                                        ? 'bg-red-50 text-red-700 hover:bg-red-100'
                                                        : 'bg-green-50 text-green-700 hover:bg-green-100'
                                                        }`}
                                                >
                                                    {u.is_active ? 'Disable' : 'Enable'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Create form */}
                            {showLoginForm && (
                                <form onSubmit={createLogin} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">First name</label>
                                            <input
                                                type="text"
                                                value={loginForm.first_name}
                                                onChange={e => setLoginForm({ ...loginForm, first_name: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Last name</label>
                                            <input
                                                type="text"
                                                value={loginForm.last_name}
                                                onChange={e => setLoginForm({ ...loginForm, last_name: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Email (used to log in)</label>
                                        <input
                                            type="email"
                                            value={loginForm.email}
                                            onChange={e => setLoginForm({ ...loginForm, email: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                            Password <span className="text-gray-400 font-normal">(leave blank to auto-generate)</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={loginForm.password}
                                            onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                                            placeholder="Leave blank for random temp password"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-emerald-500"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Either way, the user will be forced to set their own password on first login.
                                        </p>
                                    </div>

                                    {logToError && (
                                        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{logToError}</div>
                                    )}

                                    <div className="flex justify-end gap-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => { setShowLoginForm(false); setLogToError(null) }}
                                            className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 rounded-md"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700"
                                        >
                                            Create Login
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
