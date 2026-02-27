import { useNavigate } from 'react-router-dom'
import { Radio, Mic, ArrowRight, Music } from 'lucide-react'

export default function AudioHub() {
  const navigate = useNavigate()

  const options = [
    {
      title: 'Voice Announcement',
      description: 'Send a live voice message to everyone or a specific team at once.',
      icon: Radio,
      to: '/audio/broadcast',
      color: '#FA9411',
      bg: 'bg-orange-50'
    },
    {
      title: 'Direct Voice Link',
      description: 'Speak to a specific Device directly from your dashboard.',
      icon: Mic,
      to: '/devices',
      color: '#000000',
      bg: 'bg-gray-50'
    }
  ]

  return (
    <div className="mx-auto space-y-12">  
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Audio Controls</h1>
        <p className="text-gray-500 font-medium mt-1">
          Manage live voice transmissions and announcements across your fleet.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {options.map((opt) => (
          <button
            key={opt.title}
            onClick={() => navigate(opt.to)}
            className="group relative flex flex-col items-start p-10 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm transition-all hover:shadow-xl hover:-translate-y-1 text-left"
          >
            <div className={`w-16 h-16 rounded-[1.5rem] ${opt.bg} flex items-center justify-center mb-8 group-hover:scale-110 transition-transform`}>
              <opt.icon className="w-8 h-8" style={{ color: opt.color }} />
            </div>
            
            <h3 className="text-2xl font-bold text-gray-900 mb-3">{opt.title}</h3>
            <p className="text-gray-500 font-medium leading-relaxed mb-8">
              {opt.description}
            </p>

            <div className="mt-auto flex items-center gap-2 font-bold text-[10px] uppercase tracking-widest" style={{ color: opt.color }}>
              Open Controls
              <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" />
            </div>
          </button>
        ))}
      </div>

      {/* Info Card */}
      <div className="bg-black rounded-[2.5rem] p-10 text-white relative overflow-hidden group">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-[#FA9411] opacity-10 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-1000" />
        
        <div className="flex flex-col md:flex-row md:items-center gap-8 relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <Music className="w-8 h-8 text-[#FA9411]" />
          </div>
          <div>
            <h4 className="text-xl font-bold mb-2">Technical Summary</h4>
            <p className="text-white/60 font-medium text-sm leading-relaxed max-w-2xl">
              All audio is streamed using the 8kHz PCM protocol. This ensures that even Devices on very weak 
              2G or 3G office networks can receive your voice clearly with minimal delay.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
