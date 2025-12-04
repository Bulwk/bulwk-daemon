// Copyright (c) 2025 Bulwk. All rights reserved.
// Licensed under Bulwk Proprietary License
// Full terms: ipfs://QmeHNrhouvtuaoMF93uCMf6rLJCmGu7fP8Tq8MmUntMN3D

const Q96 = BigInt(2) ** BigInt(96);
const ZERO = BigInt(0);

export function getSqrtRatioAtTick(tick) {
  const absTick = Math.abs(tick);
  if (absTick > 887272) throw new Error('Tick out of bounds');

  let ratio = absTick & 0x1 ? BigInt('0xfffcb933bd6fad37aa2d162d1a594001') : BigInt('0x100000000000000000000000000000000');
  if (absTick & 0x2) ratio = (ratio * BigInt('0xfff97272373d413259a46990580e213a')) >> BigInt(128);
  if (absTick & 0x4) ratio = (ratio * BigInt('0xfff2e50f5f656932ef12357cf3c7fdcc')) >> BigInt(128);
  if (absTick & 0x8) ratio = (ratio * BigInt('0xffe5caca7e10e4e61c3624eaa0941cd0')) >> BigInt(128);
  if (absTick & 0x10) ratio = (ratio * BigInt('0xffcb9843d60f6159c9db58835c926644')) >> BigInt(128);
  if (absTick & 0x20) ratio = (ratio * BigInt('0xff973b41fa98c081472e6896dfb254c0')) >> BigInt(128);
  if (absTick & 0x40) ratio = (ratio * BigInt('0xff2ea16466c96a3843ec78b326b52861')) >> BigInt(128);
  if (absTick & 0x80) ratio = (ratio * BigInt('0xfe5dee046a99a2a811c461f1969c3053')) >> BigInt(128);
  if (absTick & 0x100) ratio = (ratio * BigInt('0xfcbe86c7900a88aedcffc83b479aa3a4')) >> BigInt(128);
  if (absTick & 0x200) ratio = (ratio * BigInt('0xf987a7253ac413176f2b074cf7815e54')) >> BigInt(128);
  if (absTick & 0x400) ratio = (ratio * BigInt('0xf3392b0822b70005940c7a398e4b70f3')) >> BigInt(128);
  if (absTick & 0x800) ratio = (ratio * BigInt('0xe7159475a2c29b7443b29c7fa6e889d9')) >> BigInt(128);
  if (absTick & 0x1000) ratio = (ratio * BigInt('0xd097f3bdfd2022b8845ad8f792aa5825')) >> BigInt(128);
  if (absTick & 0x2000) ratio = (ratio * BigInt('0xa9f746462d870fdf8a65dc1f90e061e5')) >> BigInt(128);
  if (absTick & 0x4000) ratio = (ratio * BigInt('0x70d869a156d2a1b890bb3df62baf32f7')) >> BigInt(128);
  if (absTick & 0x8000) ratio = (ratio * BigInt('0x31be135f97d08fd981231505542fcfa6')) >> BigInt(128);
  if (absTick & 0x10000) ratio = (ratio * BigInt('0x9aa508b5b7a84e1c677de54f3e99bc9')) >> BigInt(128);
  if (absTick & 0x20000) ratio = (ratio * BigInt('0x5d6af8dedb81196699c329225ee604')) >> BigInt(128);
  if (absTick & 0x40000) ratio = (ratio * BigInt('0x2216e584f5fa1ea926041bedfe98')) >> BigInt(128);
  if (absTick & 0x80000) ratio = (ratio * BigInt('0x48a170391f7dc42444e8fa2')) >> BigInt(128);

  if (tick > 0) ratio = (BigInt(2) ** BigInt(256) - BigInt(1)) / ratio;

  return ratio >> BigInt(32);
}

