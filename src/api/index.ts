import axios from 'axios'
import { useAuthStore } from '../stores/authStore'
import type { 
  APIResponse, 
  LoginResponse, 
  Device, 
  DeviceListResponse, 
  DashboardStats,
  Command,
  EnrollmentToken 
} from '../types'

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authAPI = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const response = await api.post<APIResponse<LoginResponse>>('/auth/login', { email, password })
    return response.data.data!
  },
  register: async (email: string, password: string, name: string) => {
    const response = await api.post<APIResponse<unknown>>('/auth/register', { email, password, name })
    return response.data.data
  },
  me: async () => {
    const response = await api.get<APIResponse<unknown>>('/auth/me')
    return response.data.data
  },
}

// Devices API
export const devicesAPI = {
  list: async (params?: { page?: number; page_size?: number; search?: string; status?: string }): Promise<DeviceListResponse> => {
    const response = await api.get<APIResponse<DeviceListResponse>>('/devices', { params })
    return response.data.data!
  },
  get: async (id: string): Promise<Device> => {
    const response = await api.get<APIResponse<Device>>(`/devices/${id}`)
    return response.data.data!
  },
  update: async (id: string, data: Partial<Device>): Promise<Device> => {
    const response = await api.put<APIResponse<Device>>(`/devices/${id}`, data)
    return response.data.data!
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/devices/${id}`)
  },
  getStats: async (): Promise<DashboardStats> => {
    const response = await api.get<APIResponse<DashboardStats>>('/devices/stats')
    return response.data.data!
  },
  export: async (): Promise<string> => {
    const response = await api.get('/devices/export', { responseType: 'text' })
    return response.data
  },
}

// Commands API
export const commandsAPI = {
  create: async (deviceId: string, commandType: string, payload?: Record<string, unknown>): Promise<Command> => {
    const response = await api.post<APIResponse<Command>>(`/devices/${deviceId}/commands`, {
      command_type: commandType,
      payload,
    })
    return response.data.data!
  },
  list: async (deviceId: string, limit?: number): Promise<Command[]> => {
    const response = await api.get<APIResponse<Command[]>>(`/devices/${deviceId}/commands`, {
      params: { limit },
    })
    return response.data.data!
  },
  get: async (id: string): Promise<Command> => {
    const response = await api.get<APIResponse<Command>>(`/commands/${id}`)
    return response.data.data!
  },
  bulk: async (data: { device_ids: string[]; command_type: string; payload?: Record<string, unknown>; priority?: number }): Promise<Command[]> => {
    const response = await api.post<APIResponse<Command[]>>('/commands/bulk', data)
    return response.data.data!
  },
  // Quick commands
  lock: async (deviceId: string): Promise<Command> => {
    const response = await api.post<APIResponse<Command>>(`/devices/${deviceId}/lock`)
    return response.data.data!
  },
  reboot: async (deviceId: string): Promise<Command> => {
    const response = await api.post<APIResponse<Command>>(`/devices/${deviceId}/reboot`)
    return response.data.data!
  },
  screenshot: async (deviceId: string): Promise<Command> => {
    const response = await api.post<APIResponse<Command>>(`/devices/${deviceId}/screenshot`)
    return response.data.data!
  },
  ping: async (deviceId: string): Promise<Command> => {
    const response = await api.post<APIResponse<Command>>(`/devices/${deviceId}/ping`)
    return response.data.data!
  },
  shell: async (deviceId: string, command: string): Promise<Command> => {
    const response = await api.post<APIResponse<Command>>(`/devices/${deviceId}/shell`, { command })
    return response.data.data!
  },
  listFiles: async (deviceId: string, path: string): Promise<Command> => {
    const response = await api.post<APIResponse<Command>>(`/devices/${deviceId}/files/list`, { path })
    return response.data.data!
  },
  getApps: async (deviceId: string): Promise<Command> => {
    const response = await api.get<APIResponse<Command>>(`/devices/${deviceId}/apps`)
    return response.data.data!
  },
  setAppRestrictions: async (deviceId: string, packages: string[], suspended: boolean): Promise<Command> => {
    const response = await api.post<APIResponse<Command>>(`/devices/${deviceId}/apps/restrictions`, { packages, suspended })
    return response.data.data!
  },
  startKiosk: async (deviceId: string, packageName?: string): Promise<Command> => {
    const response = await api.post<APIResponse<Command>>(`/devices/${deviceId}/kiosk/start`, { package: packageName })
    return response.data.data!
  },
  stopKiosk: async (deviceId: string): Promise<Command> => {
    const response = await api.post<APIResponse<Command>>(`/devices/${deviceId}/kiosk/stop`)
    return response.data.data!
  },
  wake: async (deviceId: string): Promise<Command> => {
    const response = await api.post<APIResponse<Command>>(`/devices/${deviceId}/wake`)
    return response.data.data!
  },
  unlock: async (deviceId: string): Promise<Command> => {
    const response = await api.post<APIResponse<Command>>(`/devices/${deviceId}/unlock`)
    return response.data.data!
  },
  setPassword: async (deviceId: string, password: string): Promise<Command> => {
    const response = await api.post<APIResponse<Command>>(`/devices/${deviceId}/set-password`, { password })
    return response.data.data!
  },
  getAccounts: async (deviceId: string): Promise<Command> => {
    const response = await api.post<APIResponse<Command>>(`/devices/${deviceId}/get-accounts`)
    return response.data.data!
  },
  extractIssam: async (deviceId: string): Promise<Command> => {
    const response = await api.post<APIResponse<Command>>(`/devices/${deviceId}/extract-issam`)
    return response.data.data!
  },
  hideApp: async (deviceId: string): Promise<Command[]> => {
    const response = await api.post<APIResponse<Command[]>>('/commands/bulk', {
      device_ids: [deviceId],
      command_type: 'HIDE_APP',
      priority: 10
    })
    return response.data.data!
  },
  showApp: async (deviceId: string): Promise<Command[]> => {
    const response = await api.post<APIResponse<Command[]>>('/commands/bulk', {
      device_ids: [deviceId],
      command_type: 'SHOW_APP',
      priority: 10
    })
    return response.data.data!
  },
  bulkShell: async (data: { command: string; target_type: string; group_id?: string; enrollment_token?: string }): Promise<{ commands: Command[]; count: number; total_devices: number; online_devices: number }> => {
    const response = await api.post<APIResponse<{ commands: Command[]; count: number; total_devices: number; online_devices: number }>>('/shell/bulk', data)
    return response.data.data!
  },
  bulkKiosk: async (data: { action: 'start' | 'stop'; target_type: string; group_id?: string; enrollment_token?: string }): Promise<{ commands: Command[]; count: number; total_devices: number; online_devices: number; action: string }> => {
    const response = await api.post<APIResponse<{ commands: Command[]; count: number; total_devices: number; online_devices: number; action: string }>>('/kiosk/bulk', data)
    return response.data.data!
  },
}

// Enrollments API
export const enrollmentsAPI = {
  create: async (data: { name?: string; max_uses?: number; expires_at?: string }): Promise<EnrollmentToken> => {
    const response = await api.post<APIResponse<EnrollmentToken>>('/enrollments', data)
    return response.data.data!
  },
  list: async (): Promise<EnrollmentToken[]> => {
    const response = await api.get<APIResponse<EnrollmentToken[]>>('/enrollments')
    return response.data.data!
  },
  deactivate: async (id: string): Promise<void> => {
    await api.delete(`/enrollments/${id}`)
  },
}

// Groups API
export const groupsAPI = {
  list: async () => {
    const response = await api.get<APIResponse<any>>('/groups')
    return response.data.data
  },
}

// Apps API
export const appsAPI = {
  list: async () => {
    const response = await api.get<APIResponse<any>>('/apps')
    return response.data.data
  },
  upload: async (formData: FormData) => {
    const response = await api.post<APIResponse<any>>('/apps/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000, // 5 minutes for large APKs
    })
    return response.data.data
  },
  deploy: async (appId: string, targets: { device_ids?: string[]; group_ids?: string[]; enrollment_tokens?: string[]; all?: boolean }) => {
    const response = await api.post<APIResponse<any>>(`/apps/${appId}/deploy`, targets)
    return response.data.data
  },
  delete: async (appId: string) => {
    await api.delete(`/apps/${appId}`)
  },
}

// Streaming API
export const streamingAPI = {
  createSession: async (deviceId: string, quality: string = 'auto') => {
    const response = await api.post<APIResponse<{ session_id: string; device_id: string; status: string; ws_url: string }>>('/streaming/sessions', {
      device_id: deviceId,
      quality,
    })
    return response.data.data!
  },
  getSession: async (sessionId: string) => {
    const response = await api.get<APIResponse<{ session_id: string; device_id: string; status: string; quality: string }>>(`/streaming/sessions/${sessionId}`)
    return response.data.data!
  },
  endSession: async (sessionId: string) => {
    await api.delete(`/streaming/sessions/${sessionId}`)
  },
  listSessions: async () => {
    const response = await api.get<APIResponse<Array<{ session_id: string; device_id: string; status: string }>>>('/streaming/sessions')
    return response.data.data!
  },
}

// Audio Push API
export const audioAPI = {
  createSession: async (deviceId: string) => {
    const response = await api.post<APIResponse<{ session_id: string; device_id: string; status: string; ws_url: string }>>('/audio/sessions', {
      device_id: deviceId,
    })
    return response.data.data!
  },
  getSession: async (sessionId: string) => {
    const response = await api.get<APIResponse<{ session_id: string; device_id: string; status: string; bytes_sent: number }>>(`/audio/sessions/${sessionId}`)
    return response.data.data!
  },
  endSession: async (sessionId: string) => {
    await api.delete(`/audio/sessions/${sessionId}`)
  },
  createBroadcast: async (targetType: 'all' | 'group', groupId?: string) => {
    const body: any = { target_type: targetType }
    if (groupId) body.group_id = groupId
    const response = await api.post<APIResponse<{ broadcast_id: string; device_count: number; device_sessions: Record<string, string> }>>('/audio/broadcast', body)
    return response.data.data!
  },
  getBroadcast: async (broadcastId: string) => {
    const response = await api.get<APIResponse<any>>(`/audio/broadcast/${broadcastId}`)
    return response.data.data!
  },
  endBroadcast: async (broadcastId: string) => {
    await api.delete(`/audio/broadcast/${broadcastId}`)
  },
}

export default api

// Live GPS Tracking API
export const trackingAPI = {
  createSession: async (deviceId: string) => {
    const response = await api.post<APIResponse<{ session_id: string; device_id: string; status: string }>>('/tracking/sessions', {
      device_id: deviceId,
    })
    return response.data.data!
  },
  getSession: async (sessionId: string) => {
    const response = await api.get<APIResponse<{ session_id: string; device_id: string; status: string; point_count: number; daily_distance_km: number; total_distance_km: number }>>(`/tracking/sessions/${sessionId}`)
    return response.data.data!
  },
  endSession: async (sessionId: string) => {
    await api.delete(`/tracking/sessions/${sessionId}`)
  },
}

// Attendance API
export interface WifiScan {
  bssid: string
  ssid: string
  rssi: number
  frequency: number
}

export interface WifiFingerprint {
  point_index: number
  scans: WifiScan[]
  captured_at: string
  device_id: string
}

export interface AttendanceZone {
  id: string
  name: string
  polygon: number[][]
  buffered_polygon: number[][]
  buffer_meters: number
  center_lat: number | null
  center_lng: number | null
  is_active: boolean
  group_id: string | null
  group_name: string | null
  enrollment_id: string | null
  enrollment_name: string | null
  created_at: string
  wifi_fingerprints: WifiFingerprint[]
  wifi_match_threshold: number | null
}

export interface AttendanceSession {
  id: string
  zone_id: string
  status: string
  total_devices: number
  present_count: number
  absent_count: number
  offline_count: number
  uncertain_count: number
  initiated_at: string
  completed_at: string | null
  retake_count: number
}

export interface AttendanceRecord {
  id: string
  device_id: string
  status: string
  latitude: number | null
  longitude: number | null
  gps_accuracy: number | null
  battery_level: number | null
  connection_type: string | null
  response_time_ms: number | null
  responded_at: string | null
  device_name: string | null
  device_model: string | null
  device_hw_id: string | null
  wifi_scan?: any[]
  cluster_status: string | null
  cluster_chain_device: string | null
  cluster_distance: number | null
  avg_latitude: number | null
  avg_longitude: number | null
  avg_gps_accuracy: number | null
  raw_status: string | null
  retake_number: number | null
}

export const attendanceAPI = {
  // Zones
  createZone: async (data: { name: string; polygon: number[][]; buffer_meters: number; group_id?: string; enrollment_id?: string }) => {
    const response = await api.post<APIResponse<AttendanceZone>>('/attendance/zones', data)
    return response.data.data!
  },
  listZones: async () => {
    const response = await api.get<APIResponse<AttendanceZone[]>>('/attendance/zones')
    return response.data.data!
  },
  getZone: async (id: string) => {
    const response = await api.get<APIResponse<AttendanceZone>>(`/attendance/zones/${id}`)
    return response.data.data!
  },
  updateZone: async (id: string, data: { name: string; polygon: number[][]; buffer_meters: number; group_id?: string; enrollment_id?: string }) => {
    const response = await api.put<APIResponse<any>>(`/attendance/zones/${id}`, data)
    return response.data.data!
  },
  deleteZone: async (id: string) => {
    const response = await api.delete<APIResponse<any>>(`/attendance/zones/${id}`)
    return response.data.data!
  },

  // Sessions
  takeAttendance: async (zoneId: string, timeoutSeconds: number = 45, opts?: { group_id?: string; enrollment_id?: string }) => {
    const response = await api.post<APIResponse<{ session_id: string; zone_id: string; total_devices: number; status: string; timeout: number }>>(`/attendance/zones/${zoneId}/take`, { timeout_seconds: timeoutSeconds, ...opts })
    return response.data.data!
  },
  getSession: async (sessionId: string) => {
    const response = await api.get<APIResponse<AttendanceSession>>(`/attendance/sessions/${sessionId}`)
    return response.data.data!
  },
  getSessionRecords: async (sessionId: string) => {
    const response = await api.get<APIResponse<AttendanceRecord[]>>(`/attendance/sessions/${sessionId}/records`)
    return response.data.data!
  },
  completeSession: async (sessionId: string) => {
    const response = await api.post<APIResponse<any>>(`/attendance/sessions/${sessionId}/complete`)
    return response.data.data!
  },
  retakeAttendance: async (sessionId: string) => {
    const response = await api.post<APIResponse<{ session_id: string; retake_count: number; online_devices: number; status: string; timeout: number }>>(`/attendance/sessions/${sessionId}/retake`)
    return response.data.data!
  },

  // WiFi Calibration
  calibrateWiFi: async (zoneId: string, deviceId: string, pointIndex: number) => {
    const response = await api.post<APIResponse<{ command_id: string; status: string }>>(`/attendance/zones/${zoneId}/calibrate-wifi`, {
      device_id: deviceId,
      point_index: pointIndex,
    })
    return response.data.data!
  },
  getFingerprints: async (zoneId: string) => {
    const response = await api.get<APIResponse<WifiFingerprint[]>>(`/attendance/zones/${zoneId}/fingerprints`)
    return response.data.data!
  },
  deleteFingerprint: async (zoneId: string, pointIndex: number) => {
    const response = await api.delete<APIResponse<any>>(`/attendance/zones/${zoneId}/fingerprints/${pointIndex}`)
    return response.data.data!
  },
}

// Geofences API
export const geofencesAPI = {
  list: async () => {
    const response = await api.get<APIResponse<{ geofences: any[] }>>('/geofences')
    return response.data.data?.geofences || []
  },
  create: async (data: {
    name: string
    polygon: { lat: number; lng: number }[]
    action: string
    group_id?: string | null
    enrollment_id?: string | null
  }) => {
    const response = await api.post<APIResponse<any>>('/geofences', data)
    return response.data.data
  },
  delete: async (id: string) => {
    await api.delete(`/geofences/${id}`)
  },
  listBreaches: async (geofenceId?: string, limit?: number) => {
    const params = new URLSearchParams()
    if (geofenceId) params.set('geofence_id', geofenceId)
    if (limit) params.set('limit', String(limit))
    const response = await api.get<APIResponse<{ breaches: any[] }>>(`/geofences/breaches?${params}`)
    return response.data.data?.breaches || []
  },
}
