// Copyright (c) 2025 Bulwk. All rights reserved.
// Licensed under Bulwk Proprietary License
// Full terms: ipfs://QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D

/**
 * IMPORTANT: This file contains ONLY token metadata for display and sending.
 * NO trading logic, tier calculations, or rebalancing algorithms.
 *
 * Trading intelligence remains on the backend platform.
 */

const SUPPORTED_TOKENS = [
  {
    symbol: 'S',
    name: 'Sonic',
    address: 'native', // Native token (not ERC-20)
    decimals: 18,
    isNative: true,
    icon: '🔷'
  },
  {
    symbol: 'wS',
    name: 'Wrapped Sonic',
    address: '0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38',
    decimals: 18,
    isNative: false,
    icon: '💎'
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x29219dd400f2Bf60E5a23d13Be72B486D4038894',
    decimals: 6,
    isNative: false,
    icon: '💵'
  }
];

/**
 * Get token configuration by symbol
 */
function getTokenBySymbol(symbol) {
  return SUPPORTED_TOKENS.find(t => t.symbol === symbol);
}

/**
 * Get token configuration by address
 */
function getTokenByAddress(address) {
  return SUPPORTED_TOKENS.find(
    t => t.address.toLowerCase() === address.toLowerCase()
  );
}

/**
 * Get all supported tokens
 */
function getAllTokens() {
  return SUPPORTED_TOKENS;
}

/**
 * Get all ERC-20 tokens (excludes native)
 */
function getERC20Tokens() {
  return SUPPORTED_TOKENS.filter(t => !t.isNative);
}

export {
  SUPPORTED_TOKENS,
  getTokenBySymbol,
  getTokenByAddress,
  getAllTokens,
  getERC20Tokens
};
