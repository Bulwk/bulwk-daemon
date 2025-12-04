// Copyright (c) 2025 Bulwk. All rights reserved.
// Licensed under Bulwk Proprietary License
// Full terms: ipfs://QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import os from 'os'

class IntentVerifier {
  constructor(platformUrl, logger = null) {
    this.platformUrl = platformUrl
    this.publicKey = null
    this.keyId = null
    this.lastFetch = null
    this.CACHE_DURATION = 3600000 // 1 hour in ms
    this.policyPath = path.join(os.homedir(), '.balancer/policy.json')
    this.logger = logger // Optional logger callback for broadcasting events
  }

  loadPolicy() {
    try {
      if (!fs.existsSync(this.policyPath)) {
        console.warn('⚠️ No policy.json found, using default policy')
        return this.getDefaultPolicy()
      }

      const policyData = fs.readFileSync(this.policyPath, 'utf8')
      const policy = JSON.parse(policyData)

      console.log(`📋 Loaded policy from ${this.policyPath}`)
      return policy
    } catch (error) {
      console.error('❌ Error loading policy:', error.message)
      return this.getDefaultPolicy()
    }
  }

  getDefaultPolicy() {
    return {
      subscription: {
        allowedHours: [0, 23] // 24/7 by default
      },
      network: {
        maxGasPrice: 100000000000, // 100 gwei
        maxSlippageBps: 100 // 1%
      },
      spending: {
        emergencyStopEnabled: true,
        emergencyStopThreshold: 5
      }
    }
  }

  async fetchPublicKey() {
    const now = Date.now()

    // Use cached key if still valid
    if (this.publicKey && this.lastFetch && (now - this.lastFetch) < this.CACHE_DURATION) {
      return this.publicKey
    }

    try {
      const response = await fetch(`${this.platformUrl}/api/jwks`)

      if (!response.ok) {
        throw new Error(`JWKS fetch failed: ${response.status}`)
      }

      const jwks = await response.json()

      if (!jwks.keys || jwks.keys.length === 0) {
        throw new Error('No keys in JWKS')
      }

      const jwk = jwks.keys[0]

      if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519') {
        throw new Error('Invalid key type, expected Ed25519')
      }

      this.keyId = jwk.kid

      const publicKeyBytes = Buffer.from(jwk.x, 'base64url')

      const oid = Buffer.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00])
      const der = Buffer.concat([oid, publicKeyBytes])

      this.publicKey = crypto.createPublicKey({
        key: der,
        format: 'der',
        type: 'spki'
      })

      this.lastFetch = now

      console.log(`✅ Fetched platform public key: ${this.keyId}`)

      return this.publicKey
    } catch (error) {
      console.error('Failed to fetch JWKS:', error)
      throw new Error(`JWKS fetch failed: ${error.message}`)
    }
  }

  async verifyIntent(signature) {
    if (!signature || typeof signature !== 'string') {
      throw new Error('Invalid signature format')
    }

    const parts = signature.split('.')

    if (parts.length !== 3) {
      throw new Error('Invalid JWS format, expected 3 parts')
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts

    // Decode header to check key ID
    const headerJson = Buffer.from(
      encodedHeader.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf8')

    const header = JSON.parse(headerJson)

    if (header.alg !== 'EdDSA') {
      throw new Error(`Unsupported algorithm: ${header.alg}`)
    }

    // Fetch public key (uses cache if available)
    const publicKey = await this.fetchPublicKey()

    // Verify signature
    const message = `${encodedHeader}.${encodedPayload}`
    const signatureBytes = Buffer.from(
      encodedSignature.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    )

    const isValid = crypto.verify(
      null,
      Buffer.from(message),
      publicKey,
      signatureBytes
    )

    if (!isValid) {
      throw new Error('Invalid signature - intent verification failed')
    }

    // Decode and return payload
    const payloadJson = Buffer.from(
      encodedPayload.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf8')

    const payload = JSON.parse(payloadJson)

    // Check expiration
    const now = Math.floor(Date.now() / 1000)

    if (payload.deadline && payload.deadline < now) {
      throw new Error('Intent expired')
    }

    console.log(`✅ Intent verified: ${payload.intentId}`)

    return payload
  }

  validatePolicy(intent, policy = null) {
    if (!policy) {
      policy = this.loadPolicy()
    }

    // Check automation enabled
    if (policy.automation?.autoRebalancing === false) {
      console.warn('Intent rejected: automation disabled')
      return false
    }

    // Check emergency stop
    if (policy.spending?.emergencyStopEnabled && policy.spending?.currentBalance !== undefined) {
      const balance = policy.spending.currentBalance
      const threshold = policy.spending.emergencyStopThreshold || 5

      if (balance < threshold) {
        const message = `Intent rejected: LOGIC balance ${balance.toFixed(2)} below emergency threshold ${threshold}`
        console.warn(message)

        if (this.logger) {
          this.logger(message, 'emergency_stop')
        }

        return false
      }
    }

    // Check time window (subscription-based hours)
    if (policy.subscription?.allowedHours) {
      const currentHour = new Date().getHours()
      const [startHour, endHour] = policy.subscription.allowedHours

      if (currentHour < startHour || currentHour > endHour) {
        console.warn(`Intent rejected: outside allowed hours (${startHour}-${endHour}, current: ${currentHour})`)
        return false
      }
    }

    // Check gas price limit
    if (intent.constraints?.maxFeePerGas && policy.network?.maxGasPrice) {
      const intentGasPrice = parseInt(intent.constraints.maxFeePerGas)
      const policyMaxGas = parseInt(policy.network.maxGasPrice)

      if (intentGasPrice > policyMaxGas) {
        console.warn(`Intent rejected: gas price ${intentGasPrice} exceeds limit ${policyMaxGas}`)
        return false
      }
    }

    // Check slippage limit
    if (intent.recipe?.slippageBps && policy.network?.maxSlippageBps) {
      const intentSlippage = intent.recipe.slippageBps
      const policyMaxSlippage = policy.network.maxSlippageBps

      if (intentSlippage > policyMaxSlippage) {
        console.warn(`Intent rejected: slippage ${intentSlippage} exceeds limit ${policyMaxSlippage}`)
        return false
      }
    }

    console.log(`✅ Intent ${intent.intentId} passed policy validation`)
    return true
  }
}

export default IntentVerifier
