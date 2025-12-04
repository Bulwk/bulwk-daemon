// Copyright (c) 2025 Bulwk. All rights reserved.
// Licensed under Bulwk Proprietary License
// Full terms: ipfs://QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D

import { useState, useEffect } from 'react'
import ActivityLog from './ActivityLog'

export default function Dashboard({ status, onRefresh }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [linkStatus, setLinkStatus] = useState(null)
  const [copied, setCopied] = useState(false)
  const [networks, setNetworks] = useState(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [sendTo, setSendTo] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [sending, setSending] = useState(false)
  const [balances, setBalances] = useState([])
  const [selectedToken, setSelectedToken] = useState(null)
  const [showAddToken, setShowAddToken] = useState(false)
  const [customTokens, setCustomTokens] = useState([])
  const [newToken, setNewToken] = useState({ symbol: '', name: '', address: '', decimals: '18', icon: '🪙' })
  const [logicBalance, setLogicBalance] = useState(null)
  const [config, setConfig] = useState(null)
  const [savingConfig, setSavingConfig] = useState(false)
  const [showSurplusExplainer, setShowSurplusExplainer] = useState(false)
  const [showDeployConfirm, setShowDeployConfirm] = useState(false)
  const [deployingRemote, setDeployingRemote] = useState(false)
  const [positionFees, setPositionFees] = useState(null)
  const [collectingFees, setCollectingFees] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [batchSize, setBatchSize] = useState('all') // 'all' or '12'
  const [spendingPermission, setSpendingPermission] = useState(null)
  const [showGrantPermission, setShowGrantPermission] = useState(false)
  const [showPermissionExplainer, setShowPermissionExplainer] = useState(false)
  const [permissionForm, setPermissionForm] = useState({
    maxSpendingLimitLogic: 10000,
    dailyLimitLogic: 1000,
    emergencyStopThreshold: 5,
    validityDays: 90
  })
  const [grantingPermission, setGrantingPermission] = useState(false)
  const [showEmergencyAlert, setShowEmergencyAlert] = useState(false)
  const [authStatus, setAuthStatus] = useState(null)
  const [refreshingAuth, setRefreshingAuth] = useState(false)
  const [subscriptionStatus, setSubscriptionStatus] = useState({
    isExpired: false,
    hoursRemaining: null
  })
  const [heartbeatStatus, setHeartbeatStatus] = useState({
    status: 'disconnected',
    lastHeartbeat: null,
    isActive: false
  })
  const [viewerAuthorizations, setViewerAuthorizations] = useState([])
  const [showViewerManager, setShowViewerManager] = useState(false)
  const [newViewerWallet, setNewViewerWallet] = useState('')
  const [authorizingViewer, setAuthorizingViewer] = useState(false)
  const [executeBackdatedRebalances, setExecuteBackdatedRebalances] = useState(false)
  const [idleSweepEnabled, setIdleSweepEnabled] = useState(false)
  const [relinking, setRelinking] = useState(false)
  const [showRelinkConfirm, setShowRelinkConfirm] = useState(false)
  const [tierPreferences, setTierPreferences] = useState({
    HOT: { enabled: true, allocPct: 40 },
    WARM: { enabled: true, allocPct: 25 },
    MEDIUM: { enabled: true, allocPct: 20 },
    WIDE: { enabled: true, allocPct: 10 },
    INSURANCE: { enabled: true, allocPct: 5 }
  })
  const [savingTierConfig, setSavingTierConfig] = useState(false)
  const [showTierConfig, setShowTierConfig] = useState(false)
  const [showTierExplainer, setShowTierExplainer] = useState(false)
  const [tierDisableConfirm, setTierDisableConfirm] = useState(null) // { tierName, newState }
  const [versionInfo, setVersionInfo] = useState(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)

  // Check for daemon updates periodically
  useEffect(() => {
    const checkVersion = async () => {
      try {
        const res = await fetch('/api/version')
        if (res.ok) {
          const data = await res.json()
          setVersionInfo(data)
        }
      } catch (err) {
        console.error('Failed to check version:', err)
      }
    }

    // Check immediately and then every 30 seconds
    checkVersion()
    const interval = setInterval(checkVersion, 30 * 1000)

    return () => clearInterval(interval)
  }, [])

  // Listen for emergency_stop events from log stream
  useEffect(() => {
    if (!status?.isRunning) return

    const eventSource = new EventSource('/api/activity-logs/stream')

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        // Check if this is an emergency_stop log event
        if (data.type === 'log' && data.entry?.level === 'emergency_stop') {
          setShowEmergencyAlert(true)
        }
      } catch (err) {
        console.error('Failed to parse emergency log event:', err)
      }
    }

    return () => eventSource.close()
  }, [status?.isRunning])

  // Listen for subscription expiry warnings from log stream
  useEffect(() => {
    if (!status?.isRunning) return

    const eventSource = new EventSource('/api/activity-logs/stream')

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        // Check if this is a subscription expiry log event
        if (data.type === 'log' && data.entry?.level === 'warn' && data.entry?.message) {
          const message = data.entry.message

          // Check for expired subscription (multiple message formats)
          if (message.includes('SUBSCRIPTION EXPIRED') ||
              message.includes('Subscription required') ||
              message.includes('Intent polling requires')) {
            setSubscriptionStatus({ isExpired: true, hoursRemaining: null })
          }
          // Check for expiring soon warning
          else if (message.includes('Subscription expires in')) {
            const match = message.match(/expires in ([\d.]+) hours/)
            if (match) {
              const hours = parseFloat(match[1])
              setSubscriptionStatus({ isExpired: false, hoursRemaining: hours })
            }
          }
        }
      } catch (err) {
        console.error('Failed to parse subscription log event:', err)
      }
    }

    return () => eventSource.close()
  }, [status?.isRunning])

  // Load custom tokens from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('customTokens')
    if (saved) {
      try {
        setCustomTokens(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to load custom tokens:', e)
      }
    }
  }, [])

  useEffect(() => {
    // Fetch networks on mount
    const fetchNetworks = async () => {
      try {
        const res = await fetch('/api/networks')
        const data = await res.json()
        setNetworks(data)
      } catch (error) {
        console.error('Failed to fetch networks:', error)
      }
    }
    fetchNetworks()
  }, [])

  useEffect(() => {
    // Fetch all token balances when wallet is available
    if (status?.walletAddress && status?.isRunning) {
      const fetchBalances = async () => {
        try {
          // Include custom tokens in the request
          const url = '/api/balances'
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customTokens })
          })
          const data = await response.json()
          if (data.balances) {
            setBalances(data.balances)
            // Set first token as selected by default
            if (!selectedToken && data.balances.length > 0) {
              setSelectedToken(data.balances[0])
            }
          }
        } catch (error) {
          console.error('Failed to fetch balances:', error)
        }
      }
      fetchBalances()
      // Refresh balances every 10 seconds
      const interval = setInterval(fetchBalances, 10000)
      return () => clearInterval(interval)
    }
  }, [status?.walletAddress, status?.isRunning, customTokens])

  useEffect(() => {
    if (status?.isRunning) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch('/api/link-status')
          const data = await res.json()
          setLinkStatus(data)

          if (data.isLinked) {
            onRefresh()
          }
        } catch (error) {
          console.error('Failed to fetch link status:', error)
        }
      }, 3000)

      return () => clearInterval(interval)
    }
  }, [status?.isRunning])

  // Fetch LOGIC balance when linked
  useEffect(() => {
    if (status?.isLinked && status?.walletAddress) {
      const fetchLogicBalance = async () => {
        try {
          const platformUrl = status?.platformUrl || 'https://app.bulwk.com'
          const res = await fetch(`${platformUrl}/api/logic/balance/${status.walletAddress}`)
          if (res.ok) {
            const data = await res.json()
            setLogicBalance(data.balance)

            // Reset emergency alert when balance is topped up above threshold
            if (data.balance >= 5 && showEmergencyAlert) {
              setShowEmergencyAlert(false)
            }
          }
        } catch (error) {
          console.error('Failed to fetch LOGIC balance:', error)
        }
      }

      fetchLogicBalance()
      // Refresh LOGIC balance every 5 seconds (faster updates for low balance warnings)
      const interval = setInterval(fetchLogicBalance, 5000)
      return () => clearInterval(interval)
    }
  }, [status?.isLinked, status?.walletAddress, showEmergencyAlert])

  // Fetch daemon config when running
  useEffect(() => {
    if (status?.isRunning) {
      const fetchConfig = async () => {
        try {
          const res = await fetch('/api/config')
          if (res.ok) {
            const data = await res.json()
            setConfig(data)
          }
        } catch (error) {
          console.error('Failed to fetch config:', error)
        }
      }

      fetchConfig()
    }
  }, [status?.isRunning])

  // Fetch position fees when linked (refresh every 15 seconds)
  useEffect(() => {
    if (status?.isLinked && status?.isRunning) {
      const fetchFees = async () => {
        try {
          const res = await fetch('/api/position-fees')
          if (res.ok) {
            const data = await res.json()
            setPositionFees(data)
          }
        } catch (error) {
          console.error('Failed to fetch position fees:', error)
        }
      }

      fetchFees()
      // Refresh fees every 15 seconds
      const interval = setInterval(fetchFees, 15000)
      return () => clearInterval(interval)
    }
  }, [status?.isLinked, status?.isRunning])

  // Fetch spending permission status when linked (refresh every 30 seconds)
  useEffect(() => {
    if (status?.isLinked && status?.isRunning) {
      const fetchPermissionStatus = async () => {
        try {
          const res = await fetch('/api/spending-permission/status')
          if (res.ok) {
            const data = await res.json()
            setSpendingPermission(data)
          }
        } catch (error) {
          console.error('Failed to fetch spending permission status:', error)
        }
      }

      fetchPermissionStatus()
      // Refresh permission status every 30 seconds
      const interval = setInterval(fetchPermissionStatus, 30000)
      return () => clearInterval(interval)
    }
  }, [status?.isLinked, status?.isRunning])

  // Fetch authentication status when running (refresh every 10 seconds)
  useEffect(() => {
    if (status?.isRunning) {
      const fetchAuthStatus = async () => {
        try {
          const res = await fetch('/api/auth-status')
          if (res.ok) {
            const data = await res.json()
            setAuthStatus(data)
          }
        } catch (error) {
          console.error('Failed to fetch auth status:', error)
        }
      }

      fetchAuthStatus()
      // Refresh auth status every 10 seconds
      const interval = setInterval(fetchAuthStatus, 10000)
      return () => clearInterval(interval)
    }
  }, [status?.isRunning])

  // Fetch heartbeat status when linked (refresh every 5 seconds)
  useEffect(() => {
    if (status?.isLinked && status?.isRunning) {
      const fetchHeartbeatStatus = async () => {
        try {
          const res = await fetch('/api/heartbeat-status')
          if (res.ok) {
            const data = await res.json()
            setHeartbeatStatus(data)
          }
        } catch (error) {
          console.error('Failed to fetch heartbeat status:', error)
        }
      }

      fetchHeartbeatStatus()
      // Refresh heartbeat status every 5 seconds
      const interval = setInterval(fetchHeartbeatStatus, 5000)
      return () => clearInterval(interval)
    }
  }, [status?.isLinked, status?.isRunning])

  // Fetch viewer authorizations when linked
  useEffect(() => {
    if (status?.isLinked && status?.isRunning) {
      const fetchViewerAuth = async () => {
        try {
          const res = await fetch('/api/viewer/list')
          if (res.ok) {
            const data = await res.json()
            setViewerAuthorizations(data.authorizations || [])
          }
        } catch (error) {
          console.error('Failed to fetch viewer authorizations:', error)
        }
      }

      fetchViewerAuth()
      // Refresh every 30 seconds
      const interval = setInterval(fetchViewerAuth, 30000)
      return () => clearInterval(interval)
    }
  }, [status?.isLinked, status?.isRunning])

  // Load backdated rebalance setting from config
  useEffect(() => {
    if (config) {
      setExecuteBackdatedRebalances(config.executeBackdatedRebalances || false)
      setIdleSweepEnabled(config.idleSweepEnabled || false)
    }
  }, [config])

  const handleStart = async () => {
    setLoading(true)

    try {
      const res = await fetch('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start')
      }

      setLinkStatus(data)
      onRefresh()

      // Auto-open link in browser if not already linked
      if (data.linkUrl && !data.isLinked) {
        window.open(data.linkUrl, '_blank')
      }
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async () => {
    try {
      await fetch('/api/stop', { method: 'POST' })
      setLinkStatus(null)
      onRefresh()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleForceRelink = async () => {
    if (!showRelinkConfirm) {
      setShowRelinkConfirm(true)
      return
    }

    // If daemon isn't running, we need a password to load the wallet
    if (!status?.isRunning && !password) {
      alert('⚠️ Please enter your password first')
      setShowRelinkConfirm(false)
      return
    }

    setRelinking(true)
    try {
      const res = await fetch('/api/force-relink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: status?.isRunning ? undefined : password })
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to re-link')
      }

      setLinkStatus(data)
      setShowRelinkConfirm(false)

      // Auto-open link in browser
      if (data.linkUrl) {
        window.open(data.linkUrl, '_blank')
      }

      alert('✅ Re-link successful! New link code generated.\n\nThe platform has been opened in a new tab to complete the linking process.')
    } catch (err) {
      alert(`❌ Re-link failed: ${err.message}`)
    } finally {
      setRelinking(false)
    }
  }

  const handleCopyAddress = () => {
    if (status?.walletAddress) {
      navigator.clipboard.writeText(status.walletAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleResetWallet = async () => {
    if (!showResetConfirm) {
      setShowResetConfirm(true)
      return
    }

    try {
      await fetch('/api/reset', { method: 'POST' })
      window.location.reload()
    } catch (err) {
      alert('Failed to reset wallet: ' + err.message)
    }
  }

  const handleSend = async () => {
    if (!sendTo || !sendAmount || !selectedToken) {
      alert('Please enter recipient address and amount')
      return
    }

    setSending(true)
    try {
      let res

      if (selectedToken.isNative) {
        // Send native S token
        const amountWei = Math.floor(parseFloat(sendAmount) * 1e18)
        const valueHex = '0x' + amountWei.toString(16)

        res = await fetch('/api/send-transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: sendTo,
            value: valueHex,
            data: '0x'
          })
        })
      } else {
        // Send ERC-20 token
        res = await fetch('/api/send-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokenAddress: selectedToken.address,
            to: sendTo,
            amount: sendAmount
          })
        })
      }

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send transaction')
      }

      alert(`Transaction sent! Hash: ${data.hash}`)
      setSendTo('')
      setSendAmount('')
      setShowSend(false)

      // Refresh balances
      setTimeout(async () => {
        try {
          const response = await fetch('/api/balances', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customTokens })
          })
          const data = await response.json()
          if (data.balances) {
            setBalances(data.balances)
          }
        } catch (error) {
          console.error('Failed to refresh balances:', error)
        }
      }, 2000)
    } catch (err) {
      alert('Transaction failed: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  const handleAddCustomToken = () => {
    if (!newToken.symbol || !newToken.name || !newToken.address || !newToken.decimals) {
      alert('Please fill in all token fields')
      return
    }

    // Validate address format
    if (!newToken.address.startsWith('0x') || newToken.address.length !== 42) {
      alert('Invalid token address format')
      return
    }

    // Validate decimals
    const decimals = parseInt(newToken.decimals)
    if (isNaN(decimals) || decimals < 0 || decimals > 18) {
      alert('Decimals must be between 0 and 18')
      return
    }

    const token = {
      symbol: newToken.symbol.toUpperCase(),
      name: newToken.name,
      address: newToken.address,
      decimals: decimals,
      isNative: false,
      icon: newToken.icon || '🪙'
    }

    const updated = [...customTokens, token]
    setCustomTokens(updated)
    localStorage.setItem('customTokens', JSON.stringify(updated))
    setNewToken({ symbol: '', name: '', address: '', decimals: '18', icon: '🪙' })
    setShowAddToken(false)
    alert(`Added ${token.symbol} to your token list`)

    // Refresh balances to include new token
    setTimeout(async () => {
      try {
        const response = await fetch('/api/balances', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customTokens: updated })
        })
        const data = await response.json()
        if (data.balances) {
          setBalances(data.balances)
        }
      } catch (error) {
        console.error('Failed to refresh balances:', error)
      }
    }, 500)
  }

  const handleRemoveCustomToken = (symbol) => {
    if (!confirm(`Remove ${symbol} from your token list?`)) {
      return
    }

    const updated = customTokens.filter(t => t.symbol !== symbol)
    setCustomTokens(updated)
    localStorage.setItem('customTokens', JSON.stringify(updated))
    alert(`Removed ${symbol}`)
  }


  const handleRemoteDeploy = async () => {
    setDeployingRemote(true)
    try {
      const res = await fetch('/api/remote/start-trading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to start trading')
      }

      const result = await res.json()
      alert(`Success! Position deployment queued.\n\nIntent ID: ${result.intentId}\n\nCheck the activity log below to monitor execution.`)
      setShowDeployConfirm(false)
    } catch (error) {
      alert('Failed to deploy positions: ' + error.message)
    } finally {
      setDeployingRemote(false)
    }
  }

  const handleCollectFees = async () => {
    if (!positionFees || !positionFees.tokenIds || positionFees.tokenIds.length === 0) {
      alert('No active positions to collect fees from')
      return
    }

    setCollectingFees(true)
    try {
      const platformUrl = status?.platformUrl || 'https://app.bulwk.com'
      const res = await fetch(`${platformUrl}/api/daemon/collect-fees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: status.walletAddress,
          tokenIds: positionFees.tokenIds
        })
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to create fee collection intent')
      }

      const result = await res.json()
      alert(`Success! SHADOW rewards collection queued.\n\nIntent ID: ${result.intentId}\n\nYour SHADOW rewards (${positionFees.shadow} SHADOW) will be collected shortly.\n\nNote: LP fees (WS + USDC) are automatically collected during rebalancing.\n\nCheck the activity log below to monitor execution.`)

      // Refresh fees after collection
      setTimeout(async () => {
        try {
          const feeRes = await fetch('/api/position-fees')
          if (feeRes.ok) {
            const data = await feeRes.json()
            setPositionFees(data)
          }
        } catch (error) {
          console.error('Failed to refresh fees:', error)
        }
      }, 3000)
    } catch (error) {
      alert('Failed to collect fees: ' + error.message)
    } finally {
      setCollectingFees(false)
    }
  }

  const handleBatchWithdraw = async () => {
    if (!positionFees || !positionFees.tokenIds || positionFees.tokenIds.length === 0) {
      alert('No active positions to withdraw')
      return
    }

    // Confirmation dialog
    const positionCount = positionFees.tokenIds.length
    const batchSizeNum = batchSize === 'all' ? positionCount : 12
    const batchCount = Math.ceil(positionCount / batchSizeNum)

    const confirmed = confirm(
      `⚠️ WARNING: This will PERMANENTLY CLOSE all ${positionCount} position(s)!\n\n` +
      `Batch configuration:\n` +
      `• Total positions: ${positionCount}\n` +
      `• Batches: ${batchCount} transaction(s)\n` +
      `• Positions per batch: ${batchSizeNum}\n\n` +
      `⚠️ IMPORTANT:\n` +
      `• Collect SHADOW rewards FIRST (use button above)\n` +
      `• Uncollected SHADOW will be LOST\n` +
      `• Liquidity will be returned to your wallet as WS + USDC\n\n` +
      `Continue with batch withdrawal?`
    )

    if (!confirmed) return

    setWithdrawing(true)
    try {
      const platformUrl = status?.platformUrl || 'https://app.bulwk.com'
      const res = await fetch(`${platformUrl}/api/daemon/batch-withdraw-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: status.walletAddress,
          tokenIds: positionFees.tokenIds,
          batchSize: batchSize === 'all' ? positionCount : 12
        })
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to create batch withdraw intent')
      }

      const result = await res.json()

      const message = result.batchCount === 1
        ? `Success! Batch withdrawal queued.\n\nIntent ID: ${result.intents[0].intentId}\n\nAll ${positionCount} position(s) will be closed and liquidity returned to your wallet.\n\nEstimated gas: ${result.estimatedGas.toLocaleString()}\n\nCheck the activity log below to monitor execution.`
        : `Success! Batch withdrawal queued in ${result.batchCount} transactions.\n\n${result.intents.map(i => `Batch ${i.batchIndex}: ${i.positionCount} positions (ID: ${i.intentId})`).join('\n')}\n\nTotal positions: ${positionCount}\nEstimated gas: ${result.estimatedGas.toLocaleString()}\n\nTransactions will execute sequentially.\nCheck the activity log below to monitor execution.`

      alert(message)

      // Refresh fees after withdrawal
      setTimeout(async () => {
        try {
          const feeRes = await fetch('/api/position-fees')
          if (feeRes.ok) {
            const data = await feeRes.json()
            setPositionFees(data)
          }
        } catch (error) {
          console.error('Failed to refresh fees:', error)
        }
      }, 3000)
    } catch (error) {
      alert('Failed to initiate batch withdraw: ' + error.message)
    } finally {
      setWithdrawing(false)
    }
  }

  const handleGrantPermission = async () => {
    setGrantingPermission(true)
    try {
      const res = await fetch('/api/spending-permission/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(permissionForm)
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))

        // Better error message for authentication issues
        if (errorData.error?.includes('Not authenticated')) {
          throw new Error('Daemon not authenticated with platform. Try stopping and restarting the daemon to re-link.')
        }

        throw new Error(errorData.error || 'Failed to grant permission')
      }

      const result = await res.json()
      alert(`Success! Spending permission granted.\n\nConfigure your spending limits on the platform's LOGIC Management modal.`)

      setShowGrantPermission(false)

      // Refresh permission status
      setTimeout(async () => {
        try {
          const statusRes = await fetch('/api/spending-permission/status')
          if (statusRes.ok) {
            const data = await statusRes.json()
            setSpendingPermission(data)
          }
        } catch (error) {
          console.error('Failed to refresh permission status:', error)
        }
      }, 1000)
    } catch (error) {
      alert('Failed to grant permission: ' + error.message)
    } finally {
      setGrantingPermission(false)
    }
  }

  const handleRefreshAuth = async () => {
    setRefreshingAuth(true)
    try {
      const res = await fetch('/api/auth-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to refresh authentication')
      }

      const result = await res.json()
      alert('Success! Authentication refreshed.\n\nYou can now grant permissions and perform authenticated operations.')

      // Refresh auth status
      setTimeout(async () => {
        try {
          const statusRes = await fetch('/api/auth-status')
          if (statusRes.ok) {
            const data = await statusRes.json()
            setAuthStatus(data)
          }
        } catch (error) {
          console.error('Failed to refresh auth status:', error)
        }
      }, 1000)
    } catch (error) {
      alert('Failed to refresh authentication: ' + error.message)
    } finally {
      setRefreshingAuth(false)
    }
  }

  const handleAuthorizeViewer = async () => {
    if (!newViewerWallet || !/^0x[a-fA-F0-9]{40}$/.test(newViewerWallet)) {
      alert('Please enter a valid Ethereum wallet address (0x...)')
      return
    }

    setAuthorizingViewer(true)
    try {
      const res = await fetch('/api/viewer/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewingWallet: newViewerWallet,
          role: 'viewer'
        })
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to authorize viewer')
      }

      const result = await res.json()
      alert(`Success! Viewer wallet authorized.\n\nThe wallet ${newViewerWallet} can now access view-only mode from mobile.\n\nThey should visit app.bulwk.com and click "View-Only Mode" to connect.`)

      setNewViewerWallet('')

      // Refresh viewer list
      setTimeout(async () => {
        try {
          const listRes = await fetch('/api/viewer/list')
          if (listRes.ok) {
            const data = await listRes.json()
            setViewerAuthorizations(data.authorizations || [])
          }
        } catch (error) {
          console.error('Failed to refresh viewer list:', error)
        }
      }, 1000)
    } catch (error) {
      alert('Failed to authorize viewer: ' + error.message)
    } finally {
      setAuthorizingViewer(false)
    }
  }

  const handleRevokeViewer = async (viewingWallet) => {
    if (!confirm(`Revoke viewing access for ${viewingWallet}?\n\nThey will no longer be able to monitor this wallet's activity.`)) {
      return
    }

    try {
      const res = await fetch('/api/viewer/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewingWallet })
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to revoke viewer')
      }

      alert(`Success! Viewing access revoked for ${viewingWallet}`)

      // Refresh viewer list
      setTimeout(async () => {
        try {
          const listRes = await fetch('/api/viewer/list')
          if (listRes.ok) {
            const data = await listRes.json()
            setViewerAuthorizations(data.authorizations || [])
          }
        } catch (error) {
          console.error('Failed to refresh viewer list:', error)
        }
      }, 500)
    } catch (error) {
      alert('Failed to revoke viewer: ' + error.message)
    }
  }

  // Tier Configuration Handlers
  const handleToggleTier = (tierName) => {
    const currentlyEnabled = tierPreferences[tierName].enabled

    // If disabling a tier, show confirmation dialog
    if (currentlyEnabled) {
      setTierDisableConfirm({ tierName, newState: false })
      return
    }

    // If enabling, proceed without confirmation
    setTierPreferences(prev => ({
      ...prev,
      [tierName]: { ...prev[tierName], enabled: true }
    }))
  }

  const confirmTierDisable = () => {
    if (!tierDisableConfirm) return

    setTierPreferences(prev => ({
      ...prev,
      [tierDisableConfirm.tierName]: { ...prev[tierDisableConfirm.tierName], enabled: false }
    }))

    setTierDisableConfirm(null)
  }

  const cancelTierDisable = () => {
    setTierDisableConfirm(null)
  }

  const handleTierPercentageChange = (tierName, value) => {
    const numValue = parseInt(value) || 0
    setTierPreferences(prev => ({
      ...prev,
      [tierName]: { ...prev[tierName], allocPct: Math.max(0, Math.min(100, numValue)) }
    }))
  }

  const handleRestoreTierDefaults = () => {
    setTierPreferences({
      HOT: { enabled: true, allocPct: 40 },
      WARM: { enabled: true, allocPct: 25 },
      MEDIUM: { enabled: true, allocPct: 20 },
      WIDE: { enabled: true, allocPct: 10 },
      INSURANCE: { enabled: true, allocPct: 5 }
    })
  }

  const calculateTierTotal = () => {
    return Object.values(tierPreferences).reduce((sum, tier) => sum + (tier.enabled ? tier.allocPct : 0), 0)
  }

  const handleSaveTierConfiguration = async () => {
    // Validation
    const enabledCount = Object.values(tierPreferences).filter(t => t.enabled).length
    if (enabledCount === 0) {
      alert('⚠️ At least one tier must be enabled')
      return
    }

    setSavingTierConfig(true)
    try {
      const res = await fetch('/api/tier-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiers: tierPreferences })
      })

      if (res.ok) {
        const data = await res.json()
        setTierPreferences(data.tiers)
        alert('✅ Tier configuration saved successfully!')
      } else {
        const error = await res.json()
        throw new Error(error.message || 'Failed to save')
      }
    } catch (error) {
      alert('❌ Failed to save tier configuration: ' + error.message)
    } finally {
      setSavingTierConfig(false)
    }
  }

  const handleToggleBackdatedRebalances = async () => {
    const newValue = !executeBackdatedRebalances

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executeBackdatedRebalances: newValue })
      })

      if (res.ok) {
        const newConfig = await res.json()
        setExecuteBackdatedRebalances(newConfig.executeBackdatedRebalances)
        setConfig(newConfig)
        alert(newValue
          ? '✅ Backdated rebalances will now execute.\n\nMake sure you have collected any Shadow rewards first using "Batch Withdraw Shadow"!'
          : '✅ Backdated rebalances disabled.\n\nOnly fresh signals (< 5 minutes old) will execute.'
        )
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to update setting')
      }
    } catch (error) {
      alert('Failed to update setting: ' + error.message)
    }
  }

  const handleToggleIdleSweep = async () => {
    const newValue = !idleSweepEnabled

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idleSweepEnabled: newValue })
      })

      if (res.ok) {
        const newConfig = await res.json()
        setIdleSweepEnabled(newConfig.idleSweepEnabled)
        setConfig(newConfig)
        alert(newValue
          ? '✅ Idle Sweep enabled!\n\nYour daemon will now automatically deploy idle WS/USDC balances after 3 scans (5 minutes).'
          : '✅ Idle Sweep disabled.\n\nYour wallet balances will remain idle until you manually deploy positions.'
        )
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to update setting')
      }
    } catch (error) {
      alert('Failed to update setting: ' + error.message)
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Update Available Banner */}
        {versionInfo?.updateAvailable && !updateDismissed && (
          <div className="bg-gradient-to-r from-cyan-900/50 to-blue-900/50 border border-cyan-500/50 rounded-lg p-4 mb-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🔄</span>
                <div>
                  <h3 className="font-semibold text-cyan-300">Update Available</h3>
                  <p className="text-sm text-slate-300 mt-1">
                    A new version of Bulwk Daemon is available: <span className="font-mono text-cyan-400">v{versionInfo.latestVersion}</span>
                    <span className="text-slate-400"> (current: v{versionInfo.currentVersion})</span>
                  </p>
                  {versionInfo.releaseNotes && (
                    <p className="text-xs text-slate-400 mt-2">{versionInfo.releaseNotes}</p>
                  )}
                  <a
                    href={versionInfo.downloadUrl || 'https://app.bulwk.com'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-3 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Download Update
                  </a>
                </div>
              </div>
              <button
                onClick={() => setUpdateDismissed(true)}
                className="text-slate-400 hover:text-white transition-colors"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-cyan-100">Trading Agent Dashboard</h1>
            </div>

            <div className={`status-badge ${status?.isRunning ? 'status-online' : 'status-offline'}`}>
              <div className={`w-2 h-2 rounded-full ${status?.isRunning ? 'bg-green-400 pulse' : 'bg-red-400'}`}></div>
              {status?.isRunning ? 'Running' : 'Offline'}
            </div>
          </div>

          {/* Wallet Address Display */}
          <div className="bg-black/30 border border-cyan-400/20 rounded-lg p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-cyan-300/70 mb-1">Wallet Address</p>
                <p className="text-sm text-white font-mono break-all">{status?.walletAddress}</p>
              </div>
              <button
                onClick={handleCopyAddress}
                className="flex-shrink-0 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 px-3 py-2 rounded-lg transition-all text-xs"
              >
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>
          </div>

          {/* Token Balances Display */}
          {balances.length > 0 && (
            <div className="bg-black/30 border border-cyan-400/20 rounded-lg p-3 mt-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-cyan-300/70">Token Balances</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddToken(!showAddToken)}
                    className="bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 px-3 py-2 rounded-lg transition-all text-xs font-medium"
                  >
                    {showAddToken ? 'Cancel' : '➕ Add Token'}
                  </button>
                  <button
                    onClick={() => setShowSend(!showSend)}
                    className="bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 px-4 py-2 rounded-lg transition-all text-sm font-medium"
                  >
                    {showSend ? 'Cancel' : '📤 Send'}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {balances.map((token) => (
                  <div
                    key={token.symbol}
                    className="flex items-center justify-between bg-black/20 border border-cyan-400/10 rounded-lg p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{token.icon}</div>
                      <div>
                        <p className="text-sm font-semibold text-white">{token.symbol}</p>
                        <p className="text-xs text-cyan-300/50">{token.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-white">{token.formatted}</p>
                      <p className="text-xs text-cyan-300/50">{token.symbol}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Send Form */}
          {showSend && balances.length > 0 && (
            <div className="bg-cyan-500/10 border border-cyan-400/20 rounded-lg p-4 mt-3">
              <h4 className="font-semibold text-cyan-100 mb-3 text-sm">Send Tokens</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-cyan-300 mb-1">Select Token</label>
                  <select
                    value={selectedToken?.symbol || ''}
                    onChange={(e) => {
                      const token = balances.find(t => t.symbol === e.target.value)
                      setSelectedToken(token)
                    }}
                    className="w-full bg-black/30 border border-cyan-400/20 rounded px-3 py-2 text-white text-sm"
                  >
                    {balances.map((token) => (
                      <option key={token.symbol} value={token.symbol}>
                        {token.icon} {token.symbol} - {token.formatted} available
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-cyan-300 mb-1">Recipient Address</label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={sendTo}
                    onChange={(e) => setSendTo(e.target.value)}
                    className="w-full bg-black/30 border border-cyan-400/20 rounded px-3 py-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-cyan-300 mb-1">Amount ({selectedToken?.symbol || ''})</label>
                  <input
                    type="number"
                    step={selectedToken?.decimals === 6 ? "0.01" : "0.0001"}
                    placeholder="0.0"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                    className="w-full bg-black/30 border border-cyan-400/20 rounded px-3 py-2 text-white text-sm"
                  />
                  {selectedToken && (
                    <p className="text-xs text-cyan-300/50 mt-1">
                      Available: {selectedToken.formatted} {selectedToken.symbol}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleSend}
                  disabled={sending || !sendTo || !sendAmount || !selectedToken}
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-semibold py-2 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {sending ? 'Sending...' : `Send ${selectedToken?.symbol || 'Token'}`}
                </button>
              </div>
            </div>
          )}

          {/* Add Custom Token Form */}
          {showAddToken && (
            <div className="bg-cyan-500/10 border border-cyan-400/20 rounded-lg p-4 mt-3">
              <h4 className="font-semibold text-cyan-100 mb-3 text-sm">Add Custom Token</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-cyan-300 mb-1">Token Symbol</label>
                  <input
                    type="text"
                    placeholder="e.g., USDT"
                    value={newToken.symbol}
                    onChange={(e) => setNewToken({ ...newToken, symbol: e.target.value })}
                    className="w-full bg-black/30 border border-cyan-400/20 rounded px-3 py-2 text-white text-sm uppercase"
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="block text-xs text-cyan-300 mb-1">Token Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Tether USD"
                    value={newToken.name}
                    onChange={(e) => setNewToken({ ...newToken, name: e.target.value })}
                    className="w-full bg-black/30 border border-cyan-400/20 rounded px-3 py-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-cyan-300 mb-1">Contract Address</label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={newToken.address}
                    onChange={(e) => setNewToken({ ...newToken, address: e.target.value })}
                    className="w-full bg-black/30 border border-cyan-400/20 rounded px-3 py-2 text-white text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-cyan-300 mb-1">Decimals</label>
                  <input
                    type="number"
                    placeholder="18"
                    value={newToken.decimals}
                    onChange={(e) => setNewToken({ ...newToken, decimals: e.target.value })}
                    className="w-full bg-black/30 border border-cyan-400/20 rounded px-3 py-2 text-white text-sm"
                    min="0"
                    max="18"
                  />
                </div>
                <div>
                  <label className="block text-xs text-cyan-300 mb-1">Icon (emoji)</label>
                  <input
                    type="text"
                    placeholder="🪙"
                    value={newToken.icon}
                    onChange={(e) => setNewToken({ ...newToken, icon: e.target.value })}
                    className="w-full bg-black/30 border border-cyan-400/20 rounded px-3 py-2 text-white text-sm"
                    maxLength={2}
                  />
                </div>
                <button
                  onClick={handleAddCustomToken}
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-semibold py-2 px-4 rounded-lg transition-all text-sm"
                >
                  Add Token
                </button>
              </div>

              {/* Custom Tokens List */}
              {customTokens.length > 0 && (
                <div className="mt-4 pt-4 border-t border-cyan-400/20">
                  <p className="text-xs text-cyan-300/70 mb-2">Your Custom Tokens:</p>
                  <div className="space-y-2">
                    {customTokens.map((token) => (
                      <div
                        key={token.symbol}
                        className="flex items-center justify-between bg-black/20 border border-cyan-400/10 rounded-lg p-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{token.icon}</span>
                          <div>
                            <p className="text-sm font-semibold text-white">{token.symbol}</p>
                            <p className="text-xs text-cyan-300/50">{token.name}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveCustomToken(token.symbol)}
                          className="text-red-400 hover:text-red-300 text-xs px-2 py-1"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Supported Networks */}
          {networks && (
            <div className="bg-black/30 border border-cyan-400/20 rounded-lg p-3 mt-3">
              <p className="text-xs text-cyan-300/70 mb-2">Supported Networks</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(networks).map(([key, network]) => (
                  <div key={key} className="bg-cyan-500/10 border border-cyan-400/20 rounded px-3 py-1">
                    <span className="text-xs text-white font-medium">{network.name}</span>
                    <span className="text-xs text-cyan-300/50 ml-1.5">Chain {network.chainId}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Start/Stop Control */}
        {!status?.isRunning && (
          <div className="card border-cyan-400/30 bg-cyan-500/5">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center">
                <div className="text-2xl">⚡</div>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-cyan-100">Start Trading Agent</h2>
                <p className="text-xs text-cyan-300/70">Enter password to begin</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-cyan-300 mb-2">Password</label>
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleStart()}
                />
              </div>

              <button
                onClick={handleStart}
                disabled={!password || loading}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Starting...' : 'Start Agent'}
              </button>

              <button
                onClick={handleResetWallet}
                className={`w-full text-sm py-2 rounded-lg transition-colors ${
                  showResetConfirm
                    ? 'bg-red-600/20 hover:bg-red-600/30 border border-red-400/30 text-red-200'
                    : 'bg-zinc-700 hover:bg-zinc-600 border border-cyan-400/30 text-cyan-300'
                }`}
              >
                {showResetConfirm ? '⚠️ Click Again to Confirm Reset' : 'Reset Wallet (Create New or Recover)'}
              </button>

              {showResetConfirm && (
                <p className="text-xs text-red-300 text-center">
                  This will delete your current wallet. Make sure you have your recovery phrase backed up!
                </p>
              )}

              {/* Re-link Button - for already registered daemons with JWT issues */}
              <div className="bg-yellow-500/10 border border-yellow-400/20 rounded-lg p-3 mt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-yellow-100 font-semibold mb-0.5">🔄 Already registered?</p>
                    <p className="text-xs text-yellow-300/70">Re-link if you have JWT token issues</p>
                  </div>
                  <button
                    onClick={handleForceRelink}
                    disabled={relinking || loading}
                    className="bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-400/30 text-yellow-100 font-medium px-3 py-1.5 rounded text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {showRelinkConfirm ? 'Confirm Re-link' : (relinking ? 'Re-linking...' : 'Re-link')}
                  </button>
                </div>
                {showRelinkConfirm && (
                  <div className="mt-2 pt-2 border-t border-yellow-400/20">
                    <p className="text-xs text-yellow-200/80 mb-2">⚠️ This will generate a NEW link code. Continue?</p>
                    <button
                      onClick={() => setShowRelinkConfirm(false)}
                      className="text-xs text-yellow-300 hover:text-yellow-100 underline"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Disclaimer Signature Required Warning */}
        {status?.isRunning && linkStatus && linkStatus.isLinked && linkStatus.needsDisclaimer && (
          <div className="card border-red-500/50 bg-red-500/10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
                <div className="text-2xl">⚠️</div>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-red-100">Action Required: Complete Disclaimer Signature</h2>
                <p className="text-xs text-red-300/70">Your daemon is linked but cannot operate until you sign the EIP-712 disclaimer</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-red-500/10 border border-red-400/30 rounded-lg p-4">
                <h4 className="font-semibold text-red-100 mb-3 text-sm">⚠️ Incomplete Onboarding Detected</h4>
                <p className="text-red-200/80 text-sm mb-3">
                  You linked your wallet but didn't complete the critical disclaimer signature step.
                  Without this EIP-712 signature, the daemon cannot:
                </p>
                <ul className="list-disc list-inside space-y-1 text-red-200/70 text-xs ml-2">
                  <li>Execute trades on your behalf</li>
                  <li>Access your subscription status</li>
                  <li>Receive permission grants from the platform</li>
                </ul>
              </div>

              <div className="bg-black/30 p-4 rounded-lg border border-red-400/20">
                <p className="text-xs text-red-300/70 mb-3 font-semibold">To fix this, click below to complete the signature:</p>
                <a
                  href={`https://app.bulwk.com/?disclaimer=true&wallet=${status?.walletAddress || ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white font-semibold py-3 px-6 rounded-lg transition-all"
                >
                  🔐 Complete Disclaimer Signature
                </a>
                <p className="text-xs text-red-300/50 mt-3 text-center">
                  You'll be prompted to double-click to sign the disclaimer, then complete your subscription payment.
                </p>
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-lg">
                <p className="text-xs text-yellow-300">
                  💡 <strong>What happened?</strong> You may have closed the tab before completing payment, or your wallet didn't have enough funds for the transaction fee. Complete the signature now to continue.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Link Instructions */}
        {status?.isRunning && linkStatus && !linkStatus.isLinked && (
          <div className="card border-cyan-400/50 bg-cyan-500/5">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-cyan-500 rounded-full flex items-center justify-center">
                <div className="text-2xl">🔗</div>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-cyan-100">Link Your Agent</h2>
                <p className="text-xs text-cyan-300/70">Connect to platform to start trading</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Next Steps */}
              <div className="bg-cyan-500/10 border border-cyan-400/20 rounded-lg p-4">
                <h4 className="font-semibold text-cyan-100 mb-3 text-sm">Next Steps:</h4>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-cyan-500 text-black font-bold flex items-center justify-center flex-shrink-0 text-xs">1</div>
                    <div>
                      <strong className="text-cyan-100 text-sm">Click the link below</strong>
                      <p className="text-cyan-300/60 mt-0.5 text-xs">Opens platform in new tab</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-cyan-500 text-black font-bold flex items-center justify-center flex-shrink-0 text-xs">2</div>
                    <div>
                      <strong className="text-cyan-100 text-sm">Connect your wallet</strong>
                      <p className="text-cyan-300/60 mt-0.5 text-xs">Use MetaMask or Rabby to sign</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-cyan-500 text-black font-bold flex items-center justify-center flex-shrink-0 text-xs">3</div>
                    <div>
                      <strong className="text-cyan-100 text-sm">Accept disclaimer & subscribe</strong>
                      <p className="text-cyan-300/60 mt-0.5 text-xs">Complete setup on platform</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-black/30 p-4 rounded-lg border border-cyan-400/20">
                <p className="text-xs text-cyan-300/70 mb-3">Click to open platform and link:</p>
                <a
                  href={linkStatus.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-semibold py-3 px-6 rounded-lg transition-all"
                >
                  Open Platform & Link Agent
                </a>
              </div>

              <details className="bg-black/20 p-3 rounded-lg">
                <summary className="text-xs text-cyan-400 cursor-pointer">Or enter code manually</summary>
                <p className="text-xl font-bold text-cyan-100 text-center font-mono mt-3">{linkStatus.linkCode}</p>
                <p className="text-xs text-cyan-400/60 text-center mt-2">Visit app.bulwk.com/link and enter this code</p>
              </details>

              <div className="bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-lg">
                <p className="text-xs text-yellow-300">
                  ⏱️ Keep this window open. Link expires in 15 minutes.
                </p>
              </div>

              <button
                onClick={handleStop}
                className="btn-secondary w-full"
              >
                Stop Agent
              </button>
            </div>
          </div>
        )}

        {/* Linked Status */}
        {status?.isLinked && (
          <div className="card border-green-400/50 bg-green-500/5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-green-100">✅ Linked to Platform</h2>
              <button
                onClick={handleStop}
                className="btn-secondary"
              >
                Stop Agent
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-2 h-2 bg-green-400 rounded-full pulse"></div>
                <span className="text-cyan-300">Listening for trading instructions...</span>
              </div>

              {/* Heartbeat Indicator */}
              <div className="bg-black/30 border border-cyan-400/20 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      heartbeatStatus.status === 'connected' ? 'bg-green-400 pulse' :
                      heartbeatStatus.status === 'connecting' ? 'bg-yellow-400 animate-pulse' :
                      'bg-red-400'
                    }`}></div>
                    <span className="text-xs text-cyan-300/90">
                      {heartbeatStatus.status === 'connected' ? '💓 Connected' :
                       heartbeatStatus.status === 'connecting' ? '🔄 Connecting' :
                       '❌ Disconnected'}
                    </span>
                  </div>
                  {heartbeatStatus.lastHeartbeat && (
                    <span className="text-xs text-cyan-400/60">
                      Last: {new Date(heartbeatStatus.lastHeartbeat).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                <p className="text-xs text-cyan-400/50 mt-1.5">
                  Session heartbeat keeps your authentication alive
                </p>
              </div>

              {/* Re-link Button */}
              <div className="bg-yellow-500/10 border border-yellow-400/20 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-yellow-100 font-semibold mb-0.5">🔄 Need to Re-link?</p>
                    <p className="text-xs text-yellow-300/70">For edge cases like JWT token mismatch</p>
                  </div>
                  <button
                    onClick={handleForceRelink}
                    disabled={relinking}
                    className="bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-400/30 text-yellow-100 font-medium px-3 py-1.5 rounded text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {showRelinkConfirm ? 'Confirm Re-link' : (relinking ? 'Re-linking...' : 'Re-link Daemon')}
                  </button>
                </div>
                {showRelinkConfirm && (
                  <div className="mt-2 pt-2 border-t border-yellow-400/20">
                    <p className="text-xs text-yellow-200/80 mb-2">⚠️ This will generate a NEW link code. Continue?</p>
                    <button
                      onClick={() => setShowRelinkConfirm(false)}
                      className="text-xs text-yellow-300 hover:text-yellow-100 underline"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-black/30 p-3 rounded-lg">
                <p className="text-xs text-cyan-400/70">
                  Keep this window open for autonomous trading. The agent will execute transactions as directed by the platform.
                </p>
              </div>

              {/* Remote Control - Start Trading Button */}
              <div className="bg-cyan-500/10 border border-cyan-400/20 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-semibold text-cyan-100">🚀 Quick Deploy</h4>
                    <p className="text-xs text-cyan-300/70 mt-0.5">Deploy positions without visiting the platform</p>
                  </div>
                </div>

                <button
                  onClick={() => setShowDeployConfirm(true)}
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-semibold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  <span>Start Trading</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>

                <p className="text-xs text-cyan-400/60 mt-2 text-center">
                  Creates up to 5 liquidity positions. Check activity log for execution status.
                </p>
              </div>

              {/* Collect SHADOW Rewards Section */}
              <div className="bg-purple-500/10 border border-purple-400/20 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-semibold text-purple-100">💎 Collect SHADOW Rewards</h4>
                    <p className="text-xs text-purple-300/70 mt-0.5">Manual SHADOW collection (LP fees auto-collect during rebalancing)</p>
                  </div>
                </div>

                <div className="bg-black/30 border border-purple-400/10 rounded-lg p-3 mb-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-purple-200">💎 SHADOW Rewards</span>
                    <span className="text-white font-mono">
                      {positionFees ? `${positionFees.shadow} SHADOW` : 'Loading...'}
                    </span>
                  </div>
                  {positionFees && positionFees.tokenIds && positionFees.tokenIds.length > 0 && (
                    <p className="text-xs text-purple-300/50 italic mt-2">
                      Tracking {positionFees.tokenIds.length} active position{positionFees.tokenIds.length !== 1 ? 's' : ''}
                    </p>
                  )}
                  <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-2 mt-2">
                    <p className="text-xs text-cyan-200">
                      ℹ️ LP fees (WS + USDC) are automatically collected during rebalancing
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleCollectFees}
                  disabled={collectingFees || !positionFees || !positionFees.tokenIds || positionFees.tokenIds.length === 0}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-semibold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>{collectingFees ? 'Collecting...' : 'Collect SHADOW Rewards'}</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>

                <p className="text-xs text-purple-400/60 mt-2 text-center">
                  Batch collects SHADOW rewards from all positions. SHADOW is also auto-collected during rebalancing (best-effort, 3 attempts).
                </p>

                {/* Batch Withdraw All Positions Section */}
                <div className="bg-black/30 border border-red-400/10 rounded-lg p-3 mb-3 space-y-2 mt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-red-200">Active Positions</span>
                    <span className="text-white font-mono">
                      {positionFees && positionFees.tokenIds ?
                        `${positionFees.tokenIds.length} position(s)` :
                        'Loading...'}
                    </span>
                  </div>

                  {/* Batch Size Selector */}
                  <div className="flex items-center justify-between text-xs mt-2">
                    <span className="text-red-200">Batch Size</span>
                    <select
                      value={batchSize}
                      onChange={(e) => setBatchSize(e.target.value)}
                      className="bg-zinc-800 text-white text-xs px-2 py-1 rounded border border-red-400/20"
                    >
                      <option value="all">All at once</option>
                      <option value="12">Batches of 12</option>
                    </select>
                  </div>

                  {positionFees && positionFees.tokenIds && positionFees.tokenIds.length > 12 && batchSize === '12' && (
                    <p className="text-xs text-yellow-300/70 italic mt-2">
                      ℹ️ Will create {Math.ceil(positionFees.tokenIds.length / 12)} transaction(s)
                    </p>
                  )}

                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2 mt-2">
                    <p className="text-xs text-yellow-200 font-semibold mb-1">
                      ⚠️ WARNING: Permanent Action
                    </p>
                    <p className="text-xs text-yellow-300/80">
                      • Collect SHADOW rewards FIRST (use button above)<br/>
                      • Uncollected SHADOW will be LOST<br/>
                      • This action cannot be undone<br/>
                      • Liquidity returns to wallet as WS + USDC
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleBatchWithdraw}
                  disabled={withdrawing || !positionFees || !positionFees.tokenIds || positionFees.tokenIds.length === 0}
                  className="w-full bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white font-semibold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>{withdrawing ? 'Withdrawing...' : 'Batch Withdraw All Positions'}</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>

                <p className="text-xs text-red-400/60 mt-2 text-center">
                  No subscription required • Works without active subscription
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Authentication Status */}
        {status?.isLinked && authStatus !== null && !authStatus.isAuthenticated && (
          <div className="card border-red-400/50 bg-red-500/10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="text-2xl">🔐</div>
                <div>
                  <h3 className="text-lg font-semibold text-red-100">Authentication Required</h3>
                  <p className="text-xs text-red-300/70 mt-0.5">
                    Daemon is linked but not authenticated - cannot grant permissions
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-red-500/10 border border-red-400/20 rounded-lg p-4 space-y-3">
              <p className="text-sm text-red-100">
                The daemon is missing its authentication token (JWT). This prevents authenticated operations like granting spending permissions.
              </p>

              <div className="bg-black/30 border border-red-400/10 rounded-lg p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-red-200">Linked to platform:</span>
                  <span className="text-white font-semibold">{authStatus.isLinked ? '✅ Yes' : '❌ No'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-red-200">Has auth token:</span>
                  <span className="text-white font-semibold">{authStatus.hasJwtToken ? '✅ Yes' : '❌ No'}</span>
                </div>
              </div>

              <button
                onClick={handleRefreshAuth}
                disabled={refreshingAuth}
                className="w-full bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white font-semibold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>{refreshingAuth ? 'Refreshing...' : 'Refresh Authentication'}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>

              <p className="text-xs text-red-300/70 text-center">
                If refresh fails, try stopping and restarting the daemon to re-link
              </p>
            </div>
          </div>
        )}

        {/* Spending Permission Status */}
        {status?.isLinked && (
          <div className={`card ${spendingPermission?.hasPermission ? 'border-green-400/50 bg-green-500/5' : 'border-orange-400/50 bg-orange-500/10'}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="text-2xl">{spendingPermission?.hasPermission ? '✅' : '⚠️'}</div>
                <div>
                  <h3 className="text-lg font-semibold text-orange-100">Auto-Rebalancing Permission</h3>
                  <p className="text-xs text-orange-300/70 mt-0.5">
                    {spendingPermission?.hasPermission
                      ? 'Permission granted - auto-rebalancing enabled'
                      : 'Grant permission to enable auto-rebalancing'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPermissionExplainer(true)}
                className="text-xs bg-orange-500/10 hover:bg-orange-500/20 border border-orange-400/30 text-orange-300 px-2 py-1 rounded"
              >
                ? Why Needed
              </button>
            </div>

            {spendingPermission?.hasPermission ? (
              <div className="bg-black/30 border border-green-400/20 rounded-lg p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-green-200">Status:</span>
                  <span className="text-white font-semibold">{spendingPermission.canSpend ? '✅ Can spend' : '❌ ' + spendingPermission.reason}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-green-200">Remaining today:</span>
                  <span className="text-white font-mono">{(Number(spendingPermission.limits?.remainingTodayLogic) || 0).toFixed(2)} LOGIC</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-green-200">Remaining total:</span>
                  <span className="text-white font-mono">{(Number(spendingPermission.limits?.remainingTotalLogic) || 0).toFixed(2)} LOGIC</span>
                </div>
                <div className="flex items-center justify-between border-t border-green-400/20 pt-2">
                  <span className="text-green-200">Daily limit:</span>
                  <span className="text-white font-mono">{spendingPermission.limits?.dailyLimitLogic || '0'} LOGIC</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-green-200">Total limit:</span>
                  <span className="text-white font-mono">{spendingPermission.limits?.maxTotalLogic || '0'} LOGIC</span>
                </div>
              </div>
            ) : (
              <div className="bg-orange-500/10 border border-orange-400/20 rounded-lg p-4">
                <p className="text-sm text-orange-100 mb-3">
                  Without permission, the position monitor cannot create auto-rebalance intents. All positions will remain unmanaged even if they go out of range.
                </p>
                <button
                  onClick={() => setShowGrantPermission(true)}
                  className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-semibold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  <span>Grant Permission</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Viewer Authorization Management */}
        {status?.isLinked && (
          <div className="card border-green-400/50 bg-green-500/5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="text-2xl">👁️</div>
                <div>
                  <h3 className="text-lg font-semibold text-green-100">View-Only Mode Access</h3>
                  <p className="text-xs text-green-300/70 mt-0.5">
                    Authorize wallets to monitor daemon activity from mobile
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-green-500/10 border border-green-400/20 rounded-lg p-4 mb-4">
              <p className="text-xs text-green-200 mb-2">
                💡 Authorized wallets can monitor your daemon activity from mobile without requiring your private key.
              </p>
              <p className="text-xs text-green-300/60">
                Perfect for checking status on the go without risking security.
              </p>
            </div>

            {/* Add New Viewer */}
            <div className="bg-black/30 border border-green-400/20 rounded-lg p-4 mb-4">
              <h4 className="text-sm font-semibold text-green-100 mb-3">Authorize New Viewing Wallet</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-green-300 mb-1">Wallet Address (0x...)</label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={newViewerWallet}
                    onChange={(e) => setNewViewerWallet(e.target.value)}
                    className="w-full bg-black/30 border border-green-400/20 rounded px-3 py-2 text-white text-sm font-mono"
                  />
                </div>
                <button
                  onClick={handleAuthorizeViewer}
                  disabled={authorizingViewer || !newViewerWallet}
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white font-semibold py-2 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {authorizingViewer ? 'Authorizing...' : '➕ Authorize Viewer'}
                </button>
              </div>
            </div>

            {/* Authorized Viewers List */}
            {viewerAuthorizations.length > 0 && (
              <div className="bg-black/30 border border-green-400/20 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-green-100 mb-3">Authorized Viewers ({viewerAuthorizations.length})</h4>
                <div className="space-y-2">
                  {viewerAuthorizations.map((auth, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-black/20 border border-green-400/10 rounded-lg p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-mono truncate">{auth.viewing_wallet}</p>
                        <p className="text-xs text-green-300/50 mt-1">
                          Authorized: {new Date(auth.granted_at).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRevokeViewer(auth.viewing_wallet)}
                        className="ml-3 text-red-400 hover:text-red-300 text-xs px-3 py-1 border border-red-400/30 rounded hover:bg-red-500/10 transition-all"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {viewerAuthorizations.length === 0 && (
              <div className="bg-black/30 border border-green-400/20 rounded-lg p-4 text-center">
                <p className="text-sm text-green-300/70">No authorized viewers yet</p>
                <p className="text-xs text-green-400/50 mt-1">Add a wallet address above to get started</p>
              </div>
            )}
          </div>
        )}

        {/* Subscription Expired Alert */}
        {status?.isLinked && subscriptionStatus.isExpired && (
          <div className="card border-red-400/50 bg-red-500/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="text-3xl pulse">🚫</div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-100">Subscription Expired</h3>
                <p className="text-sm text-red-300/80">
                  Your subscription has expired. Automated trading is paused.
                </p>
              </div>
            </div>

            <a
              href="https://app.bulwk.com/?renew=true"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white font-semibold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <span>Renew Subscription</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}

        {/* Subscription Expiring Soon Alert */}
        {status?.isLinked && !subscriptionStatus.isExpired && subscriptionStatus.hoursRemaining !== null && subscriptionStatus.hoursRemaining < 6 && (
          <div className="card border-yellow-400/50 bg-yellow-500/10">
            <div className="flex items-center gap-3">
              <div className="text-3xl pulse">⏰</div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-yellow-100">Subscription Expiring Soon</h3>
                <p className="text-sm text-yellow-300/80">
                  Your subscription expires in {subscriptionStatus.hoursRemaining.toFixed(1)} hours.
                </p>
                <p className="text-xs text-yellow-400/70 mt-2">
                  Renewal link will appear after expiration to prevent losing remaining time.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Low LOGIC Balance Alert */}
        {status?.isLinked && (showEmergencyAlert || (logicBalance !== null && logicBalance < 5)) && (
          <div className="card border-yellow-400/50 bg-yellow-500/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="text-3xl pulse">⚠️</div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-yellow-100">Low LOGIC Balance</h3>
                <p className="text-sm text-yellow-300/80">
                  {logicBalance !== null
                    ? `Your LOGIC balance is running low (${Number(logicBalance).toFixed(2)} LOGIC remaining). Top up to continue automated trading.`
                    : 'Your LOGIC balance is below the emergency threshold. Top up to continue automated trading.'}
                </p>
              </div>
            </div>

            <a
              href="https://app.bulwk.com/?openLogic=true"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white font-semibold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <span>Top Up LOGIC Credits</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}


        {/* Keep Awake Control */}
        {status?.isRunning && (
          <div className="card bg-zinc-900/50">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-cyan-100">☕ Keep Awake</h3>
                <p className="text-xs text-cyan-300/70 mt-0.5">
                  Prevent your computer from sleeping while agent runs
                </p>
              </div>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/keep-awake/toggle', { method: 'POST' })
                    const data = await res.json()
                    if (res.ok) {
                      onRefresh() // Refresh status to get updated keepAwakeEnabled state
                    } else {
                      alert(data.error || 'Failed to toggle keep awake')
                    }
                  } catch (err) {
                    alert('Failed to toggle keep awake: ' + err.message)
                  }
                }}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                  status.keepAwakeEnabled
                    ? 'bg-green-500/20 border-2 border-green-400/50 text-green-300 hover:bg-green-500/30'
                    : 'bg-zinc-700 border-2 border-cyan-400/30 text-cyan-300 hover:bg-zinc-600'
                }`}
              >
                {status.keepAwakeEnabled ? '✓ Enabled' : 'Enable'}
              </button>
            </div>

            <div className={`text-xs rounded-lg p-3 border ${
              status.keepAwakeEnabled
                ? 'bg-green-500/10 border-green-400/20 text-green-200'
                : 'bg-black/30 border-cyan-400/20 text-cyan-300/70'
            }`}>
              {status.keepAwakeEnabled ? (
                <div className="space-y-1">
                  <p className="font-semibold">☕ Keep awake is active</p>
                  <p>Your {status.platform === 'darwin' ? 'Mac' : status.platform === 'win32' ? 'PC' : 'computer'} will not sleep while the daemon runs</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p>Computer may sleep if idle, potentially missing rebalance intents</p>
                  <p className="text-cyan-400/90 mt-2"><strong>Recommended:</strong> Enable this for 24/7 auto-rebalancing</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Idle Sweep Toggle */}
        {status?.isLinked && (
          <div className="card border-cyan-400/50 bg-cyan-500/5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="text-2xl">🧹</div>
                <div>
                  <h3 className="text-sm font-semibold text-cyan-100">Auto-Deploy Idle Balances</h3>
                  <p className="text-xs text-cyan-300/70 mt-0.5">
                    Automatically deploy unused WS/USDC tokens into positions
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={idleSweepEnabled}
                  onChange={handleToggleIdleSweep}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            <div className="bg-cyan-500/10 border border-cyan-400/20 rounded-lg p-4">
              <p className="text-xs text-cyan-200 mb-3">
                <strong>ℹ️ What is Idle Sweep?</strong>
              </p>
              <p className="text-xs text-cyan-300/80 mb-3">
                When enabled, the daemon monitors your wallet for idle WS and USDC tokens. If it detects unused balances
                for 3 consecutive scans (approximately 5 minutes), it automatically creates positions with those funds.
              </p>

              <div className="bg-emerald-500/10 border border-emerald-400/20 rounded-lg p-3 mb-3">
                <p className="text-xs text-emerald-200 mb-2">
                  <strong>✅ ON (Automatic - Maximize Capital Efficiency):</strong>
                </p>
                <ul className="text-xs text-emerald-300/80 space-y-1 list-disc list-inside">
                  <li>Idle tokens are automatically deployed into 5-tier positions after 5 minutes</li>
                  <li>Maximizes your earning potential by keeping all funds actively working</li>
                  <li>Uses the same tier allocation as your main positions</li>
                  <li>Perfect for experienced users who want hands-free operation</li>
                </ul>
              </div>

              <div className="bg-orange-500/10 border border-orange-400/20 rounded-lg p-3 mb-3">
                <p className="text-xs text-orange-200 mb-2">
                  <strong>🔒 OFF (Manual - Recommended for Beginners):</strong>
                </p>
                <ul className="text-xs text-orange-300/80 space-y-1 list-disc list-inside">
                  <li>You maintain full control over when and how to deploy your funds</li>
                  <li>Ideal when learning the platform or testing with small amounts</li>
                  <li>You can manually deploy positions via "Start Trading" when ready</li>
                  <li>Gives you time to collect fees or withdraw before automatic redeployment</li>
                </ul>
              </div>

              <div className="bg-blue-500/10 border border-blue-400/20 rounded-lg p-3">
                <p className="text-xs text-blue-200">
                  <strong>💡 Tip:</strong> Start with this OFF while learning. Once comfortable, enable it to
                  maximize your capital efficiency. The daemon only deploys when you have idle balances - it won't
                  interfere with existing positions.
                </p>
              </div>

              <p className="text-xs text-cyan-400/70 mt-3 font-semibold">
                {idleSweepEnabled
                  ? '✅ Idle funds will auto-deploy after 5 minutes'
                  : '🔒 Manual control: Deploy positions when you\'re ready'}
              </p>
            </div>
          </div>
        )}

        {/* Backdated Rebalance Control */}
        {status?.isLinked && (
          <div className="card border-orange-400/50 bg-orange-500/5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="text-2xl">⏮️</div>
                <div>
                  <h3 className="text-sm font-semibold text-orange-100">Execute Backdated Rebalances</h3>
                  <p className="text-xs text-orange-300/70 mt-0.5">
                    Control whether to execute rebalance signals older than 5 minutes
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={executeBackdatedRebalances}
                  onChange={handleToggleBackdatedRebalances}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            <div className="bg-orange-500/10 border border-orange-400/20 rounded-lg p-4">
              <p className="text-xs text-orange-200 mb-3">
                <strong>ℹ️ What are backdated rebalances?</strong>
              </p>
              <p className="text-xs text-orange-300/80 mb-3">
                When your daemon is offline, positions may go out of range and the platform creates rebalance instructions (intents).
                This setting controls what happens to those old intents when you reconnect.
              </p>

              <div className="bg-emerald-500/10 border border-emerald-400/20 rounded-lg p-3 mb-3">
                <p className="text-xs text-emerald-200 mb-2">
                  <strong>✅ ON (Recommended - Complete Execution):</strong>
                </p>
                <ul className="text-xs text-emerald-300/80 space-y-1 list-disc list-inside">
                  <li>Preserves all pending intents created while daemon was offline or during deployment</li>
                  <li>Daemon executes all intents in chronological order when it reconnects</li>
                  <li>Essential during initial deployment when multiple processes create a backlog</li>
                  <li><strong>Important:</strong> During deployment/rebalancing, lag from concurrent processes creates backlogs that need to be processed</li>
                </ul>
              </div>

              <div className="bg-orange-500/10 border border-orange-400/20 rounded-lg p-3 mb-3">
                <p className="text-xs text-orange-200 mb-2">
                  <strong>🔒 OFF (Advanced - Fresh Signals Only):</strong>
                </p>
                <ul className="text-xs text-orange-300/80 space-y-1 list-disc list-inside">
                  <li>Old pending intents are deleted when daemon reconnects or "Start Trading" is pressed</li>
                  <li>Platform evaluates your CURRENT position state and creates fresh intents if needed</li>
                  <li>Prevents executing outdated instructions on positions that may have returned to range</li>
                  <li><strong>Warning:</strong> May skip necessary rebalances if disabled during active trading periods</li>
                </ul>
              </div>

              <div className="bg-red-500/10 border border-red-400/20 rounded-lg p-3">
                <p className="text-xs text-red-200">
                  <strong>⚠️ Before enabling:</strong> Use "Collect SHADOW Rewards" above to collect any accrued
                  fees. Otherwise, rebalancing will burn uncollected Shadow rewards.
                </p>
              </div>

              <p className="text-xs text-orange-400/70 mt-3 font-semibold">
                {executeBackdatedRebalances
                  ? '✅ All queued intents will execute when you reconnect'
                  : '🔒 Smart mode: Stale intents deleted, current state evaluated (recommended)'}
              </p>
            </div>
          </div>
        )}

        {/* Tier Configuration Panel */}
        {status?.isLinked && (
          <div className="card bg-purple-500/10 border border-purple-400/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-purple-100">⚙️ Tier Configuration</h4>
                <button
                  onClick={() => setShowTierConfig(!showTierConfig)}
                  className="text-purple-300/70 hover:text-purple-200 text-xs"
                >
                  {showTierConfig ? '▼' : '▶'}
                </button>
              </div>
              <button
                onClick={handleRestoreTierDefaults}
                className="text-xs text-purple-300/70 hover:text-purple-200 transition-colors"
              >
                Restore Defaults
              </button>
            </div>

            {showTierConfig && (
              <div className="space-y-3">
                {/* Explainer Panel */}
                <div className="bg-blue-500/10 border border-blue-400/20 rounded-lg p-3">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-blue-400 text-lg">ℹ️</span>
                    <div className="flex-1">
                      <button
                        onClick={() => setShowTierExplainer(!showTierExplainer)}
                        className="text-sm font-semibold text-blue-200 hover:text-blue-100 transition-colors flex items-center gap-1"
                      >
                        How Tier Toggles Work
                        <span className="text-xs">{showTierExplainer ? '▼' : '▶'}</span>
                      </button>
                    </div>
                  </div>

                  {showTierExplainer && (
                    <div className="text-xs text-blue-200/90 space-y-2 mt-3 pl-7">
                      <p><strong>Enabling a tier:</strong> Allows new positions to be deployed in this tier. The daemon will execute rebalance intents for this tier.</p>

                      <p><strong>Disabling a tier:</strong></p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>❗ Existing positions in this tier are NOT automatically closed</li>
                        <li>🚫 Rebalance intents for this tier will be skipped</li>
                        <li>⚠️ Positions will remain on-chain but won't rebalance when out of range</li>
                        <li>📊 Check <a href="https://app.bulwk.com" target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:text-blue-200 underline">app.bulwk.com</a> to see which tiers have active positions</li>
                      </ul>

                      <div className="bg-yellow-500/10 border border-yellow-400/20 rounded p-2 mt-2">
                        <p className="text-yellow-200"><strong>⚠️ Best Practice:</strong> Close all positions in a tier before disabling it. Otherwise, positions will be "frozen" without auto-rebalancing protection.</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-black/30 border border-purple-400/10 rounded-lg p-3">
                  <p className="text-xs text-purple-200/70 mb-3">
                    ℹ️ <strong>Bulwk Pre-Config:</strong> Optimized for yield with good risk spread
                  </p>

                  {/* Tier Toggles */}
                  <div className="space-y-2">
                    {Object.entries(tierPreferences).map(([tierName, tier]) => (
                      <div key={tierName} className="flex items-center justify-between bg-black/20 border border-purple-400/10 rounded p-2">
                        <div className="flex items-center gap-3 flex-1">
                          <input
                            type="checkbox"
                            checked={tier.enabled}
                            onChange={() => handleToggleTier(tierName)}
                            className="w-4 h-4 rounded border-purple-400/30 bg-black/30 checked:bg-purple-500"
                          />
                          <span className="text-sm text-white font-medium w-24" title={`${tierName} tier`}>{tierName}</span>
                          <span className="text-xs text-purple-200/70 flex-1" title={
                            tierName === 'HOT' ? 'Narrow range, highest fees, frequent rebalances' :
                            tierName === 'WARM' ? 'Medium range, balanced risk/reward' :
                            tierName === 'MEDIUM' ? 'Wider range, less frequent rebalances' :
                            tierName === 'WIDE' ? 'Wide range, safety net for volatility' :
                            tierName === 'INSURANCE' ? 'Widest range, emergency liquidity backup' : ''
                          }>
                            {tierName === 'HOT' && '🔥 Highest fees, frequent rebalances (3min grace)'}
                            {tierName === 'WARM' && '💫 Balanced risk/reward (5min grace)'}
                            {tierName === 'MEDIUM' && '⚖️ Moderate fees, less frequent (10min grace)'}
                            {tierName === 'WIDE' && '🛡️ Safety net for volatility (15min grace)'}
                            {tierName === 'INSURANCE' && '🚨 Emergency backup (20min grace)'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={tier.allocPct}
                            onChange={(e) => handleTierPercentageChange(tierName, e.target.value)}
                            disabled={!tier.enabled}
                            className="w-16 bg-black/30 border border-purple-400/20 rounded px-2 py-1 text-sm text-white text-right disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <span className="text-xs text-purple-200/70">%</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Total Percentage */}
                  <div className="mt-3 pt-3 border-t border-purple-400/20">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-purple-200">Total:</span>
                      <span className={`text-sm font-bold ${calculateTierTotal() === 100 ? 'text-green-400' : 'text-yellow-400'}`}>
                        {calculateTierTotal()}% {calculateTierTotal() === 100 ? '✅' : '⚠️'}
                      </span>
                    </div>
                    {calculateTierTotal() !== 100 && (
                      <p className="text-xs text-yellow-400/70 mt-1">
                        Note: Percentages will be auto-normalized to 100% when saved
                      </p>
                    )}
                  </div>
                </div>

                {/* Save Button */}
                <button
                  onClick={handleSaveTierConfiguration}
                  disabled={savingTierConfig}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 disabled:from-purple-500/50 disabled:to-pink-500/50 text-white font-semibold py-2 px-4 rounded-lg transition-all"
                >
                  {savingTierConfig ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Security Info */}
        <div className="card bg-zinc-900/50">
          <h3 className="text-sm font-semibold text-cyan-100 mb-3">🔐 Security</h3>
          <ul className="text-xs text-cyan-300/70 space-y-2">
            <li>✓ Your private key stays on YOUR computer</li>
            <li>✓ Platform sends signed trading instructions</li>
            <li>✓ Local verification before execution</li>
            <li>✓ Stop anytime by closing this window</li>
          </ul>
        </div>

        {/* DEX Direct Access Notice with Smart Contract Risks */}
        <div className="card bg-purple-500/10 border border-purple-400/20">
          <div className="flex items-start gap-3">
            <div className="text-2xl">🌐</div>
            <div className="flex-1">
              <h4 className="font-semibold text-purple-100 mb-2 text-sm">
                Direct DEX Access Available
              </h4>
              <p className="text-xs text-purple-200/80 mb-3">
                You can visit{' '}
                <a
                  href="https://shadow.so"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-300 hover:text-purple-200 underline font-semibold"
                  onClick={(e) => {
                    const confirmed = confirm(
                      '⚠️ You are leaving Bulwk to visit Shadow DEX (third-party platform).\n\n' +
                      '🔗 URL: https://shadow.so\n' +
                      '📅 Last verified: November 2025\n\n' +
                      'Shadow may change their URL without notice. This is a third-party platform not controlled by Bulwk.\n\n' +
                      'Continue to Shadow DEX?'
                    )
                    if (!confirmed) {
                      e.preventDefault()
                    }
                  }}
                >
                  shadow.so
                </a>
                {' '}directly to manage positions.
              </p>
              <div className="bg-purple-900/20 rounded p-3 mb-3">
                <p className="text-xs font-semibold text-purple-200 mb-2">
                  To access daemon wallet on DEX:
                </p>
                <ol className="text-xs text-purple-200/70 space-y-1 list-decimal list-inside">
                  <li>Export daemon private key (Settings → Export Key)</li>
                  <li>Import to browser wallet (MetaMask, Rabby, etc.)</li>
                  <li>Connect to shadow.so</li>
                </ol>
              </div>
              <div className="bg-red-900/20 border border-red-400/20 rounded p-3 mb-2">
                <p className="text-xs font-semibold text-red-200 mb-2">
                  ⚠️ Smart Contract Risk Warning
                </p>
                <p className="text-xs text-red-200/80 mb-2">
                  Your funds are deployed into <strong>third-party smart contracts</strong> (Shadow protocol, Uniswap V3, etc.) that are:
                </p>
                <ul className="text-xs text-red-200/70 space-y-1 list-disc list-inside">
                  <li>Not controlled or audited by Bulwk</li>
                  <li>Subject to smart contract vulnerabilities and exploits</li>
                  <li>Potentially at risk from protocol bugs or economic attacks</li>
                  <li>Immutable - cannot be updated if bugs are discovered</li>
                </ul>
                <p className="text-xs text-red-200/80 mt-2">
                  <strong>You accept all risks</strong> when depositing funds into these contracts. Always DYOR (Do Your Own Research).
                </p>
              </div>
              <div className="bg-yellow-900/20 border border-yellow-400/20 rounded p-2 mb-2">
                <p className="text-xs text-yellow-200/90">
                  🔑 <strong>Security Warning:</strong> Browser wallets expose private keys to extensions & malicious websites. Use a separate wallet for daemon operations.
                </p>
              </div>
              <p className="text-xs text-purple-300/50">
                ℹ️ Last verified: November 2025 • Shadow may change URL • Third-party platform & smart contracts - use at your own risk
              </p>
            </div>
          </div>
        </div>

        {/* Activity Log - Show when daemon is running */}
        {status?.isRunning && (
          <ActivityLog />
        )}


        {/* Deploy Confirmation Modal */}
        {showDeployConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-zinc-900/95 border border-cyan-400/30 rounded-xl p-6 max-w-lg mx-4 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-cyan-100">Deploy Liquidity Positions?</h3>
                <button
                  onClick={() => setShowDeployConfirm(false)}
                  className="text-cyan-400 hover:text-cyan-300 transition-colors"
                  disabled={deployingRemote}
                >
                  ✕
                </button>
              </div>

              <div className="text-sm text-cyan-200 leading-relaxed space-y-4">
                <p>This will create up to 5 concentrated liquidity positions:</p>

                <div className="bg-black/30 border border-cyan-400/20 rounded-lg p-3 space-y-2 text-xs">
                  <div><strong>HOT</strong>: Tightest range - highest fees, needs frequent rebalancing</div>
                  <div><strong>WARM</strong>: Narrow range - balanced risk/reward</div>
                  <div><strong>MEDIUM</strong>: Medium range - lower fees, less rebalancing</div>
                  <div><strong>WIDE</strong>: Wide range - safety net</div>
                  <div><strong>INSURANCE</strong>: Widest range - emergency liquidity</div>
                </div>

                <p className="text-xs text-cyan-300/70">
                  Tiers with &lt;$1 allocation will be skipped. Surplus can be deployed later by clicking "Start Trading" again.
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeployConfirm(false)}
                    disabled={deployingRemote}
                    className="flex-1 bg-zinc-700 hover:bg-zinc-600 border border-cyan-400/30 text-cyan-300 font-semibold py-3 px-4 rounded-lg transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRemoteDeploy}
                    disabled={deployingRemote}
                    className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-semibold py-3 px-4 rounded-lg transition-all disabled:opacity-50"
                  >
                    {deployingRemote ? 'Deploying...' : 'Confirm & Deploy'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Grant Permission Modal */}
        {showGrantPermission && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-zinc-900/95 border border-orange-400/30 rounded-xl p-6 max-w-lg mx-4 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-orange-100">Grant Auto-Rebalancing Permission</h3>
                <button
                  onClick={() => setShowGrantPermission(false)}
                  className="text-orange-400 hover:text-orange-300 transition-colors"
                  disabled={grantingPermission}
                >
                  ✕
                </button>
              </div>

              <div className="text-sm text-orange-200 leading-relaxed space-y-4">
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
                  <p className="font-bold text-orange-200 mb-2">📝 What You're Authorizing</p>
                  <p className="text-orange-100">
                    By granting this permission, you authorize the platform to spend your LOGIC credits for automated position rebalancing.
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-bold text-cyan-300 text-sm">Platform Controls:</h4>
                  <ul className="list-disc list-inside space-y-1 text-cyan-200/90 ml-2 text-xs">
                    <li>All spending limits configured on platform</li>
                    <li>Emergency stops and daily limits enforced platform-side</li>
                    <li>Full transparency via platform dashboard</li>
                    <li>Revoke permission anytime from platform settings</li>
                  </ul>
                </div>

                <div className="bg-cyan-500/10 border border-cyan-400/20 rounded-lg p-4">
                  <p className="font-bold text-cyan-200 mb-2 text-sm">💡 Next Steps:</p>
                  <p className="text-xs text-cyan-100">
                    After granting permission here, configure your spending limits, daily caps, and emergency thresholds in the platform's LOGIC Management modal.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowGrantPermission(false)}
                    disabled={grantingPermission}
                    className="flex-1 bg-zinc-700 hover:bg-zinc-600 border border-orange-400/30 text-orange-300 font-semibold py-3 px-4 rounded-lg transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGrantPermission}
                    disabled={grantingPermission}
                    className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-semibold py-3 px-4 rounded-lg transition-all disabled:opacity-50"
                  >
                    {grantingPermission ? 'Granting...' : 'Grant Permission'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Permission Explainer Modal */}
        {showPermissionExplainer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-zinc-900/95 border border-orange-400/30 rounded-xl p-6 max-w-2xl mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-orange-100">Why Spending Permission is Needed</h3>
                <button
                  onClick={() => setShowPermissionExplainer(false)}
                  className="text-orange-400 hover:text-orange-300 transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="text-sm text-orange-200 leading-relaxed space-y-4">
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
                  <p className="font-bold text-orange-200 mb-2">🔐 Security & Control</p>
                  <p className="text-orange-100">Spending permissions ensure the position monitor can only spend LOGIC credits within your defined limits, giving you full control over automation costs.</p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-bold text-cyan-300">What Happens WITH Permission:</h4>
                  <ul className="list-disc list-inside space-y-1 text-cyan-200/90 ml-2">
                    <li>✅ Position monitor automatically creates rebalance intents</li>
                    <li>✅ Out-of-range positions are rebalanced within grace period</li>
                    <li>✅ LOGIC credits are spent only within your limits</li>
                    <li>✅ Daily and total limits prevent runaway spending</li>
                    <li>✅ Emergency stop protects your remaining balance</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h4 className="font-bold text-red-300">What Happens WITHOUT Permission:</h4>
                  <ul className="list-disc list-inside space-y-1 text-red-200/90 ml-2">
                    <li>❌ Position monitor CANNOT create rebalance intents</li>
                    <li>❌ Positions remain out of range indefinitely</li>
                    <li>❌ No fee generation while out of range</li>
                    <li>❌ Potential impermanent loss from price drift</li>
                    <li>❌ Manual rebalancing required via platform</li>
                  </ul>
                </div>

                <div className="bg-cyan-500/10 border border-cyan-400/20 rounded-lg p-4">
                  <h4 className="font-bold text-cyan-200 mb-2">How LOGIC Credits Work:</h4>
                  <p className="mb-2">LOGIC is the automation fuel for Bulwk Platform:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><strong>1 LOGIC ≈ 0.2 S</strong> (Sonic native token)</li>
                    <li>Used to pay gas for automated rebalances</li>
                    <li>Top up anytime on platform</li>
                    <li>Remaining balance shown in dashboard</li>
                  </ul>
                </div>

                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <p className="font-bold text-yellow-200 mb-2">💰 Cost Estimates:</p>
                  <ul className="list-disc list-inside space-y-1 text-yellow-100 ml-2">
                    <li>HOT tier rebalance: ~2-5 LOGIC</li>
                    <li>WARM/MEDIUM rebalance: ~3-7 LOGIC</li>
                    <li>WIDE/INSURANCE rebalance: ~5-10 LOGIC</li>
                    <li>Average: ~100-500 LOGIC/month for active trading</li>
                  </ul>
                </div>

                <button
                  onClick={() => setShowPermissionExplainer(false)}
                  className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-semibold py-3 px-4 rounded-lg transition-all"
                >
                  Got it!
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tier Disable Confirmation Dialog */}
        {tierDisableConfirm && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={cancelTierDisable}>
            <div className="bg-zinc-900/95 border border-yellow-400/30 rounded-xl p-6 max-w-lg mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">⚠️</span>
                <h3 className="text-lg font-bold text-yellow-100">Disable {tierDisableConfirm.tierName} Tier?</h3>
              </div>

              <div className="text-sm text-yellow-200 leading-relaxed space-y-3">
                <p>You're about to disable the <strong className="text-yellow-100">{tierDisableConfirm.tierName}</strong> tier. Here's what will happen:</p>

                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 space-y-2">
                  <p className="font-bold text-red-300">⚠️ Important Consequences:</p>
                  <ul className="list-disc list-inside space-y-1 text-red-200/90 ml-2 text-xs">
                    <li>Existing positions in this tier will NOT be automatically closed</li>
                    <li>Positions will remain on-chain but STOP rebalancing when out of range</li>
                    <li>You'll need to manually manage or close these positions</li>
                    <li>Disabled tier won't be used for new deployments</li>
                  </ul>
                </div>

                <div className="bg-blue-500/10 border border-blue-400/20 rounded-lg p-3">
                  <p className="text-blue-200 text-xs">
                    <strong>💡 Tip:</strong> Visit{' '}
                    <a href="https://app.bulwk.com" target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:text-blue-200 underline">
                      app.bulwk.com
                    </a>
                    {' '}to check if you have active positions in the {tierDisableConfirm.tierName} tier before disabling.
                  </p>
                </div>

                <p className="text-yellow-300/80 text-xs">
                  Are you sure you want to disable this tier?
                </p>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={cancelTierDisable}
                  className="flex-1 bg-zinc-700 hover:bg-zinc-600 border border-zinc-500 text-white font-semibold py-2 px-4 rounded-lg transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmTierDisable}
                  className="flex-1 bg-gradient-to-r from-yellow-500 to-red-500 hover:from-yellow-400 hover:to-red-400 text-white font-semibold py-2 px-4 rounded-lg transition-all"
                >
                  Yes, Disable Tier
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
