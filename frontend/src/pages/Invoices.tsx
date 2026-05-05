import React, { useEffect, useState } from 'react'
import api from '../lib/api'
import { FileTextIcon, PlusIcon, DownloadIcon, XCircleIcon } from 'lucide-react'

export default function Invoices() {
    const [invoices, setInvoices] = useState<any[]>([])
    const [clients, setClients] = useState<any[]>([])
    const [projects, setProjects] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    // Form
    const [formData, setFormData] = useState({
        client: '',
        project: '',
        billing_period: '',
        file: null as File | null
    })

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        setLoading(true)
        try {
            const [invRes, clientsRes] = await Promise.all([
                api.get('/invoices/'),
                api.get('/clients/')
            ])
            setInvoices(invRes.data.results || invRes.data || [])
            setClients(clientsRes.data.results || clientsRes.data || [])
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    async function fetchProjects(clientId: string) {
        if (!clientId) {
            setProjects([])
            return
        }
        try {
            // Assuming we can filter projects by client. 
            // If the API doesn't support ?client=ID, we might need to fetch all and filter client-side 
            // or rely on the backend to filter. 
            // Based on ProjectViewSet, it doesn't explicitly show ?client filter for superusers, 
            // but let's try or just fetch all and filter.
            // Actually, ProjectViewSet has no filterset_fields for 'client'. 
            // Let's just fetch all projects and filter by client locally for now to be safe, 
            // or if the list is huge this might be bad.
            // Better approach: Since we are superusers, let's just fetch all projects and filter.
            const res = await api.get('/projects/?page_size=1000')
            const allProjects = res.data.results || res.data || []
            setProjects(allProjects.filter((p: any) => p.client === parseInt(clientId)))
        } catch (e) {
            console.error(e)
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!formData.client || !formData.billing_period || !formData.file) {
            alert('Please fill in all required fields')
            return
        }

        setSubmitting(true)
        const data = new FormData()
        data.append('client', formData.client)
        if (formData.project) data.append('project', formData.project)
        data.append('billing_period', formData.billing_period)
        data.append('file', formData.file)

        try {
            await api.post('/invoices/', data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })
            setShowModal(false)
            setFormData({ client: '', project: '', billing_period: '', file: null })
            loadData()
        } catch (e: any) {
            console.error(e)
            alert(e?.response?.data?.detail || 'Failed to upload invoice')
        } finally {
            setSubmitting(false)
        }
    }

    const handleClientChange = (clientId: string) => {
        setFormData({ ...formData, client: clientId, project: '' })
        fetchProjects(clientId)
    }

    // Default billing period to 1st of current month
    useEffect(() => {
        if (showModal && !formData.billing_period) {
            const now = new Date()
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
            // Format YYYY-MM-DD (handling timezone offset simply)
            const dateStr = firstDay.toISOString().split('T')[0]
            setFormData(prev => ({ ...prev, billing_period: dateStr }))
        }
    }, [showModal])

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-h3 font-extrabold text-[#0E141C]">Manage Invoices</h1>
                    <p className="text-gray-1">Upload and manage client invoices</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-[#0066FF] text-white font-bold rounded-lg hover:bg-[#0066FF]/90 transition shadow-sm hover:shadow"
                >
                    <PlusIcon className="w-5 h-5" />
                    Upload Invoice
                </button>
            </div>

            <div className="bg-white rounded-none border border-gray-200 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-gray-1">Loading invoices...</div>
                ) : invoices.length === 0 ? (
                    <div className="p-12 text-center">
                        <FileTextIcon className="w-12 h-12 text-gray-2 mx-auto mb-3" />
                        <p className="text-gray-1">No invoices found</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-3 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-4 font-bold text-[#0E141C]">Billing Period</th>
                                    <th className="px-6 py-4 font-bold text-[#0E141C]">Client</th>
                                    <th className="px-6 py-4 font-bold text-[#0E141C]">Project</th>
                                    <th className="px-6 py-4 font-bold text-[#0E141C]">Uploaded By</th>
                                    <th className="px-6 py-4 font-bold text-[#0E141C] text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {invoices.map(inv => (
                                    <tr key={inv.id} className="hover:bg-gray-50 transition">
                                        <td className="px-6 py-4 font-medium text-[#0E141C]">
                                            {new Date(inv.billing_period).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                                        </td>
                                        <td className="px-6 py-4 text-gray-1">
                                            {clients.find(c => c.id === inv.client)?.name || `Client #${inv.client}`}
                                        </td>
                                        <td className="px-6 py-4 text-gray-1">
                                            {inv.project_name || (inv.project ? `Project #${inv.project}` : '-')}
                                        </td>
                                        <td className="px-6 py-4 text-gray-1 text-sm">
                                            {inv.uploaded_by_name || 'Admin'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {inv.file_url && (
                                                <a
                                                    href={inv.file_url}
                                                    target="_blank"
                                                    className="inline-flex items-center gap-1 text-sm text-[#0066FF] font-bold hover:underline"
                                                >
                                                    <DownloadIcon className="w-4 h-4" /> Download
                                                </a>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-3">
                            <h3 className="font-bold text-[#0E141C]">Upload Invoice</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-2 hover:text-[#0E141C]">
                                <XCircleIcon className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-[#0E141C] mb-1">Client</label>
                                <select
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0066FF] focus:border-[#0066FF]"
                                    value={formData.client}
                                    onChange={e => handleClientChange(e.target.value)}
                                    required
                                >
                                    <option value="">Select Client</option>
                                    {clients.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-[#0E141C] mb-1">Project (Optional)</label>
                                <select
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0066FF] focus:border-[#0066FF]"
                                    value={formData.project}
                                    onChange={e => setFormData({ ...formData, project: e.target.value })}
                                    disabled={!formData.client}
                                >
                                    <option value="">All Projects / None</option>
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-[#0E141C] mb-1">Billing Period</label>
                                <input
                                    type="date"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0066FF] focus:border-[#0066FF]"
                                    value={formData.billing_period}
                                    onChange={e => setFormData({ ...formData, billing_period: e.target.value })}
                                    required
                                />
                                <p className="text-xs text-gray-1 mt-1">Select the start date of the billing month.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-[#0E141C] mb-1">Invoice File</label>
                                <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center hover:bg-gray-50 transition cursor-pointer relative">
                                    <input
                                        type="file"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        onChange={e => setFormData({ ...formData, file: e.target.files?.[0] || null })}
                                        required
                                        accept=".pdf,.doc,.docx,.xls,.xlsx"
                                    />
                                    <div className="pointer-events-none">
                                        <FileTextIcon className="w-8 h-8 text-gray-2 mx-auto mb-2" />
                                        {formData.file ? (
                                            <span className="text-sm font-medium text-[#0066FF] block">{formData.file.name}</span>
                                        ) : (
                                            <span className="text-sm text-gray-1 block">Click to upload file</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 px-4 py-2 text-[#0E141C] bg-gray-3 hover:bg-gray-200 rounded-lg font-bold transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 px-4 py-2 bg-[#0066FF] text-white rounded-lg font-bold hover:bg-[#0066FF]/90 transition shadow disabled:opacity-70"
                                >
                                    {submitting ? 'Uploading...' : 'Upload'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
