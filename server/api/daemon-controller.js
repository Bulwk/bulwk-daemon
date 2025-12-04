// Copyright (c) 2025 Bulwk. All rights reserved.
// Licensed under Bulwk Proprietary License
// Full terms: ipfs://QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D

import { Wallet, Contract } from 'ethers'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import IntentVerifier from './intent-verifier.js'
import PolicySync from './policy-sync.js'
import { GracePeriodMonitor } from './grace-period-monitor.js'
import { getAllBalances, parseTokenAmount } from './token-service.js'
import { getTokenByAddress } from './tokens-config.js'
import { calculateOptimalAmounts } from './uniswap-math.js'
import { encodeShadowMint, encodeShadowMulticall, encodeDecreaseLiquidity, encodeCollect, encodeBurn } from './shadow-encoder.js'
import PlatformEventStream from '../platform-event-stream.js'
import { setUpdateInfo } from './routes.js'
import { loadTierPreferences } from './daemon-config.js'

const CONFIG_DIR = path.join(os.homedir(), '.balancer')
const KEYSTORE_PATH = path.join(CONFIG_DIR, 'keystore.json')
const POLICY_PATH = path.join(CONFIG_DIR, 'policy.json')
const NETWORKS_PATH = path.join(CONFIG_DIR, 'networks.json')
const DAEMON_CONFIG_PATH = path.join(CONFIG_DIR, 'config.json')
const JWT_TOKEN_PATH = path.join(CONFIG_DIR, 'jwt-token.json')

// Sonic blockchain contracts
const WS_TOKEN = '0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38'
const USDC_TOKEN = '0x29219dd400f2Bf60E5a23d13Be72B486D4038894'
const SHADOW_TOKEN = '0x3333b97138D4b086720b5aE8A7844b1345a33333'
const NFPM_ADDRESS = '0x12E66C8F215DdD5d48d150c8f46aD0c6fB0F4406'
const POOL_ADDRESS = '0x324963c267C354c7660Ce8CA3F5f167E05649970'
const VOTER_ADDRESS = '0xe879d0E44e6873cf4ab71686055a4f6817685f02'
const GAUGE_ADDRESS = '0xe879d0E44e6873cf4ab71686055a4f6817685f02' // Shadow Gauge for WS/USDC pool

// ChainList Public RPC Endpoints for Sonic (Chain 146)
const CHAINLIST_RPCS = [
  'https://sonic.drpc.org',
  'https://rpc.soniclabs.com',
  'https://rpc.soniclabs.com',
]

// Runtime validation: Ensure critical addresses are valid and match expected values
// This prevents variable shadowing attacks and configuration errors from causing fund loss
function validateCriticalAddresses() {
  // Expected correct addresses (hardcoded reference - DO NOT MODIFY)
  const expectedAddresses = {
    'WS_TOKEN': '0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38',
    'USDC_TOKEN': '0x29219dd400f2Bf60E5a23d13Be72B486D4038894',
    'SHADOW_TOKEN': '0x3333b97138D4b086720b5aE8A7844b1345a33333',
    'NFPM_ADDRESS': '0x12E66C8F215DdD5d48d150c8f46aD0c6fB0F4406',
    'POOL_ADDRESS': '0x324963c267C354c7660Ce8CA3F5f167E05649970',
    'VOTER_ADDRESS': '0xe879d0E44e6873cf4ab71686055a4f6817685f02',
    'GAUGE_ADDRESS': '0xe879d0E44e6873cf4ab71686055a4f6817685f02'
  }

  const actualAddresses = {
    'WS_TOKEN': WS_TOKEN,
    'USDC_TOKEN': USDC_TOKEN,
    'SHADOW_TOKEN': SHADOW_TOKEN,
    'NFPM_ADDRESS': NFPM_ADDRESS,
    'POOL_ADDRESS': POOL_ADDRESS,
    'VOTER_ADDRESS': VOTER_ADDRESS,
    'GAUGE_ADDRESS': GAUGE_ADDRESS
  }

  const errors = []

  // Validate each address format and value
  for (const [name, expectedAddress] of Object.entries(expectedAddresses)) {
    const actualAddress = actualAddresses[name]

    // Check if address is a string
    if (typeof actualAddress !== 'string') {
      errors.push(`${name} is not a string: ${typeof actualAddress}`)
      continue
    }

    // Check if address starts with 0x and is 42 characters
    if (!actualAddress.startsWith('0x') || actualAddress.length !== 42) {
      errors.push(`${name} has invalid format: ${actualAddress}`)
      continue
    }

    // Check if address contains only hex characters
    if (!/^0x[0-9a-fA-F]{40}$/.test(actualAddress)) {
      errors.push(`${name} contains non-hex characters: ${actualAddress}`)
      continue
    }

    // CRITICAL: Compare actual vs expected (case-insensitive since checksums vary)
    if (actualAddress.toLowerCase() !== expectedAddress.toLowerCase()) {
      errors.push(`${name} does not match expected value!\n  Expected: ${expectedAddress}\n  Actual:   ${actualAddress}\n  This may indicate variable shadowing or malicious override!`)
    }
  }

  if (errors.length > 0) {
    console.error('❌ CRITICAL: Address validation failed on startup!')
    console.error('This may indicate a variable shadowing attack or configuration error.')
    console.error('Errors:')
    errors.forEach(err => console.error(`  - ${err}`))
    throw new Error(`Address validation failed: ${errors.join('; ')}`)
  }

  console.log('✅ Runtime address validation passed - All critical addresses match expected values')
}

// Cryptographic checksum validation (additional layer of protection)
// Attacker must modify BOTH the addresses AND this checksum to bypass detection
async function validateAddressChecksum() {
  const { createHash } = await import('crypto')

  // Concatenate all critical addresses in specific order
  const addressString = [
    WS_TOKEN,
    USDC_TOKEN,
    SHADOW_TOKEN,
    NFPM_ADDRESS,
    POOL_ADDRESS,
    VOTER_ADDRESS,
    GAUGE_ADDRESS
  ].join('|').toLowerCase()

  // Generate SHA-256 checksum
  const actualChecksum = createHash('sha256').update(addressString).digest('hex')

  // Expected checksum (generated from correct addresses - DO NOT MODIFY)
  const expectedChecksum = '884733443a7fcffd992429c4ecb692bcab431ea3c9045846f04bec6b6447b9c8'

  if (actualChecksum !== expectedChecksum) {
    console.error('❌ CRITICAL: Address checksum validation failed!')
    console.error(`Expected checksum: ${expectedChecksum}`)
    console.error(`Actual checksum: ${actualChecksum}`)
    console.error('This indicates that critical addresses have been modified.')
    console.error('ABORTING STARTUP to prevent potential fund loss.')
    throw new Error(`Address checksum mismatch - potential tampering detected`)
  }

  console.log('✅ Cryptographic address checksum validation passed')
}

// Shadow DEX constants
const TICK_SPACING = 50
const DEADLINE_SECS = 300  // 5 minutes

const DEFAULT_CONFIG = {
  slippage: 3000,
  swapSlippage: 1.0,  // Increased from 0.5% to 1% for LOGIC purchases
  minDeploymentUsd: 5.0,  // Minimum $5 USD to deploy (prevents small amounts not worth gas)
  idleSweepEnabled: false,
  version: '2.1.0'
}

// ERC20 ABI for approve and allowance
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
]

export class DaemonController {
  constructor() {
    this.isRunning = false
    this.wallet = null
    this.linkCode = null
    this.linkUrl = null
    this.isLinked = false
    this.needsDisclaimer = false // Whether user needs to sign disclaimer
    this.jwtToken = null // JWT token for authenticated platform requests
    this.platformUrl = process.env.PLATFORM_URL || 'https://app.bulwk.com'
    this.policySync = null // Will be initialized when wallet is loaded
    this.lastIntentCheck = null
    this.intentInterval = null
    this.pendingIntents = []
    this.isProcessingIntent = false // Mutex lock to prevent concurrent intent processing
    this.activePositions = new Set() // Track positions currently being processed (prevents duplicates)
    this.closedPositions = new Set() // Track positions already closed/burned (prevents redundant operations)
    this.activityLogs = [] // Store activity logs for UI
    this.maxLogs = 200 // Keep last 200 log entries
    this.logCallbacks = new Set() // Store WebSocket/SSE callbacks for real-time streaming
    this.config = null // Will be loaded on demand

    // Platform event streaming for viewers
    this.platformEventStream = null // Will be initialized when wallet is loaded

    // Keep awake functionality
    this.keepAwakeEnabled = false
    this.keepAwakeProcess = null
    this.platform = os.platform() // 'darwin', 'win32', 'linux'

    // Heartbeat functionality
    this.heartbeatInterval = null
    this.lastHeartbeatTime = null
    this.heartbeatStatus = 'disconnected' // 'connected', 'connecting', 'disconnected'
    this.consecutiveHeartbeatFailures = 0 // Track failures for proactive JWT refresh

    // Track when daemon connected (for backdated intent detection)
    this.daemonConnectedAt = null
    this.backdatedIntentsDetected = false // Track if we've already paused for backdated intents

    // Initialize IntentVerifier with logger callback (pass bound log method)
    this.intentVerifier = new IntentVerifier(this.platformUrl, this.log.bind(this))
  }

  // Add log entry to activity feed
  log(message, level = 'info') {
    const entry = {
      timestamp: new Date().toISOString(),
      message,
      level
    }
    this.activityLogs.push(entry)

    // Keep only last maxLogs entries
    if (this.activityLogs.length > this.maxLogs) {
      this.activityLogs.shift()
    }

    // Broadcast to all connected clients
    this.logCallbacks.forEach(callback => {
      try {
        callback(entry)
      } catch (err) {
        console.error('Failed to send log to client:', err.message)
      }
    })

    // Also log to console
    console.log(message)
  }

  // Get all activity logs
  getActivityLogs() {
    return this.activityLogs
  }

  // Subscribe to activity log stream
  subscribeToLogs(callback) {
    this.logCallbacks.add(callback)
    return () => this.logCallbacks.delete(callback)
  }

  // Save JWT token to filesystem for persistence across daemon restarts
  async saveJwtToken(token) {
    try {
      await fs.mkdir(CONFIG_DIR, { recursive: true })
      await fs.writeFile(JWT_TOKEN_PATH, JSON.stringify({
        token,
        timestamp: Date.now()
      }, null, 2))
      console.log('💾 JWT token saved to disk')
    } catch (error) {
      console.error('Failed to save JWT token:', error.message)
    }
  }

  // Load JWT token from filesystem on daemon startup
  async loadJwtToken() {
    try {
      const data = await fs.readFile(JWT_TOKEN_PATH, 'utf-8')
      const { token} = JSON.parse(data)
      this.jwtToken = token
      console.log('📂 JWT token loaded from disk')
      return token
    } catch {
      // Token file doesn't exist or is invalid - not an error on first run
      return null
    }
  }

  async getProviderWithFallback(primaryRpc) {
    const { JsonRpcProvider } = await import('ethers')
    const rpcList = primaryRpc ? [primaryRpc, ...CHAINLIST_RPCS] : CHAINLIST_RPCS

    for (const rpcUrl of rpcList) {
      try {
        const provider = new JsonRpcProvider(rpcUrl)
        await provider.getBlockNumber()
        this.log(`✅ Using RPC: ${rpcUrl}`)
        return provider
      } catch (error) {
        this.log(`⚠️  RPC ${rpcUrl} failed, trying next...`)
        continue
      }
    }

    throw new Error('All RPC endpoints failed')
  }

  shouldUseProxy(action) {
    const PROXY_ACTIONS = ['DEPLOY', 'IDLE_SWEEP', 'BATCH_WITHDRAW', 'COLLECT_FEES']
    const DIRECT_ACTIONS = ['REBALANCE', 'CLOSE_POSITION', 'SWAP_TOKENS', 'LOGIC_PURCHASE']

    if (DIRECT_ACTIONS.includes(action)) {
      return false
    }

    return PROXY_ACTIONS.includes(action)
  }

  async submitTransaction(wallet, txRequest, action) {
    const useProxy = this.shouldUseProxy(action)

    if (!useProxy) {
      return await wallet.sendTransaction(txRequest)
    }

    // CRITICAL FIX: Populate transaction fields (chainId, nonce, gas fees) before signing
    // wallet.signTransaction() does NOT auto-populate like sendTransaction() does
    const populatedTx = await wallet.populateTransaction(txRequest)
    const signedTx = await wallet.signTransaction(populatedTx)
    const txHash = await this.sendTransactionViaProxy(signedTx)

    const { ethers } = await import('ethers')
    const provider = wallet.provider

    return {
      hash: txHash,
      wait: async () => {
        let receipt = null
        const startTime = Date.now()
        const timeout = 120000

        while (!receipt && (Date.now() - startTime) < timeout) {
          try {
            receipt = await provider.getTransactionReceipt(txHash)
            if (receipt) break
          } catch (error) {
            this.log(`⏳ Waiting for transaction ${txHash}...`)
          }
          await new Promise(resolve => setTimeout(resolve, 2000))
        }

        if (!receipt) {
          throw new Error(`Transaction ${txHash} not found after ${timeout/1000}s`)
        }

        return receipt
      }
    }
  }

