# Bulwk Trading Agent Daemon

**⚠️ PROPRIETARY SOFTWARE - ALL RIGHTS RESERVED**

Open-source automated liquidity management daemon for Sonic Labs.

---

## 🔒 LICENSE NOTICE

This software is licensed under the **Bulwk Daemon Software License v1.0**.

**Copyright © 2025 BMC Saasy Technologies, Inc. - ALL RIGHTS RESERVED**

📄 **Full License**: [LICENSE](./LICENSE)
🔗 **License Portal**: https://ipfs.io/ipfs/QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D

### Quick License Summary

#### End Users (Personal Use)
✅ Use for personal liquidity provision
✅ Execute on your own devices
✅ Access Signal Service with subscription
❌ **NO modifications, redistribution, or commercial use**

#### Commercial Licenses
- **License 1 ($300K/year)**: B2C distribution rights
- **License 2 ($1.25M/year + 5% revenue share)**: B2B + B2C distribution rights

**⚠️ CRITICAL**: All derivative works automatically become property of BMC Saasy Technologies, Inc.

---

## 📥 Download

### Official Download (Recommended)
**[app.bulwk.com](https://app.bulwk.com)**
- No GitHub account required
- Automatic updates included
- SHA256 verified
- Free for End Users with subscription

### Build from Source
Available for developers who want to inspect or build manually.
```bash
git clone https://github.com/bulwk/bulwk-daemon
cd bulwk-daemon
npm install
npm run build
npm start
```
⚠️ **Manual builds do not receive automatic updates**

---

## ✨ Features

### Automated Trading
- **5-Tier Strategy**: HOT / WARM / MEDIUM / WIDE / INSURANCE positions
- **Auto-Rebalancing**: 3-step flow (CLOSE → SWAP → OPEN)
- **Grace Period Monitoring**: Tier-based countdown timers
- **Idle Balance Sweep**: Auto-deploy WS + USDC when balances stabilize

### Rewards Management
- **Shadow Rewards Auto-Collection**: Claims 60s before grace period expiry
- **LOGIC Credit System**: Spending permissions and balance tracking
- **Slippage Protection**: Configurable limits per operation

### Security & Control
- **WebSocket Real-Time Updates**: <1s toggle responsiveness
- **JWT Authentication**: Secure platform communication
- **Seat Allocation System**: 10 base + rollover seats (max 70/week)
- **Emergency Stop**: Instant halt for all automated operations

---

## 🚀 Quick Start

### Requirements
- **Node.js**: v18 or later
- **Operating System**: macOS, Windows, or Linux
- **Network**: Sonic Labs mainnet access
- **Subscription**: Active Bulwk subscription required

### Installation

1. **Download Official Build**
   ```bash
   curl -O https://app.bulwk.com/download/balancer-agent-web-gui.zip
   ```

2. **Verify SHA256**
   ```bash
   shasum -a 256 balancer-agent-web-gui.zip
   # Compare with: https://app.bulwk.com/download/daemon-sha256.txt
   ```

3. **Extract and Run**
   ```bash
   unzip balancer-agent-web-gui.zip
   cd balancer-agent-web-gui

   # macOS/Linux
   ./Start\ Balancer\ Agent.command

   # Windows
   Start Balancer Agent.bat
   ```

4. **Open Browser**
   - Daemon automatically opens `http://localhost:3420`
   - Login with your Bulwk credentials
   - Configure automation settings

### Build from Source

```bash
# Clone repository (requires GitHub login)
git clone https://github.com/bulwk/bulwk-daemon
cd bulwk-daemon

# Install dependencies
npm install

# Build frontend
npm run build

# Start daemon
npm start
```

---

## 📖 Documentation

### Configuration
- **RPC URL**: Configurable Sonic Labs RPC endpoint
- **Wallet**: Private key (stored locally, never transmitted)
- **Platform URL**: https://app.bulwk.com (production)
- **Policy Sync**: 10-second polling + WebSocket instant updates

### Automation Settings
| Setting | Description | Default |
|---------|-------------|---------|
| Auto Rebalancing | Enable automatic position rebalancing | Disabled |
| Auto Topup | Auto-buy LOGIC credits when low | Disabled |
| Topup Threshold | LOGIC balance trigger for topup | 10 |
| Topup Amount | LOGIC credits to purchase | 50 |
| Max Daily Burn | Maximum LOGIC spending per day | 100 |
| Emergency Stop | Halt all automation if credits reach threshold | Enabled |
| Emergency Threshold | LOGIC balance that triggers emergency stop | 5 |

### File Structure
```
bulwk-daemon/
├── server/                      # Backend Node.js server
│   ├── index.js                 # Entry point
│   ├── platform-event-stream.js # WebSocket client
│   └── api/
│       ├── daemon-controller.js # Main trading logic
│       ├── policy-sync.js       # Settings synchronization
│       ├── grace-period-monitor.js # Expiry tracking
│       ├── token-service.js     # Token price queries
│       └── routes.js            # API endpoints
├── src/                         # Frontend React app
│   ├── components/
│   │   ├── Dashboard.jsx        # Main UI
│   │   ├── SetupWizard.jsx      # Initial setup
│   │   └── ActivityLog.jsx      # Event history
│   ├── App.jsx
│   └── main.jsx
├── dist/                        # Built frontend (generated)
├── package.json
├── vite.config.js
└── LICENSE
```

---

## 🔐 Security

### Code Transparency
- Full source code available on GitHub
- Requires GitHub login to view (anti-scraping)
- All releases are SHA256 verified
- No obfuscation or minification of logic

### Data Privacy
- **Private keys**: Stored locally, never transmitted
- **No telemetry**: Daemon does not track usage
- **API calls**: Only to Bulwk platform for signals
- **No third-party services**: Direct blockchain interaction

### Signal Service Dependency
⚠️ **This daemon requires access to Bulwk's proprietary Signal Service**
- Without Signal Service access, the daemon has no standalone value
- API credentials are validated on each request
- Access is revoked immediately upon subscription expiration

### Security Best Practices
1. **Verify SHA256** before running any download
2. **Start with small amounts** to test automation
3. **Monitor activity logs** regularly
4. **Set emergency stop threshold** to protect capital
5. **Keep private keys secure** - daemon uses software wallet stored locally

---

## ⚠️ Risk Disclosure

**IMPORTANT: YOU MAY LOSE MONEY USING THIS SOFTWARE**

- Financial markets are volatile and unpredictable
- Automated trading carries significant risk
- Past performance does not guarantee future results
- Only risk capital you can afford to lose
- Consult with financial, legal, and tax advisors

**Licensor has ZERO liability for any financial losses** (see Section 9 of LICENSE)

---

## 📊 Platform Integration

### WebSocket Connection
The daemon maintains a persistent WebSocket connection to the Bulwk platform:
- **URL**: `wss://app.bulwk.com` (production)
- **Authentication**: JWT token via `Authorization: Bearer <token>`
- **Events**: Policy updates, intent confirmations, system notifications
- **Reconnection**: Automatic with exponential backoff

### API Endpoints Used
| Endpoint | Purpose |
|----------|---------|
| `/api/daemon/policy` | Fetch automation settings |
| `/api/daemon/intents` | Submit trading intents |
| `/api/daemon/receipts` | Log transaction receipts |
| `/api/automation/settings` | Update configuration |
| `/api/daemon/idle-sweep` | Idle balance snapshots |

---

## 🛠️ Troubleshooting

### Daemon Won't Start
```bash
# Check Node.js version
node --version  # Should be v18+

# Check port availability
lsof -i :3420  # Should be empty

# Check npm install
npm install  # Reinstall dependencies
```

### WebSocket Connection Issues
- Verify internet connection
- Check firewall allows WSS (port 443)
- Ensure JWT token is valid (re-login)

### Rebalancing Not Triggering
- Verify "Auto Rebalancing" is enabled
- Check LOGIC credit balance > max daily burn
- Ensure positions are out of range (daemon logs "Position X out of range")
- Confirm subscription is active

### Download Verification Failed
```bash
# Re-download SHA256 checksum
curl https://app.bulwk.com/download/daemon-sha256.txt

# Verify your download
shasum -a 256 balancer-agent-web-gui.zip

# Checksums must match exactly
```

---

## 📞 Support

### Technical Support
- **Telegram**: https://t.me/AgentBulwk

### Legal & Licensing
- **License Portal**: https://ipfs.io/ipfs/QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D

### Bug Reports & Feature Requests
- **GitHub Issues**: [github.com/bulwk/bulwk-daemon/issues](https://github.com/bulwk/bulwk-daemon/issues)
- Please include daemon version, OS, and error logs

---

## 📜 Version History

### v2.3.73 (2025-12-04)
- ✅ Fixed idle sweep to use live wallet balance (not snapshot)
- ✅ Fixed WS price calculation (decimal adjustment bug)
- ✅ Daemon now deploys ALL available WS + USDC tokens
- ✅ Swap calculation matches pool ratio correctly

### v2.3.72 (2025-12-04)
- ✅ Reduced policy polling from 60s to 10s
- ✅ Added WebSocket handler for instant policy updates (<1s)
- ✅ Toggle response time: 90s → <1s

### v2.3.71 (2025-12-02)
- ✅ Fixed idle sweep auto_deploy_idle field path
- ✅ Reconnected UI toggle to database

---

## 🤝 Contributing

**This is proprietary software. Contributions are NOT accepted.**

If you create derivative works:
- ⚠️ They automatically become property of BMC Saasy Technologies, Inc. (License Section 3.2)
- You may NOT claim ownership
- You may NOT distribute without a commercial license

To report security vulnerabilities: security@bulwk.com

---

## 📄 License

**Copyright © 2025 BMC Saasy Technologies, Inc.**

This software is proprietary and licensed under the **Bulwk Daemon Software License v1.0**.

By using this software, you agree to be bound by the terms in [LICENSE](./LICENSE).

**Key Points:**
- ✅ End Users may use for personal liquidity provision
- ❌ NO modifications without commercial license
- ❌ NO redistribution without commercial license
- ⚠️ All derivative works automatically transfer to Licensor
- ⚠️ Licensor has ZERO liability for any losses

**Full license**: [LICENSE](./LICENSE) | [IPFS Portal](https://ipfs.io/ipfs/QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D)

---

## 🌐 Links

- **Official Website**: https://bulwk.com
- **Platform**: https://app.bulwk.com
- **Documentation**: https://bulwk.com/docs
- **X (Twitter)**: https://x.com/agentbulwk

---

**⚠️ BY USING THIS SOFTWARE, YOU ACKNOWLEDGE THAT YOU HAVE READ THE LICENSE, UNDERSTAND IT, AND AGREE TO BE BOUND BY ITS TERMS.**

**IF YOU DO NOT AGREE, DO NOT USE, COPY, MODIFY, OR DISTRIBUTE THIS SOFTWARE.**
