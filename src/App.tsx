import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Devices from './pages/Devices'
import DeviceDetail from './pages/DeviceDetail'
import Enrollments from './pages/Enrollments'
import RemoteView from './pages/RemoteView'
import LiveAudio from './pages/LiveAudio'
import ListenDevice from './pages/ListenDevice'
import AudioBroadcast from './pages/AudioBroadcast'
import AudioHub from './pages/AudioHub'
import RemoteShell from './pages/RemoteShell'
import Groups from './pages/Groups'
import AppRepository from './pages/AppRepository'
import KioskDesigner from './pages/KioskDesigner'
import Geofences from './pages/Geofences'
import LiveTracking from './pages/LiveTracking'
import AttendanceZones from './pages/AttendanceZones'
import ZoneCalibration from './pages/ZoneCalibration'
import AttendanceSession from './pages/AttendanceSession'
import TrackAndListen from './pages/TrackAndListen'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  return <>{children}</>
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="devices" element={<Devices />} />
        <Route path="devices/:id" element={<DeviceDetail />} />
        <Route path="devices/:id/remote" element={<RemoteView />} />
        <Route path="devices/:id/audio" element={<LiveAudio />} />
        <Route path="devices/:id/listen" element={<ListenDevice />} />
        <Route path="devices/:id/tracking" element={<LiveTracking />} />
        <Route path="devices/:id/track-listen" element={<TrackAndListen />} />
        <Route path="audio" element={<AudioHub />} />
        <Route path="audio/broadcast" element={<AudioBroadcast />} />
        <Route path="shell" element={<RemoteShell />} />
        <Route path="enrollments" element={<Enrollments />} />
        <Route path="groups" element={<Groups />} />
        <Route path="apps" element={<AppRepository />} />
        <Route path="kiosk" element={<KioskDesigner />} />
        <Route path="geofencing" element={<Geofences />} />
        <Route path="attendance" element={<AttendanceZones />} />
        <Route path="attendance/calibrate" element={<ZoneCalibration />} />
        <Route path="attendance/session/:sessionId" element={<AttendanceSession />} />
      </Route>
    </Routes>
  )
}

export default App