  async sendTransactionViaProxy(txData) {
    const sessionToken = this.jwtToken

    try {
      const response = await fetch(`${this.platformUrl}/api/rpc/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken,
          method: 'eth_sendRawTransaction',
          params: [txData]
        })
      })

      if (!response.ok) {
        this.log('⚠️  Platform proxy failed, using direct RPC')
        const provider = await this.getProviderWithFallback(null)
        return await provider.send('eth_sendRawTransaction', [txData])
      }

      const data = await response.json()
      return data.result
    } catch (error) {
      this.log(`⚠️  Proxy error: ${error.message}, using direct RPC`)
      const provider = await this.getProviderWithFallback(null)
      return await provider.send('eth_sendRawTransaction', [txData])
    }
  }

  async getStatus() {
    const hasKeystore = await this.keystoreExists()

    return {
      isSetup: hasKeystore,
      isRunning: this.isRunning,
      isLinked: this.isLinked,
      walletAddress: this.wallet?.address,
      sessionToken: this.jwtToken, // Include JWT token for session restoration
      linkCode: this.linkCode,
      linkUrl: this.linkUrl,
      keepAwakeEnabled: this.keepAwakeEnabled,
      platform: this.platform,
      platformUrl: this.platformUrl // Expose platform URL for Dashboard to use
    }
  }

  async keystoreExists() {
    try {
      await fs.access(KEYSTORE_PATH)
      return true
    } catch {
      return false
    }
  }

  async setup(type, privateKey, password) {
    // Ensure config directory exists
    await fs.mkdir(CONFIG_DIR, { recursive: true })

    let wallet
    let mnemonic = null

    if (type === 'import') {
      // Import from private key
      wallet = new Wallet(privateKey)
    } else if (type === 'generate') {
      // Generate new wallet
      wallet = Wallet.createRandom()
      mnemonic = wallet.mnemonic.phrase
    } else {
      throw new Error('Invalid setup type')
    }

    // Encrypt and save keystore
    const keystore = await wallet.encrypt(password)
    await fs.writeFile(KEYSTORE_PATH, keystore)

    // Save default policy
    const defaultPolicy = {
      maxGasPrice: '100000000000',
      maxSlippageBps: 100,
      maxTxPerHour: 10,
      maxTxPerDay: 50,
      allowedHours: [0, 23]
    }
    await fs.writeFile(POLICY_PATH, JSON.stringify(defaultPolicy, null, 2))

    // Initialize default networks
    const defaultNetworks = this.getDefaultNetworks()
    await fs.writeFile(NETWORKS_PATH, JSON.stringify(defaultNetworks, null, 2))

    return {
      success: true,
      address: wallet.address,
      mnemonic
    }
  }

  async recover(recoveryPhrase, password) {
    // Ensure config directory exists
    await fs.mkdir(CONFIG_DIR, { recursive: true })

    try {
      // Restore wallet from mnemonic
      const wallet = Wallet.fromPhrase(recoveryPhrase.trim())

      // Encrypt with new password and save
      const keystore = await wallet.encrypt(password)
      await fs.writeFile(KEYSTORE_PATH, keystore)

      return {
        success: true,
        address: wallet.address
      }
    } catch (error) {
      throw new Error('Invalid recovery phrase: ' + error.message)
    }
  }

  /**
   * Fetch with Authorization header redirect handling
   * Preserves Authorization header when following redirects (301/302/307/308)
   * Standard fetch() strips Authorization header during redirects for security
   */
  async fetchWithAuthRedirect(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      redirect: 'manual' // Don't auto-follow redirects
    })

    // Check if it's a redirect
    if ([301, 302, 307, 308].includes(response.status)) {
      const redirectUrl = response.headers.get('location')
      console.log(`🔄 Redirect detected: ${url} → ${redirectUrl}`)
      console.log(`   Preserving Authorization header for redirected request`)

      // Follow redirect with Authorization header intact
      return fetch(redirectUrl, options)
    }

    return response
  }

  /**
   * Validate JWT token format (NEW system uses 64-char hex from crypto.randomBytes(32))
   */
  isValidJwtFormat(token) {
    if (!token || typeof token !== 'string') {
      return false
    }
    // New JWT system: 64-character hexadecimal string (32 bytes = 64 hex chars)
    return /^[a-fA-F0-9]{64}$/.test(token)
  }

  /**
   * Validate JWT token by checking if it exists in platform's daemon_sessions table
   * Returns { valid: boolean, needsRefresh: boolean }
   */
  async validateJwtToken(linkCode) {
    try {
      console.log('🔐 Validating JWT token...')

      // Check JWT format first (NEW system validation)
      if (!this.isValidJwtFormat(this.jwtToken)) {
        console.warn('⚠️ JWT format invalid - old JWT system detected, needs refresh')
        return { valid: false, needsRefresh: true }
      }

      // Query platform to verify JWT exists in daemon_sessions table
      const linkResponse = await fetch(
        `${this.platformUrl}/api/daemon/link?linkCode=${linkCode}`
      )

      if (!linkResponse.ok) {
        console.warn(`⚠️ Link status check failed: ${linkResponse.status}`)
        return { valid: false, needsRefresh: true }
      }

      const linkData = await linkResponse.json()

      // Check if daemon is linked and JWT matches
      if (linkData.status === 'linked' && linkData.jwtToken) {
        if (linkData.jwtToken === this.jwtToken) {
          console.log('✅ JWT token validated successfully')
          return { valid: true, needsRefresh: false }
        } else {
          console.warn('⚠️ JWT token mismatch - platform has different token')
          this.jwtToken = linkData.jwtToken
          await this.saveJwtToken(linkData.jwtToken)
          console.log('✅ JWT token updated from platform')
          return { valid: true, needsRefresh: false }
        }
      }

      // Daemon not linked or no JWT available
      console.warn('⚠️ Daemon not linked or JWT not available')
      return { valid: false, needsRefresh: true }

    } catch (error) {
      console.error('❌ JWT validation failed:', error.message)
      return { valid: false, needsRefresh: true }
    }
  }

  /**
   * Refresh JWT token by re-registering and checking link status
   * Used when JWT is missing, expired, or invalid format
   */
  async refreshJwtToken() {
    try {
      console.log('🔄 Attempting to refresh JWT token...')

      // Re-register to get fresh link code
      const timestamp = Date.now()
      const message = `Refresh JWT - ${timestamp}`
      const signature = await this.wallet.signMessage(message)

      const response = await fetch(`${this.platformUrl}/api/daemon/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature, message })
      })

      if (!response.ok) {
        throw new Error(`Registration failed: ${response.status}`)
      }

      const data = await response.json()

      // Check link status - should return JWT if already linked
      const linkResponse = await fetch(
        `${this.platformUrl}/api/daemon/link?linkCode=${data.linkCode}`
      )

      if (linkResponse.ok) {
        const linkData = await linkResponse.json()

        if (linkData.status === 'linked' && linkData.jwtToken) {
          this.jwtToken = linkData.jwtToken
          await this.saveJwtToken(linkData.jwtToken)
          console.log('✅ JWT token refreshed successfully')
          return true
        }
      }

      console.warn('⚠️ Could not refresh JWT - daemon may need re-linking')
      return false
    } catch (error) {
      console.error('❌ JWT refresh failed:', error.message)
      return false
    }
  }

  /**
   * Start heartbeat system - keeps JWT session alive
   * Sends heartbeat to platform every 60 seconds
   */
  async startHeartbeat() {
    // Don't start heartbeat if not linked or no JWT
    if (!this.isLinked || !this.jwtToken) {
      console.log('⚠️ Skipping heartbeat start - daemon not linked or no JWT')
      return
    }

    // Stop existing heartbeat if running
    if (this.heartbeatInterval) {
      this.stopHeartbeat()
    }

    console.log('💓 Starting heartbeat system (every 60 seconds)')
    this.heartbeatStatus = 'connecting'

    // Send initial heartbeat immediately
    await this.sendHeartbeat()

    // Then send heartbeat every 60 seconds
    this.heartbeatInterval = setInterval(async () => {
      await this.sendHeartbeat()
    }, 60000) // 60 seconds
  }

  /**
   * Send single heartbeat to platform
   */
  async sendHeartbeat() {
    try {
      // Proactive JWT refresh if session is approaching expiration (8+ minutes since last successful heartbeat)
      if (this.lastHeartbeatTime) {
        const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeatTime
        const eightMinutes = 8 * 60 * 1000

        if (timeSinceLastHeartbeat > eightMinutes) {
          console.log(`⚠️  Session age: ${Math.floor(timeSinceLastHeartbeat / 60000)} minutes - proactively refreshing JWT...`)
          const refreshed = await this.refreshJwtToken()
          if (refreshed) {
            console.log('✅ JWT proactively refreshed before expiration')
            this.consecutiveHeartbeatFailures = 0 // Reset failure counter
          }
        }
      }

      this.heartbeatStatus = 'connecting'

      const response = await this.fetchWithAuthRedirect(`${this.platformUrl}/api/daemon/heartbeat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.jwtToken}`
        }
      })

      if (response.ok) {
        this.lastHeartbeatTime = Date.now()
        this.heartbeatStatus = 'connected'
        this.consecutiveHeartbeatFailures = 0 // Reset failure counter on success
        console.log('💓 Heartbeat sent successfully')
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error(`❌ Heartbeat failed: ${response.status} ${errorData.error || ''}`)
        this.heartbeatStatus = 'disconnected'
        this.consecutiveHeartbeatFailures++

        // If 401, try to refresh JWT
        if (response.status === 401) {
          console.log('🔄 JWT appears invalid - attempting refresh...')
          const refreshed = await this.refreshJwtToken()
          if (refreshed) {
            console.log('✅ JWT refreshed - heartbeat will resume')
            this.consecutiveHeartbeatFailures = 0 // Reset on successful refresh
          }
        }

        // If 2+ consecutive failures, proactively refresh JWT (network or platform issues)
        if (this.consecutiveHeartbeatFailures >= 2) {
          console.log(`⚠️  ${this.consecutiveHeartbeatFailures} consecutive heartbeat failures - proactively refreshing JWT...`)
          const refreshed = await this.refreshJwtToken()
          if (refreshed) {
            console.log('✅ JWT proactively refreshed after consecutive failures')
            this.consecutiveHeartbeatFailures = 0 // Reset after refresh
          }
        }
      }
    } catch (error) {
      console.error('❌ Heartbeat error:', error.message)
      this.heartbeatStatus = 'disconnected'
      this.consecutiveHeartbeatFailures++

      // Proactive refresh on network errors too
      if (this.consecutiveHeartbeatFailures >= 2) {
        console.log(`⚠️  ${this.consecutiveHeartbeatFailures} consecutive heartbeat errors - proactively refreshing JWT...`)
        const refreshed = await this.refreshJwtToken()
        if (refreshed) {
          console.log('✅ JWT proactively refreshed after consecutive errors')
          this.consecutiveHeartbeatFailures = 0
        }
      }
    }
  }

  /**
   * Stop heartbeat system
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
      this.heartbeatStatus = 'disconnected'
      console.log('💓 Heartbeat stopped')
    }
  }

  async start(password) {
    // Load keystore
    const keystoreJson = await fs.readFile(KEYSTORE_PATH, 'utf-8')
    this.wallet = await Wallet.fromEncryptedJson(keystoreJson, password)

    // Initialize platform event stream for real-time viewer updates
    this.platformEventStream = new PlatformEventStream({
      walletAddress: this.wallet.address,
      platformUrl: this.platformUrl,
      enabled: true,
      log: this.log.bind(this),
      onUpdateAvailable: (updateInfo) => {
        // Store update info for the version API endpoint
        setUpdateInfo(updateInfo)
        this.log(`🔄 Update available: v${updateInfo.latestVersion}`)
      },
      onPolicyUpdateRequested: () => {
        // Trigger immediate policy sync when platform requests it
        if (this.policySync) {
          this.log('🔄 Instant policy sync triggered via WebSocket')
          this.policySync.syncPolicy()
        }
      }
    })
    await this.platformEventStream.connect()

    // Load persisted JWT token if available (survives daemon restarts)
    await this.loadJwtToken()

    // Register with platform and get link code
    const timestamp = Date.now()
    const message = `Link Bulwk daemon - ${timestamp}`
    const signature = await this.wallet.signMessage(message)

    const response = await fetch(`${this.platformUrl}/api/daemon/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature, message })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMsg = errorData.error || `Failed to register daemon (${response.status})`
      throw new Error(errorMsg)
    }

    const data = await response.json()
    this.linkCode = data.linkCode
    this.linkUrl = data.linkUrl
    this.isRunning = true

    // Sync networks from platform
    await this.syncNetworksFromPlatform()

    // PRODUCTION FIX: Validate JWT token if it exists (with 30s timeout)
    if (this.jwtToken) {
      console.log('🔐 JWT token loaded from disk - validating...')

      const validationPromise = (async () => {
        const validation = await this.validateJwtToken(this.linkCode)

        if (!validation.valid && validation.needsRefresh) {
          console.warn('⚠️ JWT validation failed - attempting auto-refresh...')
          const refreshed = await this.refreshJwtToken()

          if (!refreshed) {
            console.error('❌ JWT auto-refresh failed')
            console.error('   Clearing invalid JWT - daemon will require re-linking for authenticated operations')
            this.jwtToken = null
          } else {
            console.log('✅ JWT auto-refresh successful - continuing with valid token')
          }
        }
      })()

      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
          console.warn('⏱️ JWT validation timed out after 30s - clearing token')
          this.jwtToken = null
          resolve()
        }, 30000)
      })

      await Promise.race([validationPromise, timeoutPromise])
    } else {
      console.log('ℹ️ No JWT token on disk - daemon will acquire JWT after linking')
    }

    // Check if already linked by querying platform (handles restart case)
    try {
      const linkResponse = await fetch(
        `${this.platformUrl}/api/daemon/link?linkCode=${this.linkCode}`
      )

      if (linkResponse.ok) {
        const linkData = await linkResponse.json()

        if (linkData.status === 'linked') {
          console.log('✅ Daemon already linked - starting services immediately')
          this.isLinked = true
          this.daemonConnectedAt = Date.now() // Track connection time for backdated intent detection

          // Store JWT token for authenticated platform requests
          if (linkData.jwtToken) {
            this.jwtToken = linkData.jwtToken
            await this.saveJwtToken(linkData.jwtToken)
            console.log('✅ JWT token received from platform')
          } else {
            // JWT missing despite being linked - attempt recovery
            console.warn('⚠️ No JWT received despite being linked - attempting recovery...')
            const recovered = await this.refreshJwtToken()
            if (!recovered) {
              console.error('❌ Failed to recover JWT - daemon may need manual re-linking')
              console.error('   EIP-712 permission grant and other authenticated operations will fail')
            }
          }

          // Start policy sync service
          this.policySync = new PolicySync(this.platformUrl, this.wallet.address)
          this.policySync.start()

          // Start grace period monitor (auto-collect Shadow before rebalancing)
          this.gracePeriodMonitor = new GracePeriodMonitor(this)
          this.gracePeriodMonitor.start()

          // Log daemon health check - confirms all requirements for Shadow collection
          console.log('🏥 Daemon Health Check:')
          console.log(`   ✅ isRunning: ${this.isRunning}`)
          console.log(`   ✅ isLinked: ${this.isLinked}`)
          const walletAddr = this.wallet?.address || 'not loaded'
          console.log(`   ✅ wallet: ${walletAddr}`)
          console.log(`   ✅ gracePeriodMonitor: ${this.gracePeriodMonitor.isActive()}`)
          console.log('   💎 Shadow auto-collection is ENABLED')

          // Start polling for intents
          this.pollForIntents()

          // Start idle sweep timer (separate 15-minute interval)
          this.startIdleSweepTimer()

          // Start heartbeat to keep JWT session alive
          await this.startHeartbeat()

          return {
            success: true,
            linkCode: this.linkCode,
            linkUrl: this.linkUrl
          }
        }
      }
    } catch (error) {
      console.log('Failed to check link status, assuming not linked:', error.message)
    }

    // Not linked yet - start polling for link confirmation
    console.log('🔗 Waiting for user to confirm link via platform...')
    this.pollForLink()

    return {
      success: true,
      linkCode: this.linkCode,
      linkUrl: this.linkUrl
    }
  }

  async pollForLink() {
    const checkInterval = setInterval(async () => {
      try {
        const response = await fetch(
          `${this.platformUrl}/api/daemon/link?linkCode=${this.linkCode}`
        )

        if (response.ok) {
          const data = await response.json()

          if (data.status === 'linked') {
            this.isLinked = true
            this.isRunning = true // Enable intent polling
            this.daemonConnectedAt = Date.now() // Track connection time for backdated intent detection

            // 🔐 CHECK DISCLAIMER STATUS: Must be signed before daemon can operate
            if (data.needsDisclaimer === true) {
              this.needsDisclaimer = true
              console.warn('⚠️ Disclaimer signature required - user must complete onboarding')
              console.warn('   Daemon will remain linked but non-functional until signature completed')
              // Don't clear interval - keep checking until disclaimer is signed
              return
            } else {
              this.needsDisclaimer = false
              clearInterval(checkInterval)
            }

            // Store JWT token for authenticated platform requests
            if (data.jwtToken) {
              this.jwtToken = data.jwtToken
              await this.saveJwtToken(data.jwtToken)
              console.log('✅ JWT token received from platform')
            } else {
              // JWT missing despite being linked - attempt recovery
              console.warn('⚠️ No JWT received despite being linked - attempting recovery...')
              const recovered = await this.refreshJwtToken()
              if (!recovered) {
                console.error('❌ Failed to recover JWT - daemon may need manual re-linking')
                console.error('   EIP-712 permission grant and other authenticated operations will fail')
              }
            }

            console.log('✅ Daemon linked to platform!')

            // Start policy sync service
            this.policySync = new PolicySync(this.platformUrl, this.wallet.address)
            this.policySync.start()

            // Start grace period monitor (auto-collect Shadow before rebalancing)
            this.gracePeriodMonitor = new GracePeriodMonitor(this)
            this.gracePeriodMonitor.start()

            // Start polling for intents once linked
            this.pollForIntents()

            // Start idle sweep timer (separate 15-minute interval)
            this.startIdleSweepTimer()

            // Start heartbeat to keep JWT session alive
            await this.startHeartbeat()
          }
        }
      } catch (error) {
        console.error('Link poll error:', error)
      }
    }, 3000)

    // Stop polling after 15 minutes
    setTimeout(() => clearInterval(checkInterval), 900000)
  }

  async pollForIntents() {
    // Poll for intents every 5 seconds
    this.intentInterval = setInterval(async () => {
      try {
        // Only poll if daemon is running and linked
        if (!this.isRunning || !this.isLinked) {
          return
        }

        this.log(`🔄 Polling for intents...`)

        // Build query params
        const params = new URLSearchParams({
          wallet: this.wallet.address
        })

        // Don't use 'since' filter - backend already prevents duplicates by marking as DELIVERED
        // Using 'since' creates race condition where intents created between polls are missed

        const headers = { 'Content-Type': 'application/json' }
        if (this.jwtToken) {
          headers['Authorization'] = `Bearer ${this.jwtToken}`
        }

        const response = await fetch(
          `${this.platformUrl}/api/daemon/intents?${params.toString()}`,
          { headers }
        )

        if (!response.ok) {
          // Handle subscription expiry gracefully
          if (response.status === 403) {
            const errorData = await response.json().catch(() => ({}))
            this.log(`⏸️  Subscription required: ${errorData.message || 'Please renew to continue'}`, 'warn')
            this.log(`   Platform will show "Daemon Offline" until subscription renewed`, 'warn')
            return
          }

          // Log error details for debugging
          const errorText = await response.text().catch(() => 'Unable to read error response')
          this.log(`❌ Intent fetch failed: ${response.status}`, 'error')
          this.log(`   Error response: ${errorText}`, 'error')
          return
        }

        const data = await response.json()
        const intents = data.intents || []

        if (intents.length > 0) {
          this.log(`📥 Received ${intents.length} new intent(s)`)

          // Load policy for validation
          const policy = await this.getPolicy()

          // Auto-pause detection: Check if any backdated REBALANCE intents exist
          if (!this.backdatedIntentsDetected && this.daemonConnectedAt && policy.automation?.autoRebalancing) {
            let hasBackdatedRebalances = false

            for (const signedIntent of intents) {
              try {
                const intent = await this.intentVerifier.verifyIntent(signedIntent.signature)
                if (intent.action === 'REBALANCE') {
                  const intentTimestamp = intent.timestamp || intent.createdAt || 0
                  if (intentTimestamp < this.daemonConnectedAt) {
                    hasBackdatedRebalances = true
                    break
                  }
                }
              } catch (err) {
                // Skip verification errors in detection phase
              }
            }

            if (hasBackdatedRebalances) {
              this.backdatedIntentsDetected = true
              this.log(`🔒 Backdated rebalance intents detected!`, 'warn')
              this.log(`   Auto-rebalancing paused for safety`, 'warn')
              this.log(`   💎 Collect Shadow rewards first, then re-enable auto-rebalancing in UI`, 'warn')

              // Automatically pause auto-rebalancing
              policy.automation.autoRebalancing = false
              await this.updatePolicy(policy)
              this.log(`✅ Auto-rebalancing disabled (re-enable after collecting Shadow)`, 'warn')
            }
          }

          for (const signedIntent of intents) {
            try {
              // Verify intent signature
              const intent = await this.intentVerifier.verifyIntent(signedIntent.signature)

              this.log(`✅ Intent verified: ${intent.intentId}`)

              // Validate against policy
              const isPolicyValid = this.intentVerifier.validatePolicy(intent, policy)

              if (!isPolicyValid) {
                this.log(`❌ Intent ${intent.intentId} rejected by policy`)

                // Report rejection to platform
                await this.reportIntentRejection(intent.intentId, 'Policy validation failed')
                continue
              }

              this.log(`✅ Intent ${intent.intentId} passed policy validation`)

              // Check if auto-rebalancing is enabled for REBALANCE actions
              if (intent.action === 'REBALANCE') {
                if (!policy.automation?.autoRebalancing) {
                  this.log(`⏭️ Skipping REBALANCE intent ${intent.intentId} - auto-rebalancing is disabled`)
                  this.log(`   💡 Enable auto-rebalancing in UI to resume (after collecting Shadow if needed)`)
                  await this.reportIntentRejection(intent.intentId, 'Auto-rebalancing disabled')
                  continue
                }
              }

              // Check if intent is backdated (created BEFORE daemon connected) for REBALANCE actions
              // This prevents executing old intents that built up while daemon was offline
              if (intent.action === 'REBALANCE' && this.daemonConnectedAt) {
                let intentTimestamp = intent.timestamp || intent.createdAt || 0

                // Normalize timestamp: handle Date objects, strings, and numeric timestamps (seconds vs milliseconds)
                if (typeof intentTimestamp === 'object' && intentTimestamp.getTime) {
                  intentTimestamp = intentTimestamp.getTime()
                } else if (typeof intentTimestamp === 'string') {
                  intentTimestamp = new Date(intentTimestamp).getTime()
                } else if (typeof intentTimestamp === 'number') {
                  // If timestamp is in seconds (< 10000000000), convert to milliseconds
                  // Unix timestamp for Jan 1, 2000 is 946684800 (10 digits)
                  // Any timestamp before September 2001 would be < 10 digits
                  if (intentTimestamp < 10000000000) {
                    intentTimestamp = intentTimestamp * 1000
                  }
                }

                // Intent is backdated if it was created BEFORE daemon connected
                if (intentTimestamp < this.daemonConnectedAt) {
                  const config = await this.getConfig()

                  if (!config.executeBackdatedRebalances) {
                    const ageMinutes = Math.round((Date.now() - intentTimestamp) / 60000)
                    this.log(`⏭️ Skipping backdated REBALANCE intent ${intent.intentId} (created ${ageMinutes}min ago, before daemon connected)`)
                    this.log(`   💡 This intent was queued while daemon was offline`)
                    this.log(`   💡 Enable "Execute Backdated Rebalances" in settings to process queued intents`)

                    // Report skip to platform
                    await this.reportIntentRejection(intent.intentId, `Backdated intent skipped (created before daemon connected) - executeBackdatedRebalances disabled`)
                    continue
                  }

                  const ageMinutes = Math.round((Date.now() - intentTimestamp) / 60000)
                  this.log(`⚠️ Executing backdated REBALANCE intent ${intent.intentId} (created ${ageMinutes}min ago, before daemon connected)`)
                  this.log(`   ⚠️ executeBackdatedRebalances is enabled - processing queued intent`)
                  this.log(`   ⚠️ Make sure Shadow rewards were collected first to avoid burning them!`)
                } else {
                  // Fresh intent created AFTER daemon connected - always execute
                  this.log(`✅ Fresh REBALANCE intent ${intent.intentId} (created while daemon connected)`)
                }
              }

              // Add to pending queue for execution
              this.pendingIntents.push(intent)

              this.log(`📋 Queued intent ${intent.intentId} for execution`)

            } catch (error) {
              console.error(`❌ Intent verification failed:`, error.message)

              // Report verification failure to platform if we can extract intentId
              if (signedIntent.intentId) {
                await this.reportIntentRejection(signedIntent.intentId, `Verification failed: ${error.message}`)
              }
            }
          }
        }

        // Update last check timestamp
        this.lastIntentCheck = Date.now()

        // Process any pending intents in the queue
        await this.processIntentQueue()

        // Note: Idle balance sweeping now runs on separate 15-minute interval (see startIdleSweepTimer)

        // Check subscription expiry and alert user
        try {
          const policy = await this.policySync?.getCurrentPolicy()
          if (policy?.subscription?.expiresAt) {
            const expiresAt = new Date(policy.subscription.expiresAt).getTime()
            const now = Date.now()
            const hoursRemaining = (expiresAt - now) / (1000 * 60 * 60)

            if (hoursRemaining < 0) {
              this.log(`⚠️  SUBSCRIPTION EXPIRED - Automated trading paused`, 'warn')
              this.log(`   Renew at: https://app.bulwk.com/?renew=true`, 'warn')
            } else if (hoursRemaining < 24) {
              this.log(`⏰ Subscription expires in ${hoursRemaining.toFixed(1)} hours`, 'warn')
              this.log(`   Renew at: https://app.bulwk.com/?renew=true`, 'warn')
            }
          }
        } catch (expiryCheckError) {
          console.error('Failed to check subscription expiry:', expiryCheckError)
        }

      } catch (error) {
        console.error('Intent polling error:', error)
      }
    }, 5000)

    console.log('🔄 Started polling for intents every 5 seconds')
  }

  async startIdleSweepTimer() {
    this.idleSweepInterval = setInterval(async () => {
      try {
        if (!this.isRunning || !this.isLinked) {
          return
        }

        await this.sweepIdleBalances()
      } catch (error) {
        console.error('Idle sweep timer error:', error)
      }
    }, 600000)

    console.log('💰 Started idle balance sweep timer (checks every 10 minutes)')
  }

  async reportIntentRejection(intentId, reason) {
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (this.jwtToken) {
        headers['Authorization'] = `Bearer ${this.jwtToken}`
      }

      await fetch(`${this.platformUrl}/api/daemon/intent-status`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          intentId,
          status: 'rejected',
          reason,
          wallet: this.wallet.address
        })
      })
    } catch (error) {
      console.error('Failed to report intent rejection:', error)
    }
  }

  /**
   * Ensure tokens have sufficient allowance for NFPM
   * Automatically approves tokens if needed
   */
  async ensureTokenApprovals(connectedWallet, provider, intent) {
    this.log('🔍 Checking token approvals...')

    const tokens = [
      { address: WS_TOKEN, symbol: 'wS' },
      { address: USDC_TOKEN, symbol: 'USDC' },
      { address: SHADOW_TOKEN, symbol: 'SHADOW' }
    ]

    const MIN_ALLOWANCE = BigInt('1000000000000000000000')

    for (const token of tokens) {
      try {
        const tokenContract = new Contract(token.address, ERC20_ABI, provider)
        const allowance = await tokenContract.allowance(connectedWallet.address, NFPM_ADDRESS)

        if (allowance < MIN_ALLOWANCE) {
          this.log(`⚠️  ${token.symbol} allowance insufficient - approving...`)

          const tokenWithSigner = tokenContract.connect(connectedWallet)
          const approveTx = await tokenWithSigner.approve(
            NFPM_ADDRESS,
            '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' // max uint256
          )

          this.log(`⏳ Waiting for ${token.symbol} approval: ${approveTx.hash}`)
          const receipt = await approveTx.wait()
          this.log(`✅ ${token.symbol} approved for NFPM`)
        }
      } catch (error) {
        this.log(`❌ Failed to approve ${token.symbol}: ${error.message}`)
        throw new Error(`Token approval required but failed: ${token.symbol} - ${error.message}`)
      }
    }

    this.log('✅ All token approvals confirmed')
  }

  async executeIntent(intent, attempt = 1) {
    const MAX_RETRIES = 2  // Allow 2 total attempts
    const RETRY_DELAY_MS = 2000  // Wait 2s between retries

    this.log(`🔄 Executing intent ${intent.intentId} - ${intent.action} (attempt ${attempt}/${MAX_RETRIES})`)

    try {
      const config = await this.getConfig()

      // Setup provider and wallet
      const { JsonRpcProvider, Contract } = await import('ethers')
      const networks = await this.getNetworks()
      const network = networks.sonic

      if (!network) {
        throw new Error('Sonic network not configured')
      }

      const provider = new JsonRpcProvider(network.rpc)
      const connectedWallet = this.wallet.connect(provider)

      // Check LOGIC balance before executing (only on first attempt to avoid spam)
      if (attempt === 1) {
        try {
          const balanceResponse = await fetch(`${this.platformUrl}/api/logic/balance/${this.wallet.address}`)
          if (balanceResponse.ok) {
            const balanceData = await balanceResponse.json()
            const logicBalance = balanceData.logicBalance || 0

            // Warn if LOGIC balance is low (< 5 LOGIC = < 1 S in gas)
            if (logicBalance < 5) {
              this.log(`⚠️  Low LOGIC balance: ${logicBalance.toFixed(2)} LOGIC`)
              this.log(`   This may not be enough for gas fees. Top up at ${this.platformUrl}`)
            }
          }
        } catch (balanceError) {
          // Don't fail intent if balance check fails, just warn
          this.log(`⚠️  Could not check LOGIC balance: ${balanceError.message}`)
        }
      }

      if (intent.action === 'REBALANCE') {
        const tokenId = intent.recipe.tokenId

        // Skip if already processing this position
        if (this.activePositions.has(tokenId)) {
          this.log(`⏭️ Skipping duplicate REBALANCE for position ${tokenId} - already processing`)

          await this.reportReceiptWithRetry(intent.intentId, {
            status: 'skipped',
            reason: `Position ${tokenId} already being processed by another intent`
          })

          return { success: false, skipped: true, reason: 'Duplicate - already processing' }
        }

        // Skip if position already closed/burned
        if (this.closedPositions.has(tokenId)) {
          this.log(`⏭️ Skipping REBALANCE for position ${tokenId} - already closed`)

          await this.reportReceiptWithRetry(intent.intentId, {
            status: 'skipped',
            reason: `Position ${tokenId} already closed/burned`
          })

          return { success: false, skipped: true, reason: 'Position already closed' }
        }

        // Mark position as being actively processed
        this.activePositions.add(tokenId)
        this.log(`🔒 Marked position ${tokenId} as actively processing`)
      }

      if (intent.action === 'REBALANCE') {
        const tokenId = intent.recipe.tokenId
        const NFPM_ABI = [
          'function ownerOf(uint256 tokenId) view returns (address)',
          'function positions(uint256 tokenId) view returns (address token0, address token1, int24 tickSpacing, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)'
        ]
        const nfpm = new Contract(NFPM_ADDRESS, NFPM_ABI, provider)

        try {
          // Check if position still exists and is owned by user
          const owner = await nfpm.ownerOf(tokenId)

          if (owner.toLowerCase() !== this.wallet.address.toLowerCase()) {
            this.log(`⏭️  Skipping intent ${intent.intentId} - position ${tokenId} not owned by user (likely already rebalanced by duplicate intent)`)

            // Mark position as closed since it's not owned anymore
            this.activePositions.delete(tokenId)
            this.closedPositions.add(tokenId)
            this.log(`🔓 Position ${tokenId} marked as closed (not owned)`)

            await this.reportReceiptWithRetry(intent.intentId, {
              status: 'skipped',
              reason: `Position ${tokenId} no longer owned by user`
            })

            return { success: false, skipped: true, reason: 'Position not owned' }
          }

          // Check if position has liquidity
          let position
          try {
            position = await nfpm.positions(tokenId)
          } catch (decodeError) {
            // Position decode failed - likely invalid tokenId or contract error
            this.log(`❌ Failed to decode position ${tokenId}: ${decodeError.message}`)
            this.log(`   This usually means the position was burned or never existed`)

            // Mark position as closed since it can't be decoded
            this.activePositions.delete(tokenId)
            this.closedPositions.add(tokenId)
            this.log(`🔓 Position ${tokenId} marked as closed (decode failed)`)

            await this.reportReceiptWithRetry(intent.intentId, {
              status: 'skipped',
              reason: `Position ${tokenId} decode failed - position may have been burned`
            })

            return { success: false, skipped: true, reason: 'Position decode failed' }
          }

          if (position.liquidity === 0n) {
            this.log(`⏭️  Skipping intent ${intent.intentId} - position ${tokenId} has zero liquidity (position burned)`)

            // Mark position as closed since it has no liquidity
            this.activePositions.delete(tokenId)
            this.closedPositions.add(tokenId)
            this.log(`🔓 Position ${tokenId} marked as closed (zero liquidity)`)

            await this.reportReceiptWithRetry(intent.intentId, {
              status: 'skipped',
              reason: `Position ${tokenId} has zero liquidity - position was burned`
            })

            return { success: false, skipped: true, reason: 'Position has no liquidity' }
          }

          this.log(`✅ Position ${tokenId} validated: owner=${owner}, liquidity=${position.liquidity}`)

          // CRITICAL: Check if position is still out of range before rebalancing
          // Prevents wasting gas on intents for positions that are already in range
          // (either rebalanced by previous intent or price moved back naturally)
          const POOL_ABI = [
            'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
          ]
          const pool = new Contract(POOL_ADDRESS, POOL_ABI, provider)
          const slot0 = await pool.slot0()
          const currentTick = Number(slot0.tick)

          // Get position tick range
          const tickLower = Number(position.tickLower)
          const tickUpper = Number(position.tickUpper)

          // Check if position is IN RANGE
          if (currentTick >= tickLower && currentTick <= tickUpper) {
            this.log(`⏭️  Skipping intent ${intent.intentId} - position ${tokenId} is already in range (tick ${currentTick} in [${tickLower}, ${tickUpper}])`)

            // Remove from active tracking (position still exists, just back in range)
            this.activePositions.delete(tokenId)
            this.log(`🔓 Position ${tokenId} removed from active tracking (back in range)`)

            await this.reportReceiptWithRetry(intent.intentId, {
              status: 'skipped',
              reason: `Position already in range at tick ${currentTick}`
            })

            return { success: false, skipped: true, reason: 'Position already in range' }
          }

          this.log(`✅ Position ${tokenId} confirmed OUT of range: current tick ${currentTick} not in [${tickLower}, ${tickUpper}]`)

        } catch (error) {
          // ownerOf reverts if token doesn't exist (ERC721 standard)
          if (error.message.includes('ERC721') || error.message.includes('owner query')) {
            this.log(`⏭️  Skipping intent ${intent.intentId} - position ${tokenId} does not exist (likely already burned by duplicate intent)`)

            // Mark position as closed since it doesn't exist
            this.activePositions.delete(tokenId)
            this.closedPositions.add(tokenId)
            this.log(`🔓 Position ${tokenId} marked as closed (does not exist)`)

            await this.reportReceiptWithRetry(intent.intentId, {
              status: 'skipped',
              reason: `Position ${tokenId} does not exist`
            })

            return { success: false, skipped: true, reason: 'Position does not exist' }
          }

          // Other errors - let them propagate
          throw error
        }
      }

      // Ensure tokens are approved for NFPM before executing
      await this.ensureTokenApprovals(connectedWallet, provider, intent)

      // Query pool for slot0 (contains tick, price, and fee data)
      const POOL_ABI = [
        'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
        'function fee() external view returns (uint24)'
      ]
      const pool = new Contract(POOL_ADDRESS, POOL_ABI, provider)
      const freshFee = Number(await pool.fee())
      this.log(`⚡ Queried fresh pool fee: ${freshFee}`)

      // DEPLOY: Atomic tier-by-tier execution with LOCAL calculation
      if (intent.action === 'DEPLOY') {
        this.log(`📦 Atomic DEPLOY: Calculating and encoding each tier locally with fresh on-chain data`)

        // Fetch tier configuration from server (protects IP from downloadable package)
        let tierConfig
        try {
          const headers = { 'Content-Type': 'application/json' }
          if (this.jwtToken) {
            headers['Authorization'] = `Bearer ${this.jwtToken}`
          }
          const tierConfigResponse = await fetch(`${this.platformUrl}/api/daemon/tier-config`, { headers })

          if (tierConfigResponse.ok) {
            const tierConfigData = await tierConfigResponse.json()
            tierConfig = tierConfigData.tiers
            this.log(`✅ Fetched tier allocations from server`)
          } else {
            throw new Error(`Failed to fetch tier config: ${tierConfigResponse.status}`)
          }
        } catch (tierFetchError) {
          this.log(`❌ Failed to fetch tier config from platform: ${tierFetchError.message}`, 'error')
          this.log(`❌ Cannot proceed without platform connection - tier allocations are server-side only`, 'error')
          throw new Error(`Platform unreachable - trading paused to protect strategy integrity`)
        }

        // Load user tier preferences (which tiers are enabled)
        const tierPreferences = await loadTierPreferences()
        this.log(`📋 Loaded tier preferences from local config`)

        // Filter tier config by enabled tiers only
        const enabledTiers = Object.keys(tierConfig).filter(tierName => tierPreferences[tierName]?.enabled)

        if (enabledTiers.length === 0) {
          this.log(`⚠️ No tiers enabled in preferences - aborting deployment`, 'warn')
          throw new Error('No tiers enabled in configuration')
        }

        // Renormalize allocations across enabled tiers to sum to 100%
        const totalEnabledPct = enabledTiers.reduce((sum, tierName) =>
          sum + (tierPreferences[tierName]?.allocPct || 0), 0)

        const normalizedTierConfig = {}
        for (const tierName of enabledTiers) {
          const userPct = tierPreferences[tierName]?.allocPct || 0
          const normalizedPct = totalEnabledPct > 0 ? userPct / totalEnabledPct : 0

          normalizedTierConfig[tierName] = {
            ...tierConfig[tierName],
            allocPct: normalizedPct  // Renormalized to sum to 1.0 (100%)
          }
        }

        this.log(`🎯 Deploying ${enabledTiers.length} enabled tiers: ${enabledTiers.join(', ')}`)

        const receipts = []
        const txHashes = []
        const positionData = []  // Store position info for platform

        // Execute each enabled tier sequentially with fresh data
        for (let i = 0; i < enabledTiers.length; i++) {
          const tierName = enabledTiers[i]
          const tierSettings = normalizedTierConfig[tierName]

          this.log(`\n🚀 [${i+1}/${enabledTiers.length}] Deploying ${tierName} position...`)

          // Query FRESH on-chain data (milliseconds before execution)
          const slot0 = await pool.slot0()
          const currentTick = Number(slot0.tick)
          const sqrtPriceX96 = slot0.sqrtPriceX96

          // Calculate tier range centered on CURRENT tick
          const alignedTick = Math.round(currentTick / TICK_SPACING) * TICK_SPACING
          const halfWidth = tierSettings.width / 2
          const tickLower = alignedTick - halfWidth
          const tickUpper = alignedTick + halfWidth

          // Query CURRENT balances (not original - use what's actually available NOW)
          const ERC20_ABI = ['function balanceOf(address) view returns (uint256)']
          const wsToken = new Contract(WS_TOKEN, ERC20_ABI, provider)
          const usdcToken = new Contract(USDC_TOKEN, ERC20_ABI, provider)

          const currentWsBalance = await wsToken.balanceOf(this.wallet.address)
          const currentUsdcBalance = await usdcToken.balanceOf(this.wallet.address)

          // Calculate how much to allocate to THIS tier
          const wsForTier = (currentWsBalance * BigInt(Math.floor(tierSettings.allocPct * 10000))) / BigInt(10000)
          const usdcForTier = (currentUsdcBalance * BigInt(Math.floor(tierSettings.allocPct * 10000))) / BigInt(10000)

          // Skip if amounts are too small (< $1 total value)
          const wsValue = Number(wsForTier) / 1e18 * 0.20  // Rough USD value
          const usdcValue = Number(usdcForTier) / 1e6
          if (wsValue + usdcValue < 1.0) {
            this.log(`⏭️  Skipping position (amount too small)`)
            continue
          }

          // Calculate EXACT amounts using Uniswap V3 math (precision-safe BigInt)
          const { amount0Desired, amount1Desired } = calculateOptimalAmounts({
            currentTick,
            tickLower,
            tickUpper,
            amount0Available: wsForTier,
            amount1Available: usdcForTier,
            sqrtPriceX96
          })

          // Apply slippage tolerance from config
          const slippageBps = config.slippage
          const amount0Min = (amount0Desired * BigInt(10000 - slippageBps)) / BigInt(10000)
          const amount1Min = (amount1Desired * BigInt(10000 - slippageBps)) / BigInt(10000)

          // Encode Shadow DEX mint locally
          const deadline = Math.floor(Date.now() / 1000) + DEADLINE_SECS
          const mintData = encodeShadowMint({
            token0: WS_TOKEN,
            token1: USDC_TOKEN,
            tickSpacing: TICK_SPACING,
            tickLower,
            tickUpper,
            amount0Desired,
            amount1Desired,
            amount0Min,
            amount1Min,
            recipient: this.wallet.address,
            deadline
          })

          // Wrap in multicall (Shadow DEX requirement)
          const multicallData = encodeShadowMulticall([mintData])

          // Execute IMMEDIATELY (data is <1 second old - atomic!)
          const tx = await this.submitTransaction(connectedWallet, {
            to: NFPM_ADDRESS,
            data: multicallData,
            value: '0x0',
            gasLimit: 500000
          }, intent.action)

          this.log(`✅ Transaction sent: ${tx.hash}`)
          txHashes.push(tx.hash)

          // Wait for confirmation
          const receipt = await tx.wait()

          if (receipt.status === 0) {
            throw new Error('Transaction reverted')
          }

          this.log(`✅ Transaction confirmed: ${tx.hash} (block ${receipt.blockNumber}, gas: ${receipt.gasUsed.toString()})`)
          receipts.push(receipt)

          // Extract tokenId from receipt logs (ERC-721 Transfer event)
          // Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
          // Topic 0: event signature
          // Topic 1: from (0x0000...000 for mint)
          // Topic 2: to (wallet address)
          // Topic 3: tokenId
          let tokenId = null
          for (const log of receipt.logs) {
            // Check if this is a Transfer event from address(0) (mint)
            if (log.topics.length === 4 && log.topics[1] === '0x0000000000000000000000000000000000000000000000000000000000000000') {
              tokenId = Number(BigInt(log.topics[3]))
              this.log(`🎫 Position NFT minted: tokenId=${tokenId}`)
              break
            }
          }

          // Store position data for reporting to platform
          positionData.push({
            tier: tierName,
            tokenId,
            tickLower,
            tickUpper,
            amount0: amount0Desired.toString(),
            amount1: amount1Desired.toString(),
            txHash: tx.hash,
            blockNumber: receipt.blockNumber
          })

          // No delay between tiers - execute back-to-back for maximum atomicity
          // (Tick drift is minimal over ~2 seconds for all tiers)
        }

        // Calculate total gas used
        const totalGasUsed = receipts.reduce((sum, r) => sum + BigInt(r.gasUsed.toString()), BigInt(0))

        // Report success with ALL position data (needed for auto-rebalance)
        await this.reportReceiptWithRetry(intent.intentId, {
          status: 'completed',
          txHashes: txHashes,
          blockNumbers: receipts.map(r => r.blockNumber),
          gasUsed: totalGasUsed.toString(),
          positions: positionData  // NEW: Complete position data for auto-rebalance
        })

        // Track gas spending
        await this.trackGasSpending(
          totalGasUsed,
          txHashes[0], // First transaction hash
          'deploy',
          `Deployed ${positionData.length} position(s)`
        )

        return { success: true, txHashes, receipts }
      }

      if (intent.action === 'REBALANCE') {
        const tierPreferences = await loadTierPreferences()
        const positionTier = intent.recipe.fromTier || 'UNKNOWN'

        if (!tierPreferences[positionTier]?.enabled) {
          this.log(`⏭️ Skipping REBALANCE for ${positionTier} tier - tier disabled in preferences`)

          await this.reportReceiptWithRetry(intent.intentId, {
            status: 'skipped',
            reason: `${positionTier} tier is disabled in user preferences`
          })

          return { success: false, skipped: true, reason: 'Tier disabled in preferences' }
        }

        this.log(`✅ ${positionTier} tier is enabled - proceeding with rebalance`)

        const SWAP_SLIPPAGE_TIERS = [20, 50, 100, 200, 500]

        // Validate position still out of range before starting
        const tokenId = intent.recipe.tokenId
        const NFPM_ABI = [
          'function positions(uint256 tokenId) view returns (address token0, address token1, int24 tickSpacing, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)'
        ]
        const nfpm = new Contract(NFPM_ADDRESS, NFPM_ABI, provider)
        const position = await nfpm.positions(tokenId)

        const POOL_ABI = [
          'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
        ]
        const pool = new Contract(POOL_ADDRESS, POOL_ABI, provider)
        const slot0 = await pool.slot0()
        const currentTick = Number(slot0.tick)
        const tickLower = Number(position.tickLower)
        const tickUpper = Number(position.tickUpper)

        // Check if position drifted back in-range
        if (currentTick >= tickLower && currentTick <= tickUpper) {
          this.log(`✅ Position ${tokenId} drifted back in-range (tick ${currentTick} in [${tickLower}, ${tickUpper}]) - canceling rebalance`)

          await this.reportReceiptWithRetry(intent.intentId, {
            status: 'skipped',
            reason: `Position drifted back in-range at tick ${currentTick}`
          })

          return { success: false, skipped: true, reason: 'Position drifted back in-range' }
        }

        this.log(`📊 Position confirmed out of range: tick ${currentTick} not in [${tickLower}, ${tickUpper}]`)

        let positionClosed = false
        let initialTransactions = null
        let initialImbalanceData = null
        let initialNeedsSwap = false

        for (let tierIndex = 0; tierIndex < SWAP_SLIPPAGE_TIERS.length; tierIndex++) {
          const swapSlippageBps = SWAP_SLIPPAGE_TIERS[tierIndex]
          const attemptNum = tierIndex + 1

          this.log(`\n🔄 Attempt ${attemptNum}/${SWAP_SLIPPAGE_TIERS.length}: Rebalance with ${swapSlippageBps / 100}% swap slippage`)

          try {
            // Re-check tick position before each attempt (detect drift)
            const freshSlot0 = await pool.slot0()
            const freshTick = Number(freshSlot0.tick)

            if (freshTick >= tickLower && freshTick <= tickUpper) {
              this.log(`✅ Position drifted back in-range (tick ${freshTick}) - canceling rebalance`)

              await this.reportReceiptWithRetry(intent.intentId, {
                status: 'skipped',
                reason: `Position drifted back in-range at tick ${freshTick}`
              })

              return { success: false, skipped: true, reason: 'Position drifted back in-range' }
            }

            this.log(`📊 Position still out of range: tick ${freshTick} not in [${tickLower}, ${tickUpper}]`)

            let transactions, needsSwap, imbalanceData, note

            if (!positionClosed) {
              const buildResponse = await fetch(`${this.platformUrl}/api/build-transaction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  intent,
                  userAddress: this.wallet.address,
                  freshFee,
                  swapSlippageBps
                })
              })

              if (!buildResponse.ok) {
                const errorData = await buildResponse.json().catch(() => ({}))
                throw new Error(`Build transaction failed: ${errorData.error || buildResponse.status}`)
              }

              const txData = await buildResponse.json()
              transactions = txData.transactions
              needsSwap = txData.needsSwap
              imbalanceData = txData.imbalanceData
              note = txData.note

              // Cache for retry attempts after position close
              if (tierIndex === 0) {
                initialTransactions = transactions
                initialImbalanceData = imbalanceData
                initialNeedsSwap = needsSwap
              }
            } else {
              this.log(`♻️  Reusing cached transaction data (position already closed, only retrying swap)`)
              transactions = initialTransactions
              needsSwap = initialNeedsSwap
              imbalanceData = initialImbalanceData
              note = `Retry with ${swapSlippageBps / 100}% slippage`
            }

            if (!transactions || !Array.isArray(transactions)) {
              throw new Error('Invalid transaction data: expected array of transactions')
            }

            this.log(`📦 ${positionClosed ? 'Reusing' : 'Built'} ${transactions.length} transactions${needsSwap ? ' (swap will be injected after TX1)' : ''}: ${note || ''}`)

            const txHashes = []
            const receipts = []

            for (let i = 0; i < transactions.length; i++) {
              const transaction = transactions[i]
              const label = transaction.label || `TX${i + 1}`

              // Skip TX1 (CLOSE_POSITION) if position was already closed in previous attempt
              if (positionClosed && label === 'CLOSE_POSITION') {
                this.log(`⏭️  Skipping ${label} (already executed in previous attempt)`)
                continue
              }

              this.log(`\n🚀 [${i + 1}/${transactions.length + (needsSwap ? 1 : 0)}] Executing ${label}...`)

              // Re-validate tick before TX2+ (additional drift protection)
              if (i > 0) {
                const checkSlot0 = await pool.slot0()
                const checkTick = Number(checkSlot0.tick)

                if (checkTick >= tickLower && checkTick <= tickUpper) {
                  this.log(`⚠️  Position drifted back in-range before ${label} (tick ${checkTick}) - aborting remaining transactions`)
                  this.log(`💰 Funds are safe in wallet. User can manually manage or retry rebalance.`)

                  await this.reportReceiptWithRetry(intent.intentId, {
                    status: 'partial',
                    reason: `Position drifted in-range after TX${i} (tick ${checkTick})`,
                    completedTxs: i + (needsSwap && i > 0 ? 1 : 0), // Account for swap if it was executed
                    txHashes: txHashes,
                    blockNumbers: receipts.map(r => r.blockNumber),
                    note: 'Funds safe in wallet'
                  })

                  return { success: false, partial: true, completedTxs: i, txHashes }
                }
              }

              const tx = await this.submitTransaction(connectedWallet, {
                to: transaction.to,
                data: transaction.data,
                value: transaction.value || '0x0',
                gasLimit: transaction.gasLimit || undefined
              }, intent.action)

              this.log(`✅ ${label} sent: ${tx.hash}`)
              txHashes.push(tx.hash)

              // Wait for confirmation
              const receipt = await tx.wait()

              if (receipt.status === 0) {
                throw new Error(`${label} reverted (status: 0)`)
              }

              this.log(`✅ ${label} confirmed (block ${receipt.blockNumber}, gas: ${receipt.gasUsed.toString()})`)
              receipts.push(receipt)

              // Mark position as closed after TX1 succeeds
              if (label === 'CLOSE_POSITION') {
                positionClosed = true
                this.log(`🔓 Position closed - NFT burned (will skip platform API on retries)`)
              }

              // After TX1 (CLOSE_POSITION), inject Odos swap if needed
              if (label === 'CLOSE_POSITION' && needsSwap && imbalanceData) {
                this.log(`⏳ Waiting 5s for pool price stabilization...`)
                await new Promise(resolve => setTimeout(resolve, 5000))
                this.log(`\n💱 Position closed - tokens returned to wallet. Building swap transaction using Odos...`)

                try {
                  // Determine input/output tokens and amounts
                  const swapZeroForOne = imbalanceData.swapZeroForOne
                  const inputToken = swapZeroForOne ? WS_TOKEN : USDC_TOKEN
                  const outputToken = swapZeroForOne ? USDC_TOKEN : WS_TOKEN

                  // Verify actual token balance after position close
                  const ERC20_ABI_BALANCE = ['function balanceOf(address) view returns (uint256)']
                  const balanceCheckContract = new Contract(inputToken, ERC20_ABI_BALANCE, provider)
                  const actualBalance = await balanceCheckContract.balanceOf(this.wallet.address)

                  // Use the MINIMUM of calculated amount and actual balance to prevent insufficient balance errors
                  const calculatedAmount = BigInt(imbalanceData.swapAmount)
                  const inputAmount = actualBalance < calculatedAmount ? actualBalance : calculatedAmount

                  // Log adjustment if balance is lower than expected
                  if (actualBalance < calculatedAmount) {
                    const decimals = swapZeroForOne ? 1e18 : 1e6
                    this.log(`⚠️ Adjusting swap amount from ${Number(calculatedAmount) / decimals} to ${Number(actualBalance) / decimals} based on actual wallet balance`)
                  }

                  this.log(`💱 Swap direction: ${swapZeroForOne ? 'WS → USDC' : 'USDC → WS'}`)
                  this.log(`💱 Swap amount: ${swapZeroForOne ? Number(inputAmount) / 1e18 + ' WS' : Number(inputAmount) / 1e6 + ' USDC'}`)
                  this.log(`💱 Slippage: ${swapSlippageBps / 100}%`)

                  // Call Odos quote API
                  const quoteResponse = await fetch('https://api.odos.xyz/sor/quote/v2', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      chainId: 146, // Sonic
                      inputTokens: [{
                        tokenAddress: inputToken,
                        amount: inputAmount.toString()
                      }],
                      outputTokens: [{
                        tokenAddress: outputToken,
                        proportion: 1
                      }],
                      slippageLimitPercent: swapSlippageBps / 100, // Convert basis points to percentage
                      userAddr: this.wallet.address,
                      referralCode: 0,
                      compact: true
                    })
                  })

                  if (!quoteResponse.ok) {
                    const errorText = await quoteResponse.text()
                    throw new Error(`Odos quote failed: ${quoteResponse.status} ${errorText}`)
                  }

                  const quoteData = await quoteResponse.json()
                  this.log(`✅ Odos quote: ${Number(quoteData.inAmounts[0]) / (swapZeroForOne ? 1e18 : 1e6)} ${swapZeroForOne ? 'WS' : 'USDC'} → ${Number(quoteData.outAmounts[0]) / (swapZeroForOne ? 1e6 : 1e18)} ${swapZeroForOne ? 'USDC' : 'WS'}`)

                  // Assemble transaction
                  const assembleResponse = await fetch('https://api.odos.xyz/sor/assemble', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      userAddr: this.wallet.address,
                      pathId: quoteData.pathId,
                      simulate: false
                    })
                  })

                  if (!assembleResponse.ok) {
                    const errorText = await assembleResponse.text()
                    throw new Error(`Odos assemble failed: ${assembleResponse.status} ${errorText}`)
                  }

                  const assembleData = await assembleResponse.json()

                  // CRITICAL: Validate Odos transaction data before execution
                  if (!assembleData.transaction || !assembleData.transaction.to || !assembleData.transaction.data) {
                    throw new Error(`Invalid Odos transaction data: missing required fields (to/data)`)
                  }

                  this.log(`📦 Odos transaction assembled`)

                  // Approve input token for Odos router if needed
                  const ERC20_ABI = [
                    'function approve(address spender, uint256 amount) returns (bool)',
                    'function allowance(address owner, address spender) view returns (uint256)'
                  ]
                  const inputTokenContract = new Contract(inputToken, ERC20_ABI, provider)
                  const currentAllowance = await inputTokenContract.allowance(
                    this.wallet.address,
                    assembleData.transaction.to
                  )

                  const requiredAmount = BigInt(quoteData.inAmounts[0])
                  if (currentAllowance < requiredAmount) {
                    this.log(`🔓 Approving ${swapZeroForOne ? 'WS' : 'USDC'} for Odos router...`)
                    const tokenWithSigner = inputTokenContract.connect(connectedWallet)
                    const approveTx = await tokenWithSigner.approve(
                      assembleData.transaction.to,
                      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' // max uint256
                    )
                    await approveTx.wait()
                    this.log(`✅ Token approved`)
                  }

                  // Execute swap
                  this.log(`\n🚀 [2/${transactions.length + 1}] Executing SWAP_TOKENS (Odos)...`)
                  const swapTx = await this.submitTransaction(connectedWallet, {
                    to: assembleData.transaction.to,
                    data: assembleData.transaction.data,
                    value: assembleData.transaction.value || '0x0',
                    gasLimit: assembleData.transaction.gas || 1000000
                  }, intent.action)

                  this.log(`✅ SWAP_TOKENS sent: ${swapTx.hash}`)
                  txHashes.push(swapTx.hash)

                  const swapReceipt = await swapTx.wait()

                  if (swapReceipt.status === 0) {
                    throw new Error('SWAP_TOKENS reverted (status: 0)')
                  }

                  this.log(`✅ SWAP_TOKENS confirmed (block ${swapReceipt.blockNumber}, gas: ${swapReceipt.gasUsed.toString()})`)
                  receipts.push(swapReceipt)

                  this.log(`⏳ Waiting 5s for pool price stabilization...`)
                  await new Promise(resolve => setTimeout(resolve, 5000))

                  // CRITICAL: Refresh tick after swap to recalculate position params
                  // The Odos swap moves pool price, making pre-calculated position parameters stale
                  this.log(`📊 Querying fresh tick after swap to recalculate position parameters...`)

                  try {
                    const POOL_ABI = ['function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)']
                    const POOL_ADDRESS = '0x324963c267C354c7660Ce8CA3F5f167E05649970'
                    const poolContract = new Contract(POOL_ADDRESS, POOL_ABI, provider)
                    const slot0 = await poolContract.slot0()
                    const freshTick = Number(slot0.tick)

                    this.log(`📊 Fresh tick after swap: ${freshTick}`)
                    this.log(`🔄 Recalculating OPEN_POSITION params with fresh tick via platform API...`)

                    const refreshResponse = await fetch(`${this.platformUrl}/api/build-transaction`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        intent: intent,
                        userAddress: this.wallet.address,
                        freshFee: currentFee,
                        swapSlippageBps: swapSlippageBps,
                        currentTick: freshTick
                      })
                    })

                    if (!refreshResponse.ok) {
                      throw new Error(`Platform API returned ${refreshResponse.status}`)
                    }

                    const refreshData = await refreshResponse.json()

                    // Update OPEN_POSITION transaction (always last transaction after swap)
                    if (refreshData.transactions && refreshData.transactions.length > 0) {
                      const openTx = refreshData.transactions[refreshData.transactions.length - 1]
                      transactions[transactions.length - 1] = openTx
                      this.log(`✅ OPEN_POSITION params recalculated with fresh tick`)
                    } else {
                      this.log(`⚠️ No transactions returned from refresh, using original params`)
                    }

                  } catch (tickRefreshError) {
                    this.log(`⚠️ Tick refresh failed: ${tickRefreshError.message}`)
                    this.log(`⚠️ Continuing with original position params (may fail if tick drifted significantly)`)
                  }

                } catch (swapError) {
                  this.log(`❌ Odos swap failed: ${swapError.message}`)
                  throw swapError
                }
              } else if (i < transactions.length - 1) {
                // Small delay between other transactions for chain stability
                await new Promise(resolve => setTimeout(resolve, 500))
              }
            }

            // All transactions succeeded
            this.log(`\n✅ Rebalance completed successfully (${transactions.length} transactions, swap slippage: ${swapSlippageBps / 100}%)`)

            // Mark rebalance completion time for idle sweep delay
            this.lastRebalanceTime = Date.now()

            // Calculate total gas used
            const totalGasUsed = receipts.reduce((sum, r) => sum + BigInt(r.gasUsed.toString()), BigInt(0))

            await this.reportReceiptWithRetry(intent.intentId, {
              status: 'completed',
              txHashes: txHashes,
              blockNumbers: receipts.map(r => r.blockNumber),
              gasUsed: totalGasUsed.toString(),
              swapSlippageUsed: swapSlippageBps,
              transactionCount: transactions.length
            })

            // Track gas spending
            await this.trackGasSpending(
              totalGasUsed,
              txHashes[0], // First transaction hash
              'rebalance',
              `Rebalanced position ${tokenId} (${transactions.length} txs)`
            )

            try {
              const escalationSteps = SWAP_SLIPPAGE_TIERS.slice(0, attemptNum)
              await fetch(`${this.platformUrl}/api/ml/log-slippage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  wallet_address: this.wallet.address,
                  token_id: tokenId,
                  tier: intent.recipe.fromTier || 'WARM',
                  operation: 'rebalance',
                  initial_slippage: SWAP_SLIPPAGE_TIERS[0],
                  final_slippage: swapSlippageBps,
                  attempts: attemptNum,
                  escalation_steps: escalationSteps,
                  success: true,
                  tx_hash: txHashes[txHashes.length - 1]
                })
              }).catch(mlError => {
                this.log(`[ML] Failed to log slippage event: ${mlError.message}`)
              })
            } catch (mlError) {
            }

            if (this.platformEventStream) {
              this.platformEventStream.emitRebalance({
                closedPositions: [intent.recipe.tokenId],
                newPositions: txHashes.slice(1), // First tx is close, rest are new positions
                reason: 'out_of_range',
                currentTick: currentTick,
                txHashes: txHashes,
                blockNumbers: receipts.map(r => r.blockNumber)
              })
            }

            this.activePositions.delete(tokenId)
            this.closedPositions.add(tokenId)
            this.log(`🔓 Position ${tokenId} marked as closed - future intents will be skipped`)

            return { success: true, txHashes, receipts }

          } catch (error) {
            this.log(`❌ Attempt ${attemptNum} failed: ${error.message}`)

            // If last attempt, fail permanently
            if (tierIndex === SWAP_SLIPPAGE_TIERS.length - 1) {
              this.log(`\n❌ All ${SWAP_SLIPPAGE_TIERS.length} slippage tiers exhausted - rebalance failed`)
              this.log(`💰 If TX1 (CLOSE) succeeded, funds are safe in your wallet.`)
              this.log(`   You can manually swap tokens and retry, or wait for next rebalance trigger.`)

              try {
                await fetch(`${this.platformUrl}/api/ml/log-slippage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    wallet_address: this.wallet.address,
                    token_id: tokenId,
                    tier: intent.recipe.fromTier || 'WARM',
                    operation: 'rebalance',
                    initial_slippage: SWAP_SLIPPAGE_TIERS[0],
                    final_slippage: null,
                    attempts: SWAP_SLIPPAGE_TIERS.length,
                    escalation_steps: SWAP_SLIPPAGE_TIERS,
                    success: false,
                    final_error: error.message
                  })
                }).catch(mlError => {
                  this.log(`[ML] Failed to log slippage event: ${mlError.message}`)
                })
              } catch (mlError) {
              }

              await this.reportReceiptWithRetry(intent.intentId, {
                status: 'failed',
                error: error.message,
                attemptsExhausted: SWAP_SLIPPAGE_TIERS.length,
                note: 'If TX1 succeeded, funds are safe in wallet'
              })

              return { success: false, error: error.message }
            }

            // Wait before next attempt
            this.log(`⏳ Waiting 2s before retry with higher slippage...`)
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        }
      }

      // BATCH_WITHDRAW: Build transaction locally (no platform API call needed)
      if (intent.action === 'BATCH_WITHDRAW') {
        this.log(`🚪 Building BATCH_WITHDRAW transaction for ${intent.recipe.tokenIds.length} position(s)`)

        const tokenIds = intent.recipe.tokenIds
        const slippageBps = intent.recipe.slippageBps || 50 // Default 0.5% slippage
        const deadline = Math.floor(Date.now() / 1000) + DEADLINE_SECS

        // Setup provider and wallet (same pattern as REBALANCE)
        const { JsonRpcProvider, Contract } = await import('ethers')
        const networks = await this.getNetworks()
        const network = networks.sonic

        if (!network) {
          throw new Error('Sonic network not configured')
        }

        const provider = new JsonRpcProvider(network.rpc)
        const connectedWallet = this.wallet.connect(provider)

        // NFT Position Manager ABI
        const NFPM_ABI = [
          'function positions(uint256 tokenId) view returns (address token0, address token1, int24 tickSpacing, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
          'function ownerOf(uint256 tokenId) view returns (address)'
        ]
        const nfpm = new Contract(NFPM_ADDRESS, NFPM_ABI, provider)

        const multicallData = []
        let totalLiquidity = BigInt(0)

        // Build multicall for each position: decreaseLiquidity + collect + burn
        for (const tokenId of tokenIds) {
          this.log(`📦 Building withdraw for position ${tokenId}...`)

          // Verify ownership and get position data
          try {
            const owner = await nfpm.ownerOf(tokenId)
            if (owner.toLowerCase() !== this.wallet.address.toLowerCase()) {
              this.log(`⚠️  Position ${tokenId} not owned by wallet - skipping`)
              continue
            }

            const position = await nfpm.positions(tokenId)
            const liquidity = position.liquidity

            if (liquidity === BigInt(0)) {
              this.log(`⚠️  Position ${tokenId} has zero liquidity - skipping`)
              continue
            }

            totalLiquidity += liquidity

            // Calculate minimum amounts with slippage protection
            // Use 0 for minimum amounts (allows full withdrawal regardless of price)
            const amount0Min = BigInt(0)
            const amount1Min = BigInt(0)

            this.log(`   Liquidity: ${liquidity.toString()}`)

            // 1. Decrease liquidity to zero
            const decreaseLiquidityData = encodeDecreaseLiquidity({
              tokenId: BigInt(tokenId),
              liquidity: liquidity,
              amount0Min: amount0Min,
              amount1Min: amount1Min,
              deadline: BigInt(deadline)
            })

            // 2. Collect all tokens (fees + withdrawn liquidity)
            const MAX_UINT128 = BigInt('0xffffffffffffffffffffffffffffffff')
            const collectData = encodeCollect({
              tokenId: BigInt(tokenId),
              recipient: this.wallet.address,
              amount0Max: MAX_UINT128,
              amount1Max: MAX_UINT128
            })

            // 3. Burn the NFT
            const burnData = encodeBurn(BigInt(tokenId))

            // Add to multicall
            multicallData.push(decreaseLiquidityData)
            multicallData.push(collectData)
            multicallData.push(burnData)

            this.log(`✅ Position ${tokenId} withdrawal encoded (3 calls)`)

          } catch (error) {
            this.log(`❌ Failed to process position ${tokenId}: ${error.message}`)
          }
        }

        if (multicallData.length === 0) {
          throw new Error('No valid positions to withdraw')
        }

        // Wrap all calls in multicall
        const multicallCalldata = encodeShadowMulticall(multicallData)

        this.log(`📦 Built multicall with ${multicallData.length} calls for ${tokenIds.length} position(s)`)
        this.log(`   Total liquidity: ${totalLiquidity.toString()}`)

        // Execute multicall transaction
        const tx = await this.submitTransaction(connectedWallet, {
          to: NFPM_ADDRESS,
          data: multicallCalldata,
          value: '0x0',
          gasLimit: 500000 * tokenIds.length // Scale gas limit by number of positions
        }, intent.action)

        this.log(`✅ Batch withdraw transaction sent: ${tx.hash}`)

        // Wait for confirmation
        const receipt = await tx.wait()

        if (receipt.status === 0) {
          throw new Error('Batch withdraw transaction reverted (status: 0)')
        }

        this.log(`✅ Batch withdraw confirmed: ${tx.hash} (block ${receipt.blockNumber}, gas: ${receipt.gasUsed.toString()})`)

        // Report success to platform
        await this.reportReceiptWithRetry(intent.intentId, {
          status: 'completed',
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString()
        })

        // Track gas spending
        await this.trackGasSpending(
          receipt.gasUsed,
          tx.hash,
          'batch_withdraw',
          `Closed ${tokenIds.length} position(s)`
        )

        return { success: true, txHash: tx.hash, receipt }
      }

      if (intent.action === 'IDLE_SWEEP') {
        this.log(`🧹 IDLE_SWEEP initiated`)

        const { JsonRpcProvider, Contract } = await import('ethers')
        const networks = await this.getNetworks()
        const network = networks.sonic

        if (!network) {
          throw new Error('Sonic network not configured')
        }

        const provider = new JsonRpcProvider(network.rpc)
        const connectedWallet = this.wallet.connect(provider)

        const WS_TOKEN = '0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38'
        const USDC_TOKEN = '0x29219dd400f2Bf60E5a23d13Be72B486D4038894'
        const ODOS_ROUTER = '0xaC041Df48dF9791B0654f1Dbbf2CC8450C5f2e9D'

        if (intent.recipe.swapDirection !== 'NONE' && intent.recipe.swapAmount) {
          const inputToken = intent.recipe.swapDirection === 'WS_TO_USDC' ? WS_TOKEN : USDC_TOKEN
          const outputToken = intent.recipe.swapDirection === 'WS_TO_USDC' ? USDC_TOKEN : WS_TOKEN
          const inputAmount = BigInt(intent.recipe.swapAmount)

          this.log(`💱 ${intent.recipe.swapDirection}: ${intent.recipe.swapDirection === 'WS_TO_USDC' ? Number(inputAmount) / 1e18 + ' WS' : Number(inputAmount) / 1e6 + ' USDC'}`)

          const quoteResponse = await fetch('https://api.odos.xyz/sor/quote/v2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chainId: 146,
              inputTokens: [{
                tokenAddress: inputToken,
                amount: inputAmount.toString()
              }],
              outputTokens: [{
                tokenAddress: outputToken,
                proportion: 1
              }],
              userAddr: this.wallet.address,
              slippageLimitPercent: 0.5,
              referralCode: 0,
              disableRFQs: false,
              compact: true
            })
          })

          if (!quoteResponse.ok) {
            const errorText = await quoteResponse.text()
            throw new Error(`Odos quote failed: ${quoteResponse.status} ${errorText}`)
          }

          const quoteData = await quoteResponse.json()

          const assembleResponse = await fetch('https://api.odos.xyz/sor/assemble', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddr: this.wallet.address,
              pathId: quoteData.pathId,
              simulate: false
            })
          })

          if (!assembleResponse.ok) {
            const errorText = await assembleResponse.text()
            throw new Error(`Odos assemble failed: ${assembleResponse.status} ${errorText}`)
          }

          const assembleData = await assembleResponse.json()

          const ERC20_ABI = ['function allowance(address owner, address spender) view returns (uint256)', 'function approve(address spender, uint256 amount)']
          const inputTokenContract = new Contract(inputToken, ERC20_ABI, connectedWallet)

          const currentAllowance = await inputTokenContract.allowance(this.wallet.address, ODOS_ROUTER)

          if (currentAllowance < inputAmount) {
            const { MaxUint256 } = await import('ethers')
            const approveTx = await inputTokenContract.approve(ODOS_ROUTER, MaxUint256)
            await approveTx.wait()
          }

          const swapTx = await this.submitTransaction(connectedWallet, {
            to: assembleData.transaction.to,
            data: assembleData.transaction.data,
            value: assembleData.transaction.value || '0x0',
            gasLimit: 800000
          }, intent.action)

          const swapReceipt = await swapTx.wait()

          if (swapReceipt.status === 0) {
            throw new Error('Swap transaction reverted')
          }

          this.log(`✅ Swap confirmed: ${swapTx.hash}`)

          await new Promise(resolve => setTimeout(resolve, 5000))
        }

        const headers = { 'Content-Type': 'application/json' }
        if (this.jwtToken) {
          headers['Authorization'] = `Bearer ${this.jwtToken}`
        }
        const tierConfigResponse = await fetch(`${this.platformUrl}/api/daemon/tier-config`, { headers })

        if (!tierConfigResponse.ok) {
          throw new Error(`Failed to fetch tier config: ${tierConfigResponse.status}`)
        }

        const tierConfigData = await tierConfigResponse.json()
        const tierConfig = tierConfigData.tiers

        const tierPreferences = await loadTierPreferences()

        const enabledTiers = Object.keys(tierConfig).filter(tierName => tierPreferences[tierName]?.enabled)

        if (enabledTiers.length === 0) {
          throw new Error('No tiers enabled in configuration')
        }

        const totalEnabledPct = enabledTiers.reduce((sum, tierName) =>
          sum + (tierPreferences[tierName]?.allocPct || 0), 0)

        const normalizedTierConfig = {}
        for (const tierName of enabledTiers) {
          const userPct = tierPreferences[tierName]?.allocPct || 0
          const normalizedPct = totalEnabledPct > 0 ? userPct / totalEnabledPct : 0

          normalizedTierConfig[tierName] = {
            ...tierConfig[tierName],
            allocPct: normalizedPct
          }
        }

        // Use global constants (no local shadowing to prevent security issues)
        // POOL_ADDRESS, NFPM_ADDRESS, TICK_SPACING defined at module level (lines 29-36)
        const DEADLINE_SECS = 300

        const POOL_ABI = ['function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)']
        const pool = new Contract(POOL_ADDRESS, POOL_ABI, provider)

        const receipts = []
        const txHashes = []
        const positionData = []

        for (let i = 0; i < enabledTiers.length; i++) {
          const tierName = enabledTiers[i]
          const tierSettings = normalizedTierConfig[tierName]

          this.log(`🚀 [${i+1}/${enabledTiers.length}] ${tierName}`)

          const slot0 = await pool.slot0()
          const currentTick = Number(slot0.tick)
          const sqrtPriceX96 = slot0.sqrtPriceX96

          const alignedTick = Math.round(currentTick / TICK_SPACING) * TICK_SPACING
          const halfWidth = tierSettings.width / 2
          const tickLower = alignedTick - halfWidth
          const tickUpper = alignedTick + halfWidth

          const ERC20_ABI = ['function balanceOf(address) view returns (uint256)']
          const wsToken = new Contract(WS_TOKEN, ERC20_ABI, provider)
          const usdcToken = new Contract(USDC_TOKEN, ERC20_ABI, provider)

          const currentWsBalance = await wsToken.balanceOf(this.wallet.address)
          const currentUsdcBalance = await usdcToken.balanceOf(this.wallet.address)

          const wsForTier = (currentWsBalance * BigInt(Math.floor(tierSettings.allocPct * 10000))) / BigInt(10000)
          const usdcForTier = (currentUsdcBalance * BigInt(Math.floor(tierSettings.allocPct * 10000))) / BigInt(10000)

          const wsValue = Number(wsForTier) / 1e18 * 0.20
          const usdcValue = Number(usdcForTier) / 1e6
          if (wsValue + usdcValue < 1.0) {
            this.log(`⏭️  Skip (too small)`)
            continue
          }

          const { amount0Desired, amount1Desired } = calculateOptimalAmounts({
            currentTick,
            tickLower,
            tickUpper,
            amount0Available: wsForTier,
            amount1Available: usdcForTier,
            sqrtPriceX96
          })

          const slippageBps = config.slippage
          const amount0Min = (amount0Desired * BigInt(10000 - slippageBps)) / BigInt(10000)
          const amount1Min = (amount1Desired * BigInt(10000 - slippageBps)) / BigInt(10000)

          const deadline = Math.floor(Date.now() / 1000) + DEADLINE_SECS
          const mintData = encodeShadowMint({
            token0: WS_TOKEN,
            token1: USDC_TOKEN,
            tickSpacing: TICK_SPACING,
            tickLower,
            tickUpper,
            amount0Desired,
            amount1Desired,
            amount0Min,
            amount1Min,
            recipient: this.wallet.address,
            deadline
          })

          const multicallData = encodeShadowMulticall([mintData])

          const tx = await this.submitTransaction(connectedWallet, {
            to: NFPM_ADDRESS,
            data: multicallData,
            value: '0x0',
            gasLimit: 500000
          }, intent.action)

          this.log(`✅ ${tx.hash}`)
          txHashes.push(tx.hash)

          const receipt = await tx.wait()

          if (receipt.status === 0) {
            throw new Error('Transaction reverted')
          }

          receipts.push(receipt)

          let tokenId = null
          for (const log of receipt.logs) {
            if (log.topics.length === 4 && log.topics[1] === '0x0000000000000000000000000000000000000000000000000000000000000000') {
              tokenId = Number(BigInt(log.topics[3]))
              break
            }
          }

          positionData.push({
            tier: tierName,
            tokenId,
            tickLower,
            tickUpper,
            amount0: amount0Desired.toString(),
            amount1: amount1Desired.toString(),
            txHash: tx.hash,
            blockNumber: receipt.blockNumber
          })
        }

        const totalGasUsed = receipts.reduce((sum, r) => sum + BigInt(r.gasUsed.toString()), BigInt(0))

        await this.reportReceiptWithRetry(intent.intentId, {
          status: 'completed',
          txHashes: txHashes,
          blockNumbers: receipts.map(r => r.blockNumber),
          gasUsed: totalGasUsed.toString(),
          positions: positionData
        })

        await this.trackGasSpending(
          totalGasUsed,
          txHashes[0],
          'idle_sweep',
          `Deployed ${positionData.length} position(s)`
        )

        // Mark deployment time for idle sweep delay (avoid immediate re-sweep)
        this.lastRebalanceTime = Date.now()

        return { success: true, txHashes, receipts }
      }

      // Non-REBALANCE, Non-BATCH_WITHDRAW actions: Build transaction via platform API
      const buildResponse = await fetch(`${this.platformUrl}/api/build-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent,
          userAddress: this.wallet.address,
          freshFee
        })
      })

      if (!buildResponse.ok) {
        const errorData = await buildResponse.json().catch(() => ({}))
        throw new Error(`Build transaction failed: ${errorData.error || buildResponse.status}`)
      }

      const txData = await buildResponse.json()
      this.log(`📝 Transaction built for intent ${intent.intentId}`)

      // DIAGNOSTIC: Log full response structure for debugging
      this.log(`🔍 Build response structure: ${JSON.stringify(Object.keys(txData))}`)
      if (txData.transaction) {
        this.log(`🔍 Transaction keys: ${JSON.stringify(Object.keys(txData.transaction))}`)
        this.log(`🔍 Transaction.to: ${txData.transaction.to}`)
        this.log(`🔍 Transaction.data type: ${typeof txData.transaction.data}`)
        this.log(`🔍 Transaction.data length: ${txData.transaction.data?.length || 0}`)
        this.log(`🔍 Transaction.data preview: ${txData.transaction.data?.substring(0, 66) || 'MISSING/EMPTY!'}`)
      } else {
        this.log(`⚠️  No 'transaction' field in response!`)
      }

      // Handle multi-transaction response (for non-DEPLOY batch operations)
      if (txData.transactions && Array.isArray(txData.transactions)) {
        this.log(`📦 Executing ${txData.transactions.length} transactions sequentially`)

        const receipts = []
        const txHashes = []

        for (let i = 0; i < txData.transactions.length; i++) {
          const transaction = txData.transactions[i]
          const tier = transaction.tier || `#${i+1}`

          this.log(`🔄 [${i+1}/${txData.transactions.length}] Sending ${tier} transaction...`)

          const tx = await this.submitTransaction(connectedWallet, {
            to: transaction.to,
            data: transaction.data,
            value: transaction.value || '0x0',
            gasLimit: transaction.gasLimit ? BigInt(transaction.gasLimit) : undefined
          }, intent.action)

          this.log(`✅ ${tier} transaction sent: ${tx.hash}`)
          txHashes.push(tx.hash)

          // Wait for confirmation
          const receipt = await tx.wait()

          if (receipt.status === 0) {
            throw new Error(`${tier} transaction reverted (status: 0)`)
          }

          this.log(`✅ ${tier} confirmed: ${tx.hash} (block ${receipt.blockNumber}, gas: ${receipt.gasUsed.toString()})`)
          receipts.push(receipt)

          // Delay between transactions if specified
          if (i < txData.transactions.length - 1 && txData.delayBetweenMs) {
            this.log(`⏳ Waiting ${txData.delayBetweenMs}ms before next transaction...`)
            await new Promise(resolve => setTimeout(resolve, txData.delayBetweenMs))
          }
        }

        // Calculate total gas used
        const totalGasUsed = receipts.reduce((sum, r) => sum + BigInt(r.gasUsed.toString()), BigInt(0))

        // Report success with all transaction hashes
        await this.reportReceiptWithRetry(intent.intentId, {
          status: 'completed',
          txHashes: txHashes,
          blockNumbers: receipts.map(r => r.blockNumber),
          gasUsed: totalGasUsed.toString()
        })

        // Track gas spending (for batch operations like DEPLOY)
        if (intent.action === 'DEPLOY') {
          await this.trackGasSpending(
            totalGasUsed,
            txHashes[0],
            'deploy',
            `Deployed ${txHashes.length} position(s)`
          )
        }

        // Emit position deployment events for viewers
        if (intent.action === 'DEPLOY' && this.platformEventStream) {
          // Each transaction in DEPLOY is a tier position
          txHashes.forEach((txHash, index) => {
            this.platformEventStream.emitPositionDeployed({
              txHash: txHash,
              blockNumber: receipts[index].blockNumber,
              tier: txData.transactions[index].tier || `Position ${index + 1}`
            })
          })
        }

        return { success: true, txHashes, receipts }

      } else {
        // Single transaction (REBALANCE, COLLECT_FEES, etc.)
        const transaction = txData.transaction || txData

        // DIAGNOSTIC: Log exactly what we're sending
        this.log(`🔍 Sending transaction:`)
        this.log(`   to: ${transaction.to}`)
        this.log(`   data: ${transaction.data ? transaction.data.substring(0, 66) + '... (' + transaction.data.length + ' bytes)' : 'MISSING!'}`)
        this.log(`   value: ${transaction.value || '0x0'}`)
        this.log(`   gasLimit: ${transaction.gasLimit || 'auto'}`)

        // Validate transaction has data
        if (!transaction.data || transaction.data === '0x' || transaction.data.length < 10) {
          throw new Error(`Invalid transaction data: ${transaction.data || 'undefined'} - platform may have failed to build transaction`)
        }

        // IMMEDIATE submission after encoding with fresh fee
        const tx = await this.submitTransaction(connectedWallet, {
          to: transaction.to,
          data: transaction.data,
          value: transaction.value || '0x0',
          gasLimit: transaction.gasLimit || undefined
        }, intent.action)

        this.log(`✅ Transaction sent: ${tx.hash}`)

        // Wait for confirmation
        const receipt = await tx.wait()

        // Check if transaction reverted (status === 0 means revert on EVM)
        if (receipt.status === 0) {
          throw new Error('Transaction execution reverted (status: 0)')
        }

        this.log(`✅ Transaction confirmed: ${tx.hash} (block ${receipt.blockNumber})`)

        // Report success to platform
        await this.reportReceiptWithRetry(intent.intentId, {
          status: 'completed',
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString()
        })

        // Track gas spending
        await this.trackGasSpending(
          receipt.gasUsed,
          tx.hash,
          intent.action.toLowerCase(),
          `${intent.action} transaction`
        )

        // Emit events for viewers based on intent action
        if (this.platformEventStream) {
          if (intent.action === 'COLLECT_FEES') {
            this.platformEventStream.emitFeesCollected({
              txHash: tx.hash,
              blockNumber: receipt.blockNumber,
              tokenIds: intent.recipe?.tokenIds || []
            })
          }
        }

        return { success: true, txHash: tx.hash, receipt }
      }

    } catch (error) {
      // Generate user-friendly error message
      let userFriendlyMessage = error.message

      if (error.message.includes('insufficient funds') || error.message.includes('insufficient balance')) {
        userFriendlyMessage = '⚠️  Insufficient LOGIC balance for gas fees. Please top up at https://app.bulwk.com'
      } else if (error.message.includes('execution reverted')) {
        userFriendlyMessage = '❌ Transaction reverted on-chain. This may indicate insufficient rewards, contract issues, or that rewards were already claimed.'
      } else if (error.message.includes('out of gas')) {
        userFriendlyMessage = '⚠️  Transaction ran out of gas. Please report this issue - gas limits may need adjustment.'
      } else if (error.message.includes('network') || error.message.includes('timeout')) {
        userFriendlyMessage = '🌐 Network connection issue. Check your internet connection and try again.'
      } else if (error.message.includes('nonce')) {
        userFriendlyMessage = '🔄 Transaction nonce conflict. This usually resolves automatically on retry.'
      }

      this.log(`❌ Intent execution failed (attempt ${attempt}/${MAX_RETRIES}): ${userFriendlyMessage}`)

      // Categorize errors for smart retry logic
      const isPermanentError = error.message.includes('nonce') && error.message.includes('too low') ||
                              error.message.includes('already known') ||
                              error.message.includes('replacement fee too low') ||
                              error.message.includes('invalid signature') ||
                              error.message.includes('not authorized')

      const isSlippageError = error.message.includes('slippage') ||
                             error.message.includes('INSUFFICIENT_OUTPUT_AMOUNT') ||
                             error.message.includes('Too little received') ||
                             error.message.includes('K') // Uniswap K invariant error

      const isTemporaryError = error.message.includes('revert') ||
                              error.message.includes('insufficient funds') ||
                              error.message.includes('insufficient balance') ||
                              error.message.includes('network') ||
                              error.message.includes('timeout') ||
                              error.message.includes('out of range')

      // Handle permanent errors - don't retry
      if (isPermanentError) {
        this.log(`🚫 Permanent error detected - will not retry (likely already processed or nonce conflict)`)
        // Skip retry logic and fail immediately
      }
      // Handle slippage errors for non-REBALANCE actions (REBALANCE has built-in slippage escalation)
      else if (isSlippageError && intent.action !== 'REBALANCE') {
        this.log(`⚠️  Slippage error - recommend increasing slippage tolerance in settings`)
      }
      else if (isTemporaryError && attempt < MAX_RETRIES) {
        this.log(`⏳ Temporary error detected - retrying after ${RETRY_DELAY_MS}ms delay...`)
        this.log(`   Error type: ${isSlippageError ? 'slippage' : 'transient'}`)

        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))

        this.log(`🔄 Retrying intent ${intent.intentId}...`)
        return await this.executeIntent(intent, attempt + 1)
      }

      // Max retries exhausted or non-retriable error
      this.log(`❌ Intent ${intent.intentId} failed permanently after ${attempt} attempt(s)`)

      if (intent.action === 'REBALANCE' && intent.recipe?.tokenId) {
        this.activePositions.delete(intent.recipe.tokenId)
        this.log(`🔓 Position ${intent.recipe.tokenId} removed from active tracking (failed) - can retry later`)
      }

      // Report failure to platform
      await this.reportReceiptWithRetry(intent.intentId, {
        status: 'failed',
        error: userFriendlyMessage,
        attempts: attempt
      })

      // Emit error event for viewers
      if (this.platformEventStream) {
        this.platformEventStream.emitError({
          message: userFriendlyMessage,
          code: 'INTENT_EXECUTION_FAILED',
          intentId: intent.intentId,
          action: intent.action
        })
      }

      return { success: false, error: userFriendlyMessage, attempts: attempt }
    }
  }

  /**
   * Report receipt with automatic retry on 401 errors
   * Attempts to refresh JWT and retry once if authentication fails
   */
  async reportReceiptWithRetry(intentId, receipt) {
    // First attempt
    const firstAttempt = await this.reportReceipt(intentId, receipt)

    if (firstAttempt) {
      return true // Success on first attempt
    }

    // If failed, check if we should retry (only on auth errors)
    // The reportReceipt function logs the error, so we can detect 401
    // by checking if JWT refresh would help

    this.log(`🔄 Attempting to refresh JWT and retry receipt reporting...`)

    // Try to refresh JWT
    const refreshed = await this.refreshJwtToken()

    if (!refreshed) {
      this.log(`❌ JWT refresh failed - cannot retry receipt reporting`)
      return false
    }

    this.log(`✅ JWT refreshed - retrying receipt report for ${intentId}`)

    // Second attempt with fresh JWT
    const secondAttempt = await this.reportReceipt(intentId, receipt)

    if (secondAttempt) {
      this.log(`✅ Receipt reporting succeeded after JWT refresh`)
      return true
    }

    this.log(`❌ Receipt reporting failed even after JWT refresh`)
    return false
  }

  async reportReceipt(intentId, receipt) {
    try {
      // Validate JWT token exists before attempting to report receipt
      if (!this.jwtToken) {
        this.log(`⚠️  Cannot report receipt for ${intentId} - no session token available`)
        this.log(`   Daemon may need to be re-linked. Receipts will not be reported.`)
        return false
      }

      // SECURITY FIX: Validate txHash exists for completed status
      if (receipt.status === 'completed') {
        const hasTxHash = receipt.txHash || (receipt.txHashes && receipt.txHashes.length > 0 && receipt.txHashes[0])
        if (!hasTxHash) {
          this.log(`⚠️  Cannot report completed receipt for ${intentId} - no txHash available`)
          this.log(`   This indicates transaction failed before getting hash. Reporting as failed instead.`)
          // Change status to failed and add error message
          receipt = {
            ...receipt,
            status: 'failed',
            error: 'Transaction failed before txHash was returned',
            txHash: undefined,
            txHashes: undefined
          }
        }
      }

      const headers = { 'Content-Type': 'application/json' }
      if (this.jwtToken) {
        headers['Authorization'] = `Bearer ${this.jwtToken}`
      }

      const response = await fetch(`${this.platformUrl}/api/daemon/receipts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          intentId,
          wallet: this.wallet.address,
          sessionToken: this.jwtToken, // Required for daemon session validation
          timestamp: Date.now(),
          ...receipt
        })
      })

      // Check response status before logging success
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        this.log(`❌ Receipt reporting failed for ${intentId}`)
        this.log(`   Status: ${response.status} ${response.statusText}`)
        this.log(`   Error: ${errorData.error || errorData.details || 'Unknown error'}`)

        // Special handling for auth errors
        if (response.status === 401) {
          this.log(`   🔒 Authentication failed - daemon session may be expired`)
          this.log(`   Daemon may need to be re-linked at ${this.platformUrl}`)
        }

        return false
      }

      const responseData = await response.json().catch(() => ({}))
      this.log(`📤 Receipt reported for intent ${intentId}`)

      // Log any important info from the response
      if (responseData.positionSynced) {
        this.log(`   ✅ Position data synced to backend`)
      }
      if (responseData.intentDeleted) {
        this.log(`   🗑️  Intent deleted from backend (prevents replay)`)
      }

      return true

    } catch (error) {
      this.log(`❌ Receipt reporting error for ${intentId}: ${error.message}`)
      this.log(`   Network or connection issue - receipt was not delivered`)
      return false
    }
  }

  async trackGasSpending(gasUsedWei, txHash, action, description) {
    try {
      const response = await fetch(`${this.platformUrl}/api/gas/track-spending`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.jwtToken}`
        },
        body: JSON.stringify({
          walletAddress: this.wallet.address,
          sessionToken: this.jwtToken,
          gasUsedWei: gasUsedWei.toString(),
          txHash,
          action,
          description
        })
      })

      if (response.ok) {
        const data = await response.json()
        this.log(`⛽ Gas tracked: ${data.gasUsed?.logic?.toFixed(2) || '?'} LOGIC (${action})`)
      } else {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }))
        this.log(`⚠️  Gas tracking failed: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      // Non-critical - don't fail the intent if gas tracking fails
      this.log(`⚠️  Gas tracking error: ${error.message}`)
    }
  }

  /**
   * Sweep idle balances - 3-scan system (15-minute window)
   * Scan 1: Record baseline
   * Scan 2: If balances increased, deploy original amount
   * Scan 3: Deploy confirmed leftover
   *
   * Integrates with database functions from migration 045:
   * - record_idle_balance_snapshot()
   * - check_idle_sweep_action()
   * - mark_idle_sweep_deployed()
   */
  async sweepIdleBalances() {
    // Check if idle sweep is enabled in config
    const config = await this.getConfig()
    if (!config.idleSweepEnabled) {
      return
    }

    // Mutex lock: Don't sweep if actively processing intents or have pending queue
    // This prevents conflicts with REBALANCE operations
    if (this.isProcessingIntent || this.pendingIntents.length > 0) {
      return
    }

    // CRITICAL: Wait 30s after rebalance to avoid race condition
    // Tokens are in transit after rebalance completion, causing false "zero balance" errors
    if (this.lastRebalanceTime && Date.now() - this.lastRebalanceTime < 30000) {
      const secondsAgo = Math.round((Date.now() - this.lastRebalanceTime) / 1000)
      this.log(`⏸️  Idle sweep delayed - rebalance completed ${secondsAgo}s ago (waiting 30s for token settlement)`)
      return
    }

    try {
      const { JsonRpcProvider, Contract } = await import('ethers')
      const networks = await this.getNetworks()
      const network = networks.sonic

      if (!network) {
        return
      }

      const provider = await this.getProviderWithFallback(network.rpc)

      // Token addresses
      const WS_TOKEN = '0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38'
      const USDC_TOKEN = '0x29219dd400f2Bf60E5a23d13Be72B486D4038894'

      // Check wallet balances
      const ERC20_ABI = ['function balanceOf(address) view returns (uint256)']
      const wsContract = new Contract(WS_TOKEN, ERC20_ABI, provider)
      const usdcContract = new Contract(USDC_TOKEN, ERC20_ABI, provider)

      const wsBalance = await wsContract.balanceOf(this.wallet.address)
      const usdcBalance = await usdcContract.balanceOf(this.wallet.address)

      const wsBalanceNum = Number(wsBalance) / 1e18
      const usdcBalanceNum = Number(usdcBalance) / 1e6

      this.log(`💰 Wallet balances: ${wsBalanceNum.toFixed(6)} WS, ${usdcBalanceNum.toFixed(6)} USDC`)

      // Check if auto_deploy_idle is enabled for this user
      const headers = { 'Content-Type': 'application/json' }
      if (this.jwtToken) {
        headers['Authorization'] = `Bearer ${this.jwtToken}`
      }

      const settingsResponse = await fetch(`${this.platformUrl}/api/daemon/policy?wallet=${this.wallet.address}`, { headers })

      if (!settingsResponse.ok) {
        // Settings not available, skip idle sweep
        return
      }

      const settings = await settingsResponse.json()
      const autoDeployEnabled = settings.auto_deploy_idle || false

      // Get WS price to calculate total USD value
      const POOL_ADDRESS = '0x324963c267C354c7660Ce8CA3F5f167E05649970'
      const POOL_ABI = [
        'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
        'function token0() external view returns (address)',
        'function token1() external view returns (address)'
      ]

      const pool = new Contract(POOL_ADDRESS, POOL_ABI, provider)
      const [slot0, token0Address] = await Promise.all([
        pool.slot0(),
        pool.token0()
      ])

      let sqrtPriceX96 = slot0.sqrtPriceX96

      if (!sqrtPriceX96 || sqrtPriceX96 === 0n) {
        this.log(`⚠️  Pool returned zero sqrtPriceX96, retrying with fallback RPC...`)
        const fallbackProvider = await this.getProviderWithFallback(null)
        const fallbackPool = new Contract(POOL_ADDRESS, POOL_ABI, fallbackProvider)
        const fallbackSlot0 = await fallbackPool.slot0()

        if (!fallbackSlot0.sqrtPriceX96 || fallbackSlot0.sqrtPriceX96 === 0n) {
          throw new Error('Unable to fetch valid pool price from any RPC endpoint')
        }

        sqrtPriceX96 = fallbackSlot0.sqrtPriceX96
        this.log(`✅ Fallback RPC returned valid price`)
      }

      this.log(`📊 Pool sqrtPriceX96: ${sqrtPriceX96}`)

      const sqrtPrice = Number(sqrtPriceX96) / Math.pow(2, 96)
      const rawPrice = sqrtPrice * sqrtPrice
      const price = rawPrice * Math.pow(10, 18 - 6)  // Fixed: WS (18 decimals) - USDC (6 decimals)

      // Determine if token0 is WS (need to invert if token1 is WS)
      const wsPrice = token0Address.toLowerCase() === WS_TOKEN.toLowerCase() ? price : 1 / price

      this.log(`💱 WS/USD price: $${wsPrice.toFixed(4)}`)

      let totalValueUSD
      let shouldProceed = false

      if (wsPrice === 0 || !isFinite(wsPrice) || wsPrice > 10) {
        this.log(`⚠️  Invalid WS price: $${wsPrice} - using curve ratio fallback`)

        const wsValueUSD = wsBalanceNum * wsPrice
        totalValueUSD = wsValueUSD + usdcBalanceNum

        const MIN_TOTAL_USD = 5.0
        if (totalValueUSD >= MIN_TOTAL_USD) {
          shouldProceed = true
        } else {
          const targetRatio = 0.5
          const currentWsRatio = wsBalanceNum / (wsBalanceNum + (usdcBalanceNum / wsPrice))
          const ratioDiff = Math.abs(currentWsRatio - targetRatio)

          if (ratioDiff > 0.1 && (wsBalanceNum > 0 || usdcBalanceNum > 0)) {
            this.log(`📊 Curve ratio: ${(currentWsRatio * 100).toFixed(1)}% WS / ${((1 - currentWsRatio) * 100).toFixed(1)}% USDC`)
            this.log(`🔄 Ratio imbalance detected (${(ratioDiff * 100).toFixed(1)}% from 50/50) - will rebalance before deploy`)
            shouldProceed = true
          }
        }
      } else {
        const wsValueUSD = wsBalanceNum * wsPrice
        totalValueUSD = wsValueUSD + usdcBalanceNum

        this.log(`💵 USD values: WS=$${wsValueUSD.toFixed(2)}, USDC=$${usdcBalanceNum.toFixed(2)}, Total=$${totalValueUSD.toFixed(2)}`)

        const MIN_TOTAL_USD = 5.0
        if (totalValueUSD >= MIN_TOTAL_USD) {
          shouldProceed = true
        }
      }

      if (!shouldProceed) {
        this.log(`⏸️  Idle sweep skipped - total $${totalValueUSD.toFixed(2)} below threshold and ratio balanced`)
        return
      }

      // Record snapshot and check for action needed
      const sweepHeaders = { 'Content-Type': 'application/json' }
      if (this.jwtToken) {
        sweepHeaders['Authorization'] = `Bearer ${this.jwtToken}`
      }

      const snapshotResponse = await fetch(`${this.platformUrl}/api/daemon/idle-sweep`, {
        method: 'POST',
        headers: sweepHeaders,
        body: JSON.stringify({
          wallet: this.wallet.address,
          sessionToken: this.jwtToken,
          wsBalance: wsBalanceNum.toString(),
          usdcBalance: usdcBalanceNum.toString(),
          autoDeployEnabled
        })
      })

      if (!snapshotResponse.ok) {
        this.log(`⚠️  Could not record idle balance snapshot`)
        return
      }

      const snapshotData = await snapshotResponse.json()

      // Check what action is needed
      const actionResponse = await fetch(`${this.platformUrl}/api/daemon/idle-sweep?wallet=${this.wallet.address}`, { headers: sweepHeaders })

      if (!actionResponse.ok) {
        this.log(`⚠️  Could not check idle sweep action`)
        return
      }

      const actionData = await actionResponse.json()

      // Defensive logging to debug action flow
      this.log(`📊 Idle sweep check: action=${actionData.action}, scan=${actionData.scanNumber}`)

      if (actionData.action === 'none' || actionData.action === 'disabled' || actionData.action === 'wait') {
        // No action needed yet (waiting for next scan)
        this.log(`✅ Idle sweep: ${actionData.action} - no deployment needed`)
        return
      }

      this.log(`\n🧹 Idle balance sweep - Scan #${actionData.scanNumber}`)

      // Re-query live wallet balance (use ALL available tokens, not snapshot)
      const [liveWsBalance, liveUsdcBalance] = await Promise.all([
        wsContract.balanceOf(this.wallet.address),
        usdcContract.balanceOf(this.wallet.address)
      ])

      const liveWsBalanceNum = Number(liveWsBalance) / 1e18
      const liveUsdcBalanceNum = Number(liveUsdcBalance) / 1e6

      this.log(`   Live WS balance: ${liveWsBalanceNum.toFixed(6)}`)
      this.log(`   Live USDC balance: ${liveUsdcBalanceNum.toFixed(6)}`)

      // Create IDLE_SWEEP intent via platform (using LIVE balance)
      const deployResponse = await fetch(`${this.platformUrl}/api/daemon/idle-sweep/deploy`, {
        method: 'POST',
        headers: sweepHeaders,
        body: JSON.stringify({
          wallet: this.wallet.address,
          sessionToken: this.jwtToken,
          wsToDeploy: liveWsBalanceNum.toString(),
          usdcToDeploy: liveUsdcBalanceNum.toString(),
          scanNumber: actionData.scanNumber
        })
      })

      if (!deployResponse.ok) {
        const errorData = await deployResponse.json()
        this.log(`⚠️  Could not create IDLE_SWEEP intent: ${errorData.error}`)
        return
      }

      const deployData = await deployResponse.json()
      this.log(`✅ IDLE_SWEEP intent created: ${deployData.intentId}`)

      if (deployData.needsSwap) {
        this.log(`   Swap will execute: ${deployData.swapDirection}`)
      } else {
        this.log(`   Already balanced 50/50, no swap needed`)
      }

      this.log(`   5-tier deployment will follow`)

    } catch (error) {
      this.log(`⚠️  Idle balance sweep error: ${error.message}`)
    }
  }

  async processIntentQueue() {
    // Mutex lock: prevent concurrent intent processing
    if (this.isProcessingIntent) {
      this.log('⏸️ Intent processor busy - will process queue on next poll')
      return
    }

    // No intents to process
    if (this.pendingIntents.length === 0) {
      return
    }

    try {
      this.isProcessingIntent = true

      console.log(`📋 Processing ${this.pendingIntents.length} intent(s)`)

      // Clear the queue since we're processing all intents
      const intentsToProcess = [...this.pendingIntents]
      this.pendingIntents = []

      // Execute all intents sequentially with stabilization delays
      let successCount = 0
      let failureCount = 0

      for (let i = 0; i < intentsToProcess.length; i++) {
        const intent = intentsToProcess[i]
        const positionKey = this.getPositionKey(intent)

        console.log(`📋 [${i + 1}/${intentsToProcess.length}] Processing intent ${intent.intentId} (${positionKey})`)

        try {
          await this.executeIntent(intent)
          successCount++

          // Add 5-second pool stabilization delay between rebalances (except after last one)
          if (i < intentsToProcess.length - 1 && intent.action === 'REBALANCE') {
            console.log(`⏳ Waiting 5s for pool price stabilization before next rebalance...`)
            await new Promise(resolve => setTimeout(resolve, 5000))
          }
        } catch (error) {
          failureCount++
          console.error(`   ❌ Intent ${intent.intentId} failed: ${error.message}`)
        }
      }

      console.log(`✅ Processed ${successCount}/${intentsToProcess.length} intent(s) successfully (${failureCount} failed)`)

    } finally {
      // Always release lock, even if execution fails
      this.isProcessingIntent = false
    }
  }

  /**
   * Get position key for intent grouping
   * Intents with same key cannot run in parallel
   */
  getPositionKey(intent) {
    // REBALANCE: uses tokenId
    if (intent.action === 'REBALANCE' && intent.recipe?.tokenId) {
      return `rebalance:${intent.recipe.tokenId}`
    }

    // BATCH_WITHDRAW: uses all tokenIds (cannot parallelize with other batch ops)
    if (intent.action === 'BATCH_WITHDRAW' && intent.recipe?.tokenIds) {
      return `batch:${intent.recipe.tokenIds.sort().join(',')}`
    }

    // Unknown intent type: give it unique key to prevent accidental parallelization
    return `unknown:${intent.intentId}`
  }

  async stop() {
    this.isRunning = false

    // Disconnect platform event stream
    if (this.platformEventStream) {
      this.platformEventStream.disconnect()
      this.platformEventStream = null
    }

    this.wallet = null
    this.linkCode = null
    this.linkUrl = null

    // Stop heartbeat
    this.stopHeartbeat()

    // Stop policy sync
    if (this.policySync) {
      this.policySync.stop()
      this.policySync = null
    }

    // Stop grace period monitor
    if (this.gracePeriodMonitor) {
      this.gracePeriodMonitor.stop()
      this.gracePeriodMonitor = null
    }

    // Stop intent polling
    if (this.intentInterval) {
      clearInterval(this.intentInterval)
      this.intentInterval = null
    }

    // Stop idle sweep timer
    if (this.idleSweepInterval) {
      clearInterval(this.idleSweepInterval)
      this.idleSweepInterval = null
    }

    // Disable keep awake
    if (this.keepAwakeEnabled) {
      await this.disableKeepAwake()
    }

    // Clear pending intents
    this.pendingIntents = []
    this.lastIntentCheck = null
  }

  async getLinkStatus() {
    return {
      linkCode: this.linkCode,
      linkUrl: this.linkUrl,
      isLinked: this.isLinked,
      needsDisclaimer: this.needsDisclaimer
    }
  }

  async getPolicy() {
    try {
      const policyJson = await fs.readFile(POLICY_PATH, 'utf-8')
      return JSON.parse(policyJson)
    } catch {
      return null
    }
  }

  async updatePolicy(updates) {
    const currentPolicy = await this.getPolicy()
    const newPolicy = { ...currentPolicy, ...updates }
    await fs.writeFile(POLICY_PATH, JSON.stringify(newPolicy, null, 2))
  }

  async loadConfig() {
    try {
      const configJson = await fs.readFile(DAEMON_CONFIG_PATH, 'utf-8')
      return JSON.parse(configJson)
    } catch {
      // Config doesn't exist - create with defaults
      await fs.mkdir(CONFIG_DIR, { recursive: true })
      await fs.writeFile(DAEMON_CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2))
      return DEFAULT_CONFIG
    }
  }

  async getConfig() {
    if (!this.config) {
      this.config = await this.loadConfig()
    }
    return this.config
  }

  async updateConfig(updates) {
    const currentConfig = await this.getConfig()

    // Validate slippage (for position deployment)
    if (updates.slippage !== undefined) {
      const slippage = Number(updates.slippage)
      if (isNaN(slippage) || slippage < 100 || slippage > 5000) {
        throw new Error('Slippage must be between 100 (1%) and 5000 (50%)')
      }
    }

    // Validate swap slippage (for LOGIC purchases)
    if (updates.swapSlippage !== undefined) {
      const swapSlippage = Number(updates.swapSlippage)
      if (isNaN(swapSlippage) || swapSlippage < 0.05 || swapSlippage > 5.0) {
        throw new Error('Swap slippage must be between 0.05% and 5%')
      }
    }

    // Tier allocations are managed server-side only - not configurable locally

    // Validate minDeploymentUsd
    if (updates.minDeploymentUsd !== undefined) {
      const minUsd = Number(updates.minDeploymentUsd)
      if (isNaN(minUsd) || minUsd < 0.1 || minUsd > 10.0) {
        throw new Error('Minimum deployment must be between 0.1 and 10.0 USD')
      }
    }

    const newConfig = { ...currentConfig, ...updates }
    await fs.writeFile(DAEMON_CONFIG_PATH, JSON.stringify(newConfig, null, 2))
    this.config = newConfig // Update cached config
    return newConfig
  }

  async signMessage(message) {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Please start the daemon first.')
    }

    return await this.wallet.signMessage(message)
  }

  async signTypedData(domain, types, value) {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Please start the daemon first.')
    }

    return await this.wallet.signTypedData(domain, types, value)
  }

  async sendTransaction(to, value, data = '0x') {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Please start the daemon first.')
    }

    const { JsonRpcProvider } = await import('ethers')

    // Get network config
    const networks = await this.getNetworks()
    const sonicNetwork = networks.sonic

    if (!sonicNetwork) {
      throw new Error('Sonic network not configured')
    }

    // Connect wallet to provider
    const provider = new JsonRpcProvider(sonicNetwork.rpc)
    const connectedWallet = this.wallet.connect(provider)

    // Send transaction
    const tx = await connectedWallet.sendTransaction({
      to,
      value,
      data
    })

    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value.toString()
    }
  }

  async sendTokenTransaction(tokenAddress, to, amount) {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Please start the daemon first.')
    }

    const { JsonRpcProvider } = await import('ethers')

    // Get token config
    const tokenConfig = getTokenByAddress(tokenAddress)
    if (!tokenConfig) {
      throw new Error(`Unknown token: ${tokenAddress}`)
    }

    // Get network config
    const networks = await this.getNetworks()
    const sonicNetwork = networks.sonic

    if (!sonicNetwork) {
      throw new Error('Sonic network not configured')
    }

    // Connect wallet to provider
    const provider = new JsonRpcProvider(sonicNetwork.rpc)
    const connectedWallet = this.wallet.connect(provider)

    // Parse amount based on token decimals
    const amountWei = parseTokenAmount(amount, tokenConfig.decimals)

    // Create ERC-20 contract instance
    const ERC20_ABI = ['function transfer(address to, uint256 amount) returns (bool)']
    const tokenContract = new Contract(tokenAddress, ERC20_ABI, connectedWallet)

    // Send token transfer transaction
    const tx = await tokenContract.transfer(to, amountWei)

    console.log(`✅ Token transfer sent: ${amount} ${tokenConfig.symbol} to ${to}`)
    console.log(`   Transaction hash: ${tx.hash}`)

    return {
      hash: tx.hash,
      from: tx.from,
      to: tokenAddress,
      token: tokenConfig.symbol,
      recipient: to,
      amount: amount.toString()
    }
  }

  async getBalances(customTokens = []) {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Please start the daemon first.')
    }

    const { JsonRpcProvider } = await import('ethers')

    // Get network config
    const networks = await this.getNetworks()
    const sonicNetwork = networks.sonic

    if (!sonicNetwork) {
      throw new Error('Sonic network not configured')
    }

    // Create provider
    const provider = new JsonRpcProvider(sonicNetwork.rpc)

    // Fetch all token balances (including custom tokens)
    const balances = await getAllBalances(provider, this.wallet.address, customTokens)

    return {
      wallet: this.wallet.address,
      balances
    }
  }

  /**
   * Execute swap via Odos DEX aggregator
   * @param {string} estimatedUsdcNeeded - USDC amount needed (in wei)
   * @param {number} slippage - Slippage tolerance percentage (e.g., 0.5 for 0.5%)
   * @param {Object} provider - Ethers provider
   * @param {Object} connectedWallet - Connected wallet instance
   * @returns {Object} { success: true, txHash, expectedWsAmount, usdcUsed }
   */
  async executeOdosSwap(estimatedUsdcNeeded, slippage, provider, connectedWallet) {
    const USDC_TOKEN = '0x29219dd400f2Bf60E5a23d13Be72B486D4038894'
    const WS_TOKEN = '0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38'

    try {
      this.log(`🔵 Trying Odos @ ${slippage}% slippage...`)

      // Step 1: Get swap quote from Odos
      const quoteResponse = await fetch('https://api.odos.xyz/sor/quote/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: 146, // Sonic
          inputTokens: [{
            tokenAddress: USDC_TOKEN,
            amount: estimatedUsdcNeeded.toString()
          }],
          outputTokens: [{
            tokenAddress: WS_TOKEN,
            proportion: 1
          }],
          slippageLimitPercent: slippage,
          userAddr: this.wallet.address,
          referralCode: 0,
          compact: true
        })
      })

      if (!quoteResponse.ok) {
        const errorText = await quoteResponse.text()
        throw new Error(`Odos quote failed: ${quoteResponse.status} ${errorText}`)
      }

      const quoteData = await quoteResponse.json()
      this.log(`✅ Quote received: ${Number(quoteData.inAmounts[0]) / 1e6} USDC → ${Number(quoteData.outAmounts[0]) / 1e18} wS`)

      const expectedWsAmount = BigInt(quoteData.outAmounts[0])
      const usdcUsed = BigInt(quoteData.inAmounts[0])

      // Step 2: Assemble transaction
      const assembleResponse = await fetch('https://api.odos.xyz/sor/assemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddr: this.wallet.address,
          pathId: quoteData.pathId,
          simulate: false
        })
      })

      if (!assembleResponse.ok) {
        const errorText = await assembleResponse.text()
        throw new Error(`Odos assemble failed: ${assembleResponse.status} ${errorText}`)
      }

      const assembleData = await assembleResponse.json()

      // Validate transaction data
      if (!assembleData.transaction || !assembleData.transaction.to || !assembleData.transaction.data || assembleData.transaction.data === '' || assembleData.transaction.data === '0x') {
        throw new Error(`Invalid Odos transaction data: missing or empty calldata`)
      }

      this.log(`📦 Transaction assembled, executing swap...`)

      // Step 3: Approve USDC if needed
      const ERC20_ABI = [
        'function approve(address spender, uint256 amount) returns (bool)',
        'function allowance(address owner, address spender) view returns (uint256)'
      ]

      const { Contract } = await import('ethers')
      const usdcContract = new Contract(USDC_TOKEN, ERC20_ABI, provider)
      const currentAllowance = await usdcContract.allowance(
        this.wallet.address,
        assembleData.transaction.to
      )

      if (currentAllowance < usdcUsed) {
        this.log(`🔓 Approving USDC for Odos router...`)
        const usdcWithSigner = usdcContract.connect(connectedWallet)
        const approveTx = await usdcWithSigner.approve(
          assembleData.transaction.to,
          '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
        )
        await approveTx.wait()
        this.log(`✅ USDC approved`)
      }

      // Step 4: Execute swap
      const swapTx = await this.submitTransaction(connectedWallet, {
        to: assembleData.transaction.to,
        data: assembleData.transaction.data,
        value: assembleData.transaction.value || 0,
        gasLimit: assembleData.transaction.gas || 500000
      }, 'LOGIC_PURCHASE')

      this.log(`⏳ Swap transaction sent: ${swapTx.hash}`)

      const receipt = await swapTx.wait()

      if (receipt.status === 0) {
        throw new Error('Swap transaction reverted')
      }

      this.log(`✅ Odos swap confirmed: ${swapTx.hash}`)

      return {
        success: true,
        txHash: swapTx.hash,
        expectedWsAmount,
        usdcUsed
      }

    } catch (error) {
      this.log(`❌ Odos swap failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Execute swap via Fly.trade DEX aggregator (Magpie Router)
   * @param {string} estimatedUsdcNeeded - USDC amount needed (in wei)
   * @param {number} slippage - Slippage tolerance percentage (e.g., 0.5 for 0.5%)
   * @param {Object} provider - Ethers provider
   * @param {Object} connectedWallet - Connected wallet instance
   * @returns {Object} { success: true, txHash, expectedWsAmount, usdcUsed }
   */
  async executeFlySwap(estimatedUsdcNeeded, slippage, provider, connectedWallet) {
    const USDC_TOKEN = '0x29219dd400f2Bf60E5a23d13Be72B486D4038894'
    const WS_TOKEN = '0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38'
    const FLY_ROUTER = '0xc325856e5585823aac0d1fd46c35c608d95e65a9'

    try {
      this.log(`🟣 Trying Fly.trade @ ${slippage}% slippage...`)

      // Step 1: Get quote from Fly.trade
      const slippageDecimal = slippage / 100 // Convert 0.5% to 0.005
      const quoteUrl = `https://api.fly.trade/aggregator/quote?network=sonic&fromTokenAddress=${USDC_TOKEN}&toTokenAddress=${WS_TOKEN}&sellAmount=${estimatedUsdcNeeded}&slippage=${slippageDecimal}&fromAddress=${this.wallet.address}&toAddress=${this.wallet.address}&gasless=false`

      const quoteResponse = await fetch(quoteUrl)

      if (!quoteResponse.ok) {
        const errorText = await quoteResponse.text()
        throw new Error(`Fly.trade quote failed: ${quoteResponse.status} ${errorText}`)
      }

      const quoteData = await quoteResponse.json()
      this.log(`✅ Quote received: ${Number(estimatedUsdcNeeded) / 1e6} USDC → ${Number(quoteData.amountOut) / 1e18} wS`)

      const expectedWsAmount = BigInt(quoteData.amountOut)
      const usdcUsed = BigInt(estimatedUsdcNeeded)
      const quoteId = quoteData.id

      // Step 2: Sign EIP-712 typed data
      const typedData = quoteData.typedData
      const signature = await connectedWallet.signTypedData(
        typedData.domain,
        typedData.types,
        typedData.message
      )

      this.log(`🔏 Signed EIP-712 permit`)

      // Step 3: Get transaction data
      const txUrl = `https://api.fly.trade/aggregator/transaction?quoteId=${quoteId}&signature=${signature}`
      const txResponse = await fetch(txUrl)

      if (!txResponse.ok) {
        const errorText = await txResponse.text()
        throw new Error(`Fly.trade transaction failed: ${txResponse.status} ${errorText}`)
      }

      const txData = await txResponse.json()

      // Validate transaction data
      if (!txData.to || !txData.data || txData.data === '' || txData.data === '0x') {
        throw new Error(`Invalid Fly.trade transaction data: missing or empty calldata`)
      }

      this.log(`📦 Transaction assembled, executing swap...`)

      // Step 4: Approve USDC if needed
      const ERC20_ABI = [
        'function approve(address spender, uint256 amount) returns (bool)',
        'function allowance(address owner, address spender) view returns (uint256)'
      ]

      const { Contract } = await import('ethers')
      const usdcContract = new Contract(USDC_TOKEN, ERC20_ABI, provider)
      const currentAllowance = await usdcContract.allowance(
        this.wallet.address,
        FLY_ROUTER
      )

      if (currentAllowance < usdcUsed) {
        this.log(`🔓 Approving USDC for Fly.trade router...`)
        const usdcWithSigner = usdcContract.connect(connectedWallet)
        const approveTx = await usdcWithSigner.approve(
          FLY_ROUTER,
          '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
        )
        await approveTx.wait()
        this.log(`✅ USDC approved`)
      }

      // Step 5: Execute swap
      const swapTx = await this.submitTransaction(connectedWallet, {
        to: txData.to,
        data: txData.data,
        value: txData.value || 0,
        gasLimit: txData.gas || 500000
      }, 'LOGIC_PURCHASE')

      this.log(`⏳ Swap transaction sent: ${swapTx.hash}`)

      const receipt = await swapTx.wait()

      if (receipt.status === 0) {
        throw new Error('Swap transaction reverted')
      }

      this.log(`✅ Fly.trade swap confirmed: ${swapTx.hash}`)

      return {
        success: true,
        txHash: swapTx.hash,
        expectedWsAmount,
        usdcUsed
      }

    } catch (error) {
      this.log(`❌ Fly.trade swap failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Purchase LOGIC credits via USDC→S swap using Odos
   * @param {number} logicAmount - Amount of LOGIC to purchase
   * @returns {Object} Transaction result with hash
   */
  async purchaseLogic(logicAmount) {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Please start the daemon first.')
    }

    if (!this.isLinked) {
      throw new Error('Daemon not linked. Please link your daemon first.')
    }

    try {
      const { JsonRpcProvider, Contract } = await import('ethers')

      // Get network config
      const networks = await this.getNetworks()
      const sonicNetwork = networks.sonic

      if (!sonicNetwork) {
        throw new Error('Sonic network not configured')
      }

      const provider = new JsonRpcProvider(sonicNetwork.rpc)
      const connectedWallet = this.wallet.connect(provider)

      // Load config for swap slippage setting
      const config = await this.getConfig()
      const swapSlippage = config.swapSlippage || 0.5 // Default 0.5% if not set

      // 1 LOGIC ≈ 0.2 S (5 LOGIC per S)
      const sAmount = logicAmount * 0.2
      const sAmountWei = BigInt(Math.floor(sAmount * 1e18))

      this.log(`💱 Swapping USDC → ${sAmount.toFixed(2)} S (for ${logicAmount} LOGIC)`)
      this.log(`⚙️  Swap slippage tolerance: ${swapSlippage}%`)

      // Fetch real-time S/USDC price from Shadow DEX pool
      const POOL_ABI = [
        'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
        'function token0() external view returns (address)',
        'function token1() external view returns (address)'
      ]

      const poolContract = new Contract(POOL_ADDRESS, POOL_ABI, provider)
      const [token0, token1, slot0] = await Promise.all([
        poolContract.token0(),
        poolContract.token1(),
        poolContract.slot0()
      ])

      const sqrtPriceX96 = slot0[0]

      // Calculate price from sqrtPriceX96: price = (sqrtPriceX96 / 2^96)^2
      const Q96 = BigInt(2) ** BigInt(96)
      const sqrtPrice = Number(sqrtPriceX96) / Number(Q96)
      let sPerUsdc = sqrtPrice ** 2

      // Adjust for token decimals (USDC=6, WS=18)
      if (token0.toLowerCase() === USDC_TOKEN.toLowerCase()) {
        // USDC is token0 (6 decimals), WS is token1 (18 decimals)
        sPerUsdc = sPerUsdc / 1e12
      } else {
        // WS is token0 (18 decimals), USDC is token1 (6 decimals)
        sPerUsdc = (1 / sPerUsdc) / 1e12
      }

      this.log(`💱 Live pool price: ${sPerUsdc.toFixed(4)} S per USDC`)

      // Calculate USDC needed based on real-time price
      const usdcPerS = 1 / sPerUsdc
      const estimatedUsdcNeeded = Math.ceil(sAmount * usdcPerS * 1e6) // USDC has 6 decimals
      this.log(`📊 USDC needed for ${sAmount.toFixed(2)} S: ${(estimatedUsdcNeeded / 1e6).toFixed(2)} USDC`)

      // Multi-router fallback strategy:
      // 1. Try Odos @ 0.5% slippage
      // 2. Try Fly.trade @ 0.5% slippage
      // 3. Try Odos @ 1.0% slippage (max)
      // 4. Try Fly.trade @ 1.0% slippage (max)
      const strategies = [
        { router: 'Odos', slippage: 0.5, executor: this.executeOdosSwap.bind(this) },
        { router: 'Fly.trade', slippage: 0.5, executor: this.executeFlySwap.bind(this) },
        { router: 'Odos', slippage: 1.0, executor: this.executeOdosSwap.bind(this) },
        { router: 'Fly.trade', slippage: 1.0, executor: this.executeFlySwap.bind(this) }
      ]

      let swapResult = null
      let lastError = null

      for (let i = 0; i < strategies.length; i++) {
        const strategy = strategies[i]

        try {
          swapResult = await strategy.executor(estimatedUsdcNeeded, strategy.slippage, provider, connectedWallet)

          if (swapResult.success) {
            this.log(`✅ Swap successful via ${strategy.router} @ ${strategy.slippage}%`)
            break
          }
        } catch (error) {
          lastError = error
          this.log(`❌ ${strategy.router} @ ${strategy.slippage}% failed: ${error.message}`)

          // If not the last strategy, wait 1 second before trying next
          if (i < strategies.length - 1) {
            this.log(`⏳ Waiting 1s before trying next router...`)
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }
      }

      // If all strategies failed, throw user-friendly error
      if (!swapResult || !swapResult.success) {
        throw new Error('Network is busy, try again in 10-20 seconds')
      }

      // Extract results from successful swap
      const expectedWsAmount = swapResult.expectedWsAmount
      const usdcAmount = swapResult.usdcUsed
      const swapTx = { hash: swapResult.txHash }
      const receipt = { blockNumber: 0 } // Will be updated in unwrap step if needed

      // Step 5: Unwrap wS → native S (required for gas/LOGIC balance)
      this.log(`🔄 Unwrapping wS to native S...`)

      const WRAPPED_S_ABI = [
        'function withdraw(uint256 amount)',
        'function balanceOf(address owner) view returns (uint256)'
      ]

      const wsContract = new Contract(WS_TOKEN, WRAPPED_S_ABI, provider)

      // Only unwrap the amount we just swapped, not the entire wS balance
      if (expectedWsAmount > 0n) {
        const wsWithSigner = wsContract.connect(connectedWallet)
        const unwrapTx = await wsWithSigner.withdraw(expectedWsAmount)

        this.log(`⏳ Unwrap transaction sent: ${unwrapTx.hash}`)

        const unwrapReceipt = await unwrapTx.wait()

        if (unwrapReceipt.status === 0) {
          throw new Error('Unwrap transaction reverted')
        }

        this.log(`✅ Unwrapped ${Number(expectedWsAmount) / 1e18} wS → native S (tx: ${unwrapTx.hash})`)
      } else {
        this.log(`⚠️  No wS to unwrap from swap`)
      }

      // Step 6: Report purchase to platform
      try {
        const reportResponse = await fetch(`${this.platformUrl}/api/logic/purchase-complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: this.wallet.address,
            logicAmount,
            sAmount: sAmount.toFixed(2),
            usdcAmount: (Number(usdcAmount) / 1e6).toFixed(2),
            txHash: swapTx.hash,
            blockNumber: receipt.blockNumber
          })
        })

        if (reportResponse.ok) {
          this.log(`📊 Purchase reported to platform`)
        }
      } catch (reportError) {
        this.log(`⚠️  Failed to report purchase: ${reportError.message}`)
        // Don't fail the purchase if reporting fails
      }

      return {
        hash: swapTx.hash,
        blockNumber: receipt.blockNumber,
        logicAmount,
        sAmount: sAmount.toFixed(2),
        usdcAmount: (Number(usdcAmount) / 1e6).toFixed(2)
      }

    } catch (error) {
      this.log(`❌ LOGIC purchase failed: ${error.message}`, 'error')
      throw error
    }
  }

  /**
   * Get uncollected fees for all active positions
   * Returns LP fees (WS, USDC) and SHADOW gauge rewards
   */
  async getPositionFees() {
    if (!this.wallet) {
      throw new Error('Wallet not initialized. Please start the daemon first.')
    }

    try {
      const { JsonRpcProvider, Contract } = await import('ethers')

      // Get network config
      const networks = await this.getNetworks()
      const sonicNetwork = networks.sonic

      if (!sonicNetwork) {
        throw new Error('Sonic network not configured')
      }

      const provider = new JsonRpcProvider(sonicNetwork.rpc)

      // Shadow Protocol NFPM ABI
      const NFPM_ABI = [
        'function balanceOf(address owner) view returns (uint256)',
        'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
        'function positions(uint256 tokenId) view returns (address token0, address token1, int24 tickSpacing, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)'
      ]

      // Shadow Gauge ABI for querying rewards
      const GAUGE_ABI = [
        'function earned(address rewardToken, uint256 tokenId) view returns (uint256)'
      ]

      const nfpm = new Contract(NFPM_ADDRESS, NFPM_ABI, provider)
      const gauge = new Contract(GAUGE_ADDRESS, GAUGE_ABI, provider)

      // Get count of positions owned by wallet
      const balance = await nfpm.balanceOf(this.wallet.address)
      const balanceNum = Number(balance)

      if (balanceNum === 0) {
        return {
          ws: '0',
          usdc: '0',
          shadow: '0',
          tokenIds: []
        }
      }

      let totalWsFees = BigInt(0)
      let totalUsdcFees = BigInt(0)
      let totalShadowRewards = BigInt(0)
      const tokenIds = []

      // Iterate through all positions
      for (let i = 0; i < balanceNum; i++) {
        try {
          const tokenId = await nfpm.tokenOfOwnerByIndex(this.wallet.address, i)

          // Try to decode position data
          let position
          try {
            position = await nfpm.positions(tokenId)
          } catch (decodeError) {
            console.warn(`Failed to decode position ${tokenId}: ${decodeError.message}`)
            console.warn(`  This usually means the position was burned or is invalid`)
            continue
          }

          // Skip closed positions (no liquidity)
          // Note: Backend will mark these as inactive, so they won't appear in future syncs
          if (position.liquidity === 0n) {
            continue
          }

          tokenIds.push(tokenId.toString())

          // Accumulate LP fees (tokensOwed0 = WS, tokensOwed1 = USDC)
          totalWsFees += position.tokensOwed0
          totalUsdcFees += position.tokensOwed1

          // Query SHADOW gauge rewards for this position
          try {
            const shadowRewards = await gauge.earned(SHADOW_TOKEN, tokenId)
            totalShadowRewards += shadowRewards
          } catch (error) {
            console.warn(`Failed to query SHADOW rewards for tokenId ${tokenId}:`, error.message)
          }

        } catch (error) {
          console.warn(`Failed to query position index ${i}:`, error.message)
        }
      }

      // Format fees to readable decimals
      const wsFeesFormatted = (Number(totalWsFees) / 1e18).toFixed(4)
      const usdcFeesFormatted = (Number(totalUsdcFees) / 1e6).toFixed(4)
      const shadowRewardsFormatted = (Number(totalShadowRewards) / 1e18).toFixed(4)

      return {
        ws: wsFeesFormatted,
        usdc: usdcFeesFormatted,
        shadow: shadowRewardsFormatted,
        tokenIds
      }

    } catch (error) {
      console.error('Failed to fetch position fees:', error)
      throw new Error(`Failed to fetch position fees: ${error.message}`)
    }
  }

  async getNetworks() {
    try {
      const networksJson = await fs.readFile(NETWORKS_PATH, 'utf-8')
      return JSON.parse(networksJson)
    } catch {
      // Return default networks if file doesn't exist
      return this.getDefaultNetworks()
    }
  }

  getDefaultNetworks() {
    return {
      sonic: {
        chainId: 146,
        name: 'Sonic',
        rpc: 'https://sonic.drpc.org',
        explorer: 'https://sonicscan.org',
        nativeCurrency: {
          name: 'Sonic',
          symbol: 'S',
          decimals: 18
        }
      }
    }
  }

  async updateNetworks(networks) {
    await fs.mkdir(CONFIG_DIR, { recursive: true })
    await fs.writeFile(NETWORKS_PATH, JSON.stringify(networks, null, 2))
  }

  async syncNetworksFromPlatform() {
    try {
      const response = await fetch(`${this.platformUrl}/api/daemon/networks`)
      if (response.ok) {
        const networks = await response.json()
        await this.updateNetworks(networks)
        console.log('✅ Networks synced from platform')
        return networks
      }
    } catch (error) {
      console.error('Failed to sync networks:', error)
      // Fallback to existing or default networks
      return await this.getNetworks()
    }
  }

  async resetWallet() {
    // Stop daemon if running
    if (this.isRunning) {
      await this.stop()
    }

    // Delete keystore and policy files
    try {
      await fs.unlink(KEYSTORE_PATH)
    } catch (error) {
      // Ignore if file doesn't exist
    }

    try {
      await fs.unlink(POLICY_PATH)
    } catch (error) {
      // Ignore if file doesn't exist
    }

    try {
      await fs.unlink(NETWORKS_PATH)
    } catch (error) {
      // Ignore if file doesn't exist
    }

    this.wallet = null
    this.linkCode = null
    this.linkUrl = null
    this.isLinked = false
  }

  /**
   * Enable keep awake - prevents computer from sleeping
   */
  async enableKeepAwake() {
    if (this.keepAwakeEnabled) {
      return { success: true, message: 'Keep awake already enabled' }
    }

    try {
      if (this.platform === 'darwin') {
        // macOS: Use caffeinate to prevent sleep
        this.keepAwakeProcess = spawn('caffeinate', ['-d'])
        this.log('☕ Keep awake enabled (macOS caffeinate)')
      } else if (this.platform === 'win32') {
        // Windows: Use PowerShell to prevent sleep
        const psScript = `
          $code = @'
          [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
          public static extern uint SetThreadExecutionState(uint esFlags);
          '@
          $ste = Add-Type -MemberDefinition $code -Name System -Namespace Win32 -PassThru
          # ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
          $ste::SetThreadExecutionState(0x80000003)
          while($true) { Start-Sleep -Seconds 30 }
        `
        this.keepAwakeProcess = spawn('powershell.exe', ['-NoProfile', '-Command', psScript])
        this.log('☕ Keep awake enabled (Windows)')
      } else {
        // Linux: Try systemd-inhibit if available, otherwise warn
        this.keepAwakeProcess = spawn('systemd-inhibit', [
          '--what=idle:sleep',
          '--who=Bulwk Daemon',
          '--why=Auto-rebalancing agent running',
          'sleep', 'infinity'
        ])
        this.log('☕ Keep awake enabled (Linux systemd-inhibit)')
      }

      this.keepAwakeEnabled = true

      // Handle process errors
      this.keepAwakeProcess.on('error', (err) => {
        console.error('Keep awake process error:', err.message)
        this.keepAwakeEnabled = false
        this.keepAwakeProcess = null
      })

      this.keepAwakeProcess.on('exit', (code) => {
        if (this.keepAwakeEnabled) {
          console.log('Keep awake process exited with code:', code)
          this.keepAwakeEnabled = false
          this.keepAwakeProcess = null
        }
      })

      return { success: true, message: 'Keep awake enabled' }
    } catch (error) {
      this.log(`❌ Failed to enable keep awake: ${error.message}`)
      return { success: false, error: error.message }
    }
  }

  /**
   * Disable keep awake - allow computer to sleep normally
   */
  async disableKeepAwake() {
    if (!this.keepAwakeEnabled || !this.keepAwakeProcess) {
      return { success: true, message: 'Keep awake already disabled' }
    }

    try {
      // Kill the keep awake process
      this.keepAwakeProcess.kill()
      this.keepAwakeProcess = null
      this.keepAwakeEnabled = false

      // Windows: Reset thread execution state
      if (this.platform === 'win32') {
        const psResetScript = `
          $code = @'
          [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
          public static extern uint SetThreadExecutionState(uint esFlags);
          '@
          $ste = Add-Type -MemberDefinition $code -Name System -Namespace Win32 -PassThru
          # ES_CONTINUOUS - reset to default
          $ste::SetThreadExecutionState(0x80000000)
        `
        spawn('powershell.exe', ['-NoProfile', '-Command', psResetScript])
      }

      this.log('💤 Keep awake disabled')
      return { success: true, message: 'Keep awake disabled' }
    } catch (error) {
      this.log(`❌ Failed to disable keep awake: ${error.message}`)
      return { success: false, error: error.message }
    }
  }

  /**
   * Toggle keep awake on/off
   */
  async toggleKeepAwake() {
    if (this.keepAwakeEnabled) {
      return await this.disableKeepAwake()
    } else {
      return await this.enableKeepAwake()
    }
  }

  /**
   * Force re-link daemon to platform
   *
   * Used when daemon is already registered but needs to re-authenticate
   * (e.g., JWT token mismatch, platform URL change)
   *
   * This will:
   * 1. Delete local JWT token (force fresh auth)
   * 2. Call platform force-relink endpoint to get NEW link code
   * 3. Invalidate any existing linked sessions for this daemon
   * 4. Return new link code for user to complete linking
   *
   * @param {string} password - Optional password to load wallet if not already loaded
   */
  async forceRelink(password) {
    // If wallet not loaded, try to load it with provided password
    if (!this.wallet) {
      if (!password) {
        throw new Error('Password required to load wallet')
      }

      try {
        const keystoreJson = await fs.readFile(KEYSTORE_PATH, 'utf-8')
        this.wallet = await Wallet.fromEncryptedJson(keystoreJson, password)
        this.log('✅ Wallet loaded temporarily for re-linking')
      } catch (error) {
        throw new Error('Failed to load wallet: ' + error.message)
      }
    }

    this.log('🔄 Initiating force re-link...')

    // Delete local JWT token to force fresh authentication
    try {
      await fs.unlink(JWT_TOKEN_PATH)
      this.jwtToken = null
      this.log('✅ Deleted local JWT token')
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.log(`⚠️  Failed to delete JWT token: ${error.message}`)
      }
    }

    // Call platform force-relink endpoint to get NEW link code
    const timestamp = Date.now()
    const message = `Force re-link Bulwk daemon - ${timestamp}`
    const signature = await this.wallet.signMessage(message)

    this.log('🔐 Requesting new link code from platform...')

    const response = await fetch(`${this.platformUrl}/api/daemon/force-relink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature, message })
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || `Platform returned ${response.status}`)
    }

    const data = await response.json()
    this.linkCode = data.linkCode
    this.linkUrl = data.linkUrl
    this.isLinked = false // Reset - user must complete linking

    this.log(`✅ New link code generated: ${this.linkCode}`)
    this.log(`📱 Visit: ${this.linkUrl}`)

    return {
      linkCode: this.linkCode,
      linkUrl: this.linkUrl,
      isLinked: this.isLinked
    }
  }
}

// Run address validation immediately on module load (before any daemon code runs)
// This prevents variable shadowing attacks and configuration errors
validateCriticalAddresses()
await validateAddressChecksum()
