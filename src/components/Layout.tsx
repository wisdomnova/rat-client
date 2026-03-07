import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { 
  LayoutDashboard, 
  Tablet, 
  QrCode, 
  LogOut,
  Grid,
  MapPin,
  Package,
  Radio,
  ClipboardCheck,
  Terminal,
  Monitor,
  Menu,
  X as CloseIcon
} from 'lucide-react'

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Overview' },
    { to: '/devices', icon: Tablet, label: 'Devices' },
    { to: '/groups', icon: Grid, label: 'Groups' },
    { to: '/kiosk', icon: Monitor, label: 'Kiosk' },
    { to: '/geofencing', icon: MapPin, label: 'Geofence' },
    { to: '/attendance', icon: ClipboardCheck, label: 'Attendance' },
    { to: '/apps', icon: Package, label: 'App Library' },
    { to: '/audio', icon: Radio, label: 'Audio Announcement' },
    { to: '/shell', icon: Terminal, label: 'Commands' },
    { to: '/enrollments', icon: QrCode, label: 'Enroll Devices' },
  ]

  return (
    <div className="h-screen bg-white flex overflow-hidden lg:flex-row flex-col">
      {/* Mobile Header */}
      <header className="lg:hidden h-20 bg-[#FA9411] flex items-center justify-between px-6 z-30 shrink-0">
        <div className="flex items-center">
          <QrCode className="w-8 h-8 mr-3 text-white" />
          <span className="font-bold text-xl tracking-tight text-white">MDM Control</span>
        </div>
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 bg-white/10 rounded-xl text-white active:scale-95 transition-transform"
        >
          {isSidebarOpen ? <CloseIcon className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 w-72 bg-[#FA9411] flex flex-col z-50 transition-transform duration-300 lg:translate-x-0 lg:static lg:inset-auto lg:h-full lg:z-10
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Subtle background decoration */}
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-white/5 rounded-full blur-3xl opacity-50" />
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-black/5 rounded-full blur-3xl opacity-50" />

        {/* Desktop Logo */}
        <div className="hidden lg:flex h-24 items-center px-8 relative z-10">
          <QrCode className="w-8 h-8 mr-3 text-white" />
          <span className="font-bold text-xl tracking-tight text-white">MDM Control</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 overflow-y-auto scrollbar-hide space-y-1 relative z-10">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setIsSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 text-sm font-bold transition-all duration-200 ${
                  isActive
                    ? 'bg-white text-[#FA9411] rounded-[1.5rem] shadow-xl shadow-orange-950/20'
                    : 'text-white/70 hover:bg-white/10 hover:text-white rounded-[1.5rem]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={`w-5 h-5 mr-3 transition-colors ${isActive ? 'text-[#FA9411]' : 'text-white/70'}`} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="p-4 mt-auto relative z-10">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 shadow-sm">
            <div className="flex items-center mb-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mr-3 border border-white/20 shrink-0">
                <span className="text-white font-bold text-xs uppercase">
                  {user?.email?.substring(0, 2)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white truncate">
                  {user?.email?.split('@')[0]}
                </div>
                <div className="text-[10px] text-white/50 truncate font-bold uppercase tracking-wider">{user?.email}</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center w-full px-3 py-2.5 text-xs font-bold text-white hover:bg-white/10 rounded-xl transition-all border border-white/15 active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5 mr-2" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-gray-50/50 relative">
        <div className="p-4 sm:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
