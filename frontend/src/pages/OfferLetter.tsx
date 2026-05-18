import React, { useEffect, useMemo, useRef, useState } from 'react'
import api, { getCached } from '../lib/api'
import { Mail, Send, CheckCircle, XCircle, User as UserIcon, FileText, Paperclip, Plus, Trash2 } from 'lucide-react'

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

type RuleRow = { label: string; value: string }

type OfferContent = {
    recipient_name: string
    address: string
    position: string
    joining_date: string
    probation_period: string
    probation_salary: string
    confirmed_salary: string
    pay_date: string
    signatory: string
    rules_regulations: string
    duties: string
    general_rules: RuleRow[]
    daily_work: string[]
    confidentiality: string
    intellectual_property: string
    termination: string
    acknowledgment: string
}

const EMAIL_FALLBACK = {
    subject: 'Offer of Employment — AXINOR TECHNOLOGIES',
    body:
        'Dear {name},\n\n' +
        'We are delighted to extend you an offer of employment with AXINOR TECHNOLOGIES. ' +
        'Please find your formal offer letter attached.\n\n' +
        'Kindly review the terms and confirm your acceptance by replying to this email.\n\n' +
        'Best regards,\nAXINOR TECHNOLOGIES HR Team',
}

const EMPTY_CONTENT: OfferContent = {
    recipient_name: '', address: '', position: '', joining_date: '',
    probation_period: 'two (2) months', probation_salary: '', confirmed_salary: '',
    pay_date: '15th', signatory: '',
    rules_regulations: '', duties: '', general_rules: [], daily_work: [],
    confidentiality: '', intellectual_property: '', termination: '', acknowledgment: '',
}

