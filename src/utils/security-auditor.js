/**
 * Security Auditor & Token Risk Analysis Module
 * Deterministic heuristics for contract bytecode auditing, social clone detection, and developer clustering.
 */

export const STANDARD_FLAP_IMPLS = [
  '0x024f18294970b5c76c0691b87f138a0317156422',
  '0x29e6383f0ce68507b5a72a53c2b118a118332aa8'
];

export const POPULAR_SOCIALS_BLACKLIST = [
  'pepecoineth', 'pepe.vip', 'shibtoken', 'shib.io', 'dogecoin', 'dogecoin.com',
  'pancakeswap', 'babydogecoin', 'floki', 'floki.com', 'binance', 'cz_binance',
  'vitalikbuterin', 'ethereum', 'solana', 'tether', 'usdt', 'circle', 'usdc',
  'avax', 'avalanche', 'arbitrum', 'optimism', 'polygon', 'matic', 'uniswap',
  'jupiterexchange', 'jup.ag', 'raydium', 'orca_so', 'bonk_inu', 'wif', 'dogwifhat'
];

/**
 * Validates tax bounds against maximum acceptable risk thresholds.
 * Tokens with tax > 9% are flagged as high risk / predatory.
 */
export function evaluateTaxRisk(buyTax, sellTax, maxThreshold = 9) {
  const b = Number(buyTax) || 0;
  const s = Number(sellTax) || 0;
  const isHighTax = b > maxThreshold || s > maxThreshold;
  return {
    buyTax: b,
    sellTax: s,
    isHighTax,
    taxKnown: buyTax !== null && buyTax !== undefined,
    status: isHighTax ? 'HIGH_RISK_TAX' : 'ACCEPTABLE'
  };
}

/**
 * Analyzes contract bytecode for ERC-1167 Minimal Proxy Clones.
 * Extracts implementation address and determines whether it matches verified factory implementations.
 */
export function auditContractBytecode(bytecode, standardImpls = STANDARD_FLAP_IMPLS) {
  if (!bytecode || typeof bytecode !== 'string' || bytecode === '0x') {
    return {
      type: 'UNKNOWN',
      isProxy: false,
      implementation: null,
      description: 'Bytecode unavailable or contract unverified'
    };
  }

  const cleanCode = bytecode.toLowerCase();
  // ERC-1167 prefix: 0x363d3d373d3d3d363d73 (push20 target address)
  if (cleanCode.startsWith('0x363d3d373d3d3d363d73') && cleanCode.length >= 62) {
    const impl = '0x' + cleanCode.slice(22, 62);
    const isStandard = standardImpls.map(i => i.toLowerCase()).includes(impl);
    return {
      type: isStandard ? 'STANDARD_PROXY' : 'CUSTOM_PROXY',
      isProxy: true,
      implementation: impl,
      isStandard,
      description: isStandard 
        ? `Standard Flap Proxy (${impl.slice(0, 10)}...)` 
        : `Custom Proxy (${impl.slice(0, 10)}...) - High Caution`
    };
  }

  return {
    type: 'NATIVE_CONTRACT',
    isProxy: false,
    implementation: null,
    isStandard: false,
    description: 'Native non-proxy contract implementation'
  };
}

/**
 * Checks for social media handle reuse or famous project copycats.
 */
export function checkSocialCloning(url, tokenAddress, registry = {}) {
  if (!url || typeof url !== 'string') return null;

  const key = url.trim().toLowerCase().split('?')[0];
  if (key.includes('t.me/flap') || key.includes('x.com/flap') || key.includes('flap.sh') || key.length < 15) {
    return null;
  }

  if (POPULAR_SOCIALS_BLACKLIST.some(term => key.includes(term))) {
    return {
      isClone: true,
      type: 'FAMOUS_PROJECT_COPYCAT',
      warning: 'Copycat of established brand or project (Phishing / Trap)',
      matchedUrl: key
    };
  }

  const currentAddr = (tokenAddress || '').toLowerCase();
  if (registry[key] && registry[key] !== currentAddr) {
    return {
      isClone: true,
      type: 'DUPLICATE_SOCIAL_ACROSS_TOKENS',
      warning: `Social account previously registered by token ${registry[key].slice(0, 10)}...`,
      originalToken: registry[key],
      matchedUrl: key
    };
  }

  return null;
}

/**
 * Classifies deployer wallet based on funding transaction history.
 */
export function classifyDevCluster(txCount, isExchange = false) {
  const count = Number(txCount) || 0;
  if (isExchange || count > 1000) {
    return { category: 'INSTITUTIONAL_OR_EXCHANGE', risk: 'LOW', label: 'Exchange / Bridge Funder' };
  }
  if (count > 20) {
    return { category: 'SERIAL_DEPLOYER', risk: 'HIGH', label: `Serial Deployer (${count} txs)` };
  }
  return { category: 'FRESH_OR_PRIVATE_WALLET', risk: 'NEUTRAL', label: `Private Wallet (${count} txs)` };
}
