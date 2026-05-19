
import React, { useState, useEffect } from 'react'
import { PlusIcon, FileTextIcon, CheckCircleIcon, XCircleIcon, ClockIcon, DownloadIcon } from 'lucide-react'
import api from '../../lib/api'
import { useAppData } from '../../lib/AppDataContext'

export default function ClientRequests() {
    const [requests, setRequests] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)

    // Form State
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        project: '',
        files: [] as File[]
    })
    const [projects, setProjects] = useState<any[]>([])

    useEffect(() => {
        fetchRequests()
        fetchProjects()
    }, [])

    async function fetchRequests() {
        try {
            // Pull more rows in one call to reduce pagination chatter for clients
            const { data } = await api.get('/requests/', { params: { page_size: 200 } })
            setRequests((data as any).results || data || [])
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    async function fetchProjects() {
        try {
            const { data } = await api.get('/projects/', { params: { page_size: 200 } })
            setProjects((data as any).results || data || [])
        } catch (e) {
            console.error("Failed to fetch projects", e)
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!formData.project || formData.files.length === 0) {
            alert('Project and at least one File are required')
            return
        }

        const data = new FormData()
        data.append('title', formData.title)
        data.append('description', formData.description)
        data.append('project', formData.project)
        // Main file (first one) - for compatibility? Or just put all in 'files'
        // The backend looks at 'files' list for additional, but also 'instance.file'
        // The View logic I wrote uses serializer.save() which might pick 'file' from request if simple field.
        // But better to be explicit.
        // Let's attach all as 'files' and let backend handle it (my view logic does iterate 'files')

        // If I want 'instance.file' populated, I should send one as 'file'
        if (formData.files.length > 0) {
            data.append('file', formData.files[0])
        }

        // Append all files as 'files' (or just specific ones)
        // If I append same file to 'file' and 'files', my backend logic might duplicate analysis/storage?
        // My backend logic:
        // 1. serializer.save() -> saves 'file' (if in validated_data)
        // 2. perform_create loop over 'files' -> save RequestFile

        // So if I send 'file' = files[0], and 'files' = [files[1], files[2], ...], it works best.

        for (let i = 1; i < formData.files.length; i++) {
            data.append('files', formData.files[i])
        }

        // If only 1 file, loop won't run, 'file' is set.
        // If mulitple, 'file' is files[0], rest are in 'files'.

        // Wait, my backend logic says:
        // "files = self.request.FILES.getlist('files')"
        // "Using serializer.save(requester=user)" will use 'file' from request.data/request.FILES if name matches field.

        // So:
        // 'file' -> formData.files[0]
        // 'files' -> formData.files[1:]


        try {
            await api.post('/requests/', data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })
            setShowModal(false)
            setFormData({ title: '', description: '', project: '', files: [] })
            fetchRequests()
        } catch (e) {
            console.error(e)
            alert('Failed to upload request')
        }
    }

    async function handleApprove(id: number) {
        if (!confirm('Are you sure you want to approve this estimate? This will create a task for the team.')) return
        try {
            await api.post(`/requests/${id}/approve/`)
            fetchRequests()
        } catch (e) {
            console.error(e)
            alert('Failed to approve')
        }
    }

    async function downloadAll(req: any) {
        // Trigger download
        // Using window.open or anchor tag
        const token = localStorage.getItem('access')
        const url = `${import.meta.env.VITE_API_URL || ''}/api/requests/${req.id}/download_all/`

        // If we need auth header for download, we might need to fetch blob.
        // But usually browser navigation separates auth.
        // If API requires auth, we can try fetch and save.

        try {
            const response = await api.get(url, { responseType: 'blob' })
            const blob = new Blob([response.data], { type: 'application/zip' })
            const link = document.createElement('a')
            link.href = window.URL.createObjectURL(blob)
            link.download = `Request_${req.id}_Files.zip`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
        } catch (e) {
            console.error("Download failed", e)
            alert('Download failed')
        }
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-h3 font-extrabold text-[#0E141C]">Data Requests</h1>
                    <p className="text-gray-1">Manage and track your data processing requests</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#171717] text-white rounded-lg font-bold hover:bg-[#171717]/90 transition"
                >
                    <PlusIcon className="w-5 h-5" />
                    New Request
                </button>
            </div>

            {loading ? (
                <div className="text-center py-10 text-gray-1">Loading requests...</div>
            ) : requests.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-none border border-gray-200">
                    <FileTextIcon className="w-12 h-12 text-gray-2 mx-auto mb-3" />
                    <p className="text-gray-1">No requests found. Create one to get started.</p>
                </div>
            ) : (
                <div className="bg-white rounded-none border border-gray-200 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-3 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-4 font-bold text-[#0E141C]">ID</th>
                                    <th className="px-6 py-4 font-bold text-[#0E141C]">Title</th>
                                    <th className="px-6 py-4 font-bold text-[#0E141C]">Project</th>
                                    <th className="px-6 py-4 font-bold text-[#0E141C]">Status</th>
                                    <th className="px-6 py-4 font-bold text-[#0E141C]">Submitted</th>
                                    <th className="px-6 py-4 font-bold text-[#0E141C]">Estimate</th>
                                    <th className="px-6 py-4 font-bold text-[#0E141C]">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {requests.map(req => (
                                    <tr key={req.id} className="hover:bg-gray-50 transition">
                                        <td className="px-6 py-4 text-gray-1">#{req.id}</td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-[#0E141C]">{req.title || 'Untitled'}</div>
                                            <div className="text-sm text-gray-1 truncate max-w-xs">{req.description}</div>
                                            {(req.files && req.files.length > 0 || req.file_url) && (
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-xs text-gray-500">
                                                        {1 + (req.files ? req.files.length : 0)} file(s)
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-gray-1">{req.project_name}</td>
                                        <td className="px-6 py-4">
                                            <StatusBadge status={req.status} />
                                        </td>
                                        <td className="px-6 py-4 text-gray-2 text-sm">
                                            {new Date(req.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            {req.estimated_cost ? (
                                                <span className="font-bold text-[#0E141C]">₹{req.estimated_cost}</span>
                                            ) : (
                                                <span className="text-gray-2">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-3">
                                                {/* Download Action */}
                                                <button
                                                    onClick={() => downloadAll(req)}
                                                    className="text-[#171717] hover:text-[#0055DD] text-sm font-bold flex items-center gap-1"
                                                    title="Download All Files (Zip)"
                                                >
                                                    <DownloadIcon className="w-4 h-4" />
                                                </button>

                                                {req.status === 'pending_approval' && (
                                                    <button
                                                        onClick={() => handleApprove(req.id)}
                                                        className="text-green-600 hover:text-green-700 font-bold text-sm flex items-center gap-1"
                                                    >
                                                        <CheckCircleIcon className="w-4 h-4" /> Approve
                                                    </button>
                                                )}
                                                {req.status === 'approved' && (
                                                    <span className="text-xs text-green-600 font-bold">Approved</span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-3">
                            <h3 className="text-lg font-bold text-[#0E141C]">New Data Request</h3>
                            <button onClick={() => {
                                setShowModal(false)
                                setFormData({ title: '', description: '', project: '', files: [] })
                            }} className="text-gray-2 hover:text-[#0E141C] transition">
                                <XCircleIcon className="w-6 h-6" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-[#0E141C] mb-1">Project</label>
                                <select
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#171717] focus:border-[#171717] transition"
                                    value={formData.project}
                                    onChange={e => setFormData({ ...formData, project: e.target.value })}
                                    required
                                >
                                    <option value="">Select a project...</option>
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-[#0E141C] mb-1">Title</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#171717] focus:border-[#171717] transition"
                                    placeholder="e.g. Q3 Sales Data Analysis"
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                />
                                {/* Recommendation Chips */}
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {(() => {
                                        const currentTitle = formData.title.trim()

                                        // Helper to render a chip
                                        const renderChip = (label: string, valueToSet: string, append = true) => (
                                            <button
                                                key={label}
                                                type="button"
                                                onClick={() => {
                                                    const newValue = append ? (currentTitle ? currentTitle + ', ' + valueToSet : valueToSet) : valueToSet
                                                    setFormData({ ...formData, title: newValue })
                                                }}
                                                className="px-3 py-1 bg-gray-100 hover:bg-[#E6F0FF] hover:text-[#171717] text-gray-600 text-xs font-medium rounded-full transition border border-transparent hover:border-[#171717]/20"
                                            >
                                                {label}
                                            </button>
                                        )

                                        // State 1: Empty or Initial -> Show Top Level
                                        if (!currentTitle) {
                                            return [
                                                renderChip("Planogram", "Planogram"),
                                                renderChip("Training", "Training")
                                            ]
                                        }

                                        // State 2: Planogram -> Show Date Ranges (Sat-Fri)
                                        if (currentTitle.toLowerCase().startsWith('planogram')) {
                                            // Make sure we don't already have dates (a simplistic check is if it ends with "Planogram")
                                            // Or just always show dates if the user typed "Planogram" so they can pick one
                                            // But if they already picked one, maybe hide? 
                                            // User said: "when clicked on planogram it should then show the week chips"
                                            // So if strictly "Planogram" (trimmed), show dates.

                                            // Note: If user manually typed something after Planogram, we might not want to show dates?
                                            // Let's assume if the last word is "Planogram", we show dates.

                                            if (currentTitle.toLowerCase().endsWith('planogram')) {
                                                const suggestions: string[] = []
                                                const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

                                                let d = new Date()
                                                // Find most recent Saturday (Start of current week)
                                                // Day: 0 (Sun) ... 6 (Sat)
                                                // If Sat (6), offset 0.
                                                // If Fri (5), offset 6 (last Sat).
                                                // If Sun (0), offset 1 (last Sat).
                                                const distToSat = (d.getDay() + 1) % 7
                                                d.setDate(d.getDate() - distToSat)

                                                // Generate 8 weeks back
                                                for (let i = 0; i < 8; i++) {
                                                    const startMonth = months[d.getMonth()]
                                                    const startDate = d.getDate()

                                                    // End Date is Friday (Start + 6 days)
                                                    const friday = new Date(d)
                                                    friday.setDate(d.getDate() + 6)
                                                    const endMonth = months[friday.getMonth()]
                                                    const endDate = friday.getDate()

                                                    suggestions.push(`${startMonth} ${startDate} - ${endMonth} ${endDate}`)

                                                    // Move back 7 days for next iteration
                                                    d.setDate(d.getDate() - 7)
                                                }

                                                return suggestions.map(s => renderChip(s, s, true))
                                            }
                                        }

                                        // State 3: Training Path
                                        if (currentTitle.toLowerCase().startsWith('training')) {
                                            // Exact match "Training" -> Show SKU / POSM
                                            if (currentTitle.toLowerCase() === 'training') {
                                                return [
                                                    renderChip("SKU", "SKU"),
                                                    renderChip("POSM", "POSM")
                                                ]
                                            }

                                            // "Training SKU" -> Show options
                                            if (currentTitle.toLowerCase().endsWith('sku')) {
                                                return [
                                                    renderChip("Updated Design", "Updated Design"),
                                                    renderChip("New Product", "New Product")
                                                ]
                                            }
                                        }

                                        return null
                                    })()}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-[#0E141C] mb-1">Description</label>
                                <textarea
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#171717] focus:border-[#171717] transition"
                                    rows={3}
                                    placeholder="Describe what needs to be done..."
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-[#0E141C] mb-1">Attach Excel Files</label>
                                <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center hover:border-[#171717] hover:bg-gray-3 transition cursor-pointer relative">
                                    <input
                                        type="file"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        accept=".xlsx,.xls,.csv"
                                        multiple
                                        onChange={e => {
                                            if (e.target.files && e.target.files.length > 0) {
                                                const newFiles = Array.from(e.target.files)
                                                const existingNames = new Set(formData.files.map(f => f.name))
                                                const uniqueNewFiles = newFiles.filter(f => !existingNames.has(f.name))
                                                setFormData({ ...formData, files: [...formData.files, ...uniqueNewFiles] })
                                            }
                                            e.target.value = ''
                                        }}
                                    />
                                    <div className="flex flex-col items-center">
                                        <FileTextIcon className="w-8 h-8 text-gray-2 mb-2" />
                                        <span className="text-sm text-gray-1">Click or drag files to upload</span>
                                        {formData.files.length > 0 && (
                                            <div className="mt-2 text-xs text-[#171717] font-medium">
                                                {formData.files.length} file(s) selected
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {formData.files.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {formData.files.map((file, index) => (
                                            <div key={index}
                                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#E6F0FF] text-[#171717] border border-[#171717]/20"
                                            >
                                                <span className="truncate max-w-[150px]">{file.name}</span>
                                                <button
                                                    type="button"
                                                    className="hover:bg-[#171717]/20 rounded-full p-0.5 transition-colors cursor-pointer"
                                                    onClick={() => {
                                                        const newFiles = formData.files.filter((_, i) => i !== index)
                                                        setFormData({ ...formData, files: newFiles })
                                                    }}
                                                >
                                                    <XCircleIcon className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowModal(false)
                                        setFormData({ title: '', description: '', project: '', files: [] })
                                    }}
                                    className="px-4 py-2 text-[#0E141C] hover:bg-gray-3 rounded-lg transition font-bold"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-[#171717] text-white rounded-lg hover:bg-[#171717]/90 shadow-md hover:shadow-lg transition font-bold"
                                >
                                    Submit Request
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

function StatusBadge({ status }: { status: string }) {
    const styles = {
        pending_review: 'bg-yellow-100 text-yellow-800',
        pending_approval: 'bg-orange-100 text-orange-800',
        approved: 'bg-neutral-100 text-neutral-900',
        in_progress: 'bg-neutral-100 text-neutral-900',
        completed: 'bg-green-100 text-green-800',
        rejected: 'bg-red-100 text-red-800'
    }[status] || 'bg-gray-100 text-gray-800'

    const labels = {
        pending_review: 'Pending Review',
        pending_approval: 'Needs Approval',
        approved: 'Approved',
        in_progress: 'In Progress',
        completed: 'Completed',
        rejected: 'Rejected'
    }[status] || status

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles}`}>
            {labels}
        </span>
    )
}
