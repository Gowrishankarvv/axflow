import React, { useState } from 'react'
import { ChevronDown, Check, Building } from 'lucide-react'
import { useAppData } from '../lib/AppDataContext'

export default function ProjectSwitcher({ isCollapsed }: { isCollapsed?: boolean }) {
    const { data, currentProjectId, setCurrentProjectId } = useAppData()
    const [isOpen, setIsOpen] = useState(false)

    const projects = data?.projects || []
    const currentProject = projects.find(p => p.id === currentProjectId)

    if (projects.length === 0) return null

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/10 transition-colors ${isCollapsed ? 'justify-center' : ''
                    }`}
            >
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
                    <Building className="w-6 h-6 text-neutral-900" />
                </div>

                {!isCollapsed && (
                    <div className="flex-1 text-left overflow-hidden">
                        <div className="font-bold text-gray-900 truncate">
                            {currentProject?.name || 'Select Project'}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                            Switch Project <ChevronDown className="w-3 h-3" />
                        </div>
                    </div>
                )}
            </button>

            {isOpen && !isCollapsed && (
                <>
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-20 max-h-64 overflow-y-auto animate-in fade-in zoom-in duration-200">
                        <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            Your Projects
                        </div>
                        {projects.map(p => (
                            <button
                                key={p.id}
                                onClick={() => {
                                    setCurrentProjectId(p.id)
                                    setIsOpen(false)
                                }}
                                className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-50 transition-colors group"
                            >
                                <span className={`text-sm font-medium ${p.id === currentProjectId ? 'text-neutral-900' : 'text-gray-700'}`}>
                                    {p.name}
                                </span>
                                {p.id === currentProjectId && (
                                    <Check className="w-4 h-4 text-neutral-900" />
                                )}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}
