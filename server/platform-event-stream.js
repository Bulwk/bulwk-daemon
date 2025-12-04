// Copyright (c) 2025 Bulwk. All rights reserved.
// Licensed under Bulwk Proprietary License
// Full terms: ipfs://QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D

import WebSocket from 'ws'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Read version from package.json
function getDaemonVersion() {
  try {
    const packagePath = path.join(__dirname, '..', 'package.json')
    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
    return packageData.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

class PlatformEventStream {
  constructor(config = {}) {
    // Store as HTTPS, convert to WSS when building WebSocket URL
    this.platformUrl = config.platformUrl || 'https://app.bulwk.com'
    this.walletAddress = config.walletAddress
    this.jwtToken = config.jwtToken || null
    this.ws = null
    this.reconnectTimeout = null
    this.reconnectDelay = 5000 // Start with 5 seconds
    this.maxReconnectDelay = 60000 // Max 1 minute
    this.isConnecting = false
    this.enabled = config.enabled !== false // Default to enabled
    // NOTE: WebSocket URL is fetched from platform API for security
    this.log = config.log || console.log
    this.pendingEvents = [] // Queue events while disconnected
    this.maxPendingEvents = 100
    this.wsUrl = null // Will be fetched from server
    this.version = getDaemonVersion()
    this.onUpdateAvailable = config.onUpdateAvailable || null // Callback for update notifications
  }

  /**
   * Fetch WebSocket URL from platform API
   */
  async fetchWebSocketUrl() {
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (this.jwtToken) {
        headers['Authorization'] = `Bearer ${this.jwtToken}`
      }

      const response = await fetch(`${this.platformUrl}/api/daemon/ws-url`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          wallet: this.walletAddress,
          sessionToken: this.jwtToken
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch WS URL: ${response.status}`)
      }

      const data = await response.json()
      this.wsUrl = data.wsUrl
      return data.wsUrl
    } catch (error) {
      this.log('❌ Failed to fetch WebSocket URL:', error.message)
      return null
    }
  }

  /**
   * Connect to platform WebSocket server
   */
  async connect() {
    if (!this.enabled) {
      this.log('📡 Platform event streaming disabled')
      return
    }

    if (!this.walletAddress) {
      this.log('⚠️ Cannot connect to platform - no wallet address configured')
      return
    }

    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return
    }

    this.isConnecting = true

    try {
      // Fetch secure WebSocket URL from platform
      // This prevents exposing Railway infrastructure in client code
      const wsUrl = await this.fetchWebSocketUrl()
      if (!wsUrl) {
        throw new Error('Failed to obtain WebSocket URL from platform')
      }

      this.log(`📡 Connecting to platform event stream...`)
      this.ws = new WebSocket(wsUrl)

      this.ws.on('open', () => {
        this.log('✅ Connected to platform event stream')
        this.isConnecting = false
        this.reconnectDelay = 5000 // Reset delay on successful connection

        // Send any pending events
        this.flushPendingEvents()

        // Send initial connection event with version
        this.emit('daemon_connected', {
          walletAddress: this.walletAddress,
          version: this.version,
          timestamp: Date.now()
        })
      })

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString())
          this.handlePlatformMessage(message)
        } catch (error) {
          this.log('⚠️ Failed to parse platform message:', error.message)
        }
      })

      this.ws.on('error', (error) => {
        this.log('❌ Platform WebSocket error:', error.message)
      })

      this.ws.on('close', () => {
        this.log('🔌 Disconnected from platform event stream')
        this.isConnecting = false
        this.ws = null

        // Auto-reconnect
        if (this.enabled) {
          this.scheduleReconnect()
        }
      })

    } catch (error) {
      this.log('❌ Failed to connect to platform:', error.message)
      this.isConnecting = false
      this.scheduleReconnect()
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }

    this.log(`🔄 Scheduling reconnect in ${this.reconnectDelay / 1000}s...`)

    this.reconnectTimeout = setTimeout(() => {
      this.connect()
    }, this.reconnectDelay)

    // Increase delay for next attempt (exponential backoff)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
  }

  /**
   * Handle messages from platform (ack, errors, update notifications, etc.)
   */
  handlePlatformMessage(message) {
    switch (message.type) {
      case 'ack':
        // Event acknowledged by platform
        break

      case 'error':
        this.log('⚠️ Platform error:', message.error)
        break

      case 'update_available':
        this.log(`🔄 Update available: v${message.latestVersion} (current: v${this.version})`)
        // Call callback if provided
        if (this.onUpdateAvailable) {
          this.onUpdateAvailable({
            currentVersion: this.version,
            latestVersion: message.latestVersion,
            downloadUrl: message.downloadUrl || 'https://bulwk.com/download',
            releaseNotes: message.releaseNotes || ''
          })
        }
        break

      case 'update_policy':
        this.log('🔄 Policy update requested from platform')
        // Trigger immediate policy sync via callback
        if (this.onPolicyUpdateRequested) {
          this.onPolicyUpdateRequested()
        }
        break

      default:
        this.log('📨 Platform message:', message)
    }
  }

  /**
   * Get current daemon version
   */
  getVersion() {
    return this.version
  }

  /**
   * Emit event to platform (and queue if disconnected)
   */
  emit(eventType, eventData) {
    if (!this.enabled) {
      return
    }

    const event = {
      type: eventType,
      wallet: this.walletAddress,
      data: eventData,
      timestamp: Date.now()
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(event))
      } catch (error) {
        this.log('⚠️ Failed to send event to platform:', error.message)
        this.queueEvent(event)
      }
    } else {
      // Queue for later
      this.queueEvent(event)
    }
  }

  /**
   * Queue event for sending when reconnected
   */
  queueEvent(event) {
    this.pendingEvents.push(event)

    // Limit queue size
    if (this.pendingEvents.length > this.maxPendingEvents) {
      this.pendingEvents.shift() // Remove oldest
    }
  }

  /**
   * Send all pending events
   */
  flushPendingEvents() {
    if (this.pendingEvents.length === 0) {
      return
    }

    this.log(`📤 Sending ${this.pendingEvents.length} queued events...`)

    while (this.pendingEvents.length > 0) {
      const event = this.pendingEvents.shift()
      try {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(event))
        }
      } catch (error) {
        this.log('⚠️ Failed to send queued event:', error.message)
        // Put it back if send failed
        this.pendingEvents.unshift(event)
        break
      }
    }
  }

  /**
   * Emit position deployment event
   */
  emitPositionDeployed(position) {
    this.emit('position_deployed', {
      tokenId: position.tokenId,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
      liquidity: position.liquidity,
      txHash: position.txHash,
      blockNumber: position.blockNumber
    })
  }

  /**
   * Emit rebalance event
   */
  emitRebalance(rebalanceData) {
    this.emit('rebalance', {
      closedPositions: rebalanceData.closedPositions,
      newPositions: rebalanceData.newPositions,
      reason: rebalanceData.reason,
      currentTick: rebalanceData.currentTick
    })
  }

  /**
   * Emit fee collection event
   */
  emitFeesCollected(feeData) {
    this.emit('fees_collected', {
      amount0: feeData.amount0,
      amount1: feeData.amount1,
      shadowRewards: feeData.shadowRewards,
      txHash: feeData.txHash,
      blockNumber: feeData.blockNumber
    })
  }

  /**
   * Emit daemon status update
   */
  emitStatusUpdate(status) {
    this.emit('status_update', {
      online: status.online,
      mode: status.mode,
      positionsInRange: status.positionsInRange,
      totalPositions: status.totalPositions,
      totalValue: status.totalValue,
      lastActivity: status.lastActivity
    })
  }

  /**
   * Emit error event
   */
  emitError(error) {
    this.emit('error', {
      message: error.message,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }

  /**
   * Disconnect from platform
   */
  disconnect() {
    this.enabled = false

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.ws) {
      // Send disconnect event before closing
      if (this.ws.readyState === WebSocket.OPEN) {
        this.emit('daemon_disconnected', {
          walletAddress: this.walletAddress,
          timestamp: Date.now()
        })
      }

      this.ws.close()
      this.ws = null
    }

    this.log('🔌 Disconnected from platform event stream')
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN
  }
}

export default PlatformEventStream
