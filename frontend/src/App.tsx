import React, { useEffect, useState, useMemo } from 'react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const MyTime = React.lazy(() => import('./pages/MyTime'))
const TeamTime = React.lazy(() => import('./pages/TeamTime'))
const Reports = React.lazy(() => import('./pages/Reports'))
const Projects = React.lazy(() => import('./pages/Projects'))
const ProjectDetail = React.lazy(() => import('./pages/ProjectDetail'))
const OrgTree = React.lazy(() => import('./pages/OrgTree'))
const Admin = React.lazy(() => import('./pages/Admin'))
const Login = React.lazy(() => import('./pages/Login'))
const ClientDashboard = React.lazy(() => import('./pages/client/ClientDashboard'))
const ClientRequests = React.lazy(() => import('./pages/client/ClientRequests'))
const ClientInvoices = React.lazy(() => import('./pages/client/ClientInvoices'))
const ClientProjectDetail = React.lazy(() => import('./pages/client/ClientProjectDetail'))
const Clients = React.lazy(() => import('./pages/Clients'))
const Invoices = React.lazy(() => import('./pages/Invoices'))
const Requests = React.lazy(() => import('./pages/Requests'))
const Leave = React.lazy(() => import('./pages/Leave'))
const OfferLetter = React.lazy(() => import('./pages/OfferLetter'))
const Notifications = React.lazy(() => import('./pages/Notifications'))
const Finance = React.lazy(() => import('./pages/Finance'))
const Salary = React.lazy(() => import('./pages/Salary'))
const CRM = React.lazy(() => import('./pages/CRM'))
const Tickets = React.lazy(() => import('./pages/Tickets'))

// Mirror of backend/src/core/permissions.py:EXECUTIVE_POSITIONS — keep in sync.
const EXECUTIVE_POSITIONS = ['CEO', 'CFO', 'COO', 'CMO', 'Executive']
const isExecutive = (me: any) =>
  !!me && (me.role === 'superuser' || EXECUTIVE_POSITIONS.includes(me?.position))
import { format } from 'date-fns'
import api, { fetchMe, logout } from './lib/api'
import { useAppData } from './lib/AppDataContext'
import { useLoading } from './lib/LoadingContext'
import LoadingClock from './components/LoadingClock'
import ProjectSwitcher from './components/ProjectSwitcher'
import {
  HomeIcon,
  ClockIcon,
  FolderIcon,
  BuildingIcon,
  UserPlusIcon,
  BarChartIcon as ChartBarIcon,
  LogOutIcon,
  MenuIcon,
  XIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  BugIcon,
  InboxIcon,
  FileTextIcon as InvoiceIcon,
  BriefcaseIcon,
  CalendarIcon as LeaveCalendarIcon,
  MailIcon as OfferMailIcon,
  BellIcon as NotificationsIcon,
  WalletIcon as FinanceIcon,
  TargetIcon as CRMIcon,
  CoinsIcon as SalaryIcon
} from 'lucide-react'

