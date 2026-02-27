import { useQuery } from '@tanstack/react-query'
import { Clock, User, Tablet, Shield } from 'lucide-react'
import axios from 'axios'

export default function AuditLogs() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      const response = await axios.get('/api/v1/audit')
      return response.data.data
    },
    refetchInterval: 10000
  })

  if (isLoading) return <div className="p-8">Loading audit trail...</div>

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Audit Trail</h1>
        <p className="text-gray-500 mt-1">Review all administrative actions and security events</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase text-xs">
            <tr>
              <th className="px-6 py-4 font-medium">Timestamp</th>
              <th className="px-6 py-4 font-medium">Actor</th>
              <th className="px-6 py-4 font-medium">Action</th>
              <th className="px-6 py-4 font-medium">Target</th>
              <th className="px-6 py-4 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data?.logs.map((log: any) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                  <div className="flex items-center">
                    <Clock className="w-3 h-3 mr-2" />
                    {new Date(log.created_at).toLocaleString()}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <User className="w-3 h-3 mr-2 text-gray-400" />
                    <span className="font-medium">{log.user_id ? 'Administrator' : 'System'}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                    log.action.includes('DELETE') || log.action.includes('WIPE') 
                      ? 'bg-red-50 text-red-600' 
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {log.action.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center text-gray-600">
                    {log.target_type === 'DEVICE' ? <Tablet className="w-3 h-3 mr-2" /> : <Shield className="w-3 h-3 mr-2" />}
                    {log.target_id.substring(0, 8)}...
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-500 truncate max-w-xs px-2">
                  {JSON.stringify(log.metadata)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