export default function OfferLetterPage() {
    const [users, setUsers] = useState<LightUser[]>([])
    const [history, setHistory] = useState<OfferLetterRecord[]>([])
    const [emailTpl, setEmailTpl] = useState(EMAIL_FALLBACK)
    const [loading, setLoading] = useState(true)

    const [recipientId, setRecipientId] = useState<string>('')
    const [subject, setSubject] = useState('')
    const [body, setBody] = useState('')
    const [content, setContent] = useState<OfferContent>(EMPTY_CONTENT)
    const [submitting, setSubmitting] = useState(false)
    const [feedback, setFeedback] = useState<{ kind: 'success' | 'error', text: string } | null>(null)

    async function load() {
        setLoading(true)
        try {
            const [usersRes, historyRes, tplRes] = await Promise.all([
                getCached('/users/light/'),
                api.get('/offer-letters/'),
                api.get('/offer-letters/default_template/'),
            ])
            const up: any = usersRes.data
            setUsers((up.results || up || []) as LightUser[])
            const hp: any = historyRes.data
            setHistory((hp.results || hp || []) as OfferLetterRecord[])
            const tpl = tplRes.data as { subject: string, body: string, content: OfferContent }
            if (tpl?.subject && tpl?.body) setEmailTpl({ subject: tpl.subject, body: tpl.body })
            if (tpl?.content) setContent(c => ({ ...EMPTY_CONTENT, ...tpl.content, recipient_name: c.recipient_name }))
        } catch (e) {
            console.error('Failed to load offer-letter page data', e)
        } finally {
            setLoading(false)
        }
    }
    useEffect(() => { load() }, [])

    // Refill email subject/body with {name} substitution; prefill the letter
    // recipient name from the chosen user — only when untouched.
    const lastDefaults = useRef<{ subject: string, body: string }>({ subject: '', body: '' })
    useEffect(() => {
        const recipient = users.find(u => String(u.id) === recipientId)
        const name = recipient?.first_name || recipient?.username || ''
        const nextSubject = emailTpl.subject
        const nextBody = emailTpl.body.replace(/\{name\}/g, name || '{name}')
        setSubject(prev => (prev === '' || prev === lastDefaults.current.subject) ? nextSubject : prev)
        setBody(prev => (prev === '' || prev === lastDefaults.current.body) ? nextBody : prev)
        lastDefaults.current = { subject: nextSubject, body: nextBody }
        setContent(c => (c.recipient_name.trim() === '' ? { ...c, recipient_name: name } : c))
    }, [recipientId, emailTpl, users])

    const recipientUser = useMemo(
        () => users.find(u => String(u.id) === recipientId) || null,
        [users, recipientId]
    )

    const set = <K extends keyof OfferContent>(k: K, v: OfferContent[K]) =>
        setContent(c => ({ ...c, [k]: v }))

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setFeedback(null)
        if (!recipientId) { setFeedback({ kind: 'error', text: 'Pick a recipient.' }); return }
        if (!subject.trim()) { setFeedback({ kind: 'error', text: 'Email subject is required.' }); return }
        if (!body.trim()) { setFeedback({ kind: 'error', text: 'Email message is required.' }); return }
        if (!content.recipient_name.trim()) { setFeedback({ kind: 'error', text: 'Recipient name (on the letter) is required.' }); return }

        setSubmitting(true)
        try {
            await api.post('/offer-letters/', { recipient: Number(recipientId), subject, body, content })
            setFeedback({ kind: 'success', text: `Offer letter generated and sent to ${recipientUser?.email}.` })
            setRecipientId('')
            setSubject(''); setBody('')
            await load()
            setContent(EMPTY_CONTENT)
        } catch (err: any) {
            setFeedback({ kind: 'error', text: err?.response?.data?.detail || 'Failed to send.' })
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="p-6 md:p-10 max-w-6xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-100 rounded-lg">
                    <Mail className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Offer Letter</h1>
                    <p className="text-sm text-gray-500">Compose the offer letter content — the formatted AXINOR PDF is generated and emailed automatically.</p>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-500">Loading…</div>
            ) : (
                <div className="grid lg:grid-cols-5 gap-6">
                    <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-5">
                        {/* Recipient + email */}
                        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Recipient &amp; Email</h2>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    <UserIcon className="w-4 h-4 inline mr-1" /> Recipient
                                </label>
                                <select
                                    value={recipientId}
                                    onChange={e => setRecipientId(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    required
                                >
                                    <option value="">Pick a user…</option>
                                    {users.map(u => (
                                        <option key={u.id} value={u.id}>
                                            {u.first_name || u.username} {u.email ? `— ${u.email}` : '(no email)'}
                                        </option>
                                    ))}
                                </select>
                                {recipientUser && !recipientUser.email && (
                                    <p className="text-xs text-red-600 mt-1">This user has no email — backend will reject the send.</p>
                                )}
                            </div>
                            <Text label="Email subject" value={subject} onChange={setSubject} />
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email message</label>
                                <textarea
                                    value={body} onChange={e => setBody(e.target.value)} rows={5}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-1"><code>{'{name}'}</code> auto-fills the recipient's first name.</p>
                            </div>
                        </div>

                        {/* Letter header + salary fields */}
                        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Letter Details</h2>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <Text label="Recipient name (on letter)" value={content.recipient_name} onChange={v => set('recipient_name', v)} />
                                <Text label="Position" value={content.position} onChange={v => set('position', v)} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                                <textarea
                                    value={content.address} onChange={e => set('address', e.target.value)} rows={2}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                    placeholder="One line per row"
                                />
                            </div>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <Text label="Joining date" value={content.joining_date} onChange={v => set('joining_date', v)} placeholder="10th October 2025" />
                                <Text label="Probation period" value={content.probation_period} onChange={v => set('probation_period', v)} />
                                <Text label="Probation salary (₹)" value={content.probation_salary} onChange={v => set('probation_salary', v)} placeholder="12,000" />
                                <Text label="Confirmed salary (₹)" value={content.confirmed_salary} onChange={v => set('confirmed_salary', v)} placeholder="15,000" />
                                <Text label="Salary pay date" value={content.pay_date} onChange={v => set('pay_date', v)} placeholder="15th" />
                                <Text label="Signatory" value={content.signatory} onChange={v => set('signatory', v)} placeholder="Gowrishankar V.V" />
                            </div>
                        </div>

                        {/* Editable sections */}
                        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Sections</h2>
                            <p className="text-xs text-gray-500 -mt-2">Pre-filled with the standard wording. Edit as needed before sending.</p>
                            <Area label="Rules & Regulations" value={content.rules_regulations} onChange={v => set('rules_regulations', v)} />
                            <Area label="Duties and Responsibilities" value={content.duties} onChange={v => set('duties', v)} />

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-gray-700">General Rules &amp; Expectations</label>
                                    <button type="button" onClick={() => set('general_rules', [...content.general_rules, { label: '', value: '' }])}
                                        className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                                        <Plus className="w-3 h-3" /> Add row
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {content.general_rules.map((row, i) => (
                                        <div key={i} className="flex gap-2 items-start">
                                            <input
                                                value={row.label}
                                                onChange={e => {
                                                    const g = [...content.general_rules]; g[i] = { ...g[i], label: e.target.value }; set('general_rules', g)
                                                }}
                                                placeholder="Label"
                                                className="w-1/3 px-2 py-1.5 border border-gray-300 rounded text-sm"
                                            />
                                            <textarea
                                                value={row.value} rows={1}
                                                onChange={e => {
                                                    const g = [...content.general_rules]; g[i] = { ...g[i], value: e.target.value }; set('general_rules', g)
                                                }}
                                                placeholder="Value (use new lines for multiple points)"
                                                className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
                                            />
                                            <button type="button" onClick={() => set('general_rules', content.general_rules.filter((_, j) => j !== i))}
                                                className="p-1.5 text-gray-400 hover:text-red-600">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-gray-700">Daily Work Completion and Reporting</label>
                                    <button type="button" onClick={() => set('daily_work', [...content.daily_work, ''])}
                                        className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
                                        <Plus className="w-3 h-3" /> Add point
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {content.daily_work.map((pt, i) => (
                                        <div key={i} className="flex gap-2 items-start">
                                            <textarea
                                                value={pt} rows={1}
                                                onChange={e => {
                                                    const d = [...content.daily_work]; d[i] = e.target.value; set('daily_work', d)
                                                }}
                                                className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
                                            />
                                            <button type="button" onClick={() => set('daily_work', content.daily_work.filter((_, j) => j !== i))}
                                                className="p-1.5 text-gray-400 hover:text-red-600">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <Area label="Confidentiality" value={content.confidentiality} onChange={v => set('confidentiality', v)} />
                            <Area label="Intellectual Property" value={content.intellectual_property} onChange={v => set('intellectual_property', v)} />
                            <Area label="Termination" value={content.termination} onChange={v => set('termination', v)} />
                            <Area label="Acknowledgment And Declaration" value={content.acknowledgment} onChange={v => set('acknowledgment', v)} />
                        </div>

                        {feedback && (
                            <div className={`text-sm px-3 py-2 rounded-lg border ${feedback.kind === 'success'
                                ? 'bg-green-50 border-green-200 text-green-800'
                                : 'bg-red-50 border-red-200 text-red-800'}`}>
                                {feedback.text}
                            </div>
                        )}
                        <button
                            type="submit" disabled={submitting}
                            className="inline-flex items-center px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium"
                        >
                            <Send className="w-4 h-4 mr-2" />
                            {submitting ? 'Generating & sending…' : 'Generate & Send Offer Letter'}
                        </button>
                    </form>

                    {/* History */}
                    <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5 h-fit">
                        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3">History</h2>
                        {history.length === 0 ? (
                            <div className="text-center py-10 text-gray-500 text-sm">
                                <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                                Nothing sent yet.
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[700px] overflow-y-auto pr-1">
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

function Text({ label, value, onChange, placeholder }: {
    label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <input
                value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            />
        </div>
    )
}

function Area({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <textarea
                value={value} onChange={e => onChange(e.target.value)} rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            />
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
