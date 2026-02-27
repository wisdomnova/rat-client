import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { authAPI } from '../api'
import { QrCode, Loader2 } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await authAPI.login(email, password)
      setAuth(response.user, response.access_token, response.refresh_token)
      navigate('/')
    } catch (err) {
      setError('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center mb-12">
          <QrCode className="w-10 h-10 text-[#FA9411] mr-3" />
          <span className="text-gray-900 text-3xl font-bold tracking-tight">
            MDM Control
          </span>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 text-gray-900 rounded-[1.5rem] font-bold focus:outline-none focus:border-[#FA9411] transition-all placeholder:text-gray-400 shadow-xl shadow-gray-100/50"
              placeholder="admin@example.com"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
              Secret Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-5 py-4 bg-gray-50 border-2 border-gray-100 text-gray-900 rounded-[1.5rem] font-bold focus:outline-none focus:border-[#FA9411] transition-all placeholder:text-gray-400 shadow-xl shadow-gray-100/50"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="text-red-500 text-xs font-bold text-center bg-red-50 py-3 rounded-xl border border-red-100">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-[#FA9411] text-white font-bold rounded-[1.5rem] hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-xl shadow-orange-100 text-lg"
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <p className="mt-12 text-center text-gray-400 text-[10px] font-bold uppercase tracking-widest">
          Device Control System v1.0
        </p>
      </div>
    </div>
  )
}
