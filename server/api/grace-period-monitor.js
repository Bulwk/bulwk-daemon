// Copyright (c) 2025 Bulwk. All rights reserved.
// Licensed under Bulwk Proprietary License
// Full terms: ipfs://QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D

export class GracePeriodMonitor {
  constructor(daemon) {
    this.daemon = daemon
    this.platformUrl = daemon.platformUrl || 'https://app.bulwk.com'
    this.monitorInterval = null
    this.CHECK_INTERVAL_MS = 10000 // Check every 10 seconds
    this.COLLECTION_THRESHOLD_MS = 60000 // Collect Shadow 60s before grace expiry
    this.trackedPositions = new Map() // tokenId -> { graceExpiresAt, shadowCollected, tier }
    this.log = daemon.log.bind(daemon)
    // Tier definitions matching backend config
    this.GRACE_PERIODS = {
      HOT: 3 * 60000,       // 3 minutes
      WARM: 5 * 60000,      // 5 minutes
      MEDIUM: 10 * 60000,   // 10 minutes
      WIDE: 15 * 60000,     // 15 minutes
      INSURANCE: 20 * 60000 // 20 minutes
    }
  }

  /**
   * Infer tier from tick range width
   * Matches backend logic from tier-helper.js
   */
  getTierFromRange(tickLower, tickUpper) {
    const rangeWidth = Math.abs(tickUpper - tickLower)
    if (rangeWidth <= 100) return 'HOT'
    if (rangeWidth <= 200) return 'WARM'
    if (rangeWidth <= 300) return 'MEDIUM'
    if (rangeWidth <= 400) return 'WIDE'
    return 'INSURANCE'
  }

  /**
   * Validate grace period matches tier expectations
   */
  validateGracePeriod(tier, graceExpiresAt, positionCreatedAt) {
    const expectedGracePeriod = this.GRACE_PERIODS[tier]
    if (!expectedGracePeriod) return { valid: true, message: 'Unknown tier' }

    const actualGracePeriod = new Date(graceExpiresAt).getTime() - new Date(positionCreatedAt).getTime()
    const tolerance = 5000 // 5 second tolerance for timestamp differences
    const isValid = Math.abs(actualGracePeriod - expectedGracePeriod) < tolerance

    return {
      valid: isValid,
      message: isValid
        ? `Grace period matches ${tier} tier (${expectedGracePeriod / 60000}min)`
        : `⚠️ Grace period mismatch: expected ${expectedGracePeriod / 60000}min for ${tier} tier, got ${actualGracePeriod / 60000}min`,
      expectedMinutes: expectedGracePeriod / 60000,
      actualMinutes: actualGracePeriod / 60000
    }
  }

