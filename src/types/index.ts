export interface User {
  id: string
  organization_id: string
  email: string
  name: string
  role: 'super_admin' | 'admin' | 'operator' | 'viewer'
  is_active: boolean
  two_factor_enabled: boolean
  created_at: string
  updated_at: string
}

export interface Device {
  id: string
  organization_id: string
  group_id?: string
  policy_id?: string
  serial_number?: string
  device_id: string
  name?: string
  model?: string
  manufacturer?: string
  android_version?: string
  sdk_version?: number
  agent_version?: string
  status: 'online' | 'offline' | 'pending' | 'disabled'
  last_seen?: string
  enrolled_at?: string
  battery_level?: number
  storage_total?: number
  storage_available?: number
  memory_total?: number
  memory_available?: number
  network_type?: string
  ip_address?: string
  latitude?: number
  longitude?: number
  google_emails?: string[]
  phone_numbers?: string[]
  issam_id?: string
  is_device_locked?: boolean
  tags?: string[]
  // v1.1 extended telemetry
  wifi_ssid?: string
  wifi_rssi?: number
  charging_type?: string
  foreground_app?: string
  current_url?: string
  link_speed_mbps?: number
  group_name?: string
  policy_name?: string
  enrollment_name?: string
  created_at: string
  updated_at: string
}

export interface Command {
  id: string
  device_id: string
  issued_by?: string
  command_type: string
  payload?: Record<string, unknown>
  status: 'pending' | 'queued' | 'delivered' | 'executing' | 'completed' | 'failed' | 'timeout'
  priority: number
  created_at: string
  queued_at?: string
  delivered_at?: string
  executed_at?: string
  completed_at?: string
  timeout_seconds: number
  result?: Record<string, unknown>
  error_message?: string
}

export interface EnrollmentToken {
  id: string
  organization_id: string
  group_id?: string
  policy_id?: string
  token: string
  name?: string
  max_uses?: number
  current_uses: number
  expires_at?: string
  is_active: boolean
  created_at: string
}

export interface DashboardStats {
  total_devices: number
  online_devices: number
  offline_devices: number
  pending_devices: number
  total_groups: number
  total_commands: number
  status_counts: Record<string, number>
}

export interface DeviceListResponse {
  devices: Device[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface APIResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  expires_at: number
  user: User
}
