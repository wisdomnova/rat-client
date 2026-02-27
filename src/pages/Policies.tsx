import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, Plus, MoreVertical, Check, X, Loader2 } from 'lucide-react'
import axios from 'axios'

const AVAILABLE_RULES = [
  { key: 'disable_camera', label: 'Disable Camera' },
  { key: 'disable_microphone', label: 'Disable Microphone' },
  { key: 'force_screen_lock', label: 'Force Screen Lock' },
  { key: 'disable_factory_reset', label: 'Disable Factory Reset' },
  { key: 'disable_developer_options', label: 'Disable Developer Options' },
  { key: 'disable_usb_transfer', label: 'Disable USB Transfer' },
  { key: 'disable_bluetooth', label: 'Disable Bluetooth' },
  { key: 'disable_wifi', label: 'Disable WiFi Changes' },
  { key: 'disable_nfc', label: 'Disable NFC' },
  { key: 'disable_screenshots', label: 'Disable Screenshots' },
]

export default function Policies() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [newPolicy, setNewPolicy] = useState({
    name: '',
    description: '',
    is_default: false,
    rules: {} as Record<string, boolean>
  })

  const { data: policies, isLoading } = useQuery({
    queryKey: ['policies'],
    queryFn: async () => {
      const response = await axios.get('/api/v1/policies')
      return response.data.data || []
    }
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await axios.post('/api/v1/policies', {
        name: newPolicy.name,
        description: newPolicy.description,
        is_default: newPolicy.is_default,
        rules: newPolicy.rules
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['policies'] })
      setShowModal(false)
      setNewPolicy({ name: '', description: '', is_default: false, rules: {} })
    }
  })

  const toggleRule = (key: string) => {
    setNewPolicy(prev => ({
      ...prev,
      rules: {
        ...prev.rules,
        [key]: !prev.rules[key]
      }
    }))
  }

  if (isLoading) return <div>Loading...</div>

  return (
    <div className="animate-fade-in text-black">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold ">Security Policies</h1>
          <p className="text-gray-500 mt-1">Global enforcement rules for your Android fleet</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Policy
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-6 py-4 font-medium">Policy Name</th>
              <th className="px-6 py-4 font-medium">Restrictions</th>
              <th className="px-6 py-4 font-medium">Auto-Enroll</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {policies?.map((policy: any) => (
              <tr key={policy.id} className="hover:bg-gray-50 group">
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <div className="p-2 bg-gray-100 rounded-lg mr-3">
                      <ShieldCheck className="w-4 h-4 text-black" />
                    </div>
                    <div>
                      <div className="font-medium">{policy.name}</div>
                      <div className="text-xs text-gray-500">ID: {policy.id.substring(0,8)}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {Object.keys(policy.rules || {}).filter(k => policy.rules[k]).slice(0, 3).map((rule) => (
                      <div key={rule} className="px-2 py-0.5 bg-gray-100 border border-white rounded-md text-[10px] font-bold uppercase text-gray-600">
                        {rule.replace(/_/g, ' ')}
                      </div>
                    ))}
                    {Object.keys(policy.rules || {}).filter(k => policy.rules[k]).length > 3 && (
                      <div className="px-2 py-0.5 bg-black text-white rounded-md text-[10px] font-bold">
                        +{Object.keys(policy.rules || {}).filter(k => policy.rules[k]).length - 3}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  {policy.is_default ? (
                    <span className="flex items-center text-green-600 font-medium">
                      <Check className="w-4 h-4 mr-1" /> Yes
                    </span>
                  ) : (
                    <span className="text-gray-400">Manual</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
                    Active
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="p-1 hover:bg-gray-100 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreVertical className="w-4 h-4 text-gray-400" />
                  </button>
                </td>
              </tr>
            ))}
            
            {(!policies || policies.length === 0) && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  <ShieldCheck className="w-8 h-8 mx-auto mb-3 opacity-20" />
                  No policies defined. Create a policy to start enforcing security rules.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Policy Rule Preview Section */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-black text-white p-6 rounded-xl">
          <h3 className="text-lg font-medium mb-4">Baseline Security Rules</h3>
          <ul className="space-y-3 text-sm text-gray-400">
            <li className="flex items-center"><Check className="w-4 h-4 mr-2 text-green-400" /> Disable Camera / Mic</li>
            <li className="flex items-center"><Check className="w-4 h-4 mr-2 text-green-400" /> Force Screen Lock (6-digit Pin)</li>
            <li className="flex items-center"><Check className="w-4 h-4 mr-2 text-green-400" /> Disable Factory Reset</li>
            <li className="flex items-center"><Check className="w-4 h-4 mr-2 text-green-400" /> Disable Developer Options</li>
            <li className="flex items-center"><Check className="w-4 h-4 mr-2 text-green-400" /> App Install Whitelist Only</li>
          </ul>
        </div>
        <div className="bg-white border border-gray-200 p-6 rounded-xl">
          <h3 className="text-lg font-medium mb-4 text-black">Compliance Overview</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-500 uppercase font-bold text-[10px]">Fleet Compliance</span>
                <span className="text-black font-mono">9,842 / 10,000</span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="bg-black h-full w-[98.4%]" />
              </div>
            </div>
            <p className="text-sm text-gray-500">
              Policies are auto-propagated via MQTT Cluster in real-time. Remaining devices are currently offline.
            </p>
          </div>
        </div>
      </div>

      {/* Create Policy Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Create Security Policy</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Policy Name *
                </label>
                <input
                  type="text"
                  value={newPolicy.name}
                  onChange={(e) => setNewPolicy(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., High Security Policy"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-black transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newPolicy.description}
                  onChange={(e) => setNewPolicy(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe this policy's purpose..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-black transition-colors"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={newPolicy.is_default}
                  onChange={(e) => setNewPolicy(prev => ({ ...prev, is_default: e.target.checked }))}
                  className="w-4 h-4 mr-2"
                />
                <label htmlFor="is_default" className="text-sm text-gray-700">
                  Auto-enroll new devices with this policy
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Security Rules
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_RULES.map(rule => (
                    <button
                      key={rule.key}
                      type="button"
                      onClick={() => toggleRule(rule.key)}
                      className={`flex items-center px-3 py-2 rounded-lg border text-sm transition-colors ${
                        newPolicy.rules[rule.key]
                          ? 'bg-black text-white border-black'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {newPolicy.rules[rule.key] && <Check className="w-3 h-3 mr-2" />}
                      {rule.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !newPolicy.name}
                className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                {createMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Create Policy'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
