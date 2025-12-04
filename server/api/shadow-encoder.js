// Copyright (c) 2025 Bulwk. All rights reserved.
// Licensed under Bulwk Proprietary License
// Full terms: ipfs://QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D

import { AbiCoder, Interface } from 'ethers';

const SHADOW_MINT_SELECTOR = '0x6d70c415';

const SHADOW_TUPLE_TYPES = [
  'address',  // token0
  'address',  // token1
  'uint24',   // tickSpacing (fee parameter)
  'int24',    // tickLower
  'int24',    // tickUpper
  'uint256',  // amount0Desired
  'uint256',  // amount1Desired
  'uint256',  // amount0Min
  'uint256',  // amount1Min
  'address',  // recipient
  'uint256'   // deadline
];

export function encodeShadowMint(params) {
  // Build parameter array in correct order for Shadow encoding
  const paramArray = [
    params.token0,
    params.token1,
    params.tickSpacing,
    params.tickLower,
    params.tickUpper,
    params.amount0Desired,
    params.amount1Desired,
    params.amount0Min,
    params.amount1Min,
    params.recipient,
    params.deadline
  ];

  const abiCoder = AbiCoder.defaultAbiCoder();
  const encodedParams = abiCoder.encode(
    SHADOW_TUPLE_TYPES,
    paramArray
  );

  return SHADOW_MINT_SELECTOR + encodedParams.slice(2);
}

export function encodeShadowMulticall(mintCalldatas) {
  const multicallAbi = ['function multicall(bytes[] calldata data) external payable returns (bytes[] memory results)'];
  const iface = new Interface(multicallAbi);

  return iface.encodeFunctionData('multicall', [mintCalldatas]);
}

export function encodeDecreaseLiquidity(params) {
  const abi = [
    'function decreaseLiquidity(tuple(uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint256 amount0, uint256 amount1)'
  ];
  const iface = new Interface(abi);

  return iface.encodeFunctionData('decreaseLiquidity', [{
    tokenId: params.tokenId,
    liquidity: params.liquidity,
    amount0Min: params.amount0Min,
    amount1Min: params.amount1Min,
    deadline: params.deadline
  }]);
}

export function encodeCollect(params) {
  const abi = [
    'function collect(tuple(uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) external payable returns (uint256 amount0, uint256 amount1)'
  ];
  const iface = new Interface(abi);

  return iface.encodeFunctionData('collect', [{
    tokenId: params.tokenId,
    recipient: params.recipient,
    amount0Max: params.amount0Max,
    amount1Max: params.amount1Max
  }]);
}

export function encodeBurn(tokenId) {
  const abi = ['function burn(uint256 tokenId) external payable'];
  const iface = new Interface(abi);

  return iface.encodeFunctionData('burn', [tokenId]);
}
