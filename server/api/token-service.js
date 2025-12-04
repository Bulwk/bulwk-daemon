// Copyright (c) 2025 Bulwk. All rights reserved.
// Licensed under Bulwk Proprietary License
// Full terms: ipfs://QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D

import { ethers } from 'ethers';
import { getAllTokens, getERC20Tokens } from './tokens-config.js';

// Minimal ERC-20 ABI for balance checking
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

/**
 * Fetch balance for a single ERC-20 token
 */
async function getERC20Balance(provider, tokenAddress, walletAddress) {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const balance = await contract.balanceOf(walletAddress);
    return balance;
  } catch (error) {
    console.error(`Error fetching balance for ${tokenAddress}:`, error.message);
    return 0n;
  }
}

/**
 * Fetch native S balance
 */
async function getNativeBalance(provider, walletAddress) {
  try {
    const balance = await provider.getBalance(walletAddress);
    return balance;
  } catch (error) {
    console.error(`Error fetching native balance:`, error.message);
    return 0n;
  }
}

/**
 * Fetch all token balances for a wallet
 * Returns array of { symbol, name, balance, formatted, address, decimals }
 * @param {*} provider - Ethers provider
 * @param {string} walletAddress - Wallet address to check balances for
 * @param {Array} customTokens - Optional array of custom token configs to include
 */
async function getAllBalances(provider, walletAddress, customTokens = []) {
  // Merge default tokens with custom tokens
  const defaultTokens = getAllTokens();
  const tokens = [...defaultTokens, ...customTokens];

  // Parallelize all balance fetches using Promise.all
  const balancePromises = tokens.map(async (token) => {
    try {
      let balanceWei;

      if (token.isNative) {
        balanceWei = await getNativeBalance(provider, walletAddress);
      } else {
        balanceWei = await getERC20Balance(provider, token.address, walletAddress);
      }

      // Format balance based on decimals
      const formatted = ethers.formatUnits(balanceWei, token.decimals);

      return {
        symbol: token.symbol,
        name: token.name,
        address: token.address,
        decimals: token.decimals,
        balanceWei: balanceWei.toString(),
        balance: parseFloat(formatted),
        formatted: parseFloat(formatted).toFixed(token.decimals === 6 ? 2 : 4),
        isNative: token.isNative,
        icon: token.icon
      };

    } catch (error) {
      console.error(`Error fetching balance for ${token.symbol}:`, error.message);

      // Return zero balance on error
      return {
        symbol: token.symbol,
        name: token.name,
        address: token.address,
        decimals: token.decimals,
        balanceWei: '0',
        balance: 0,
        formatted: '0.00',
        isNative: token.isNative,
        icon: token.icon,
        error: error.message
      };
    }
  });

  // Wait for all balance fetches to complete in parallel
  const balances = await Promise.all(balancePromises);

  return balances;
}

/**
 * Format token amount from wei to human-readable
 */
function formatTokenAmount(amountWei, decimals) {
  return ethers.formatUnits(amountWei, decimals);
}

/**
 * Parse token amount from human-readable to wei
 */
function parseTokenAmount(amount, decimals) {
  return ethers.parseUnits(amount.toString(), decimals);
}

export {
  getAllBalances,
  getERC20Balance,
  getNativeBalance,
  formatTokenAmount,
  parseTokenAmount
};
