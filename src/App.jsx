// Copyright (c) 2025 Bulwk. All rights reserved.
// Licensed under Bulwk Proprietary License
// Full terms: ipfs://QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D

import { useState, useEffect } from 'react'
import SetupWizard from './components/SetupWizard'
import Dashboard from './components/Dashboard'

function App() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [licenseAccepted, setLicenseAccepted] = useState(false)
  const [showLicenseModal, setShowLicenseModal] = useState(false)

  useEffect(() => {
    const accepted = localStorage.getItem('bulwk_license_accepted')
    if (accepted === 'true') {
      setLicenseAccepted(true)
      fetchStatus()
    } else {
      setShowLicenseModal(true)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const handleWindowClose = (e) => {
      const autoClose = localStorage.getItem('daemon_auto_close')
      if (autoClose !== 'false') {
        // Send shutdown request using sendBeacon (works during page unload)
        const blob = new Blob([JSON.stringify({})], { type: 'application/json' })
        navigator.sendBeacon('/api/daemon/shutdown', blob)

        // Show confirmation dialog
        e.preventDefault()
        e.returnValue = 'Closing this window will stop the daemon. Continue?'
        return e.returnValue
      }
    }

    window.addEventListener('beforeunload', handleWindowClose)
    return () => window.removeEventListener('beforeunload', handleWindowClose)
  }, [])

  const handleAcceptLicense = () => {
    localStorage.setItem('bulwk_license_accepted', 'true')
    setLicenseAccepted(true)
    setShowLicenseModal(false)
    setLoading(true)
    fetchStatus()
  }

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status')
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      const data = await res.json()
      setStatus(data)
    } catch (error) {
      console.error('Failed to fetch status:', error)
      alert(`Connection Error: ${error.message}\n\nMake sure the server is running on http://localhost:3420`)
    } finally {
      setLoading(false)
    }
  }

  if (showLicenseModal) {
    return (
      <div className="grid-bg min-h-screen flex items-center justify-center p-4">
        <div className="bg-slate-800/90 backdrop-blur-sm border border-cyan-500/30 rounded-lg p-8 max-w-2xl w-full shadow-2xl">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-cyan-400 mb-2">Bulwk Trading Agent</h1>
            <p className="text-slate-400">Software License Agreement</p>
          </div>

          <div className="bg-slate-900/50 border border-slate-700 rounded p-6 mb-6 max-h-96 overflow-y-auto">
            <h2 className="text-xl font-semibold text-cyan-300 mb-4">⚖️ Proprietary License Notice</h2>

            <div className="space-y-4 text-slate-300 text-sm leading-relaxed">
              <p>
                <strong className="text-cyan-400">Copyright © 2025 Bulwk. All rights reserved.</strong>
              </p>

              <p>
                This software and associated documentation files (the "Software") are proprietary
                and confidential to Bulwk. The Software is licensed, not sold, to you for use only
                under the terms of this license.
              </p>

              <p className="font-semibold text-cyan-300">
                UNAUTHORIZED COPYING, MODIFICATION, DISTRIBUTION, REVERSE ENGINEERING,
                OR USE OF THIS SOFTWARE IS STRICTLY PROHIBITED.
              </p>

              <p>
                By clicking "I Agree" below, you acknowledge that you have read and agree to be
                bound by the full terms of the Bulwk Proprietary License.
              </p>

              <div className="bg-slate-800 border border-cyan-500/20 rounded p-4 mt-4">
                <p className="text-xs text-slate-400 mb-2">View full license terms:</p>
                <a
                  href="https://ipfs.io/ipfs/QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 underline text-sm break-all"
                >
                  ipfs://QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D
                </a>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => window.close()}
              className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium transition-colors"
            >
              Decline & Exit
            </button>
            <button
              onClick={handleAcceptLicense}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white rounded-lg font-medium transition-all shadow-lg"
            >
              I Agree - Continue
            </button>
          </div>

          <p className="text-xs text-slate-500 text-center mt-4">
            Your acceptance will be stored locally and you will not be asked again.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="grid-bg min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-cyan-300">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid-bg min-h-screen">
      {!status?.isSetup ? (
        <SetupWizard onComplete={fetchStatus} />
      ) : (
        <Dashboard status={status} onRefresh={fetchStatus} />
      )}
    </div>
  )
}

export default App
