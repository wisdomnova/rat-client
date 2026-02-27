import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Package, Upload, Trash2, Send, X, CheckCircle, AlertCircle, Loader2, Users, Globe, Tablet } from 'lucide-react'
import { appsAPI, groupsAPI, devicesAPI } from '../api'
import { useState, useRef } from 'react'

interface AppEntry {
  id: string
  package_name: string
  app_name: string
  version_code: number
  version_name?: string
  apk_size?: number
  apk_hash?: string
  description?: string
  is_mandatory: boolean
  download_url?: string
  created_at: string
}

export default function AppRepository() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [showDeploy, setShowDeploy] = useState<string | null>(null)
  const [uploadForm, setUploadForm] = useState({
    app_name: '',
    package_name: '',
    version_code: '1',
    version_name: '1.0',
    description: '',
    is_mandatory: false,
  })
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [deployMode, setDeployMode] = useState<'all' | 'groups' | 'devices'>('all')
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])

  const { data: apps, isLoading } = useQuery<AppEntry[]>({
    queryKey: ['apps'],
    queryFn: async () => {
      const response = await appsAPI.list()
      return response || []
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: groups } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsAPI.list(),
    staleTime: 5 * 60 * 1000,
  })

  const { data: devicesData } = useQuery({
    queryKey: ['devices-for-deploy'],
    queryFn: () => devicesAPI.list({ page_size: 100 }),
    enabled: showDeploy !== null,
    staleTime: 5 * 60 * 1000,
  })

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error('No file selected')
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('app_name', uploadForm.app_name || selectedFile.name)
      formData.append('package_name', uploadForm.package_name)
      formData.append('version_code', uploadForm.version_code)
      formData.append('version_name', uploadForm.version_name)
      formData.append('description', uploadForm.description)
      formData.append('is_mandatory', uploadForm.is_mandatory.toString())
      return appsAPI.upload(formData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] })
      setShowUpload(false)
      setSelectedFile(null)
      setUploadForm({ app_name: '', package_name: '', version_code: '1', version_name: '1.0', description: '', is_mandatory: false })
    },
  })

  const deployMutation = useMutation({
    mutationFn: async (appId: string) => {
      const targets: any = {}
      if (deployMode === 'all') {
        targets.all = true
      } else if (deployMode === 'groups') {
        targets.group_ids = selectedGroups
      } else if (deployMode === 'devices') {
        targets.device_ids = selectedDevices
      }
      return appsAPI.deploy(appId, targets)
    },
    onSuccess: (data) => {
      setShowDeploy(null)
      setSelectedGroups([])
      setSelectedDevices([])
      alert(`Deployment queued for ${data?.targets || '?'} device(s)`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (appId: string) => appsAPI.delete(appId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apps'] }),
  })

  const AppSkeleton = () => (
    <div className="bg-gray-50 border border-gray-100 rounded-[2.5rem] p-6 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 bg-gray-200 rounded-2xl" />
        <div className="w-8 h-8 bg-gray-200 rounded-full" />
      </div>
      <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="h-12 bg-gray-200 rounded-2xl" />
        <div className="h-12 bg-gray-200 rounded-2xl" />
      </div>
      <div className="h-10 bg-gray-200 rounded-[2.5rem]" />
    </div>
  )

  const devices = devicesData?.devices || []

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-end mb-12">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">App Repository</h1>
          <p className="text-gray-500 mt-2 text-lg">Upload and manage applications for your devices</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center space-x-3 bg-[#FA9411] text-white px-8 py-4 rounded-[2.5rem] text-lg font-bold hover:shadow-lg hover:brightness-105 transition-all shadow-orange-200"
        >
          <Upload className="w-6 h-6" />
          <span>Add New App</span>
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => <AppSkeleton key={i} />)}
        </div>
      ) : (
        <>
          {/* Upload Modal */}
          {showUpload && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-xl shadow-2xl relative">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold">Add New App</h2>
                  <button onClick={() => setShowUpload(false)} className="bg-gray-100 p-2 rounded-full text-gray-400 hover:text-gray-600">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">App Installation File</label>
                  <div
                    className="border-2 border-dashed border-gray-200 rounded-[2rem] p-8 text-center cursor-pointer hover:border-[#FA9411] hover:bg-orange-50/30 transition-all"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {selectedFile ? (
                      <div className="flex items-center justify-center space-x-2">
                        <CheckCircle className="w-6 h-6 text-[#FA9411]" />
                        <span className="text-base font-bold text-gray-900">{selectedFile.name}</span>
                        <span className="text-sm text-gray-400">({(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)</span>
                      </div>
                    ) : (
                      <div>
                        <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Upload className="w-8 h-8 text-[#FA9411]" />
                        </div>
                        <p className="text-base font-medium text-gray-600">Click or drag APK here</p>
                        <p className="text-sm text-gray-400">Select the Android installation file</p>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".apk"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setSelectedFile(file)
                        if (!uploadForm.app_name) {
                          setUploadForm(prev => ({ ...prev, app_name: file.name.replace('.apk', '') }))
                        }
                      }
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">App Name</label>
                    <input
                      className="w-full border-2 border-gray-100 focus:border-[#FA9411] outline-none rounded-2xl px-4 py-3 text-sm transition-all"
                      value={uploadForm.app_name}
                      onChange={(e) => setUploadForm(prev => ({ ...prev, app_name: e.target.value }))}
                      placeholder="e.g. Sales App"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Unique ID</label>
                    <input
                      className="w-full border-2 border-gray-100 focus:border-[#FA9411] outline-none rounded-2xl px-4 py-3 text-sm transition-all"
                      value={uploadForm.package_name}
                      onChange={(e) => setUploadForm(prev => ({ ...prev, package_name: e.target.value }))}
                      placeholder="e.g. com.company.app"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Build Number</label>
                    <input
                      className="w-full border-2 border-gray-100 focus:border-[#FA9411] outline-none rounded-2xl px-4 py-3 text-sm transition-all"
                      type="number"
                      value={uploadForm.version_code}
                      onChange={(e) => setUploadForm(prev => ({ ...prev, version_code: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Release Version</label>
                    <input
                      className="w-full border-2 border-gray-100 focus:border-[#FA9411] outline-none rounded-2xl px-4 py-3 text-sm transition-all"
                      value={uploadForm.version_name}
                      onChange={(e) => setUploadForm(prev => ({ ...prev, version_name: e.target.value }))}
                      placeholder="e.g. 1.0.0"
                    />
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">Description</label>
                  <textarea
                    className="w-full border-2 border-gray-100 focus:border-[#FA9411] outline-none rounded-2xl px-4 py-3 text-sm transition-all"
                    rows={2}
                    value={uploadForm.description}
                    onChange={(e) => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Short description of the app..."
                  />
                </div>

                <div className="mb-8 p-4 bg-orange-50 rounded-[1.5rem]">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={uploadForm.is_mandatory}
                      onChange={(e) => setUploadForm(prev => ({ ...prev, is_mandatory: e.target.checked }))}
                      className="w-5 h-5 rounded text-[#FA9411] focus:ring-[#FA9411]"
                    />
                    <div>
                      <span className="block text-sm font-bold text-gray-900">Required App</span>
                      <span className="text-xs text-orange-600">Automatically installs on all managed devices</span>
                    </div>
                  </label>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowUpload(false)}
                    className="flex-1 py-4 border-2 border-gray-100 rounded-[2rem] text-sm font-bold hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => uploadMutation.mutate()}
                    disabled={!selectedFile || !uploadForm.package_name || uploadMutation.isPending}
                    className="flex-1 py-4 bg-[#FA9411] text-white rounded-[2rem] text-sm font-bold hover:shadow-lg hover:brightness-105 transition-all disabled:opacity-40 flex items-center justify-center space-x-2"
                  >
                    {uploadMutation.isPending ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        <span>Upload App</span>
                      </>
                    )}
                  </button>
                </div>

                {uploadMutation.isError && (
                  <div className="mt-4 p-4 bg-red-50 rounded-2xl flex items-center space-x-2 text-red-600 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>{(uploadMutation.error as any)?.response?.data?.error?.message || uploadMutation.error?.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Deploy Modal */}
          {showDeploy && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-xl shadow-2xl">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold">Send App to Devices</h2>
                  <button onClick={() => setShowDeploy(null)} className="bg-gray-100 p-2 rounded-full text-gray-400 hover:text-gray-600">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <p className="text-lg text-gray-500 mb-6">
                  Sending: <span className="font-bold text-gray-900">{apps?.find(a => a.id === showDeploy)?.app_name}</span>
                </p>

                <div className="space-y-4 mb-8">
                  <button
                    onClick={() => setDeployMode('all')}
                    className={`w-full flex items-center space-x-4 p-5 rounded-[2rem] border-2 transition-all ${deployMode === 'all' ? 'border-[#FA9411] bg-orange-50/50' : 'border-gray-100 hover:border-gray-300'}`}
                  >
                    <div className={`p-3 rounded-2xl ${deployMode === 'all' ? 'bg-[#FA9411] text-white' : 'bg-gray-100 text-gray-500'}`}>
                      <Globe className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <span className="block text-base font-bold">All Devices</span>
                      <span className="block text-sm text-gray-400">Send this app to every device</span>
                    </div>
                  </button>

                  <button
                    onClick={() => setDeployMode('groups')}
                    className={`w-full flex items-center space-x-4 p-5 rounded-[2rem] border-2 transition-all ${deployMode === 'groups' ? 'border-[#FA9411] bg-orange-50/50' : 'border-gray-100 hover:border-gray-300'}`}
                  >
                    <div className={`p-3 rounded-2xl ${deployMode === 'groups' ? 'bg-[#FA9411] text-white' : 'bg-gray-100 text-gray-500'}`}>
                      <Users className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <span className="block text-base font-bold">Groups</span>
                      <span className="block text-sm text-gray-400">Choose specific device groups</span>
                    </div>
                  </button>

                  <button
                    onClick={() => setDeployMode('devices')}
                    className={`w-full flex items-center space-x-4 p-5 rounded-[2rem] border-2 transition-all ${deployMode === 'devices' ? 'border-[#FA9411] bg-orange-50/50' : 'border-gray-100 hover:border-gray-300'}`}
                  >
                    <div className={`p-3 rounded-2xl ${deployMode === 'devices' ? 'bg-[#FA9411] text-white' : 'bg-gray-100 text-gray-500'}`}>
                      <Tablet className="w-6 h-6" />
                    </div>
                    <div className="text-left">
                      <span className="block text-base font-bold">Specific Devices</span>
                      <span className="block text-sm text-gray-400">Choose specific devices to receive the app</span>
                    </div>
                  </button>
                </div>

                {deployMode === 'groups' && (
                  <div className="mb-6 max-h-60 overflow-y-auto border-2 border-gray-100 rounded-[2rem] p-4 space-y-1">
                    {(groups as any)?.groups?.length > 0 ? (
                      (groups as any).groups.map((g: any) => (
                        <label key={g.id} className="flex items-center space-x-3 p-3 rounded-2xl hover:bg-orange-50 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedGroups.includes(g.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedGroups(prev => [...prev, g.id])
                              else setSelectedGroups(prev => prev.filter(id => id !== g.id))
                            }}
                            className="w-5 h-5 rounded text-[#FA9411] focus:ring-[#FA9411]"
                          />
                          <span className="text-sm font-bold">{g.name}</span>
                        </label>
                      ))
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-4">No groups available</p>
                    )}
                  </div>
                )}

                {deployMode === 'devices' && (
                  <div className="mb-6 max-h-60 overflow-y-auto border-2 border-gray-100 rounded-[2rem] p-4 space-y-1">
                    {devices.length > 0 ? (
                      devices.map((d: any) => (
                        <label key={d.id} className="flex items-center justify-between p-3 rounded-2xl hover:bg-orange-50 cursor-pointer transition-colors">
                          <div className="flex items-center space-x-3">
                            <input
                              type="checkbox"
                              checked={selectedDevices.includes(d.id)}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedDevices(prev => [...prev, d.id])
                                else setSelectedDevices(prev => prev.filter(id => id !== d.id))
                              }}
                              className="w-5 h-5 rounded text-[#FA9411] focus:ring-[#FA9411]"
                            />
                            <span className="text-sm font-bold text-gray-900">{d.name || d.model || d.device_id}</span>
                          </div>
                          <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-full ${d.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {d.status}
                          </span>
                        </label>
                      ))
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-4">No devices available</p>
                    )}
                  </div>
                )}

                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowDeploy(null)}
                    className="flex-1 py-4 border-2 border-gray-100 rounded-[2rem] text-sm font-bold hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deployMutation.mutate(showDeploy)}
                    disabled={
                      deployMutation.isPending ||
                      (deployMode === 'groups' && selectedGroups.length === 0) ||
                      (deployMode === 'devices' && selectedDevices.length === 0)
                    }
                    className="flex-1 py-4 bg-[#FA9411] text-white rounded-[2rem] text-sm font-bold hover:shadow-lg hover:brightness-105 transition-all disabled:opacity-40 flex items-center justify-center space-x-2"
                  >
                    {deployMutation.isPending ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        <span>Send Now</span>
                      </>
                    )}
                  </button>
                </div>

                {deployMutation.isError && (
                  <div className="mt-4 p-4 bg-red-50 rounded-2xl flex items-center space-x-2 text-red-600 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>{(deployMutation.error as any)?.response?.data?.error?.message || deployMutation.error?.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* App Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {apps?.map((app) => (
              <div key={app.id} className="bg-white border-2 border-gray-100 rounded-[2.5rem] p-8 hover:shadow-xl hover:border-orange-100 transition-all group">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-16 h-16 bg-orange-50 rounded-[1.5rem] flex items-center justify-center group-hover:bg-[#FA9411] group-hover:text-white transition-all">
                    <Package className="w-8 h-8" />
                  </div>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => {
                        if (confirm(`Delete ${app.app_name}?`)) deleteMutation.mutate(app.id)
                      }}
                      className="p-3 bg-gray-50 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="font-bold text-2xl text-gray-900 mb-1">{app.app_name}</h3>
                  <p className="text-sm font-medium text-gray-400 mb-2 truncate">{app.package_name}</p>
                  {app.description ? (
                    <p className="text-sm text-gray-500 line-clamp-2">{app.description}</p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No description provided</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-gray-50 p-4 rounded-2xl">
                    <span className="block text-[10px] uppercase text-gray-400 font-bold mb-1">Release Version</span>
                    <span className="text-base font-bold text-gray-900">{app.version_name || app.version_code}</span>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-2xl">
                    <span className="block text-[10px] uppercase text-gray-400 font-bold mb-1">Size</span>
                    <span className="text-base font-bold text-gray-900">
                      {app.apk_size ? `${(app.apk_size / (1024 * 1024)).toFixed(1)} MB` : 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  {app.is_mandatory && (
                    <div className="flex-1">
                      <span className="flex items-center justify-center space-x-2 w-full px-4 py-3 bg-orange-50 text-[#FA9411] text-sm font-bold rounded-2xl">
                        <CheckCircle className="w-4 h-4" />
                        <span>Required App</span>
                      </span>
                    </div>
                  )}

                  <button
                    onClick={() => setShowDeploy(app.id)}
                    className="flex-1 flex items-center justify-center space-x-2 bg-gray-900 text-white py-4 rounded-2xl text-sm font-bold hover:bg-black transition-all"
                  >
                    <Send className="w-4 h-4" />
                    <span>Send to Devices</span>
                  </button>
                </div>
              </div>
            ))}

            {(!apps || apps.length === 0) && (
              <div className="col-span-full py-32 text-center border-4 border-dashed border-gray-50 rounded-[3rem]">
                <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Package className="w-12 h-12 text-gray-300" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Your repository is empty</h3>
                <p className="text-gray-500 mb-8 max-w-sm mx-auto">Upload your first application installation file to start managing apps for your devices.</p>
                <button
                  onClick={() => setShowUpload(true)}
                  className="bg-[#FA9411] text-white px-10 py-4 rounded-[2.5rem] font-bold hover:shadow-xl hover:brightness-105 transition-all"
                >
                  Add Your First App
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
