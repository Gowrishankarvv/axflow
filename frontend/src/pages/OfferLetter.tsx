import React, { useEffect, useMemo, useRef, useState } from 'react'
import api, { getCached } from '../lib/api'
import { Mail, Paperclip, Send, CheckCircle, XCircle, User as UserIcon, FileText } from 'lucide-react'

type LightUser = {
    id: number
    username: string
    first_name: string
    email: string
    role: string
}

type OfferLetterRecord = {
    id: number
    recipient: number | null
    recipient_username: string | null
    recipient_email_snapshot: string
    recipient_name_snapshot: string
    subject: string
    body: string
    attachment_url: string | null
    attachment_name: string | null
    sent_by_name: string | null
    sent_at: string
    status: 'sent' | 'failed'
    error_message: string
}

const FALLBACK_TEMPLATE = {
    subject: 'Offer of Employment — Axinortech',
    body:
        "Dear {name},\n\n" +
        "We are delighted to extend you an offer of employment with Axinortech. " +
        "Please find your formal offer letter attached.\n\n" +
        "Kindly review the terms and confirm your acceptance by replying to this email. " +
        "If you have any questions, feel free to reach out.\n\n" +
        "Best regards,\nAxinortech HR Team",
}

export default function OfferLetterPage() {
    const [users, setUsers] = useState<LightUser[]>([])
    const [history, setHistory] = useState<OfferLetterRecord[]>([])
    const [template, setTemplate] = useState(FALLBACK_TEMPLATE)
    const [loading, setLoading] = useState(true)

    const [recipientId, setRecipientId] = useState<string>('')
    const [subject, setSubject] = useState('')
    const [body, setBody] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [feedback, setFeedback] = useState<{ kind: 'success' | 'error', text: string } | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    async function load() {
        setLoading(true)
        try {
            const [usersRes, historyRes, templateRes] = await Promise.all([
                getCached('/users/light/'),
                api.get('/offer-letters/'),
                api.get('/offer-letters/default_template/'),
            ])
            const usersPayload: any = usersRes.data
            setUsers((usersPayload.results || usersPayload || []) as LightUser[])
            const historyPayload: any = historyRes.data
            setHistory((historyPayload.results || historyPayload || []) as OfferLetterRecord[])
            const tpl = templateRes.data as { subject: string, body: string }
            if (tpl?.subject && tpl?.body) setTemplate(tpl)
        } catch (e) {
            console.error('Failed to load offer-letter page data', e)
        } finally {
            setLoading(false)
        }
    }
    useEffect(() => { load() }, [])

    // When recipient or template changes, refill subject + body with {name} substitution.
    // Only auto-fill if the field is empty OR matches the previous default (so we don't blow
    // away the admin's mid-edit changes).
    const lastDefaults = useRef<{ subject: string, body: string }>({ subject: '', body: '' })
    useEffect(() => {
        const recipient = users.find(u => String(u.id) === recipientId)
        const name = recipient?.first_name || recipient?.username || ''
        const nextSubject = template.subject
        const nextBody = template.body.replace(/\{name\}/g, name || '{name}')

        setSubject(prev => (prev === '' || prev === lastDefaults.current.subject) ? nextSubject : prev)
        setBody(prev => (prev === '' || prev === lastDefaults.current.body) ? nextBody : prev)
        lastDefaults.current = { subject: nextSubject, body: nextBody }
    }, [recipientId, template, users])

    const recipientUser = useMemo(
        () => users.find(u => String(u.id) === recipientId) || null,
        [users, recipientId]
    )

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setFeedback(null)
        if (!recipientId) { setFeedback({ kind: 'error', text: 'Pick a recipient.' }); return }
        if (!subject.trim()) { setFeedback({ kind: 'error', text: 'Subject is required.' }); return }
        if (!body.trim()) { setFeedback({ kind: 'error', text: 'Message body is required.' }); return }
        if (!file) { setFeedback({ kind: 'error', text: 'Attach the offer letter file.' }); return }

        const fd = new FormData()
        fd.append('recipient', recipientId)
        fd.append('subject', subject)
        fd.append('body', body)
        fd.append('attachment', file)

        setSubmitting(true)
        try {
            await api.post('/offer-letters/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
            setFeedback({ kind: 'success', text: `Offer letter sent to ${recipientUser?.email}.` })
            setRecipientId('')
            setSubject('')
            setBody('')
            setFile(null)
            if (fileInputRef.current) fileInputRef.current.value = ''
            await load()
        } catch (err: any) {
            const detail = err?.response?.data?.detail || 'Failed to send.'
            setFeedback({ kind: 'error', text: detail })
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="p-6 md:p-10 max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-100 rounded-lg">
                    <Mail className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Offer Letter</h1>
                    <p className="text-sm text-gray-500">Send an offer letter email with attachment to a user in the system.</p>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-500">Loading…</div>
            ) : (
                <div className="grid lg:grid-cols-5 gap-6">
                    {/* Composer */}
                    <form onSubmit={handleSubmit} className="lg:col-span-3 bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Compose</h2>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                <UserIcon className="w-4 h-4 inline mr-1" />
                                Recipient
                            </label>
                            <select
                                value={recipientId}
                                onChange={e => setRecipientId(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                            >
                                <option value="">Pick a user…</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.first_name || u.username} {u.email ? `— ${u.email}` : '(no email on file)'}
                                    </option>
                                ))}
                            </select>
                            {recipientUser && !recipientUser.email && (
                                <p className="text-xs text-red-600 mt-1">
                                    This user has no email address — backend will reject the send.
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                            <input
                                type="text"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                            <textarea
                                value={body}
                                onChange={e => setBody(e.target.value)}
                                rows={10}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                                required
                            />
                            <p className="text-xs text-gray-500 mt-1">Pre-filled from template. <code>{'{name}'}</code> auto-fills the recipient's first name.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                <Paperclip className="w-4 h-4 inline mr-1" />
                                Offer letter file
                            </label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.doc,.docx,application/pdf"
                                onChange={e => setFile(e.target.files?.[0] || null)}
                                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 file:mr-3 file:px-3 file:py-1 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium hover:file:bg-blue-100"
                                required
                            />
                            {file && (
                                <p className="text-xs text-gray-600 mt-1">{file.name} — {(file.size / 1024).toFixed(1)} KB</p>
                            )}
                        </div>

                        {feedback && (
                            <div className={`text-sm px-3 py-2 rounded-lg border ${feedback.kind === 'success'
                                ? 'bg-green-50 border-green-200 text-green-800'
                                : 'bg-red-50 border-red-200 text-red-800'}`}>
                                {feedback.text}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={submitting}
                            className="inline-flex items-center px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium"
                        >
                            <Send className="w-4 h-4 mr-2" />
                            {submitting ? 'Sending…' : 'Send Offer Letter'}
                        </button>
                    </form>

                    {/* History */}
                    <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
                        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">History</h2>
                        {history.length === 0 ? (
                            <div className="text-center py-10 text-gray-500 text-sm">
                                <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                                Nothing sent yet.
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                                {history.map(rec => (
                                    <div key={rec.id} className="border border-gray-200 rounded-lg p-3 text-sm">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="font-medium text-gray-900 truncate">{rec.recipient_name_snapshot}</div>
                                                <div className="text-xs text-gray-500 truncate">{rec.recipient_email_snapshot}</div>
                                            </div>
                                            <StatusBadge status={rec.status} />
                                        </div>
                                        <div className="text-xs text-gray-700 mt-2 truncate">{rec.subject}</div>
                                        {rec.attachment_url && (
                                            <a href={rec.attachment_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                                                <Paperclip className="w-3 h-3 inline mr-1" /> {rec.attachment_name}
                                            </a>
                                        )}
                                        <div className="text-xs text-gray-400 mt-2 flex justify-between">
                                            <span>by {rec.sent_by_name || '—'}</span>
                                            <span>{new Date(rec.sent_at).toLocaleString()}</span>
                                        </div>
                                        {rec.status === 'failed' && rec.error_message && (
                                            <div className="text-xs bg-red-50 border border-red-200 text-red-800 rounded p-2 mt-2 break-words">
                                                {rec.error_message}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

function StatusBadge({ status }: { status: string }) {
    const v = status === 'sent'
        ? { className: 'bg-green-50 text-green-700', icon: CheckCircle, label: 'Sent' }
        : { className: 'bg-red-50 text-red-700', icon: XCircle, label: 'Failed' }
    const I = v.icon
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${v.className}`}>
            <I className="w-3 h-3" /> {v.label}
        </span>
    )
}