export default function App() {
  const [me, setMe] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [unreadNotifs, setUnreadNotifs] = useState(0)
  const navigate = useNavigate()
  const location = useLocation()
  const globalLoading = useLoading()
  const { ready } = useAppData()

  // Poll the unread-notification count every 30s while authed.
  useEffect(() => {
    if (!me) return
    let cancelled = false
    async function tick() {
      try {
        const { data } = await api.get('/notifications/unread_count/')
        if (!cancelled) setUnreadNotifs((data as any)?.count || 0)
      } catch { /* network blip — just keep last value */ }
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [me])

  // Force a refresh when navigating away from /notifications/ (user likely
  // marked things read on the page).
  useEffect(() => {
    if (!me) return
    if (location.pathname === '/notifications') return
    api.get('/notifications/unread_count/')
      .then(r => setUnreadNotifs((r.data as any)?.count || 0))
      .catch(() => {})
  }, [location.pathname, me])

  async function loadMe() {
    const token = localStorage.getItem('access')
    if (!token) {
      setMe(null)
      setLoading(false)
      if (location.pathname !== '/login') navigate('/login')
      return
    }
    try {
      const data = await fetchMe()
      setMe(data)
      // AppDataProvider handles aggregated preload in background
    } catch {
      setMe(null)
      if (location.pathname !== '/login') navigate('/login')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadMe() }, [location.pathname])

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed)
  }

  const isAuthed = !!me

  // Only block on AppData preload when authenticated.
  // If the backend is down and we aren't authed (or auth fetch fails),
  // we still want the Login page to render instead of a permanent loading screen.
  if (loading || (isAuthed && !ready)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="animate-in fade-in duration-700">
          <LoadingClock />
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex bg-gray-3">
      {isAuthed && (
        <>
          {/* Mobile sidebar backdrop */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-300"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Sidebar */}
          <Sidebar
            me={me}
            onLogout={async () => {
              await logout()
              navigate('/login')
            }}
            isOpen={sidebarOpen}
            isCollapsed={sidebarCollapsed}
            onClose={() => setSidebarOpen(false)}
            onToggleCollapse={toggleSidebar}
            unreadNotifs={unreadNotifs}
          />

          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden fixed top-4 left-4 z-30 p-3 bg-white/90 backdrop-blur-lg rounded-xl shadow-lg border border-white/20 hover:bg-white hover:shadow-xl transition-all duration-300 transform hover:scale-110 group"
          >
            <MenuIcon className="w-6 h-6 text-gray-700 group-hover:text-neutral-900 transition-colors duration-200" />
          </button>
        </>
      )}

      <main className={`flex-1 overflow-auto transition-all duration-300 ${isAuthed ? (sidebarCollapsed ? 'md:ml-5' : 'md:ml-5') : ''
        }`}>
        {isAuthed && location.pathname !== '/login' && <Topbar me={me} unreadNotifs={unreadNotifs} />}
        <React.Suspense fallback={
          <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-900"></div></div>
        }>
          <Routes>
            <Route path="/login" element={<Login />} />
            {isAuthed && me?.role === 'client' ? (
              <>
                <Route path="/" element={<ClientDashboard />} />
                <Route path="/requests" element={<ClientRequests />} />
                <Route path="/invoices" element={<ClientInvoices />} />
                <Route path="/projects" element={<Projects me={me} />} />
                <Route path="/project-detail/:id" element={<ClientProjectDetail />} />
              </>
            ) : isAuthed ? (
              <>
                <Route path="/my-time" element={<MyTime />} />
                <Route path="/reports" element={<Reports me={me} />} />
                <Route path="/team-time" element={<TeamTime me={me} />} />
                <Route path="/projects" element={<Projects me={me} />} />
                <Route path="/projects/:id" element={<ProjectDetail me={me} />} />
                <Route path="/requests" element={<Requests />} />
                {(me?.role === 'manager' || me?.role === 'superuser') && <Route path="/invoices" element={<Invoices />} />}
                <Route path="/clients" element={<Clients me={me} />} />
                {(me?.role === 'manager' || me?.role === 'superuser') && <Route path="/crm" element={<CRM />} />}
                {(me?.role === 'manager' || me?.role === 'superuser') && <Route path="/org-tree" element={<OrgTree />} />}
                <Route path="/leave" element={<Leave />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/tickets" element={<Tickets />} />
                {isExecutive(me) && <Route path="/finance" element={<Finance />} />}
                {isExecutive(me) && <Route path="/salary" element={<Salary />} />}
                {(me?.role === 'manager' || me?.role === 'superuser') && <Route path="/offer-letter" element={<OfferLetter />} />}
                {(me?.role === 'manager' || me?.role === 'superuser') && <Route path="/admin" element={<Admin />} />}
                <Route path="/" element={<Dashboard />} />
              </>
            ) : (
              <Route path="/*" element={<Login />} />
            )}
          </Routes>
        </React.Suspense>
      </main>

      {/* Global Loading Overlay */}
      {globalLoading > 0 && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-3xl p-8 border border-gray-200/50 animate-in zoom-in duration-200">
            <LoadingClock />
          </div>
        </div>
      )}
    </div>
  )
}

function Topbar({ me, unreadNotifs }: { me: any, unreadNotifs: number }) {
  const today = format(new Date(), 'EEEE, d MMMM yyyy')

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 h-16 px-4 md:px-6 pl-16 md:pl-6 bg-white border-b border-gray-3">
      {/* Left: today's date */}
      <div className="flex items-center gap-2 text-gray-1 min-w-0">
        <LeaveCalendarIcon className="w-5 h-5 text-neutral-900 flex-shrink-0" />
        <span className="font-medium text-xs md:text-sm text-[#0E141C] truncate">{today}</span>
      </div>

      {/* Right: currently logged-in user — same profile card as the sidebar */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <Link
          to="/notifications"
          aria-label="Notifications"
          className="relative p-2 rounded-lg text-gray-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
        >
          <NotificationsIcon className="w-6 h-6" />
          {unreadNotifs > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
          )}
        </Link>
        <div className="w-px h-8 bg-gray-200" />
        <div className="min-w-0 text-right">
          <div className="font-bold text-[#0E141C] truncate text-xs">
            {me?.first_name || me?.username}
          </div>
          <div className="flex items-center justify-end gap-2 mt-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-600 border border-neutral-200 capitalize">
              {me?.role}
            </span>
          </div>
        </div>
        <div className="relative flex-shrink-0">
          <div className="w-12 h-12 bg-neutral-900 rounded-xl flex items-center justify-center shadow-md">
            <span className="text-white font-bold text-lg">
              {(me?.first_name?.[0] || me?.username?.[0] || 'U').toUpperCase()}
            </span>
          </div>
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
        </div>
      </div>
    </header>
  )
}

