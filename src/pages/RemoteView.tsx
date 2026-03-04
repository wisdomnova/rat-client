import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { devicesAPI, streamingAPI } from '../api'
import { getWsUrl } from '../api/ws'
import { useAuthStore } from '../stores/authStore'
import { 
  ArrowLeft, 
  Monitor, 
  MonitorOff, 
  Maximize2,
  Minimize2,
  Loader2,
  Tablet,
  MousePointer,
  Keyboard,
  Home,
  ChevronLeft,
  Square,
  Wifi,
  WifiOff,
  Power,
  RotateCcw,
  Lock,
  ShieldOff,
  Shield,
  ChevronDown
} from 'lucide-react'

interface SignalMessage {
  type: string
  session_id?: string
  device_id?: string
  payload?: any
}

export default function RemoteView() {
  const { id: deviceId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  
  const [isConnecting, setIsConnecting] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quality, setQuality] = useState('auto')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [fps, setFps] = useState(0)
  const [latency, setLatency] = useState(0)
  const [interactionMode, setInteractionMode] = useState(true)  // true = mouse mode
  const [mouseCanvasPos, setMouseCanvasPos] = useState<{ x: number; y: number; visible: boolean } | null>(null)
  const [isClicked, setIsClicked] = useState(false)
  const [isInputLocked, setIsInputLocked] = useState(false)  // blocks local user touch on device
  const [connectStatus, setConnectStatus] = useState('')      // progress text during connection
  
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fpsCountRef = useRef(0)
  const lastFpsTimeRef = useRef(Date.now())
  const lastFrameTimeRef = useRef(Date.now())
  const isDecodingRef = useRef(false)
  const pendingFrameRef = useRef<ArrayBuffer | null>(null)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const dragStartTimeRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)
  const isStreamingRef = useRef(false)
  const sessionIdRef = useRef<string | null>(null)
  
  // Overscan size in CSS pixels - allows edge swipes like AnyDesk
  const OVERSCAN = 32
  
  const { data: device } = useQuery({
    queryKey: ['device', deviceId],
    queryFn: () => devicesAPI.get(deviceId!),
    enabled: !!deviceId,
    staleTime: 5 * 60 * 1000,
  })
  
  // Helper: send START_STREAMING command to device
  const sendStartStreamingCommand = useCallback(async (sid: string) => {
    const token = useAuthStore.getState().accessToken || ''
    await fetch(`/api/v1/devices/${deviceId}/commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        command_type: 'START_STREAMING',
        payload: { session_id: sid, quality }
      })
    })
  }, [deviceId, quality])

  // Clear all retry/timeout timers
  const clearTimers = useCallback(() => {
    if (retryTimerRef.current) { clearInterval(retryTimerRef.current); retryTimerRef.current = null }
    if (timeoutTimerRef.current) { clearTimeout(timeoutTimerRef.current); timeoutTimerRef.current = null }
  }, [])

  // Create streaming session + send START_STREAMING command with auto-retry
  const createSessionMutation = useMutation({
    mutationFn: async () => {
      setConnectStatus('Creating session...')
      
      // 1. Create session on backend
      const session = await streamingAPI.createSession(deviceId!, quality)
      const sid = session.session_id
      setSessionId(sid)
      sessionIdRef.current = sid
      retryCountRef.current = 0
      
      setConnectStatus('Connecting to relay...')
      
      // 2. Connect WebSocket immediately
      connectWebSocket(sid)
      
      // 3. Send START_STREAMING command to device
      setConnectStatus('Sending command to device...')
      await sendStartStreamingCommand(sid)
      
      // 4. Start retry loop — re-send the command every 6s until device connects.
      // The device polls for commands every 5s so this ensures at least one
      // command is always waiting in the queue.
      retryTimerRef.current = setInterval(async () => {
        if (isStreamingRef.current) {
          // Device connected — stop retrying
          clearTimers()
          return
        }
        retryCountRef.current++
        setConnectStatus(`Waiting for device... (attempt ${retryCountRef.current + 1})`)
        try {
          await sendStartStreamingCommand(sid)
          console.log(`Retry #${retryCountRef.current}: re-sent START_STREAMING for ${sid}`)
        } catch (e) {
          console.warn('Retry command send failed:', e)
        }
      }, 6000)

      // 5. Hard timeout — if no streaming_started after 45s, give up
      timeoutTimerRef.current = setTimeout(() => {
        if (!isStreamingRef.current) {
          clearTimers()
          setError('Connection timed out. Device may be offline or unreachable. Try again.')
          setIsConnecting(false)
          // Clean up WebSocket
          wsRef.current?.close()
          wsRef.current = null
        }
      }, 45000)
      
      return sid
    },
    onError: (err: any) => {
      clearTimers()
      setError(err.message || 'Failed to create session')
      setIsConnecting(false)
    }
  })
  
  const connectWebSocket = useCallback((sid: string) => {
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
    }
    
    const wsUrl = getWsUrl(`/ws/viewer/${sid}`)
    
    console.log('Connecting viewer WS to', wsUrl)
    const ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws
    
    ws.onopen = () => {
      console.log('Viewer WebSocket connected')
      setConnectStatus('Relay connected, waiting for device...')
    }
    
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary frame = JPEG image
        renderFrame(event.data)
      } else {
        // JSON control message
        try {
          const msg: SignalMessage = JSON.parse(event.data)
          handleSignalMessage(msg)
        } catch (e) {
          console.error('Failed to parse message:', e)
        }
      }
    }
    
    ws.onerror = (event) => {
      console.error('WebSocket error:', event)
      // Don't set error immediately — retry will handle it
      if (!isStreamingRef.current) {
        setConnectStatus('Connection hiccup, retrying...')
      }
    }
    
    ws.onclose = () => {
      console.log('WebSocket closed')
      if (isStreamingRef.current) {
        // Was streaming and lost connection — try to reconnect
        setIsStreaming(false)
        isStreamingRef.current = false
        setConnectStatus('Connection lost, reconnecting...')
        setIsConnecting(true)
        // Reconnect after a short delay
        const currentSid = sessionIdRef.current
        if (currentSid) {
          setTimeout(() => connectWebSocket(currentSid), 1500)
        }
      } else {
        setIsConnecting(false)
      }
    }
  }, [])
  
  const handleSignalMessage = useCallback((msg: SignalMessage) => {
    switch (msg.type) {
      case 'session_info':
        console.log('Session established:', msg.session_id)
        break
        
      case 'streaming_started':
        // Device connected! Stop retrying and clear timeouts
        clearTimers()
        setIsStreaming(true)
        isStreamingRef.current = true
        setIsConnecting(false)
        setConnectStatus('')
        // Focus the container so keyboard events are captured
        setTimeout(() => containerRef.current?.focus(), 100)
        if (msg.payload) {
          setDimensions({
            width: msg.payload.width || 1080,
            height: msg.payload.height || 2400
          })
        }
        break
        
      case 'streaming_stopped':
        setIsStreaming(false)
        isStreamingRef.current = false
        setIsInputLocked(false)
        break
        
      case 'lock_state':
        if (msg.payload) {
          setIsInputLocked(!!msg.payload.locked)
        }
        break
        
      case 'error':
        setError(typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload))
        setIsConnecting(false)
        clearTimers()
        break
    }
  }, [clearTimers])
  
  // Render JPEG frame on canvas — uses createImageBitmap for off-thread
  // decoding and drops frames when the previous decode hasn't finished yet
  // so latency stays bounded.
  const renderFrame = useCallback((data: ArrayBuffer) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // If already decoding, stash this frame — only the latest matters
    if (isDecodingRef.current) {
      pendingFrameRef.current = data
      return
    }

    const decodeAndDraw = (buf: ArrayBuffer) => {
      isDecodingRef.current = true
      const blob = new Blob([buf], { type: 'image/jpeg' })

      createImageBitmap(blob).then((bmp) => {
        // Resize canvas if device resolution changed
        if (canvas.width !== bmp.width || canvas.height !== bmp.height) {
          canvas.width = bmp.width
          canvas.height = bmp.height
          setDimensions({ width: bmp.width, height: bmp.height })
        }

        ctx.drawImage(bmp, 0, 0)
        bmp.close()

        // FPS counter
        fpsCountRef.current++
        const now = Date.now()
        setLatency(now - lastFrameTimeRef.current)
        lastFrameTimeRef.current = now
        if (now - lastFpsTimeRef.current >= 1000) {
          setFps(fpsCountRef.current)
          fpsCountRef.current = 0
          lastFpsTimeRef.current = now
        }

        isDecodingRef.current = false

        // If a newer frame arrived while we were decoding, draw it now
        const pending = pendingFrameRef.current
        if (pending) {
          pendingFrameRef.current = null
          decodeAndDraw(pending)
        }
      }).catch(() => {
        isDecodingRef.current = false
      })
    }

    decodeAndDraw(data)
  }, [])
  
  // Send JSON message to backend (relay to device)
  const sendMessage = useCallback((message: SignalMessage) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }, [])
  
  // Map mouse coordinates from the interaction area to device screen coords.
  // The interaction area includes an overscan border around the canvas
  // so users can start swipes from beyond the screen edge (like AnyDesk).
  // Coordinates are clamped to [0, dimension] so edge swipes work naturally.
  //
  // AnyDesk approach: canvas IS the screen. Mouse position on canvas maps
  // directly to device coords via a simple ratio — no offsets, no tricks.
  // The cursor indicator is drawn at the exact same point that gets sent.
  const mapCoordinates = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    
    const rect = canvas.getBoundingClientRect()
    // Raw position relative to canvas (can be negative due to overscan)
    const rawX = e.clientX - rect.left
    const rawY = e.clientY - rect.top
    // Scale from CSS pixels to device (canvas buffer) pixels — pure 1:1 ratio
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    
    return {
      x: Math.max(0, Math.min(canvas.width, rawX * scaleX)),
      y: Math.max(0, Math.min(canvas.height, rawY * scaleY))
    }
  }, [])
  
  // Mouse handlers for touch simulation
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isStreaming || !interactionMode) return
    e.preventDefault()
    
    const { x, y } = mapCoordinates(e)
    isDraggingRef.current = true
    dragStartRef.current = { x, y }
    dragStartTimeRef.current = Date.now()
    setIsClicked(true)
  }, [isStreaming, interactionMode, mapCoordinates])
  
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    setIsClicked(false)
    if (!isStreaming || !interactionMode || !isDraggingRef.current) return
    e.preventDefault()
    
    const { x, y } = mapCoordinates(e)
    const dx = x - dragStartRef.current.x
    const dy = y - dragStartRef.current.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const elapsed = Date.now() - dragStartTimeRef.current
    
    if (dist < 15 && elapsed < 300) {
      // Quick tap (click)
      sendMessage({
        type: 'input',
        payload: {
          type: 'touch',
          action: 'tap',
          x: dragStartRef.current.x,
          y: dragStartRef.current.y,
          screen_width: dimensions.width,
          screen_height: dimensions.height
        }
      })
    } else if (dist < 15 && elapsed >= 300) {
      // Long press (held in place)
      sendMessage({
        type: 'input',
        payload: {
          type: 'touch',
          action: 'long_press',
          x: dragStartRef.current.x,
          y: dragStartRef.current.y,
          screen_width: dimensions.width,
          screen_height: dimensions.height
        }
      })
    } else {
      // Swipe / drag
      sendMessage({
        type: 'input',
        payload: {
          type: 'touch',
          action: 'swipe',
          x: dragStartRef.current.x,
          y: dragStartRef.current.y,
          delta_x: dx,
          delta_y: dy,
          screen_width: dimensions.width,
          screen_height: dimensions.height
        }
      })
    }
    
    isDraggingRef.current = false
  }, [isStreaming, interactionMode, mapCoordinates, dimensions, sendMessage])
  
  // Right click = long press
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (!isStreaming || !interactionMode) return
    
    const { x, y } = mapCoordinates(e)
    sendMessage({
      type: 'input',
      payload: {
        type: 'touch',
        action: 'long_press',
        x, y,
        screen_width: dimensions.width,
        screen_height: dimensions.height
      }
    })
  }, [isStreaming, interactionMode, mapCoordinates, dimensions, sendMessage])
  
  // Scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!isStreaming || !interactionMode) return
    e.preventDefault()
    
    const { x, y } = mapCoordinates(e as unknown as React.MouseEvent)
    sendMessage({
      type: 'input',
      payload: {
        type: 'scroll',
        action: 'scroll',
        x, y,
        delta_x: e.deltaX,
        delta_y: e.deltaY,
        screen_width: dimensions.width,
        screen_height: dimensions.height
      }
    })
  }, [isStreaming, interactionMode, mapCoordinates, dimensions, sendMessage])
  
  // Track mouse position canvas-relative so the indicator shows
  // exactly where the touch will land (same math as mapCoordinates).
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isStreaming || !interactionMode) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    setMouseCanvasPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      visible: true
    })
  }, [isStreaming, interactionMode])
  
  // Keyboard input — special keys via keydown
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isStreaming || !interactionMode) return
    // Don't capture if user is typing in a real input/select
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    
    const keyMap: Record<string, number> = {
      'Backspace': 67,
      'Enter': 66,
      'Escape': 4,      // BACK
      'Home': 3,
      'Tab': 61,
      'ArrowUp': 19,
      'ArrowDown': 20,
      'ArrowLeft': 21,
      'ArrowRight': 22,
      'Delete': 112,
      ' ': 62,           // SPACE
    }
    
    if (keyMap[e.key]) {
      e.preventDefault()
      sendMessage({
        type: 'input',
        payload: {
          type: 'key',
          action: 'down',
          key_code: keyMap[e.key],
          screen_width: dimensions.width,
          screen_height: dimensions.height
        }
      })
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      // Single printable character (but not Ctrl/Cmd combos)
      e.preventDefault()
      sendMessage({
        type: 'input',
        payload: {
          type: 'key',
          action: 'down',
          character: e.key,
          screen_width: dimensions.width,
          screen_height: dimensions.height
        }
      })
    }
  }, [isStreaming, interactionMode, dimensions, sendMessage])
  
  useEffect(() => {
    if (isStreaming && interactionMode) {
      // Use capture phase to intercept before any element swallows the event
      window.addEventListener('keydown', handleKeyDown, true)
      return () => window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [isStreaming, interactionMode, handleKeyDown])
  
  // Navigation buttons (Back, Home, Recents)
  const sendNavKey = (keyCode: number) => {
    sendMessage({
      type: 'input',
      payload: {
        type: 'key',
        action: 'down',
        key_code: keyCode,
        screen_width: dimensions.width,
        screen_height: dimensions.height
      }
    })
  }
  
  // Send a device command via the REST API (for reboot, shutdown, lock, etc.)
  const sendDeviceCommand = async (commandType: string, payload?: Record<string, unknown>) => {
    if (!deviceId) return
    try {
      const token = useAuthStore.getState().accessToken || ''
      await fetch(`/api/v1/devices/${deviceId}/commands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ command_type: commandType, ...(payload ? { payload } : {}) })
      })
    } catch (e) {
      console.error(`Failed to send ${commandType}:`, e)
    }
  }

  // Toggle local user input lock on the device
  const toggleInputLock = () => {
    const newLockState = !isInputLocked
    sendMessage({
      type: newLockState ? 'lock_input' : 'unlock_input'
    })
    // Optimistic update — will be confirmed by lock_state message from device
    setIsInputLocked(newLockState)
  }

  const startStreaming = () => {
    setIsConnecting(true)
    setError(null)
    setFps(0)
    isStreamingRef.current = false
    retryCountRef.current = 0
    setConnectStatus('Creating session...')
    createSessionMutation.mutate()
  }
  
  const stopStreaming = async () => {
    // Clear all retry/timeout timers
    clearTimers()
    isStreamingRef.current = false
    
    // Unlock input before stopping (safety measure)
    if (isInputLocked) {
      sendMessage({ type: 'unlock_input' })
      setIsInputLocked(false)
    }
    
    // Send STOP_STREAMING command
    if (deviceId) {
      try {
        const token = useAuthStore.getState().accessToken || ''
        await fetch(`/api/v1/devices/${deviceId}/commands`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ command_type: 'STOP_STREAMING' })
        })
      } catch (e) { /* ignore */ }
    }
    
    // End session
    if (sessionId) {
      try {
        await streamingAPI.endSession(sessionId)
      } catch (e) { /* ignore */ }
    }
    
    wsRef.current?.close()
    wsRef.current = null
    setSessionId(null)
    setIsStreaming(false)
    setConnectStatus('')
  }
  
  const toggleFullscreen = async () => {
    if (!containerRef.current) return
    
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen()
      setIsFullscreen(true)
    } else {
      await document.exitFullscreen()
      setIsFullscreen(false)
    }
  }
  
  const changeQuality = (newQuality: string) => {
    setQuality(newQuality)
    if (isStreaming) {
      sendMessage({
        type: 'quality_change',
        payload: newQuality
      })
    }
  }
  
  useEffect(() => {
    return () => {
      clearTimers()
      wsRef.current?.close()
    }
  }, [clearTimers])
  
  return (
    <div className="animate-fade-in h-full flex flex-col space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <button
            onClick={() => navigate(`/devices/${deviceId}`)}
            className="p-4 hover:bg-gray-100 rounded-full transition-all active:scale-90"
          >
            <ArrowLeft className="w-6 h-6 text-gray-400" />
          </button>
          <div>
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
              <Tablet className="w-8 h-8 text-[#FA9411]" />
              Remote Control
            </h1>
            <p className="text-gray-500 font-medium mt-1">
              Active Stream: <span className="text-gray-900 font-bold">{device?.name || device?.model || 'Generic Unit'}</span>
              {device?.serial_number ? ` · ID: ${device.serial_number}` : ''}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Interaction Mode Toggle */}
          {isStreaming && (
            <button
              onClick={() => setInteractionMode(!interactionMode)}
              className={`flex items-center gap-2 px-6 py-3.5 rounded-[1.5rem] text-sm font-bold transition-all active:scale-95 ${
                interactionMode 
                  ? 'bg-black text-white shadow-xl shadow-gray-200' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title={interactionMode ? 'Switch to view-only' : 'Switch to interactive control'}
            >
              <MousePointer className="w-4 h-4" />
              {interactionMode ? 'Control Mode' : 'Observe Mode'}
            </button>
          )}
          
          {/* Quality Selector */}
          <div className="relative group">
            <select
              value={quality}
              onChange={(e) => changeQuality(e.target.value)}
              className="appearance-none bg-white px-6 py-3.5 pr-12 border-2 border-gray-100 rounded-[1.5rem] text-sm font-bold text-gray-900 focus:outline-none focus:border-[#FA9411] transition-all cursor-pointer"
            >
              <option value="auto">Auto Stream</option>
              <option value="low">Low Bandwidth</option>
              <option value="medium">Standard High</option>
              <option value="high">Ultra Fidelity</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none group-focus-within:text-[#FA9411] transition-colors" />
          </div>
          
          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            disabled={!isStreaming}
            className="p-4 bg-white border-2 border-gray-100 rounded-full hover:bg-gray-50 text-gray-400 hover:text-gray-900 disabled:opacity-50 transition-all active:scale-90"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
          
          {/* Connect/Disconnect */}
          {isStreaming ? (
            <button
              onClick={stopStreaming}
              className="flex items-center gap-2 px-8 py-3.5 bg-red-50 text-red-600 rounded-[1.5rem] font-bold hover:bg-red-100 transition-all active:scale-95"
            >
              <MonitorOff className="w-4 h-4" />
              End Session
            </button>
          ) : (
            <button
              onClick={startStreaming}
              disabled={isConnecting || device?.status !== 'online'}
              className="flex items-center gap-2 px-8 py-3.5 bg-black text-white rounded-[1.5rem] font-bold hover:bg-gray-800 transition-all active:scale-95 shadow-xl shadow-gray-200 disabled:opacity-50 disabled:bg-gray-400"
            >
              {isConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#FA9411]" />
              ) : (
                <Monitor className="w-4 h-4 text-[#FA9411]" />
              )}
              {isConnecting ? 'Booting Connection...' : 'Start Control'}
            </button>
          )}
        </div>
      </div>
      
      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 px-8 py-5 rounded-[2rem] font-bold shadow-sm animate-in slide-in-from-top-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-black text-xl leading-none">&times;</button>
        </div>
      ) /* Lines 517-814 omitted */}

      
      {/* Main Content */}
      <div className="flex-1 flex gap-6 min-h-0">
        {/* Device Screen */}
        <div 
          ref={containerRef}
          tabIndex={0}
          className="flex-1 bg-black rounded-[2.5rem] border-8 border-gray-950 overflow-hidden flex items-center justify-center relative outline-none min-h-[600px] shadow-2xl transition-all"
        >
          {!isStreaming && !isConnecting && (
            <div className="text-center p-12 bg-gray-950/50 rounded-[2rem] border border-white/5 backdrop-blur-xl">
              <div className="w-24 h-24 bg-white/5 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl border border-white/10">
                <Monitor className="w-12 h-12 text-[#FA9411] opacity-50" />
              </div>
              <p className="text-2xl font-bold text-white mb-2 tracking-tight">Remote Control</p>
              <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest">{device?.model || 'Select Model'}</p>
              
              <div className="mt-8 space-y-4">
                <p className="text-sm text-gray-400 font-medium">
                  Remote handshake required to begin stream.
                </p>
                {device?.status !== 'online' ? (
                  <div className="inline-flex items-center gap-2 bg-red-500/10 text-red-500 px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest border border-red-500/20">
                    <WifiOff className="w-4 h-4" />
                    Device Unreachable
                  </div>
                ) : (
                  <button 
                    onClick={startStreaming}
                    className="inline-flex items-center gap-2 bg-[#FA9411] text-white px-8 py-3 rounded-[1.5rem] font-bold text-sm hover:scale-105 transition-all shadow-[0_0_20px_rgba(250,148,17,0.3)]"
                  >
                    Control Now
                  </button>
                )}
              </div>
            </div>
          )}
          
          {isConnecting && (
            <div className="text-center">
              <div className="relative w-24 h-24 mx-auto mb-8">
                <div className="absolute inset-0 border-4 border-[#FA9411]/20 rounded-full" />
                <div className="absolute inset-0 border-4 border-t-[#FA9411] rounded-full animate-spin" />
                <Loader2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-[#FA9411] animate-pulse" />
              </div>
              <p className="text-xl font-bold text-white tracking-tight">
                {connectStatus || 'Syncing Interface...'}
              </p>
              <p className="text-sm text-gray-500 mt-2 font-medium">
                {retryCountRef.current > 0 
                  ? `Attempt ${retryCountRef.current + 1} — Reaching device...`
                  : 'Waiting for hardware handshake'
                }
              </p>
            </div>
          )}
          
          {/* AnyDesk-style interaction wrapper */}
          <div
            className={`relative ${isStreaming ? 'flex' : 'hidden'} items-center justify-center w-full h-full`}
            style={{
              padding: OVERSCAN,
              cursor: interactionMode ? 'none' : 'default',
            }}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setMouseCanvasPos(null)}
            onContextMenu={handleContextMenu}
            onWheel={handleWheel}
          >
            {/* Edge hint indicators */}
            <div className="absolute inset-0 pointer-events-none p-4">
              {/* Top edge */}
              <div className="absolute top-8 left-1/2 -translate-x-1/2 w-16 h-1.5 bg-white/10 rounded-full backdrop-blur-sm" />
              {/* Bottom edge */}
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-16 h-1.5 bg-white/10 rounded-full backdrop-blur-sm" />
            </div>
            
            <canvas
              ref={canvasRef}
              className="max-w-full shadow-[0_0_50px_rgba(0,0,0,0.5)] transition-all"
              style={{
                imageRendering: 'auto',
                maxHeight: '100%',
                borderRadius: 12,
              }}
            />
            {/* Mouse indicator — positioned relative to canvas so it
                shows the EXACT point that mapCoordinates sends to the device */}
            {isStreaming && interactionMode && mouseCanvasPos?.visible && canvasRef.current && (() => {
              const cr = canvasRef.current!.getBoundingClientRect()
              const wr = canvasRef.current!.parentElement!.getBoundingClientRect()
              // Offset of canvas within the wrapper (accounts for overscan padding + flex centering)
              const offsetX = cr.left - wr.left + mouseCanvasPos.x
              const offsetY = cr.top - wr.top + mouseCanvasPos.y
              return (
                <div
                  className="absolute pointer-events-none z-50 flex items-center justify-center"
                  style={{
                    left: offsetX,
                    top: offsetY,
                    width: 32,
                    height: 32,
                    marginLeft: -16,
                    marginTop: -16,
                    border: '2px solid #FA9411',
                    borderRadius: '50%',
                    boxShadow: '0 0 15px rgba(250,148,17,0.6)',
                    transform: isClicked ? 'scale(0.85)' : 'scale(1)',
                    backgroundColor: isClicked ? 'rgba(250,148,17,0.2)' : 'transparent',
                    transition: 'transform 75ms, background-color 75ms',
                  }}
                >
                  <div style={{
                    width: 6,
                    height: 6,
                    backgroundColor: '#FA9411',
                    borderRadius: '50%',
                    transform: isClicked ? 'scale(1.5)' : 'scale(1)',
                    transition: 'transform 75ms',
                  }} />
                </div>
              )
            })()}
          </div>
          
          {/* Connection Status Indicator */}
          {isStreaming && (
            <div className="absolute bottom-6 left-6 flex items-center gap-6 bg-black/40 backdrop-blur-md border border-white/10 text-white px-6 py-3 rounded-full font-bold text-[10px] uppercase tracking-widest shadow-2xl">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_12px_#22c55e]" />
                Live Broadcast
              </div>
              <div className="w-px h-4 bg-white/10" />
              <div className="flex items-center gap-4 text-white/60">
                <span>{fps} Smoothness</span>
                <span>{latency}ms Delay</span>
              </div>
            </div>
          )}
        </div>
        
        {/* Right Panel - Navigation Buttons */}
        {isStreaming && (
          <div className="w-24 flex flex-col items-center justify-center gap-6">
            {/* Input Lock Toggle — blocks local user from touching the device */}
            <div className={`rounded-[2rem] border-2 p-3 flex flex-col gap-2 shadow-sm transition-all ${
              isInputLocked 
                ? 'bg-[#FA9411]/10 border-[#FA9411]/30' 
                : 'bg-white border-gray-100'
            }`}>
              <button
                onClick={toggleInputLock}
                className={`p-4 rounded-[1.5rem] transition-all active:scale-90 ${
                  isInputLocked
                    ? 'bg-[#FA9411] text-white shadow-lg shadow-[#FA9411]/30'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-black'
                }`}
                title={isInputLocked ? 'Unlock device input (let user touch)' : 'Lock device input (only you can control)'}
              >
                {isInputLocked ? <Shield className="w-6 h-6" /> : <ShieldOff className="w-6 h-6" />}
              </button>
              <div className="text-[8px] font-black uppercase tracking-widest text-center leading-tight px-1">
                {isInputLocked ? (
                  <span className="text-[#FA9411]">User Locked</span>
                ) : (
                  <span className="text-gray-400">User Free</span>
                )}
              </div>
            </div>

            {/* Android Nav Buttons */}
            <div className="bg-white rounded-[2rem] border-2 border-gray-100 p-3 flex flex-col gap-4 shadow-sm">
              <button
                onClick={() => sendNavKey(4)}
                className="p-4 rounded-[1.5rem] bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-black transition-all active:scale-90"
                title="System Back"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={() => sendNavKey(3)}
                className="p-4 rounded-[1.5rem] bg-[#FA9411]/10 text-[#FA9411] hover:bg-[#FA9411] hover:text-white transition-all active:scale-90 shadow-sm"
                title="System Home"
              >
                <Home className="w-6 h-6" />
              </button>
              <button
                onClick={() => sendNavKey(187)}
                className="p-4 rounded-[1.5rem] bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-black transition-all active:scale-90"
                title="Task Switcher"
              >
                <Square className="w-6 h-6" />
              </button>
            </div>
            
            {/* Screen & Volume */}
            <div className="bg-white rounded-[2rem] border-2 border-gray-100 p-3 flex flex-col gap-4 shadow-sm">
              <button
                onClick={() => sendNavKey(26)}
                className="p-4 rounded-[1.5rem] bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-black transition-all active:scale-90"
                title="Device Lock"
              >
                <Lock className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  sendMessage({
                    type: 'input',
                    payload: {
                      type: 'touch',
                      action: 'swipe',
                      x: dimensions.width / 2,
                      y: 0,
                      delta_x: 0,
                      delta_y: dimensions.height * 0.4,
                      screen_width: dimensions.width,
                      screen_height: dimensions.height
                    }
                  })
                }}
                className="p-4 rounded-[1.5rem] bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-black transition-all active:scale-90"
                title="System Feed"
              >
                <ChevronDown className="w-6 h-6" />
              </button>
              <div className="w-full h-px bg-gray-100 mx-auto" />
              <button
                onClick={() => sendNavKey(24)}
                className="p-4 rounded-[1.5rem] bg-gray-50 hover:bg-gray-100 text-[10px] font-bold text-gray-500 hover:text-black transition-all active:scale-90"
                title="Louder"
              >
                V+
              </button>
              <button
                onClick={() => sendNavKey(25)}
                className="p-4 rounded-[1.5rem] bg-gray-50 hover:bg-gray-100 text-[10px] font-bold text-gray-500 hover:text-black transition-all active:scale-90"
                title="Quieter"
              >
                V-
              </button>
            </div>
            
            {/* Power Actions */}
            <div className="bg-red-50 rounded-[2rem] border-2 border-red-100 p-3 flex flex-col gap-4 shadow-sm">
              <button
                onClick={() => {
                  if (confirm('Soft reboot this Device?')) sendDeviceCommand('REBOOT')
                }}
                className="p-4 rounded-[1.5rem] bg-white text-orange-600 hover:bg-orange-600 hover:text-white transition-all active:scale-90 shadow-sm"
                title="Soft Reboot"
              >
                <RotateCcw className="w-6 h-6" />
              </button>
              <button
                onClick={() => {
                  if (confirm('Hard shutdown? You will lose control immediately.')) sendDeviceCommand('SHELL_COMMAND', { command: 'reboot -p' })
                }}
                className="p-4 rounded-[1.5rem] bg-white text-red-600 hover:bg-red-600 hover:text-white transition-all active:scale-90 shadow-sm"
                title="Hard Shutdown"
              >
                <Power className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Bottom Interface Stats */}
      {isStreaming && (
        <div className="bg-white rounded-[2rem] border-2 border-gray-50 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm border-b-4 border-b-[#FA9411]/20">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-50 rounded-xl">
                <Wifi className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Tunnel Status</div>
                <div className="text-sm font-bold text-gray-900 leading-none">Secured & Active</div>
              </div>
            </div>
            
            <div className="w-px h-8 bg-gray-100" />
            
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Canvas Scale</div>
              <div className="text-sm font-bold text-gray-900 leading-none">{dimensions.width} &times; {dimensions.height}</div>
            </div>

            <div className="w-px h-8 bg-gray-100" />

            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Fidelity Mode</div>
              <div className="text-sm font-bold text-[#FA9411] leading-none uppercase tracking-tighter">{quality} Profile</div>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 bg-gray-50 px-6 py-3 rounded-2xl border border-gray-100">
              <Keyboard className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-bold text-gray-600">
                {interactionMode ? 'Remote Input Enabled' : 'Watch Only Mode'}
              </span>
            </div>

            {isInputLocked && (
              <div className="flex items-center gap-2 bg-[#FA9411]/10 px-5 py-3 rounded-2xl border border-[#FA9411]/20">
                <Shield className="w-4 h-4 text-[#FA9411]" />
                <span className="text-sm font-bold text-[#FA9411]">User Input Locked</span>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_#22c55e]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#FA9411]">Live Broadcast</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
