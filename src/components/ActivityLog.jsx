// Copyright (c) 2025 Bulwk. All rights reserved.
// Licensed under Bulwk Proprietary License
// Full terms: ipfs://QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D

import { useState, useEffect, useRef } from 'react'

export default function ActivityLog() {
  const [logs, setLogs] = useState([])
  const [autoScroll, setAutoScroll] = useState(true)
  const logContainerRef = useRef(null)
  const eventSourceRef = useRef(null)
  const scrollTimeoutRef = useRef(null)

  useEffect(() => {
    // Fetch initial logs
    fetch('/api/activity-logs')
      .then(res => res.json())
      .then(data => {
        if (data.logs) {
          setLogs(data.logs)
        }
      })
      .catch(err => console.error('Failed to fetch logs:', err))

    // Connect to activity log stream (Server-Sent Events)
    const eventSource = new EventSource('/api/activity-logs/stream')
    eventSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'init') {
          // Initial log batch
          setLogs(data.logs)
        } else if (data.type === 'log') {
          // New log entry
          setLogs(prev => [...prev, data.entry])
        }
      } catch (err) {
        console.error('Failed to parse log event:', err)
      }
    }

    eventSource.onerror = (err) => {
      console.error('Activity log stream error:', err)
      // Auto-reconnect is handled by EventSource
    }

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      // Use requestAnimationFrame to ensure DOM is updated before scrolling
      requestAnimationFrame(() => {
        if (logContainerRef.current) {
          logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
        }
      })
    }
  }, [logs, autoScroll])

  // Detect user wheel/touch input (not scroll position) to pause auto-scroll
  const handleUserScrollInput = (event) => {
    if (!logContainerRef.current || !autoScroll) return

    // User is actively scrolling with wheel/touch - check if scrolling up
    // deltaY < 0 = scrolling UP, deltaY > 0 = scrolling DOWN
    if (event.deltaY < 0) {
      // User scrolled UP - pause auto-scroll
      setAutoScroll(false)
    }
  }

  // Re-enable auto-scroll when user scrolls back to bottom
  const handleScroll = () => {
    if (!logContainerRef.current || autoScroll) return

    // Only check position if auto-scroll is currently paused
    // This re-enables auto-scroll when user manually scrolls to bottom
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }

    scrollTimeoutRef.current = setTimeout(() => {
      if (!logContainerRef.current) return

      const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      const isAtBottom = distanceFromBottom < 10

      if (isAtBottom) {
        setAutoScroll(true)
      }
    }, 150)
  }

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const getLogColor = (message) => {
    if (message.includes('✅') || message.includes('SUCCESS')) return 'text-green-400'
    if (message.includes('❌') || message.includes('ERROR') || message.includes('Failed')) return 'text-red-400'
    if (message.includes('⚠️') || message.includes('WARN')) return 'text-yellow-400'
    if (message.includes('🔄') || message.includes('Executing')) return 'text-cyan-400'
    if (message.includes('📊') || message.includes('Quote')) return 'text-blue-400'
    if (message.includes('💰') || message.includes('balance')) return 'text-green-300'
    return 'text-cyan-300/80'
  }

  return (
    <div className="card bg-black/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-cyan-100">📝 Activity Log</h3>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 text-xs ${autoScroll ? 'text-green-400' : 'text-gray-400'}`}>
            <div className={`w-2 h-2 rounded-full ${autoScroll ? 'bg-green-400 pulse' : 'bg-gray-400'}`}></div>
            {autoScroll ? 'Auto-scroll' : 'Paused'}
          </div>
          <button
            onClick={() => setLogs([])}
            className="text-xs text-cyan-400/60 hover:text-cyan-400 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      <div
        ref={logContainerRef}
        onScroll={handleScroll}
        onWheel={handleUserScrollInput}
        className="bg-black/30 border border-cyan-400/20 rounded-lg p-3 h-[400px] overflow-y-auto font-mono text-xs"
        style={{ scrollBehavior: autoScroll ? 'smooth' : 'auto' }}
      >
        {logs.length === 0 ? (
          <div className="text-cyan-300/50 text-center py-8">
            No activity yet. Waiting for events...
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log, index) => (
              <div key={index} className="flex gap-2">
                <span className="text-cyan-500/50 flex-shrink-0 select-none">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span className={`${getLogColor(log.message)} break-all`}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 text-xs text-cyan-400/50 text-center">
        {logs.length} log entr{logs.length === 1 ? 'y' : 'ies'}
      </div>
    </div>
  )
}