function getLiquidity0(sqrtRatioAX96, sqrtRatioBX96, amount0) {
  if (sqrtRatioAX96 > sqrtRatioBX96) {
    [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  }

  return (amount0 * sqrtRatioBX96 * sqrtRatioAX96) / (Q96 * (sqrtRatioBX96 - sqrtRatioAX96));
}

function getLiquidity1(sqrtRatioAX96, sqrtRatioBX96, amount1) {
  if (sqrtRatioAX96 > sqrtRatioBX96) {
    [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  }

  return (amount1 * Q96) / (sqrtRatioBX96 - sqrtRatioAX96);
}

export function getLiquidityForAmounts(
  sqrtPriceX96,
  sqrtRatioAX96,
  sqrtRatioBX96,
  amount0,
  amount1
) {
  // Ensure A < B
  if (sqrtRatioAX96 > sqrtRatioBX96) {
    [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  }

  if (sqrtPriceX96 <= sqrtRatioAX96) {
    return getLiquidity0(sqrtRatioAX96, sqrtRatioBX96, amount0);
  } else if (sqrtPriceX96 >= sqrtRatioBX96) {
    return getLiquidity1(sqrtRatioAX96, sqrtRatioBX96, amount1);
  } else {
    if (amount0 === BigInt(0)) {
      return getLiquidity1(sqrtRatioAX96, sqrtPriceX96, amount1);
    }

    if (amount1 === BigInt(0)) {
      return getLiquidity0(sqrtPriceX96, sqrtRatioBX96, amount0);
    }

    const liquidity0 = getLiquidity0(sqrtPriceX96, sqrtRatioBX96, amount0);
    const liquidity1 = getLiquidity1(sqrtRatioAX96, sqrtPriceX96, amount1);
    return liquidity0 < liquidity1 ? liquidity0 : liquidity1;
  }
}

function getAmount0ForLiquidity(sqrtRatioAX96, sqrtRatioBX96, liquidity) {
  if (sqrtRatioAX96 > sqrtRatioBX96) {
    [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  }

  return (liquidity * Q96 * (sqrtRatioBX96 - sqrtRatioAX96)) / (sqrtRatioBX96 * sqrtRatioAX96);
}

function getAmount1ForLiquidity(sqrtRatioAX96, sqrtRatioBX96, liquidity) {
  if (sqrtRatioAX96 > sqrtRatioBX96) {
    [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  }

  return (liquidity * (sqrtRatioBX96 - sqrtRatioAX96)) / Q96;
}

export function getAmountsForLiquidity(
  sqrtPriceX96,
  sqrtRatioAX96,
  sqrtRatioBX96,
  liquidity
) {
  // Ensure A < B
  if (sqrtRatioAX96 > sqrtRatioBX96) {
    [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  }

  let amount0 = BigInt(0);
  let amount1 = BigInt(0);

  if (sqrtPriceX96 <= sqrtRatioAX96) {
    amount0 = getAmount0ForLiquidity(sqrtRatioAX96, sqrtRatioBX96, liquidity);
  } else if (sqrtPriceX96 >= sqrtRatioBX96) {
    amount1 = getAmount1ForLiquidity(sqrtRatioAX96, sqrtRatioBX96, liquidity);
  } else {
    amount0 = getAmount0ForLiquidity(sqrtPriceX96, sqrtRatioBX96, liquidity);
    amount1 = getAmount1ForLiquidity(sqrtRatioAX96, sqrtPriceX96, liquidity);
  }

  return { amount0, amount1 };
}

export function calculateOptimalAmounts(params) {
  const {
    currentTick,
    tickLower,
    tickUpper,
    amount0Available,
    amount1Available,
    sqrtPriceX96
  } = params;

  // Get sqrt prices for range bounds
  const sqrtRatioAX96 = getSqrtRatioAtTick(tickLower);
  const sqrtRatioBX96 = getSqrtRatioAtTick(tickUpper);

  // Calculate liquidity from each token individually
  const liquidity0 = getLiquidityForAmounts(sqrtPriceX96, sqrtRatioAX96, sqrtRatioBX96, amount0Available, BigInt(0));
  const liquidity1 = getLiquidityForAmounts(sqrtPriceX96, sqrtRatioAX96, sqrtRatioBX96, BigInt(0), amount1Available);

  // Use the minimum liquidity (bottleneck)
  const liquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;

  if (liquidity === BigInt(0)) {
    return {
      amount0Desired: BigInt(0),
      amount1Desired: BigInt(0),
      liquidity: BigInt(0)
    };
  }

  // Calculate exact amounts needed for this liquidity
  const { amount0, amount1 } = getAmountsForLiquidity(sqrtPriceX96, sqrtRatioAX96, sqrtRatioBX96, liquidity);

  return {
    amount0Desired: amount0,
    amount1Desired: amount1,
    liquidity
  };
}
