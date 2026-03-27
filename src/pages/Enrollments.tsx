import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { enrollmentsAPI } from '../api'
import { 
  Plus, 
  QrCode, 
  Copy, 
  Trash2, 
  CheckCircle,
  X,
  Loader2,
  Pencil
} from 'lucide-react'

export default function Enrollments() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [newEnrollment, setNewEnrollment] = useState({ name: '', max_uses: '' })
  const [copied, setCopied] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const { data: enrollments, isLoading } = useQuery({
    queryKey: ['enrollments'],
    queryFn: enrollmentsAPI.list,
    staleTime: 5 * 60 * 1000,
  })

  const createMutation = useMutation({
    mutationFn: () => enrollmentsAPI.create({
      name: newEnrollment.name || undefined,
      max_uses: newEnrollment.max_uses ? parseInt(newEnrollment.max_uses) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      setShowModal(false)
      setNewEnrollment({ name: '', max_uses: '' })
    },
    onError: (error: any) => {
      console.error('Failed to create enrollment:', error)
      alert('Failed to create enrollment: ' + (error?.response?.data?.error?.message || error.message))
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => enrollmentsAPI.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] })
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => enrollmentsAPI.rename(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      setEditingId(null)
    },
    onError: (error: any) => {
      console.error('Failed to rename enrollment:', error)
      alert('Failed to rename: ' + (error?.response?.data?.error?.message || error.message))
    },
  })

  const startRenaming = (enrollment: { id: string; name?: string }) => {
    setEditingId(enrollment.id)
    setEditName(enrollment.name || '')
  }

  const submitRename = () => {
    if (editingId && editName.trim()) {
      renameMutation.mutate({ id: editingId, name: editName.trim() })
    }
  }

  const copyToken = async (token: string) => {
    await navigator.clipboard.writeText(token)
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Device Setup Links</h1>
          <p className="text-gray-500 mt-1">
            Generate codes to connect new phones to your system
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center px-6 py-2.5 bg-[#FA9411] text-white rounded-[1.5rem] hover:opacity-90 transition-all font-semibold shadow-sm"
        >
          <Plus className="w-5 h-5 mr-2" />
          Create Setup Link
        </button>
      </div>

      {/* Tokens List */}
      <div className="bg-white border border-gray-100 rounded-[2.5rem] overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="divide-y divide-gray-50">
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-8 py-6 flex items-center justify-between animate-pulse">
                <div className="flex items-center flex-1">
                  <div className="w-10 h-10 bg-gray-100 rounded-full mr-4" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-100 rounded w-32 mb-2" />
                    <div className="h-3 bg-gray-50 rounded w-48" />
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="h-4 bg-gray-100 rounded w-16 mb-2 ml-auto" />
                    <div className="h-3 bg-gray-50 rounded w-20 ml-auto" />
                  </div>
                  <div className="w-10 h-10 bg-gray-50 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : enrollments && enrollments.length > 0 ? (
          <div className="divide-y divide-gray-50">
            {enrollments.map((enrollment) => (
              <div
                key={enrollment.id}
                className={`px-8 py-6 flex items-center justify-between hover:bg-gray-50/50 transition-colors ${
                  !enrollment.is_active ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-center flex-1">
                  <div className={`p-3 rounded-2xl ${enrollment.is_active ? 'bg-orange-50 text-[#FA9411]' : 'bg-gray-100 text-gray-400'} mr-4`}>
                    <QrCode className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {editingId === enrollment.id ? (
                        <form
                          onSubmit={(e) => { e.preventDefault(); submitRename() }}
                          className="flex items-center gap-2"
                        >
                          <input
                            autoFocus
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={() => { if (!renameMutation.isPending) setEditingId(null) }}
                            onKeyDown={(e) => { if (e.key === 'Escape') setEditingId(null) }}
                            className="font-bold text-gray-900 text-lg bg-gray-50 border border-gray-200 rounded-xl px-3 py-1 focus:outline-none focus:border-[#FA9411] focus:ring-2 focus:ring-[#FA9411]/20"
                          />
                          <button
                            type="submit"
                            disabled={renameMutation.isPending}
                            className="p-1.5 text-[#FA9411] hover:bg-orange-50 rounded-lg transition-all"
                          >
                            {renameMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle className="w-4 h-4" />
                            )}
                          </button>
                        </form>
                      ) : (
                        <>
                          <span className="font-bold text-gray-900 text-lg">
                            {enrollment.name || 'General Setup'}
                          </span>
                          {enrollment.is_active && (
                            <button
                              onClick={() => startRenaming(enrollment)}
                              className="p-1.5 text-gray-300 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                              title="Rename"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex items-center mt-1 text-sm text-gray-500">
                      <span className="font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-100 truncate max-w-xs">
                        {enrollment.token}
                      </span>
                      <button
                        onClick={() => copyToken(enrollment.token)}
                        className="ml-2 p-1.5 hover:bg-white hover:shadow-sm rounded-lg transition-all"
                        title="Copy Setup Code"
                      >
                        {copied === enrollment.token ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <div className="text-sm font-bold text-gray-900">
                      {enrollment.current_uses}
                      {enrollment.max_uses ? ` / ${enrollment.max_uses}` : ''} uses
                    </div>
                    <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold mt-1">
                      Created {new Date(enrollment.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  {enrollment.is_active && (
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this link?')) {
                          deactivateMutation.mutate(enrollment.id)
                        }
                      }}
                      disabled={deactivateMutation.isPending}
                      className="p-3 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                      title="Delete Link"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-20 text-center">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <QrCode className="w-10 h-10 text-gray-300" />
            </div>
            <p className="text-xl font-bold text-gray-900">No setup links found</p>
            <p className="text-gray-500 mt-2">
              Generate a code to start connecting phones
            </p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 animate-slide-up shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Create Setup Link</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">
                  Name (optional)
                </label>
                <input
                  type="text"
                  value={newEnrollment.name}
                  onChange={(e) => setNewEnrollment(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Warehouse Tablets"
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:outline-none focus:border-[#FA9411] focus:ring-2 focus:ring-[#FA9411]/20 transition-all text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">
                  Usage Limit (optional)
                </label>
                <input
                  type="number"
                  value={newEnrollment.max_uses}
                  onChange={(e) => setNewEnrollment(prev => ({ ...prev, max_uses: e.target.value }))}
                  placeholder="Unlimited"
                  className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:outline-none focus:border-[#FA9411] focus:ring-2 focus:ring-[#FA9411]/20 transition-all text-gray-900"
                />
              </div>
            </div>

            <div className="flex gap-4 mt-10">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-4 border border-gray-200 rounded-[1.5rem] font-bold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="flex-1 px-4 py-4 bg-[#FA9411] text-white rounded-[1.5rem] font-bold hover:opacity-90 shadow-lg shadow-orange-200 transition-all disabled:opacity-50 flex items-center justify-center"
              >
                {createMutation.isPending ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  'Create Setup Link'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