function Sidebar({
  me,
  onLogout,
  isOpen,
  isCollapsed,
  onClose,
  onToggleCollapse,
  unreadNotifs
}: {
  me: any,
  onLogout: () => void,
  isOpen: boolean,
  isCollapsed: boolean,
  onClose: () => void,
  onToggleCollapse: () => void,
  unreadNotifs: number
}) {
  const location = useLocation()

  const { data } = useAppData()
  const navigationItems = [
    // Internal
    { to: '/', label: 'Dashboard', icon: HomeIcon, show: me?.role !== 'client' },
    { to: '/my-time', label: 'My Time', icon: ClockIcon, show: me?.role !== 'client' },
    { to: '/projects', label: 'Projects', icon: FolderIcon, show: me?.role !== 'client' },
    { to: '/requests', label: 'Requests', icon: InboxIcon, show: me?.role !== 'client' },
    { to: '/leave', label: 'Leave', icon: LeaveCalendarIcon, show: me?.role !== 'client' },
    { to: '/notifications', label: 'Notifications', icon: NotificationsIcon, show: me?.role !== 'client', badge: unreadNotifs },
    { to: '/reports', label: 'Reports', icon: ChartBarIcon, show: me?.role !== 'client' },
    { to: '/clients', label: 'Clients', icon: BriefcaseIcon, show: me?.role === 'manager' || me?.role === 'superuser' },
    { to: '/crm', label: 'CRM', icon: CRMIcon, show: me?.role === 'manager' || me?.role === 'superuser' },
    { to: '/invoices', label: 'Invoices', icon: InvoiceIcon, show: me?.role === 'manager' || me?.role === 'superuser' },
    { to: '/finance', label: 'Finance', icon: FinanceIcon, show: isExecutive(me) },
    { to: '/salary', label: 'Salary', icon: SalaryIcon, show: isExecutive(me) },
    { to: '/offer-letter', label: 'Offer Letter', icon: OfferMailIcon, show: me?.role === 'manager' || me?.role === 'superuser' },
    { to: '/org-tree', label: 'Organization', icon: BuildingIcon, show: me?.role === 'manager' || me?.role === 'superuser' },
    { to: '/admin', label: 'User Management', icon: UserPlusIcon, show: me?.role === 'manager' || me?.role === 'superuser' },

    // Client
    { to: '/', label: 'Dashboard', icon: HomeIcon, show: me?.role === 'client' },
    { to: '/projects', label: 'My Projects', icon: FolderIcon, show: me?.role === 'client' },
    { to: '/requests', label: 'Requests', icon: InboxIcon, show: me?.role === 'client' },
    { to: '/invoices', label: 'Invoices', icon: InvoiceIcon, show: me?.role === 'client' },
  ]

  return (
    <aside className={`
      fixed md:relative inset-y-0 left-0 z-50 h-screen bg-white border-r border-gray-3 shadow-none
      transform transition-all duration-300 ease-in-out flex flex-col
      ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      ${isCollapsed ? 'md:w-20' : 'md:w-72'}
      w-72
      animate-in slide-in-from-left duration-500
    `}>
      {/* Header */}
      <div className={`border-b border-gray-3 bg-white relative overflow-hidden transition-all duration-300 flex-shrink-0 ${isCollapsed ? 'p-4' : 'p-6'
        }`}>
        {/* Background decoration */}
        <div className="absolute inset-0 bg-neutral-50"></div>

        <div className="relative">
          <div className="flex items-center justify-between gap-2">
            <div className={`flex items-center transition-all duration-300 ${isCollapsed ? 'flex-1 justify-center' : 'flex-1'}`}>
              {me?.role === 'client' ? (
                <div className={`flex ${isCollapsed ? 'flex-col gap-2 items-center' : 'flex-col items-start gap-2'}`}>
                  {/* Client Logo */}
                  {me.client_org?.logo ? (
                    <img
                      src={me.client_org.logo}
                      alt={me.client_org.name}
                      className={`${isCollapsed ? 'w-8 h-6' : 'h-8 max-w-full'} object-contain`}
                    />
                  ) : (
                    <div className="w-12 h-12 bg-neutral-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-neutral-900 font-bold text-lg">
                        {(me.client_org?.name?.substring(0, 2) || me.username.substring(0, 2)).toUpperCase()}
                      </span>
                    </div>
                  )}

                  {/* Bottom Row: X + Axinortech
                  <div className={`flex items-center ${isCollapsed ? 'flex-col gap-1' : 'gap-2'}`}>
                    <span className="font-bold text-gray-400 text-xs">X</span>
                    <img
                      src="/Axinortechlogo.png"
                      alt="Axinortech"
                      className={`${isCollapsed ? 'w-10' : 'h-6'} object-contain`}
                    />
                  </div> */}
                </div>
              ) : (
                <>
                  {isCollapsed ? (
                    <div className="w-10 h-10 bg-neutral-900 rounded-lg flex items-center justify-center shadow-md">
                      <span className="text-white font-bold text-lg">T</span>
                    </div>
                  ) : (
                    <div className="animate-in slide-in-from-right duration-300">
                      <span className="text-xl font-extrabold text-[#0E141C]">AXFLOW</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Close button for mobile */}
            <button
              onClick={onClose}
              className="md:hidden p-2 hover:bg-gray-100/80 rounded-lg transition-all duration-200 flex-shrink-0"
            >
              <XIcon className="w-5 h-5 text-gray-500" />
            </button>

            {/* Collapse toggle for desktop */}
            <button
              onClick={onToggleCollapse}
              className="hidden md:block p-2 hover:bg-gray-100/80 rounded-lg transition-all duration-200 flex-shrink-0"
            >
              {isCollapsed ? (
                <ChevronRightIcon className="w-4 h-4 text-gray-600" />
              ) : (
                <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
              )}
            </button>
          </div>

        </div>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto py-6 space-y-1 transition-all duration-300 ${isCollapsed ? 'px-2' : 'px-4'
        }`}>
        {navigationItems.map((item, index) => {
          if (!item.show) return null

          return (
            <NavItem
              key={item.to}
              to={item.to}
              icon={item.icon}
              isActive={location.pathname === item.to}
              isCollapsed={isCollapsed}
              delay={index * 50}
              badge={(item as any).badge}
            >
              {item.label}
            </NavItem>
          )
        })}
      </nav>

      {/* Footer: Logout and Bug Report buttons */}
      <div className={`border-t border-gray-3 bg-white flex-shrink-0 transition-all duration-300 ${isCollapsed ? 'p-2' : 'p-4'
        }`}>
        <div className="space-y-1">
          <button
            onClick={onLogout}
            className={`group flex items-center text-gray-1 hover:text-red-600 hover:bg-gray-3 rounded-lg transition-all duration-200 relative overflow-hidden ${isCollapsed ? 'w-full h-12 justify-center' : 'w-full gap-3 px-4 py-3'
              }`}
            title={isCollapsed ? 'Sign Out' : ''}
          >
            <LogOutIcon className="w-4 h-4 relative z-10 flex-shrink-0" />
            {!isCollapsed && <span className="font-medium text-sm relative z-10">Sign Out</span>}
          </button>

          {me?.role !== 'client' && (
            <Link
              to="/tickets"
              className={`group flex items-center text-gray-600 hover:bg-gray-3 rounded-lg transition-all duration-200 relative overflow-hidden ${isCollapsed ? 'w-full h-12 justify-center' : 'w-full gap-3 px-4 py-3'
                } ${location.pathname === '/tickets' ? 'bg-gray-3 text-[#0E141C]' : ''}`}
              title={isCollapsed ? 'Bug / Feature Ticket' : ''}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-gray-50 to-gray-100 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
              <BugIcon className="w-4 h-4 relative z-10 flex-shrink-0" />
              {!isCollapsed && <span className="font-medium text-sm relative z-10">Bug / Feature Ticket</span>}
            </Link>
          )}
          {/* Bottom Row: Powered by + Axinortech 
          <div className="flex flex-col items-start gap-1 mt-8">
            <span className="font-bold text-gray-400 text-xs">
              Powered by
            </span>

            <img
              src="/Axinortechlogo.png"
              alt="Axinortech"
              className={`${isCollapsed ? 'w-8' : 'h-5'} object-contain`}
            />
          </div>
          */}
        </div>
      </div>
    </aside>
  )
}

function NavItem({
  to,
  children,
  icon: Icon,
  isActive,
  isCollapsed,
  delay = 0,
  badge
}: {
  to: string,
  children: React.ReactNode,
  icon: any,
  isActive: boolean,
  isCollapsed: boolean,
  delay?: number,
  badge?: number
}) {
  const hasBadge = typeof badge === 'number' && badge > 0
  const badgeText = hasBadge ? (badge! > 99 ? '99+' : String(badge)) : ''
  return (
    <Link
      to={to}
      className={`
        group relative flex items-center font-medium transition-all duration-300 rounded-lg overflow-hidden
        animate-in slide-in-from-left duration-300
        ${isCollapsed ? 'w-12 h-12 justify-center' : 'gap-3 px-4 py-3'}
        ${isActive
          ? 'bg-neutral-900 text-white shadow-sm'
          : 'text-gray-1 hover:bg-gray-3 hover:text-[#0E141C]'
        }
      `}
      style={{ animationDelay: `${delay}ms` }}
      title={isCollapsed ? children as string : ''}
    >
      {/* Background animation */}
      {!isActive && (
        <div className="absolute inset-0 bg-neutral-100 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
      )}

      <Icon className={`
        transition-all duration-200 group-hover:scale-110 relative z-10
        ${isCollapsed ? 'w-5 h-5' : 'w-4 h-4'}
        ${isActive ? 'text-white' : 'text-gray-2 group-hover:text-[#0E141C]'}
      `} />

      {/* Collapsed: dot in the corner of the icon when there's a badge */}
      {isCollapsed && hasBadge && (
        <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center z-20">
          {badgeText}
        </span>
      )}

      {!isCollapsed && (
        <>
          <span className="truncate relative z-10 text-sm">{children}</span>

          <div className="ml-auto flex items-center gap-2 relative z-10">
            {/* Unread badge */}
            {hasBadge && (
              <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center ${isActive ? 'bg-white text-neutral-900' : 'bg-red-500 text-white'}`}>
                {badgeText}
              </span>
            )}
            {/* Active indicator */}
            {isActive && (
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            )}
          </div>
        </>
      )}

      {/* Collapsed active indicator */}
      {isCollapsed && isActive && (
        <div className="absolute -right-1 top-1/2 transform -translate-y-1/2 w-1 h-6 bg-white rounded-l-full" />
      )}
    </Link>
  )
}