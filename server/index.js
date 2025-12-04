// Copyright (c) 2025 Bulwk. All rights reserved.
// Licensed under Bulwk Proprietary License
// Full terms: ipfs://QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import open from 'open'
import chalk from 'chalk'
import fs from 'fs'
import os from 'os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3420

// Security: Restrict CORS to trusted origins only (prevents cross-site request attacks)
// Allow localhost (daemon UI) and production platform (for subscription payments)
app.use(cors({
  origin: [
    'http://localhost:3420',
    'http://127.0.0.1:3420',
    'https://app.bulwk.com',     // Production platform for subscription payments
    'https://staging.bulwk.com', // Staging environment for testing
    'https://bulwk.com',         // Main production domain
    'http://localhost:3000'      // Local development
  ],
  credentials: true
}))
app.use(express.json())

// Serve static files from dist folder (Vite build) with no-cache headers
app.use(express.static(path.join(__dirname, '../dist'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
  }
}))

// API Routes
import { createApiRoutes } from './api/routes.js'
createApiRoutes(app)

// Serve index.html for all other routes (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'))
})

// Graceful shutdown handler
// Resets auto-rebalancing and executeBackdatedRebalances to false for safety
function gracefulShutdown() {
  console.log(chalk.yellow('\n🛑 Shutting down Bulwk Trading Agent...\n'))

  try {
    // Reset auto-rebalancing in policy.json
    const policyPath = path.join(os.homedir(), '.balancer', 'policy.json')

    if (fs.existsSync(policyPath)) {
      const policyData = fs.readFileSync(policyPath, 'utf8')
      const policy = JSON.parse(policyData)

      // Reset auto-rebalancing to false for safety
      if (policy.automation && policy.automation.autoRebalancing === true) {
        console.log(chalk.cyan('🔒 Resetting auto-rebalancing to false for next session (safety feature)'))
        policy.automation.autoRebalancing = false
        fs.writeFileSync(policyPath, JSON.stringify(policy, null, 2), 'utf8')
        console.log(chalk.green('✅ Auto-rebalancing reset successfully'))
      }
    }

    // Reset executeBackdatedRebalances in config.json
    const configPath = path.join(os.homedir(), '.balancer', 'config.json')

    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8')
      const config = JSON.parse(configData)

      // Reset executeBackdatedRebalances to false for safety
      if (config.executeBackdatedRebalances === true) {
        console.log(chalk.cyan('🔒 Resetting executeBackdatedRebalances to false for next session (safety feature)'))
        config.executeBackdatedRebalances = false
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
        console.log(chalk.green('✅ executeBackdatedRebalances reset successfully'))
      }
    }
  } catch (error) {
    console.error(chalk.red('❌ Error resetting safety settings:'), error.message)
  }

  console.log(chalk.gray('👋 Goodbye!\n'))
  process.exit(0)
}

// Sanitize error messages to prevent private key leakage
function sanitizeErrorMessage(text) {
  if (!text) return 'No error message'
  // Remove potential private keys (0x followed by 64 hex characters)
  return text.replace(/0x[0-9a-fA-F]{64}/g, '0x[REDACTED_PRIVATE_KEY]')
}

// Crash logging function
function logCrash(type, error) {
  const crashLogPath = path.join(os.homedir(), '.balancer', 'crash.log')
  const timestamp = new Date().toISOString()
  const logEntry = `
================================================================================
CRASH REPORT - ${timestamp}
Type: ${type}
Error: ${sanitizeErrorMessage(error.message || String(error))}
Stack Trace:
${sanitizeErrorMessage(error.stack || 'No stack trace available')}
================================================================================

`

  try {
    const balancerDir = path.join(os.homedir(), '.balancer')
    if (!fs.existsSync(balancerDir)) {
      fs.mkdirSync(balancerDir, { recursive: true })
    }

    fs.appendFileSync(crashLogPath, logEntry, 'utf8')
    console.error(chalk.red(`\n❌ ${type} logged to ${crashLogPath}\n`))
  } catch (logError) {
    console.error(chalk.red('❌ Failed to write crash log:'), logError.message)
  }
}

// Crash handlers
process.on('uncaughtException', (error) => {
  console.error(chalk.red('\n💥 UNCAUGHT EXCEPTION:'), error)
  logCrash('UNCAUGHT_EXCEPTION', error)
  gracefulShutdown()
})

process.on('unhandledRejection', (reason, promise) => {
  const error = reason instanceof Error ? reason : new Error(String(reason))
  console.error(chalk.red('\n💥 UNHANDLED REJECTION:'), error)
  logCrash('UNHANDLED_REJECTION', error)
})

// Register shutdown handlers
process.on('SIGINT', gracefulShutdown)   // Ctrl+C
process.on('SIGTERM', gracefulShutdown)  // Kill command

// Security: Bind to localhost only (prevents network access)
app.listen(PORT, '127.0.0.1', () => {
  console.log(chalk.green('\n✨ Bulwk Trading Agent Started!\n'))
  console.log(chalk.cyan(`   → Local:  http://localhost:${PORT}`))
  console.log(chalk.gray('   → Security: Localhost-only binding (network access disabled)'))
  console.log(chalk.gray('\n   Press Ctrl+C to stop\n'))

  // Open browser automatically after a small delay
  setTimeout(() => {
    open(`http://localhost:${PORT}`)
  }, 1000)
})
