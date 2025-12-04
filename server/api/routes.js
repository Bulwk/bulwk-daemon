// Copyright (c) 2025 Bulwk. All rights reserved.
// Licensed under Bulwk Proprietary License
// Full terms: ipfs://QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D

import { DaemonController } from './daemon-controller.js'
import { loadTierPreferences, saveTierPreferences, validateTierPreferences } from './daemon-config.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const daemon = new DaemonController()

// Store update info when received from platform
let updateInfo = null

export function setUpdateInfo(info) {
  updateInfo = info
}

export function createApiRoutes(app) {
  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' })
  })

  // Get daemon version and update status
  app.get('/api/version', (req, res) => {
    try {
      const packagePath = path.join(__dirname, '..', '..', 'package.json')
      const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'))

      res.json({
        currentVersion: packageData.version || '0.0.0',
        updateAvailable: updateInfo !== null,
        latestVersion: updateInfo?.latestVersion || null,
        downloadUrl: updateInfo?.downloadUrl || null,
        releaseNotes: updateInfo?.releaseNotes || null
      })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Get daemon status
  app.get('/api/status', async (req, res) => {
    try {
      const status = await daemon.getStatus()
      res.json(status)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Setup wallet
  app.post('/api/setup', async (req, res) => {
    try {
      const { type, privateKey, password } = req.body
      const result = await daemon.setup(type, privateKey, password)
      res.json(result)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Recover wallet with recovery phrase
  app.post('/api/recover', async (req, res) => {
    try {
      const { recoveryPhrase, password } = req.body
      const result = await daemon.recover(recoveryPhrase, password)
      res.json(result)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Start daemon
  app.post('/api/start', async (req, res) => {
    try {
      const { password } = req.body
      const result = await daemon.start(password)
      res.json(result)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Stop daemon
  app.post('/api/stop', async (req, res) => {
    try {
      await daemon.stop()
      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  app.post('/api/daemon/shutdown', (req, res) => {
    console.log('🛑 Shutdown requested by web GUI')
    res.json({ success: true, message: 'Daemon shutting down...' })

    setTimeout(() => {
      console.log('👋 Daemon process exiting')
      process.exit(0)
    }, 500)
  })

  // Get link status
  app.get('/api/link-status', async (req, res) => {
    try {
      const status = await daemon.getLinkStatus()
      res.json(status)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Get authentication status
  app.get('/api/auth-status', async (req, res) => {
    try {
      const isAuthenticated = !!(daemon.isLinked && daemon.jwtToken)

      res.json({
        isAuthenticated,
        isLinked: daemon.isLinked,
        hasJwtToken: !!daemon.jwtToken,
        walletAddress: daemon.wallet?.address
      })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Refresh authentication (attempt JWT recovery)
  app.post('/api/auth-refresh', async (req, res) => {
    try {
      if (!daemon.wallet) {
        return res.status(400).json({ error: 'Daemon not running' })
      }

      if (!daemon.isLinked) {
        return res.status(400).json({ error: 'Daemon not linked to platform' })
      }

      const recovered = await daemon.refreshJwtToken()

      if (recovered && daemon.jwtToken) {
        res.json({
          success: true,
          isAuthenticated: true,
          message: 'Authentication refreshed successfully'
        })
      } else {
        res.status(401).json({
          success: false,
          isAuthenticated: false,
          error: 'Failed to refresh authentication. Please restart daemon or re-link to platform.'
        })
      }
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Force re-link daemon (for edge cases like JWT token mismatch)
  app.post('/api/force-relink', async (req, res) => {
    try {
      const { password } = req.body
      const result = await daemon.forceRelink(password)
      res.json(result)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Update policy
  app.post('/api/policy', async (req, res) => {
    try {
      const updates = req.body
      await daemon.updatePolicy(updates)
      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Get policy
  app.get('/api/policy', async (req, res) => {
    try {
      const policy = await daemon.getPolicy()
      res.json(policy)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Get daemon configuration
  app.get('/api/config', async (req, res) => {
    try {
      const config = await daemon.getConfig()
      res.json(config)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Update daemon configuration
  app.post('/api/config', async (req, res) => {
    try {
      const updates = req.body
      const newConfig = await daemon.updateConfig(updates)
      res.json(newConfig)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Sign message with daemon wallet
  app.post('/api/sign', async (req, res) => {
    try {
      const { message } = req.body
      if (!message) {
        return res.status(400).json({ error: 'Message is required' })
      }

      const signature = await daemon.signMessage(message)
      res.json({ signature })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Sign typed data (EIP-712) with daemon wallet
  app.post('/api/sign-typed-data', async (req, res) => {
    try {
      const { domain, types, value } = req.body
      if (!domain || !types || !value) {
        return res.status(400).json({ error: 'domain, types, and value are required' })
      }

      const signature = await daemon.signTypedData(domain, types, value)
      res.json({ signature })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Send transaction with daemon wallet (native S)
  app.post('/api/send-transaction', async (req, res) => {
    try {
      const { to, value, data } = req.body
      if (!to || !value) {
        return res.status(400).json({ error: 'Recipient address (to) and value are required' })
      }

      const result = await daemon.sendTransaction(to, value, data)
      res.json(result)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Send ERC-20 token transaction with daemon wallet
  app.post('/api/send-token', async (req, res) => {
    try {
      const { tokenAddress, to, amount } = req.body
      if (!tokenAddress || !to || !amount) {
        return res.status(400).json({
          error: 'Token address, recipient address (to), and amount are required'
        })
      }

      const result = await daemon.sendTokenTransaction(tokenAddress, to, amount)
      res.json(result)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Get all token balances for daemon wallet
  app.post('/api/balances', async (req, res) => {
    try {
      const { customTokens } = req.body
      const balances = await daemon.getBalances(customTokens || [])
      res.json(balances)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Get uncollected fees from all positions (LP fees + SHADOW rewards)
  app.get('/api/position-fees', async (req, res) => {
    try {
      const fees = await daemon.getPositionFees()
      res.json(fees)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Get supported networks
  app.get('/api/networks', async (req, res) => {
    try {
      const networks = await daemon.getNetworks()
      res.json(networks)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Sync networks from platform
  app.post('/api/networks/sync', async (req, res) => {
    try {
      const networks = await daemon.syncNetworksFromPlatform()
      res.json(networks)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Reset/delete wallet
  app.post('/api/reset', async (req, res) => {
    try {
      await daemon.resetWallet()
      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Remote control: Start Trading (creates DEPLOY intent via platform)
  app.post('/api/remote/start-trading', async (req, res) => {
    try {
      if (!daemon.wallet) {
        return res.status(400).json({ error: 'Daemon not running. Please start the daemon first.' })
      }

      if (!daemon.isLinked) {
        return res.status(400).json({ error: 'Daemon not linked to platform. Please link your daemon first.' })
      }

      const wallet = daemon.wallet.address

      // Call platform's start-trading endpoint
      const platformUrl = daemon.platformUrl || 'https://app.bulwk.com'
      const headers = { 'Content-Type': 'application/json' }
      if (daemon.jwtToken) {
        headers['Authorization'] = `Bearer ${daemon.jwtToken}`
      }

      const response = await fetch(`${platformUrl}/api/daemon/start-trading`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          wallet,
          sessionToken: daemon.jwtToken
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `Platform returned ${response.status}`)
      }

      const result = await response.json()

      daemon.log(`🚀 Remote DEPLOY intent created: ${result.intentId}`)

      res.json({
        success: true,
        intentId: result.intentId,
        message: 'Position deployment queued - daemon will execute shortly'
      })

    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Purchase LOGIC credits via daemon wallet (USDC -> S swap)
  app.post('/api/logic/purchase', async (req, res) => {
    try {
      if (!daemon.wallet) {
        return res.status(400).json({ error: 'Daemon not running. Please start the daemon first.' })
      }

      if (!daemon.isLinked) {
        return res.status(400).json({ error: 'Daemon not linked to platform. Please link your daemon first.' })
      }

      const { amount } = req.body
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' })
      }

      daemon.log(`🛒 Starting LOGIC purchase: ${amount} LOGIC (~${(amount * 0.2).toFixed(2)} S)`)

      const result = await daemon.purchaseLogic(amount)

      res.json({
        success: true,
        transactionHash: result.hash,
        amount,
        usdcAmount: result.usdcAmount,
        sAmount: result.sAmount,
        message: `Successfully purchased ${amount} LOGIC credits`
      })

    } catch (error) {
      daemon.log(`❌ LOGIC purchase failed: ${error.message}`, 'error')
      res.status(500).json({ error: error.message })
    }
  })

  // Get heartbeat status
  app.get('/api/heartbeat-status', (req, res) => {
    try {
      res.json({
        status: daemon.heartbeatStatus,
        lastHeartbeat: daemon.lastHeartbeatTime,
        isActive: !!daemon.heartbeatInterval
      })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Get activity logs (last 200 entries)
  app.get('/api/activity-logs', (req, res) => {
    try {
      const logs = daemon.getActivityLogs()
      res.json({ logs })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Stream activity logs (Server-Sent Events)
  app.get('/api/activity-logs/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    // Send initial logs
    const logs = daemon.getActivityLogs()
    res.write(`data: ${JSON.stringify({ type: 'init', logs })}\n\n`)

    // Subscribe to new logs
    const unsubscribe = daemon.subscribeToLogs((entry) => {
      res.write(`data: ${JSON.stringify({ type: 'log', entry })}\n\n`)
    })

    // Cleanup on disconnect
    req.on('close', () => {
      unsubscribe()
    })
  })

  // Toggle keep awake (prevent computer sleep)
  app.post('/api/keep-awake/toggle', async (req, res) => {
    try {
      const result = await daemon.toggleKeepAwake()
      res.json(result)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Enable keep awake
  app.post('/api/keep-awake/enable', async (req, res) => {
    try {
      const result = await daemon.enableKeepAwake()
      res.json(result)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Disable keep awake
  app.post('/api/keep-awake/disable', async (req, res) => {
    try {
      const result = await daemon.disableKeepAwake()
      res.json(result)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Get spending permission status
  app.get('/api/spending-permission/status', async (req, res) => {
    try {
      if (!daemon.wallet) {
        return res.status(400).json({ error: 'Daemon not running. Please start the daemon first.' })
      }

      if (!daemon.isLinked) {
        return res.status(400).json({ error: 'Daemon not linked to platform. Please link your daemon first.' })
      }

      const platformUrl = daemon.platformUrl || 'https://app.bulwk.com'

      // Get JWT token for authenticated request
      if (!daemon.jwtToken) {
        return res.status(401).json({ error: 'Not authenticated with platform' })
      }

      const response = await daemon.fetchWithAuthRedirect(`${platformUrl}/api/spending-permission/status`, {
        headers: {
          'Authorization': `Bearer ${daemon.jwtToken}`
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `Platform returned ${response.status}`)
      }

      const status = await response.json()
      res.json(status)

    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Grant spending permission (blanket authorization)
  app.post('/api/spending-permission/grant', async (req, res) => {
    try {
      if (!daemon.wallet) {
        return res.status(400).json({ error: 'Daemon not running. Please start the daemon first.' })
      }

      if (!daemon.isLinked) {
        return res.status(400).json({ error: 'Daemon not linked to platform. Please link your daemon first.' })
      }

      // Define EIP-712 domain and types for blanket authorization
      const domain = {
        name: 'Tick3 Bulwk',
        version: '1',
        chainId: 146, // Sonic Labs
        verifyingContract: '0x0000000000000000000000000000000000000000' // Placeholder
      }

      const types = {
        AutoRebalancePermission: [
          { name: 'wallet', type: 'address' },
          { name: 'authorized', type: 'bool' },
          { name: 'timestamp', type: 'uint256' }
        ]
      }

      const value = {
        wallet: daemon.wallet.address,
        authorized: true,
        timestamp: Math.floor(Date.now() / 1000)
      }

      // Sign the blanket permission
      const signature = await daemon.signTypedData(domain, types, value)

      // Submit to platform (platform will manage all spending limits)
      const platformUrl = daemon.platformUrl || 'https://app.bulwk.com'

      // Ensure JWT token is available - attempt recovery if missing
      if (!daemon.jwtToken) {
        console.warn('⚠️ JWT missing before permission grant - attempting recovery...')
        const recovered = await daemon.refreshJwtToken()

        if (!recovered || !daemon.jwtToken) {
          return res.status(401).json({
            error: 'Not authenticated with platform. Please restart daemon or re-link to platform.'
          })
        }

        console.log('✅ JWT recovered successfully')
      }

      // DEBUG: Log JWT info before sending to platform
      console.log('🔐 DEBUG: Sending permission grant to platform')
      console.log(`   JWT format: ${daemon.jwtToken ? 'exists' : 'missing'}`)
      console.log(`   JWT length: ${daemon.jwtToken ? daemon.jwtToken.length : 0}`)
      console.log(`   JWT preview: ${daemon.jwtToken ? daemon.jwtToken.substring(0, 16) + '...' : 'N/A'}`)
      console.log(`   Platform URL: ${platformUrl}`)

      const response = await daemon.fetchWithAuthRedirect(`${platformUrl}/api/spending-permission/grant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${daemon.jwtToken}`
        },
        body: JSON.stringify({
          signature,
          timestamp: value.timestamp
        })
      })

      // DEBUG: Log platform response
      console.log(`🔐 DEBUG: Platform response: ${response.status} ${response.statusText}`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.log(`❌ DEBUG: Platform error response:`, errorData)
        throw new Error(errorData.error || `Platform returned ${response.status}`)
      }

      const result = await response.json()

      daemon.log(`✅ Auto-rebalancing permission granted - spending limits managed on platform`)

      res.json(result)

    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Get authorized viewer wallets
  app.get('/api/viewer/list', async (req, res) => {
    try {
      if (!daemon.wallet) {
        return res.status(400).json({ error: 'Daemon not running. Please start the daemon first.' })
      }

      if (!daemon.isLinked) {
        return res.status(400).json({ error: 'Daemon not linked to platform. Please link your daemon first.' })
      }

      const platformUrl = daemon.platformUrl || 'https://app.bulwk.com'
      const response = await fetch(`${platformUrl}/api/wallet/viewer-authorizations/${daemon.wallet.address}`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `Platform returned ${response.status}`)
      }

      const result = await response.json()
      res.json(result)

    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Authorize a viewer wallet
  app.post('/api/viewer/authorize', async (req, res) => {
    try {
      if (!daemon.wallet) {
        return res.status(400).json({ error: 'Daemon not running. Please start the daemon first.' })
      }

      if (!daemon.isLinked) {
        return res.status(400).json({ error: 'Daemon not linked to platform. Please link your daemon first.' })
      }

      const { viewingWallet } = req.body
      if (!viewingWallet) {
        return res.status(400).json({ error: 'Viewing wallet address is required' })
      }

      // Validate wallet address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(viewingWallet)) {
        return res.status(400).json({ error: 'Invalid wallet address format' })
      }

      // Create EIP-712 typed signature for authorization
      const timestamp = Math.floor(Date.now() / 1000)

      const domain = {
        name: 'Tick3 Bulwk',
        version: '1',
        chainId: 146, // Sonic Labs
        verifyingContract: '0x0000000000000000000000000000000000000000'
      }

      const types = {
        WalletAuthorization: [
          { name: 'executionWallet', type: 'address' },
          { name: 'viewingWallet', type: 'address' },
          { name: 'role', type: 'string' },
          { name: 'timestamp', type: 'uint256' }
        ]
      }

      const value = {
        executionWallet: daemon.wallet.address,
        viewingWallet: viewingWallet,
        role: 'viewer',
        timestamp: timestamp
      }

      // Sign with EIP-712 typed signature
      const signature = await daemon.signTypedData(domain, types, value)

      // Submit to platform
      const platformUrl = daemon.platformUrl || 'https://app.bulwk.com'
      const response = await fetch(`${platformUrl}/api/wallet/authorize-viewer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executionWallet: daemon.wallet.address,
          viewingWallet: viewingWallet,
          role: 'viewer',  // Read-only permission for mobile viewing
          signature: signature,
          timestamp: timestamp
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `Platform returned ${response.status}`)
      }

      const result = await response.json()
      daemon.log(`👁️ Authorized viewer wallet: ${viewingWallet}`)
      res.json(result)

    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Revoke a viewer wallet authorization
  app.post('/api/viewer/revoke', async (req, res) => {
    try {
      if (!daemon.wallet) {
        return res.status(400).json({ error: 'Daemon not running. Please start the daemon first.' })
      }

      if (!daemon.isLinked) {
        return res.status(400).json({ error: 'Daemon not linked to platform. Please link your daemon first.' })
      }

      const { viewingWallet } = req.body
      if (!viewingWallet) {
        return res.status(400).json({ error: 'Viewing wallet address is required' })
      }

      // Submit to platform
      const platformUrl = daemon.platformUrl || 'https://app.bulwk.com'
      const response = await fetch(`${platformUrl}/api/wallet/revoke-viewer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executionWallet: daemon.wallet.address,
          viewingWallet: viewingWallet
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `Platform returned ${response.status}`)
      }

      const result = await response.json()
      daemon.log(`🚫 Revoked viewer wallet: ${viewingWallet}`)
      res.json(result)

    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Get tier preferences
  app.get('/api/tier-preferences', async (req, res) => {
    try {
      const tiers = await loadTierPreferences()
      res.json({ tiers })
    } catch (error) {
      console.error('Failed to load tier preferences:', error)
      res.status(500).json({ error: error.message })
    }
  })

  // Save tier preferences
  app.post('/api/tier-preferences', async (req, res) => {
    try {
      const { tiers } = req.body

      // Validate
      const errors = validateTierPreferences(tiers)
      if (errors.length > 0) {
        return res.status(400).json({ error: errors.join(', ') })
      }

      // Save with auto-normalization
      const normalizedTiers = await saveTierPreferences(tiers)

      res.json({
        success: true,
        tiers: normalizedTiers,
        message: 'Tier preferences saved successfully'
      })
    } catch (error) {
      console.error('Failed to save tier preferences:', error)
      res.status(500).json({ error: error.message })
    }
  })

  // ====================
  // QuickNode Streams Webhook Trigger Endpoints
  // ====================

  /**
   * Phase 1: Idle Sweep Webhook Trigger
   * Called by backend when token transfer event detected
   */
  app.post('/idle-sweep-trigger', async (req, res) => {
    try {
      const { trigger, tokenAddress, toAddress, amount, timestamp } = req.body

      console.log(`🔔 Idle sweep trigger received: ${trigger}`)
      console.log(`   Token: ${tokenAddress}`)
      console.log(`   To: ${toAddress}`)

      // Trigger immediate idle sweep check (bypasses interval)
      await daemon.sweepIdleBalances()

      res.json({
        success: true,
        message: 'Idle sweep triggered successfully'
      })
    } catch (error) {
      console.error('❌ Idle sweep trigger failed:', error)
      res.status(500).json({ error: error.message })
    }
  })

  /**
   * Phase 2: Grace Period Check Webhook Trigger
   * Called by backend when pool swap event detected (price movement)
   */
  app.post('/grace-check-trigger', async (req, res) => {
    try {
      const { trigger, poolAddress, timestamp } = req.body

      console.log(`🔔 Grace check trigger received: ${trigger}`)
      console.log(`   Pool: ${poolAddress}`)

      // Trigger immediate grace period check (bypasses interval)
      // Grace monitor runs automatically via daemon start, this forces immediate check
      await daemon.checkGracePeriod()

      res.json({
        success: true,
        message: 'Grace period check triggered successfully'
      })
    } catch (error) {
      console.error('❌ Grace check trigger failed:', error)
      res.status(500).json({ error: error.message })
    }
  })

  /**
   * Phase 3: Intent Ready Notification
   * Called by backend when new intent created
   */
  app.post('/intent-ready-notification', async (req, res) => {
    try {
      const { intent, timestamp } = req.body

      console.log(`🔔 Intent ready notification received`)
      console.log(`   Intent ID: ${intent.intentId}`)
      console.log(`   Action: ${intent.action}`)

      // Trigger immediate intent check (bypasses polling interval)
      await daemon.checkIntents()

      res.json({
        success: true,
        message: 'Intent check triggered successfully'
      })
    } catch (error) {
      console.error('❌ Intent notification failed:', error)
      res.status(500).json({ error: error.message })
    }
  })
}
