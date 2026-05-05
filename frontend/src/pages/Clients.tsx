import React, { useEffect, useState } from 'react'
import api, { getCached } from '../lib/api'
import { Plus, Search, Building, Mail, Globe, CheckCircle, XCircle, Trash2, Edit2 } from 'lucide-react'

export default function Clients({ me }: { me?: any }) {
    const [clients, setClients] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [showModal, setShowModal] = useState(false)
    const [editingClient, setEditingClient] = useState<any | null>(null)
    const [form, setForm] = useState<{ name: string, domain: string, contact_email: string, is_active: boolean, logo: File | null }>({
        name: '', domain: '', contact_email: '', is_active: true, logo: null
    })

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

    return (
        <div className="p-6 space-y-6 bg-gradient-to-br from-gray-50 to-white min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
                    <p className="text-gray-500">Manage client organizations and access</p>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                >
                    <Plus className="w-5 h-5" />
                    Add Client
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="mb-6 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all"
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
                                        <div className="w-12 h-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xl">
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
                                    <button onClick={() => openEdit(c)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
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
                                    className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Acme Corp"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Domain (for auto-join)</label>
                                <input
                                    className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                                        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
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
                                    className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                                                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="John Doe"
                                                value={(form as any).admin_name || ''}
                                                onChange={e => setForm({ ...form, admin_name: e.target.value } as any)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email/Username</label>
                                            <input
                                                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="john@acme.com"
                                                value={(form as any).admin_email || ''}
                                                onChange={e => setForm({ ...form, admin_email: e.target.value } as any)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setForm(f => ({ ...f, admin_email: f.contact_email } as any))}
                                                className="text-xs text-blue-600 hover:underline mt-1"
                                            >
                                                Copy from Contact Email
                                            </button>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                                            <input
                                                type="password"
                                                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                                    className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
                                >
                                    Save Client
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
