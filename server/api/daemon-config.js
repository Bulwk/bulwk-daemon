// Copyright (c) 2025 Bulwk. All rights reserved.
// Licensed under Bulwk Proprietary License
// Full terms: ipfs://QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Config file location
const CONFIG_DIR = path.join(os.homedir(), '.balancer')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

// Default tier preferences (Bulwk Pre-Config)
const DEFAULT_TIER_PREFERENCES = {
  HOT: { enabled: true, allocPct: 40 },
  WARM: { enabled: true, allocPct: 25 },
  MEDIUM: { enabled: true, allocPct: 20 },
  WIDE: { enabled: true, allocPct: 10 },
  INSURANCE: { enabled: true, allocPct: 5 }
}

/**
 * Ensure config directory exists
 */
async function ensureConfigDir() {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true })
  } catch (error) {
    console.error('Failed to create config directory:', error)
  }
}

/**
 * Load entire config from file
 */
async function loadConfig() {
  try {
    await ensureConfigDir()
    const data = await fs.readFile(CONFIG_FILE, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    // File doesn't exist or is invalid, return empty config
    return {}
  }
}

/**
 * Save entire config to file
 */
async function saveConfig(config) {
  try {
    await ensureConfigDir()
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8')
    return true
  } catch (error) {
    console.error('Failed to save config:', error)
    throw error
  }
}

/**
 * Load tier preferences from config
 * Returns defaults if not found
 */
export async function loadTierPreferences() {
  const config = await loadConfig()
  return config.tiers || DEFAULT_TIER_PREFERENCES
}

/**
 * Save tier preferences to config
 * Auto-normalizes percentages to sum to 100%
 */
export async function saveTierPreferences(tiers) {
  // Validation
  const enabledTiers = Object.entries(tiers).filter(([_, tier]) => tier.enabled)

  if (enabledTiers.length === 0) {
    throw new Error('At least one tier must be enabled')
  }

  // Auto-normalize percentages
  const totalPct = enabledTiers.reduce((sum, [_, tier]) => sum + tier.allocPct, 0)

  const normalizedTiers = {}
  for (const [tierName, tier] of Object.entries(tiers)) {
    if (tier.enabled && totalPct > 0) {
      // Renormalize enabled tiers to sum to 100%
      normalizedTiers[tierName] = {
        enabled: true,
        allocPct: Math.round((tier.allocPct / totalPct) * 100)
      }
    } else {
      // Keep disabled tiers as-is
      normalizedTiers[tierName] = {
        enabled: false,
        allocPct: tier.allocPct
      }
    }
  }

  // Load existing config and update only the tiers
  const config = await loadConfig()
  config.tiers = normalizedTiers

  await saveConfig(config)

  return normalizedTiers
}

/**
 * Validate tier preferences
 */
export function validateTierPreferences(tiers) {
  const errors = []

  if (!tiers || typeof tiers !== 'object') {
    errors.push('Invalid tier preferences format')
    return errors
  }

  const requiredTiers = ['HOT', 'WARM', 'MEDIUM', 'WIDE', 'INSURANCE']
  for (const tierName of requiredTiers) {
    if (!tiers[tierName]) {
      errors.push(`Missing tier: ${tierName}`)
    } else {
      const tier = tiers[tierName]
      if (typeof tier.enabled !== 'boolean') {
        errors.push(`${tierName}: enabled must be boolean`)
      }
      if (typeof tier.allocPct !== 'number' || tier.allocPct < 0 || tier.allocPct > 100) {
        errors.push(`${tierName}: allocPct must be 0-100`)
      }
    }
  }

  const enabledCount = Object.values(tiers).filter(t => t.enabled).length
  if (enabledCount === 0) {
    errors.push('At least one tier must be enabled')
  }

  return errors
}