  start() {
    if (this.monitorInterval) {
      this.log('⚠️ Grace period monitor already running')
      return
    }

    this.log('🛡️ Starting Grace Period Monitor - will auto-collect Shadow before rebalancing')

    // Run initial check immediately on startup to collect Shadow from positions
    // that may have expired during daemon downtime
    setTimeout(async () => {
      try {
        this.log('🔍 Running initial grace period check on startup...')
        await this.checkGracePeriods()
      } catch (error) {
        this.log(`❌ Initial grace period check error: ${error.message}`, 'error')
      }
    }, 5000) // Wait 5 seconds for daemon to fully initialize

    this.monitorInterval = setInterval(async () => {
      try {
        await this.checkGracePeriods()
      } catch (error) {
        this.log(`❌ Grace period check error: ${error.message}`, 'error')
      }
    }, this.CHECK_INTERVAL_MS)
  }

  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval)
      this.monitorInterval = null
      this.trackedPositions.clear()
      this.log('🛑 Grace Period Monitor stopped')
    }
  }

  async checkGracePeriods() {
    // Log daemon state for debugging
    // SECURITY WARNING: Never include this.daemon.wallet object - only use .address property
    const daemonState = {
      isRunning: this.daemon.isRunning,
      isLinked: this.daemon.isLinked,
      hasWallet: !!this.daemon.wallet,
      walletAddress: this.daemon.wallet?.address
    }

    // Only run if daemon is active and linked
    if (!this.daemon.isRunning || !this.daemon.isLinked || !this.daemon.wallet) {
      this.log(`⏸️ Grace monitor skipped - daemon not ready: ${JSON.stringify(daemonState)}`)
      return
    }

    this.log(`🔍 Grace monitor check - wallet: ${this.daemon.wallet.address}`)

    try {
      // Fetch positions from platform (with grace period info)
      const headers = { 'Content-Type': 'application/json' }
      if (this.daemon.jwtToken) {
        headers['Authorization'] = `Bearer ${this.daemon.jwtToken}`
      }

      const response = await fetch(
        `${this.platformUrl}/api/daemon/positions?wallet=${this.daemon.wallet.address}`,
        { headers }
      )

      if (!response.ok) {
        // Log ALL failures (removed silent 404 handling to debug missing endpoint)
        const errorMsg = `API ${response.status} from ${this.platformUrl}/api/daemon/positions`
        this.log(`⚠️ ${errorMsg}`, 'warn')
        throw new Error(`Failed to fetch positions: ${response.status}`)
      }

      const data = await response.json()
      const positions = data.positions || []

      // Log position status breakdown
      const statusCounts = {}
      positions.forEach(p => {
        statusCounts[p.status] = (statusCounts[p.status] || 0) + 1
      })

      const gracePeriodPositions = positions.filter(p => p.status === 'GRACE_PERIOD')
      this.log(`📊 Found ${positions.length} positions: ${JSON.stringify(statusCounts)}`)
      this.log(`   ${gracePeriodPositions.length} in GRACE_PERIOD status`)

      for (const position of positions) {
        if ((position.status === 'GRACE_PERIOD' || position.status === 'REBALANCE_QUEUED' || position.status === 'PENDING_REBALANCE') && position.graceExpiresAt) {
          const shadowAmount = parseFloat(position.shadowRewards) || 0
          const expiresAt = new Date(position.graceExpiresAt).getTime()
          const timeRemaining = expiresAt - Date.now()
          const secondsRemaining = Math.round(timeRemaining / 1000)

          // Show clear message based on grace period status
          if (secondsRemaining >= 0) {
            this.log(`   Position #${position.tokenId}: ${shadowAmount.toFixed(6)} SHADOW, status: ${position.status}, ${secondsRemaining}s until grace expiry`)
          } else {
            const secondsAfterExpiry = Math.abs(secondsRemaining)
            this.log(`   Position #${position.tokenId}: ${shadowAmount.toFixed(6)} SHADOW, status: ${position.status}, grace expired ${secondsAfterExpiry}s ago`)
          }
          await this.handlePositionInGracePeriod(position)
        }
      }

      // Clean up tracked positions that are no longer in grace period
      this.cleanupTrackedPositions(positions)

    } catch (error) {
      this.log(`❌ Grace period check error: ${error.message}`, 'error')
      this.log(`   URL: ${this.platformUrl}/api/daemon/positions?wallet=${this.daemon.wallet.address}`)
      this.log(`   Daemon state: ${JSON.stringify(daemonState)}`)
    }
  }

  async handlePositionInGracePeriod(position) {
    const { tokenId, graceExpiresAt, shadowRewards, tickLower, tickUpper, createdAt } = position
    const expiresAt = new Date(graceExpiresAt).getTime()
    const now = Date.now()
    const timeRemaining = expiresAt - now

    // Infer tier from tick range if available
    let tier = 'UNKNOWN'
    if (tickLower !== undefined && tickUpper !== undefined) {
      tier = this.getTierFromRange(tickLower, tickUpper)
    }

    // Track this position
    if (!this.trackedPositions.has(tokenId)) {
      this.trackedPositions.set(tokenId, {
        graceExpiresAt: expiresAt,
        shadowCollected: false,
        tier
      })

      // Show clear message based on grace period status
      const secondsRemaining = Math.round(timeRemaining / 1000)
      const minutesRemaining = Math.round(secondsRemaining / 60)

      // Validate grace period matches tier
      if (tier !== 'UNKNOWN' && createdAt && graceExpiresAt) {
        const validation = this.validateGracePeriod(tier, graceExpiresAt, createdAt)
        if (!validation.valid) {
          this.log(`⚠️ Position #${tokenId} (${tier} tier): ${validation.message}`)
        }
      }

      if (secondsRemaining >= 0) {
        this.log(`🕐 Position #${tokenId} (${tier} tier) entered grace period - ${minutesRemaining}min remaining until potential rebalance`)
      } else {
        const minutesAfterExpiry = Math.abs(minutesRemaining)
        this.log(`🕐 Position #${tokenId} (${tier} tier) grace period expired ${minutesAfterExpiry}min ago - awaiting rebalance execution`)
      }
    }

    const tracked = this.trackedPositions.get(tokenId)
    // Update tier if it was unknown before
    if (tracked.tier === 'UNKNOWN' && tier !== 'UNKNOWN') {
      tracked.tier = tier
    }

    const secondsRemaining = Math.round(timeRemaining / 1000)

    // Always attempt Shadow collection if not yet collected, regardless of how late
    // This fixes the issue where daemon startup delays would prevent Shadow collection
    const shouldCollect = (
      (timeRemaining < this.COLLECTION_THRESHOLD_MS && !tracked.shadowCollected) ||
      (timeRemaining <= 0 && !tracked.shadowCollected)
    )

    if (shouldCollect) {
      if (secondsRemaining >= 0 && secondsRemaining <= 60) {
        this.log(`💎 Position #${tokenId}: ${secondsRemaining}s until grace expiry - collecting Shadow preemptively to prevent burning`)
      } else if (secondsRemaining < 0) {
        const secondsAfterExpiry = Math.abs(secondsRemaining)
        this.log(`💎 Position #${tokenId}: Grace expired ${secondsAfterExpiry}s ago - collecting Shadow before rebalance execution`)
      } else {
        this.log(`💎 Position #${tokenId}: Collecting Shadow (${secondsRemaining}s until grace expiry)`)
      }

      try {
        const MIN_CLAIMABLE_SHADOW = 0.001

        const shadowAmount = parseFloat(shadowRewards) || 0
        if (shadowAmount > MIN_CLAIMABLE_SHADOW) {
          await this.collectShadowForPosition(tokenId, shadowRewards)
          tracked.shadowCollected = true
          this.log(`✅ Shadow rewards collected for position #${tokenId} - safe from burning!`)
        } else if (shadowAmount > 0) {
          this.log(`ℹ️ Position #${tokenId} has ${shadowAmount.toFixed(6)} SHADOW (below 0.001 minimum, skipping)`)
          tracked.shadowCollected = true
        } else {
          this.log(`ℹ️ Position #${tokenId} has no Shadow rewards to collect`)
          tracked.shadowCollected = true
        }
      } catch (error) {
        this.log(`❌ Failed to collect Shadow for position #${tokenId}: ${error.message}`, 'error')
      }
    }
  }

  async collectShadowForPosition(tokenId, shadowAmount) {
    if (!this.daemon.wallet) {
      throw new Error('Wallet not initialized')
    }

    this.log(`💎 Collecting ${shadowAmount} Shadow from position #${tokenId}...`)

    const tracked = this.trackedPositions.get(tokenId)
    const timeToExpiry = tracked ? Math.floor((tracked.graceExpiresAt - Date.now()) / 1000) : 0

    let success = false
    let errorMessage = null
    let txHash = null
    let gasCostWei = null

    try {
      // Convert Shadow amount to wei for API (Shadow has 18 decimals)
      const shadowRewardsWei = Math.floor(parseFloat(shadowAmount) * 1e18).toString()

      // Use the daemon's existing fee collection logic
      // We'll call the platform endpoint to trigger Shadow collection
      const collectHeaders = { 'Content-Type': 'application/json' }
      if (this.daemon.jwtToken) {
        collectHeaders['Authorization'] = `Bearer ${this.daemon.jwtToken}`
      }

      const response = await fetch(`${this.platformUrl}/api/daemon/collect-fees`, {
        method: 'POST',
        headers: collectHeaders,
        body: JSON.stringify({
          wallet: this.daemon.wallet.address,
          sessionToken: this.daemon.jwtToken,
          tokenIds: [tokenId],
          collectShadowOnly: true, // Only collect Shadow, not LP fees
          shadowAmount: shadowRewardsWei // Shadow amount in wei for minimum threshold check
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `Collection failed: ${response.status}`)
      }

      const result = await response.json()

      if (result.skipped) {
        this.log(`⏭️  Shadow collection skipped for #${tokenId}: ${result.reason}`)
        tracked.shadowCollected = true
        return
      }

      if (!result.txHash) {
        this.log(`✅ Position #${tokenId} NFT burned - SHADOW collection completed earlier`)
        tracked.shadowCollected = true
        return
      }

      success = true
      txHash = result.txHash
      gasCostWei = result.gasCost || null

      this.log(`✅ Shadow collection transaction submitted: ${result.txHash}`)

      try {
        await fetch(`${this.platformUrl}/api/ml/log-shadow-collection`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet_address: this.daemon.wallet.address,
            token_id: tokenId,
            tier: tracked.tier || 'UNKNOWN',
            shadow_amount: shadowAmount,
            time_to_grace_expiry: timeToExpiry,
            success: true,
            tx_hash: txHash,
            gas_cost_wei: gasCostWei,
            collection_triggered_by: 'grace_monitor'
          })
        }).catch(mlError => {
          console.error('[ML] Failed to log Shadow collection:', mlError.message)
        })
      } catch (mlError) {
        console.error('[ML] Failed to log Shadow collection:', mlError.message)
      }

      try {
        const patchHeaders = { 'Content-Type': 'application/json' }
        if (this.daemon.jwtToken) {
          patchHeaders['Authorization'] = `Bearer ${this.daemon.jwtToken}`
        }

        const response = await fetch(`${this.platformUrl}/api/daemon/positions`, {
          method: 'PATCH',
          headers: patchHeaders,
          body: JSON.stringify({
            wallet: this.daemon.wallet.address,
            sessionToken: this.daemon.jwtToken,
            tokenId: tokenId,
            clearOutOfRangeFlag: true,
            reason: 'shadow_collected'
          })
        })

        if (response.ok) {
          this.log(`🔄 Cleared out-of-range flag for position ${tokenId} - rebalance check will run within 30s`)
        }
      } catch (flagError) {
        console.error('[Shadow] Failed to clear out-of-range flag:', flagError.message)
      }

      return result

    } catch (error) {
      success = false
      errorMessage = error.message

      try {
        await fetch(`${this.platformUrl}/api/ml/log-shadow-collection`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet_address: this.daemon.wallet.address,
            token_id: tokenId,
            tier: tracked.tier || 'UNKNOWN',
            shadow_amount: shadowAmount,
            time_to_grace_expiry: timeToExpiry,
            success: false,
            error_message: errorMessage,
            collection_triggered_by: 'grace_monitor'
          })
        }).catch(mlError => {
          console.error('[ML] Failed to log Shadow collection failure:', mlError.message)
        })
      } catch (mlError) {
        console.error('[ML] Failed to log Shadow collection failure:', mlError.message)
      }

      throw error
    }
  }

  cleanupTrackedPositions(currentPositions) {
    const activeGracePeriodTokenIds = new Set(
      currentPositions
        .filter(p => p.status === 'GRACE_PERIOD' || p.status === 'REBALANCE_QUEUED' || p.status === 'PENDING_REBALANCE')
        .map(p => p.tokenId)
    )

    // Remove positions that are no longer in grace period
    for (const [tokenId, tracked] of this.trackedPositions.entries()) {
      if (!activeGracePeriodTokenIds.has(tokenId)) {
        this.log(`✓ Position #${tokenId} exited grace period (back in range or rebalanced)`)
        this.trackedPositions.delete(tokenId)
      }
    }
  }

  isActive() {
    return !!this.monitorInterval
  }

  getTrackedPositions() {
    return Array.from(this.trackedPositions.entries()).map(([tokenId, data]) => ({
      tokenId,
      graceExpiresAt: data.graceExpiresAt,
      shadowCollected: data.shadowCollected,
      timeRemaining: data.graceExpiresAt - Date.now()
    }))
  }
}
