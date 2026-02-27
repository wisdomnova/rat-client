import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, MoreVertical, Shield, X, Loader2, AlertCircle } from 'lucide-react'
import axios from 'axios'

export default function Users() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'admin'
  })

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await axios.get('/api/v1/auth/me')
      const user = response.data.data
      return user ? [user] : []
    }
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await axios.post('/api/v1/auth/register', {
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
        role: newUser.role
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setShowModal(false)
      setNewUser({ name: '', email: '', password: '', role: 'admin' })
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Failed to create user')
    }
  })

  if (isLoading) return <div>Loading...</div>

  return (
    <div className="animate-fade-in text-black">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold ">Administrator Accounts</h1>
          <p className="text-gray-500 mt-1">Manage personnel access levels and audit capabilities</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          Invite User
        </button>
      </div>

      {/* Note about single-admin mode */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-start">
        <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-yellow-800">
          <strong>Single Admin Mode:</strong> This system is currently configured with a single hardcoded admin account from environment variables. 
          User registration creates records but authentication uses ENV credentials only.
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-6 py-4 font-medium">Name</th>
              <th className="px-6 py-4 font-medium">Email</th>
              <th className="px-6 py-4 font-medium">Role</th>
              <th className="px-6 py-4 font-medium">Last Login</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users?.map((user: any) => (
              <tr key={user.id} className="hover:bg-gray-50 group">
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-gray-900 text-white rounded-full flex items-center justify-center font-bold text-xs mr-3">
                      {user.name?.charAt(0) || 'A'}
                    </div>
                    <span className="font-medium">{user.name || 'Admin'}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-500">{user.email}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <Shield className="w-3 h-3 mr-1 text-black" />
                    <span className="capitalize">{user.role}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-500">
                  {user.last_login ? new Date(user.last_login).toLocaleString() : 'Just now'}
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="p-1 hover:bg-gray-100 rounded-lg">
                    <MoreVertical className="w-4 h-4 text-gray-400" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invite User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Invite Administrator</h2>
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
                  Full Name *
                </label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="John Smith"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-black transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="john@company.com"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-black transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Minimum 8 characters"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-black transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-black transition-colors"
                >
                  <option value="admin">Administrator</option>
                  <option value="viewer">Viewer (Read-only)</option>
                </select>
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
                disabled={createMutation.isPending || !newUser.name || !newUser.email || !newUser.password}
                className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                {createMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Send Invite'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
