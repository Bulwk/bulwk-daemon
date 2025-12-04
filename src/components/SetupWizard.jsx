// Copyright (c) 2025 Bulwk. All rights reserved.
// Licensed under Bulwk Proprietary License
// Full terms: ipfs://QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D

import { useState } from 'react'

export default function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(0) // Start at step 0 (welcome screen)
  const [setupType, setSetupType] = useState(null)
  const [privateKey, setPrivateKey] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mnemonic, setMnemonic] = useState(null)
  const [recoveryPhrase, setRecoveryPhrase] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSetup = async () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: setupType,
          privateKey: setupType === 'import' ? privateKey : null,
          password
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Setup failed')
      }

      if (data.mnemonic) {
        setMnemonic(data.mnemonic)
        setStep(3)
      } else {
        onComplete()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRecovery = async () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (!recoveryPhrase.trim()) {
      setError('Recovery phrase is required')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recoveryPhrase: recoveryPhrase.trim(),
          password
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Recovery failed')
      }

      onComplete()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-black">
      <div className="bg-zinc-900/95 border border-cyan-400/30 rounded-xl max-w-2xl w-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-cyan-400/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500 flex items-center justify-center text-2xl">
              🛡️
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Bulwk Trading Agent</h1>
              <p className="text-cyan-300/60 text-xs">Your keys stay on YOUR computer</p>
            </div>
          </div>
        </div>

        <div className="p-6">

        {/* Step 0: Welcome Screen */}
        {step === 0 && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-lg font-bold text-white mb-2">Welcome to Bulwk</h2>
              <p className="text-sm text-cyan-200/80">Choose how you'd like to get started</p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <button
                onClick={() => setStep(1)}
                className="bg-cyan-500/10 border border-cyan-400/30 rounded-lg p-5 hover:bg-cyan-500/20 hover:border-cyan-400/50 transition-all text-left"
              >
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-lg bg-cyan-500 flex items-center justify-center text-2xl flex-shrink-0">
                    ✨
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white mb-1">Create New Daemon</h3>
                    <p className="text-xs text-cyan-300/60">Set up a fresh trading agent</p>
                  </div>
                </div>
                <p className="text-xs text-cyan-300/50 pl-16">Import your existing wallet or generate a new one</p>
              </button>

              <button
                onClick={() => {
                  setSetupType('recover')
                  setStep(4)
                }}
                className="bg-purple-500/10 border border-purple-400/30 rounded-lg p-5 hover:bg-purple-500/20 hover:border-purple-400/50 transition-all text-left"
              >
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-lg bg-purple-500 flex items-center justify-center text-2xl flex-shrink-0">
                    🔄
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white mb-1">Recover Daemon</h3>
                    <p className="text-xs text-cyan-300/60">Reset password with recovery phrase</p>
                  </div>
                </div>
                <p className="text-xs text-cyan-300/50 pl-16">Use your 12-word recovery phrase to restore access</p>
              </button>
            </div>

            {/* DEX Direct Access Notice */}
            <div className="bg-purple-500/10 border border-purple-400/20 rounded-lg p-4">
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
                          'Shadow may change their URL. This is a third-party platform.\n\n' +
                          'Continue?'
                        )
                        if (!confirmed) {
                          e.preventDefault()
                        }
                      }}
                    >
                      https://shadow.so
                    </a>
                    {' '}directly to manage positions without the daemon.
                  </p>
                  <div className="bg-cyan-500/10 border border-cyan-400/20 rounded-lg p-3 mb-2">
                    <p className="text-xs text-cyan-200 font-semibold mb-1">
                      💡 To access your daemon wallet on the DEX:
                    </p>
                    <ol className="text-xs text-cyan-300/80 space-y-1 list-decimal list-inside ml-2">
                      <li>Export your daemon's private key (after setup)</li>
                      <li>Import it into your browser wallet (MetaMask, Rabby, etc.)</li>
                      <li>Connect to shadow.so with that wallet</li>
                    </ol>
                  </div>
                  <div className="bg-red-500/10 border border-red-400/30 rounded-lg p-3">
                    <p className="text-xs text-red-200 font-semibold mb-1">
                      ⚠️ Security Warning:
                    </p>
                    <p className="text-xs text-red-300/80">
                      Importing your private key to a browser wallet exposes it to browser extensions,
                      malicious websites, and potential security vulnerabilities. Only do this if you
                      understand the risks. Consider using a separate wallet for the daemon if you
                      plan to access it via browser.
                    </p>
                  </div>
                  <p className="text-xs text-purple-400/50 mt-2 italic">
                    ℹ️ Last verified: November 2025 • Shadow may change URL • Third-party platform
                  </p>
                </div>
              </div>
            </div>

            {/* Info box */}
            <div className="bg-green-500/10 border border-green-400/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="text-xl">🔐</div>
                <div>
                  <h4 className="font-semibold text-green-100 mb-1 text-sm">Your keys stay on YOUR computer</h4>
                  <p className="text-xs text-green-200/80">Private keys are encrypted and stored locally. Bulwk never has access to your funds.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Choose Setup Type */}
        {step === 1 && (
          <div className="space-y-6">
            <button
              onClick={() => setStep(0)}
              className="text-cyan-400 hover:text-cyan-300 text-sm transition-colors"
            >
              ← Back
            </button>

            {/* How It Works */}
            <div className="bg-cyan-500/10 border border-cyan-400/20 rounded-lg p-4">
              <h4 className="font-semibold text-cyan-100 mb-3 text-sm">How It Works:</h4>
              <div className="space-y-3 text-xs text-cyan-200/80">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-cyan-500 text-black font-bold flex items-center justify-center flex-shrink-0 text-xs">1</div>
                  <div>
                    <strong className="text-cyan-100">Import or Generate Wallet</strong>
                    <p className="text-cyan-300/60 mt-0.5">Use your Rabby wallet or create a new one</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-cyan-500 text-black font-bold flex items-center justify-center flex-shrink-0 text-xs">2</div>
                  <div>
                    <strong className="text-cyan-100">Link to Platform</strong>
                    <p className="text-cyan-300/60 mt-0.5">Get link code and connect via browser</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-cyan-500 text-black font-bold flex items-center justify-center flex-shrink-0 text-xs">3</div>
                  <div>
                    <strong className="text-cyan-100">Start Trading</strong>
                    <p className="text-cyan-300/60 mt-0.5">Agent executes trades locally on your computer</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center">
              <h2 className="text-base font-bold text-white mb-4">Choose Setup Method</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setSetupType('import')
                  setStep(2)
                }}
                className="bg-cyan-500/10 border border-cyan-400/30 rounded-lg p-5 hover:bg-cyan-500/20 hover:border-cyan-400/50 transition-all text-left"
              >
                <div className="text-3xl mb-3">📥</div>
                <h3 className="text-sm font-semibold text-white mb-1">Import from Rabby</h3>
                <p className="text-xs text-cyan-300/60">Use your existing wallet</p>
              </button>

              <button
                onClick={() => {
                  setSetupType('generate')
                  setStep(2)
                }}
                className="bg-cyan-500/10 border border-cyan-400/30 rounded-lg p-5 hover:bg-cyan-500/20 hover:border-cyan-400/50 transition-all text-left"
              >
                <div className="text-3xl mb-3">🔑</div>
                <h3 className="text-sm font-semibold text-white mb-1">Generate New Wallet</h3>
                <p className="text-xs text-cyan-300/60">Create a fresh wallet</p>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Enter Details */}
        {step === 2 && (
          <div className="space-y-5">
            <button
              onClick={() => setStep(1)}
              className="text-cyan-400 hover:text-cyan-300 text-sm transition-colors"
            >
              ← Back
            </button>

            <div className="text-center">
              <h2 className="text-base font-bold text-white mb-1">
                {setupType === 'import' ? 'Import Wallet' : 'Create New Wallet'}
              </h2>
              <p className="text-xs text-cyan-300/60">
                {setupType === 'import' ? 'Enter your private key from Rabby' : 'Set a strong password to encrypt your wallet'}
              </p>
            </div>

            {setupType === 'import' && (
              <div>
                <label className="block text-sm text-cyan-200 mb-2">Private Key</label>
                <input
                  type="password"
                  placeholder="0x..."
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  className="w-full bg-black/30 border border-cyan-400/30 rounded-lg px-4 py-3 text-cyan-100 placeholder:text-cyan-400/40 focus:outline-none focus:border-cyan-400/60 font-mono text-sm"
                />
                <p className="text-xs text-cyan-400/60 mt-2">
                  Open Rabby → Settings → Export Private Key
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm text-cyan-200 mb-2">Encryption Password</label>
              <input
                type="password"
                placeholder="Enter strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/30 border border-cyan-400/30 rounded-lg px-4 py-3 text-cyan-100 placeholder:text-cyan-400/40 focus:outline-none focus:border-cyan-400/60 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm text-cyan-200 mb-2">Confirm Password</label>
              <input
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-black/30 border border-cyan-400/30 rounded-lg px-4 py-3 text-cyan-100 placeholder:text-cyan-400/40 focus:outline-none focus:border-cyan-400/60 text-sm"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-lg text-xs">
                {error}
              </div>
            )}

            <button
              onClick={handleSetup}
              disabled={loading || !password || !confirmPassword || (setupType === 'import' && !privateKey)}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 disabled:from-cyan-500/50 disabled:to-blue-500/50 text-white font-semibold py-3 px-4 rounded-lg transition-all text-sm disabled:cursor-not-allowed"
            >
              {loading ? 'Setting up...' : 'Continue'}
            </button>
          </div>
        )}

        {/* Step 3: Show Mnemonic (Generate Only) */}
        {step === 3 && mnemonic && (
          <div className="space-y-5">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="text-xl">⚠️</div>
                <div>
                  <h3 className="font-semibold text-yellow-100 mb-1 text-sm">IMPORTANT: Save Your Recovery Phrase</h3>
                  <p className="text-xs text-yellow-200/80">Write this down and store it safely. You cannot recover it later!</p>
                </div>
              </div>
            </div>

            <div className="bg-black/50 border border-cyan-400/20 rounded-lg p-4">
              <p className="text-white text-center text-base font-mono leading-relaxed">{mnemonic}</p>
            </div>

            <button
              onClick={onComplete}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-semibold py-3 px-4 rounded-lg transition-all text-sm"
            >
              I've Saved My Recovery Phrase
            </button>
          </div>
        )}

        {/* Step 4: Recovery */}
        {step === 4 && (
          <div className="space-y-5">
            <button
              onClick={() => {
                setStep(0)
                setSetupType(null)
                setRecoveryPhrase('')
                setPassword('')
                setConfirmPassword('')
                setError('')
              }}
              className="text-cyan-400 hover:text-cyan-300 text-sm transition-colors"
            >
              ← Back
            </button>

            <div className="text-center">
              <div className="w-12 h-12 rounded-lg bg-purple-500 flex items-center justify-center text-2xl mx-auto mb-3">
                🔄
              </div>
              <h2 className="text-base font-bold text-white mb-1">Recover Your Daemon</h2>
              <p className="text-xs text-cyan-300/60">Reset your password using your recovery phrase</p>
            </div>

            <div className="bg-purple-500/10 border border-purple-400/20 rounded-lg p-4">
              <h4 className="font-semibold text-purple-100 mb-2 text-sm">How Recovery Works:</h4>
              <ol className="text-xs text-purple-200/80 space-y-1 list-decimal list-inside">
                <li>Enter your 12-word recovery phrase</li>
                <li>Create a new password for your daemon</li>
                <li>Your wallet will be restored with the new password</li>
              </ol>
            </div>

            <div>
              <label className="block text-sm text-cyan-200 mb-2">Recovery Phrase (12 words)</label>
              <textarea
                placeholder="word1 word2 word3 ..."
                value={recoveryPhrase}
                onChange={(e) => setRecoveryPhrase(e.target.value)}
                rows={3}
                className="w-full bg-black/30 border border-cyan-400/30 rounded-lg px-4 py-3 text-cyan-100 placeholder:text-cyan-400/40 focus:outline-none focus:border-cyan-400/60 font-mono text-sm"
              />
              <p className="text-xs text-cyan-400/60 mt-1">
                Enter the words separated by spaces
              </p>
            </div>

            <div>
              <label className="block text-sm text-cyan-200 mb-2">New Password</label>
              <input
                type="password"
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/30 border border-cyan-400/30 rounded-lg px-4 py-3 text-cyan-100 placeholder:text-cyan-400/40 focus:outline-none focus:border-cyan-400/60 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm text-cyan-200 mb-2">Confirm New Password</label>
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-black/30 border border-cyan-400/30 rounded-lg px-4 py-3 text-cyan-100 placeholder:text-cyan-400/40 focus:outline-none focus:border-cyan-400/60 text-sm"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-lg text-xs">
                {error}
              </div>
            )}

            <button
              onClick={handleRecovery}
              disabled={loading || !password || !confirmPassword || !recoveryPhrase.trim()}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 disabled:from-cyan-500/50 disabled:to-blue-500/50 text-white font-semibold py-3 px-4 rounded-lg transition-all text-sm disabled:cursor-not-allowed"
            >
              {loading ? 'Recovering...' : 'Recover Daemon'}
            </button>

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="text-lg">⚠️</div>
                <p className="text-xs text-yellow-200/80">
                  Make sure to enter your recovery phrase exactly as it was shown to you when you created your wallet. Incorrect phrases cannot recover your daemon.
                </p>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
