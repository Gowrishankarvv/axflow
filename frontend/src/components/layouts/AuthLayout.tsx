import React from 'react'
import { Rocket } from 'lucide-react'

interface AuthLayoutProps {
    children: React.ReactNode;
    title?: string;
    subtitle?: string;
}

export default function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
    return (
        <div className="min-h-screen w-full flex flex-col md:flex-row bg-white overflow-hidden font-sans">
            {/* Left Panel - Brand Experience */}
            <div className="w-full md:w-5/6 relative flex flex-col justify-center p-8 md:p-16 overflow-hidden bg-[#171717]">
                {/* Background Gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-brand-blue to-[#0052cc]/80 z-0"></div>

                {/* Decorative Wave/Cloud Edge */}
                <div className="absolute top-0 bottom-0 right-0 w-16 md:w-24 lg:w-32 z-10 hidden md:block translate-x-[1px]">
                    <svg
                        viewBox="0 0 100 800"
                        className="h-full w-full text-white fill-current drop-shadow-xl"
                        preserveAspectRatio="none"
                    >
                        {/* A vertical wave pattern mimicking the reference "cloud" edge */}
                        <path d="M100 0H0C20 100 60 150 20 250C-20 350 40 400 10 500C-20 600 30 650 0 800H100V0Z" />
                    </svg>
                </div>

                {/* Logo - Top Left */}
                <div className="absolute top-6 left-6 md:top-10 md:left-10 z-30 animate-in fade-in slide-in-from-top-4 duration-700">
                    <img src="/Axinortech.png" alt="Axinortech Logo" className="h-8 md:h-10 w-auto object-contain" />
                </div>

                {/* Brand Content */}
                <div className="relative z-20 flex flex-col h-full justify-center text-center md:text-left">

                    <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-6 tracking-tight leading-tight animate-in slide-in-from-bottom-4 duration-700 delay-100 drop-shadow-sm">
                        {title || "Welcome to Axinortech"}
                    </h1>

                    <p className="text-white/90 text-lg md:text-xl font-normal leading-relaxed max-w-lg mx-auto md:mx-0 animate-in slide-in-from-bottom-4 duration-700 delay-200 drop-shadow-sm">
                        {subtitle || "Deep dive into your data. Turn insights into action with AI-powered analytics."}
                    </p>

                    <div className="mt-12 opacity-60 text-white text-xs font-mono tracking-widest hidden md:flex items-center gap-4 animate-in fade-in duration-1000 delay-500">
                        <span>DATAVERSE</span>
                        <span className="w-px h-3 bg-white/50"></span>
                        <span>ANALYTICS</span>
                    </div>
                </div>
            </div>

            {/* Right Panel - Auth Form */}
            <div className="w-full md:w-1/2 flex items-center justify-center p-6 md:p-12 lg:p-20 bg-white relative z-0">
                <div className="w-full max-w-md animate-in slide-in-from-right-8 duration-700 ease-out">
                    {children}
                </div>
            </div>
        </div>
    )
}
