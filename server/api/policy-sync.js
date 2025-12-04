// Copyright (c) 2025 Bulwk. All rights reserved.
// Licensed under Bulwk Proprietary License
// Full terms: ipfs://QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D

import fs from 'fs';
import path from 'path';
import os from 'os';

class PolicySync {
  constructor(platformUrl, walletAddress) {
    this.platformUrl = platformUrl;
    this.walletAddress = walletAddress;
    this.syncInterval = null;
    this.lastSync = null;
    this.lastPolicy = null;

    // Policy stored in ~/.balancer/policy.json
    const balancerDir = path.join(os.homedir(), '.balancer');
    this.policyPath = path.join(balancerDir, 'policy.json');

    // Ensure directory exists
    if (!fs.existsSync(balancerDir)) {
      fs.mkdirSync(balancerDir, { recursive: true });
    }
  }

  start() {
    console.log('🔄 Starting policy sync service...');

    // Initial sync immediately
    this.syncPolicy();

    // Poll every 10 seconds for faster toggle response
    this.syncInterval = setInterval(() => {
      this.syncPolicy();
    }, 10000);

    console.log('✅ Policy sync service started (polling every 10s)');
  }

  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('🛑 Policy sync service stopped');
    }
  }

  async syncPolicy() {
    try {
      const url = `${this.platformUrl}/api/daemon/policy?wallet=${this.walletAddress}`;

      console.log(`🔄 Syncing policy from: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        console.error(`❌ Policy sync failed:`);
        console.error(`   URL: ${url}`);
        console.error(`   Status: ${response.status} ${response.statusText}`);
        console.error(`   Response: ${errorText}`);
        return;
      }

      const newPolicy = await response.json();

      // Check if policy changed
      const currentPolicy = this.loadLocalPolicy();
      const policyChanged = this.hasPolicyChanged(currentPolicy, newPolicy);

      if (policyChanged) {
        console.log('🔄 Policy changed, updating local policy.json...');
        this.savePolicy(newPolicy);
        this.applyPolicy(newPolicy);
        console.log('✅ Policy updated successfully');
      } else {
        console.log('✓ Policy sync complete (no changes)');
      }

      this.lastSync = Date.now();
      this.lastPolicy = newPolicy;

    } catch (error) {
      console.error('❌ Policy sync error:', error.message);
      console.error('   Stack:', error.stack);
    }
  }

  loadLocalPolicy() {
    try {
      if (!fs.existsSync(this.policyPath)) {
        console.log('⚠️ No local policy.json found, will create on first sync');
        return null;
      }

      const policyData = fs.readFileSync(this.policyPath, 'utf8');
      return JSON.parse(policyData);
    } catch (error) {
      console.error('❌ Error loading local policy:', error.message);
      return null;
    }
  }

  savePolicy(policy) {
    try {
      fs.writeFileSync(this.policyPath, JSON.stringify(policy, null, 2), 'utf8');
      console.log(`💾 Policy saved to ${this.policyPath}`);
    } catch (error) {
      console.error('❌ Error saving policy:', error.message);
      throw error;
    }
  }

  hasPolicyChanged(oldPolicy, newPolicy) {
    if (!oldPolicy) return true; // First sync always updates

    // Compare JSON strings (simple but effective)
    const oldStr = JSON.stringify(this.normalizePolicy(oldPolicy));
    const newStr = JSON.stringify(this.normalizePolicy(newPolicy));

    return oldStr !== newStr;
  }

  normalizePolicy(policy) {
    if (!policy) return {};

    const normalized = { ...policy };
    delete normalized.lastSync; // Don't compare timestamps
    return normalized;
  }

  applyPolicy(policy) {
    console.log('📋 Applying new policy:');
    console.log(`  - Auto Rebalancing: ${policy.automation?.autoRebalancing}`);
    console.log(`  - Max Daily LOGIC: ${policy.spending?.maxDailyLogic}`);
    console.log(`  - Emergency Stop: ${policy.spending?.emergencyStopEnabled} (threshold: ${policy.spending?.emergencyStopThreshold} LOGIC)`);
    console.log(`  - Subscription Plan: ${policy.subscription?.plan}`);
    console.log(`  - Allowed Hours: ${policy.subscription?.allowedHours?.join('-')}`);
    console.log(`  - Current Balance: ${policy.spending?.currentBalance?.toFixed(2)} LOGIC`);
  }

  getCurrentPolicy() {
    return this.lastPolicy || this.loadLocalPolicy();
  }

  getStatus() {
    return {
      lastSync: this.lastSync,
      isRunning: this.syncInterval !== null,
      policyPath: this.policyPath,
      walletAddress: this.walletAddress,
      platformUrl: this.platformUrl
    };
  }
}

export default PolicySync;
