import React, { useState, useEffect, useRef } from 'react';
import { Shield, ShieldAlert, Network, CheckCircle, Search, Brain, Zap, Target, Activity } from 'lucide-react';
import { ethers } from 'ethers';
import './Scanner.css';
import historicalTokensData from '../assets/historical_tokens.json';
import TokenDetailModal from './TokenDetailModal';

const RPC_NODES = [
  "https://bsc-mainnet.public.blastapi.io",
  "https://bsc-rpc.publicnode.com",
  "https://bsc.drpc.org",
  "https://binance.llamarpc.com",
  "https://bsc-dataseed.binance.org/",
  "https://1rpc.io/bnb"
];
const FLAP_FACTORY_ADDRESS = '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0';

// Domini sistemici Flap da escludere dai social/siti
const SYSTEM_DOMAINS = [
  'flap.sh','binance.com','mypinata.cloud','w3.org','bscscan.com',
  'warpcast.com','taxed.fun','debox.pro','allnodes.com','publicnode.com',
  'flapdotsh', // account ufficiale Flap su TG/X
];

// Implementazioni Proxy Standard di Flap (non innovative)
const STANDARD_IMPLS = [
  '0x024f18294970b5c76c0691b87f138a0317156422',
  '0x29e6383f0ce68507b5a72a53c2b118a118332aa8'
];

// Registro impl per contare innovazione in sessione per quelle nuove
const implSeenCount = {};
// Registro social per rilevare cloni (url -> primo tokenAddress)
const socialRegistry = {};

// Popola il registro con i social storici e in cache per scovare subito cloni e social falsi
function seedSocialRegistry(historicalList) {
  if (Array.isArray(historicalList)) {
    historicalList.forEach(t => {
      const addr = t.tokenAddress?.toLowerCase();
      if (!addr) return;
      const addKey = (url) => {
        if (!url) return;
        const key = url.trim().toLowerCase().split('?')[0];
        if (key.includes('t.me/flap') || key.includes('x.com/flap') || key.includes('flap.sh') || key.length < 15) return;
        socialRegistry[key] = addr;
      };
      addKey(t.tgUrl);
      addKey(t.xUrl);
      addKey(t.websiteUrl);
    });
  }
  try {
    const saved = localStorage.getItem('centaur_scanned_tokens');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        parsed.forEach(t => {
          const addr = t.tokenAddress?.toLowerCase();
          if (!addr) return;
          const addKey = (url) => {
            if (!url) return;
            const key = url.trim().toLowerCase().split('?')[0];
            if (key.includes('t.me/flap') || key.includes('x.com/flap') || key.includes('flap.sh') || key.length < 15) return;
            if (!socialRegistry[key]) socialRegistry[key] = addr;
          };
          addKey(t.tgUrl);
          addKey(t.xUrl);
          addKey(t.websiteUrl);
        });
      }
    }
  } catch (_) {}
}

// Avvia il seeding iniziale
seedSocialRegistry(historicalTokensData);

// ─── Parser HTML Flap (testato su dati reali) ─────────────────────────────
function parseFlapPage(html, tokenAddress) {
  let tokenName = null, tokenSymbol = null;
  let buyTax = null, sellTax = null;
  let realLogo = "";
  let tgUrl = null, xUrl = null, websiteUrl = null;

  // Slices a 5000 character window centered around the token address
  // to avoid matching recommended/other tokens on the same page
  let windowHtml = html;
  if (tokenAddress) {
    const lowercaseAddr = tokenAddress.toLowerCase();
    const htmlLower = html.toLowerCase();
    let targetIndex = htmlLower.indexOf(lowercaseAddr);
    if (targetIndex === -1) {
      targetIndex = htmlLower.indexOf(lowercaseAddr.replace('0x', ''));
    }
    if (targetIndex !== -1) {
      const startWindow = Math.max(0, targetIndex - 2500);
      const endWindow = Math.min(html.length, targetIndex + 2500);
      windowHtml = html.slice(startWindow, endWindow);
    }
  }

  // 1. Name & Symbol inside JSON chunks (symbol and creator context avoids meta tags)
  const nameMatch = windowHtml.match(/\\\\?\"name\\\\?\"\s*:\s*\\\\?\"([^\\\\\"]+)\\\\?\"\s*,\s*\\\\?\"?:(?:address|symbol|decimals|creator)\\\\?\"/);
  if (nameMatch) tokenName = nameMatch[1];
  
  const symbolMatch = windowHtml.match(/\\\\?\"symbol\\\\?\"\s*:\s*\\\\?\"([^\\\\\"]+)\\\\?\"/);
  if (symbolMatch) tokenSymbol = symbolMatch[1];

  // 2. Taxes: read buyTaxBps and sellTaxBps directly (100 bps = 1%)
  const hasTaxMatch = windowHtml.match(/\\\\?\"hasTax\\\\?\"\s*:\s*(true|false)/);
  if (hasTaxMatch && hasTaxMatch[1] === "false") {
    buyTax = 0;
    sellTax = 0;
  } else {
    const buyTaxMatch = windowHtml.match(/\\\\?\"buyTaxBps\\\\?\"\s*:\s*(\d+)/);
    const sellTaxMatch = windowHtml.match(/\\\\?\"sellTaxBps\\\\?\"\s*:\s*(\d+)/);
    if (buyTaxMatch && sellTaxMatch) {
      buyTax = parseInt(buyTaxMatch[1]) / 100;
      sellTax = parseInt(sellTaxMatch[1]) / 100;
    }
  }

  // 3. Logo/Image CID or URL
  const imageMatch = windowHtml.match(/\\\\?\"image\\\\?\"\s*:\s*\\\\?\"([^\\\\\"]*)\\\\?\"/);
  if (imageMatch && imageMatch[1]) {
    realLogo = imageMatch[1];
    if (!realLogo.startsWith('http') && realLogo.length > 5) {
      realLogo = `https://ipfs.io/ipfs/${realLogo}`;
    }
  }

  // 4. Socials
  const websiteMatch = windowHtml.match(/\\\\?\"website\\\\?\"\s*:\s*\\\\?\"([^\\\\\"]*)\\\\?\"/);
  if (websiteMatch && websiteMatch[1]) websiteUrl = websiteMatch[1];

  const twitterMatch = windowHtml.match(/\\\\?\"twitter\\\\?\"\s*:\s*\\\\?\"([^\\\\\"]*)\\\\?\"/);
  if (twitterMatch && twitterMatch[1]) xUrl = twitterMatch[1];

  const telegramMatch = windowHtml.match(/\\\\?\"telegram\\\\?\"\s*:\s*\\\\?\"([^\\\\\"]*)\\\\?\"/);
  if (telegramMatch && telegramMatch[1]) tgUrl = telegramMatch[1];

  // Filter out system domains
  if (tgUrl && SYSTEM_DOMAINS.some(d => tgUrl.includes(d))) tgUrl = null;
  if (xUrl && SYSTEM_DOMAINS.some(d => xUrl.includes(d))) xUrl = null;
  if (websiteUrl && SYSTEM_DOMAINS.some(d => websiteUrl.includes(d))) websiteUrl = null;

  const hasTelegram = !!tgUrl;
  const hasTwitter = !!xUrl;

  return { tokenName, tokenSymbol, buyTax, sellTax, realLogo, hasTelegram, hasTwitter, tgUrl, xUrl, websiteUrl };
}

// ─── Rilevamento social clonati e falsi ───────────────────────────────────
function checkSocialClone(url, tokenAddr) {
  if (!url) return null;
  const key = url.trim().toLowerCase().split('?')[0]; // ignora query params
  if (key.includes('t.me/flap') || key.includes('x.com/flap') || key.includes('flap.sh') || key.length < 15) return null;

  // Lista di parole chiave di canali social ufficiali di progetti famosi abusati dagli scammer
  const POPULAR_SOCIALS_BLACKLIST = [
    'pepecoineth', 'pepe.vip', 'shibtoken', 'shib.io', 'dogecoin', 'dogecoin.com',
    'pancakeswap', 'babydogecoin', 'floki', 'floki.com', 'binance', 'cz_binance',
    'vitalikbuterin', 'ethereum', 'solana', 'tether', 'usdt', 'circle', 'usdc',
    'avax', 'avalanche', 'arbitrum', 'optimism', 'polygon', 'matic', 'uniswap',
    'jupiterexchange', 'jup.ag', 'raydium', 'orca_so', 'bonk_inu', 'wif', 'dogwifhat'
  ];
  const isBlacklisted = POPULAR_SOCIALS_BLACKLIST.some(term => key.includes(term));
  if (isBlacklisted) {
    return '0x_famous_project_copycat'; // Restituisce un indirizzo speciale fittizio per indicare copia di famoso progetto
  }

  if (socialRegistry[key] && socialRegistry[key] !== tokenAddr.toLowerCase()) {
    return socialRegistry[key];
  }
  socialRegistry[key] = tokenAddr.toLowerCase();
  return null;
}

// ─── Utility di Rotazione RPC per Resilienza ──────────────────────────────
let rpcIndex = 0;
function getProvider() {
  return new ethers.JsonRpcProvider(RPC_NODES[rpcIndex]);
}
function rotateRpc() {
  rpcIndex = (rpcIndex + 1) % RPC_NODES.length;
  console.log(`Rotating frontend RPC to: ${RPC_NODES[rpcIndex]}`);
}

async function safeCall(fn, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const p = getProvider();
      return await fn(p);
    } catch (err) {
      console.warn(`RPC Call failed: ${err.message}. Rotating RPC.`);
      rotateRpc();
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error("All RPC attempts failed");
}

// ─── Componente ───────────────────────────────────────────────────────────
const Scanner = () => {
  const cleanHistorical = (historicalTokensData || []).filter(t => !t.isHighTax);
  
  const [tokens, setTokens] = useState(() => {
    const saved = localStorage.getItem('centaur_scanned_tokens');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (_) {}
    }
    return [];
  });

  const [isConnected, setIsConnected] = useState(false);
  const [currentBlock, setCurrentBlock] = useState(0);
  const [selectedToken, setSelectedToken] = useState(null);
  
  const processedTokens = useRef(new Set());
  const processedTxs = useRef(new Set());

  // Function to fetch the 80 latest tokens from GMGN launches proxy API
  const fetchLiveLaunches = async () => {
    try {
      const res = await fetch('/api/gmgn/launches');
      const data = await res.json();
      if (data.success && Array.isArray(data.tokens)) {
        setTokens(prev => {
          const merged = [...data.tokens];
          prev.forEach(p => {
            if (!merged.some(m => m.tokenAddress?.toLowerCase() === p.tokenAddress?.toLowerCase())) {
              merged.push(p);
            }
          });
          return merged.slice(0, 100);
        });
      }
    } catch (err) {
      console.error("Failed to load fresh launches:", err);
    }
  };

  // Cleanup contaminated cache on startup
  useEffect(() => {
    const saved = localStorage.getItem('centaur_scanned_tokens');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        let changed = false;
        const cleaned = parsed.map(t => {
          let updated = { ...t };
          const isPumpTg = t.tgUrl && (t.tgUrl.includes('pump') || t.tgUrl.includes('solana') || t.tgUrl.includes('pumpfun'));
          const isPumpX = t.xUrl && (t.xUrl.includes('pump') || t.xUrl.includes('solana') || t.xUrl.includes('pumpfun'));
          const isPumpWeb = t.websiteUrl && (t.websiteUrl.includes('pump') || t.websiteUrl.includes('solana') || t.websiteUrl.includes('pump.fun') || t.websiteUrl.includes('pumpfun'));
          
          if (isPumpTg) { updated.tgUrl = null; updated.hasTelegram = false; changed = true; }
          if (isPumpX) { updated.xUrl = null; updated.hasTwitter = false; changed = true; }
          if (isPumpWeb) { updated.websiteUrl = null; changed = true; }
          
          if (isPumpTg || isPumpX || isPumpWeb) {
            updated.hasSocialClone = false;
            updated.cloneWarning = null;
            updated.isStealth = !updated.hasTelegram && !updated.hasTwitter && !updated.websiteUrl;
            updated.webStatus = updated.isStealth ? "Nessun social pubblico" : "✅ Social verificati";
            updated.twitterCreateTokenCount = 0;
            updated.twitterRenameCount = 0;
            updated.twitterDup = 0;
            updated.telegramDup = 0;
            updated.websiteDup = 0;
          }
          return updated;
        });
        if (changed) {
          localStorage.setItem('centaur_scanned_tokens', JSON.stringify(cleaned));
          setTokens(cleaned);
        }
      }
    } catch (_) {}
  }, []);

  // Fetch live launches on startup
  useEffect(() => {
    fetchLiveLaunches();
  }, []);

  // Populate processedTokens dynamically from tokens
  useEffect(() => {
    tokens.forEach(t => {
      if (t.tokenAddress) {
        processedTokens.current.add(t.tokenAddress.toLowerCase());
      }
    });
  }, [tokens]);

  // Dynamic social clone detection across the current tokens list
  useEffect(() => {
    const registry = {};
    let changed = false;
    const updated = tokens.map(t => {
      let isClone = false;
      let cloneOf = null;
      
      const checkUrl = (url) => {
        if (!url) return;
        const key = url.trim().toLowerCase().split('?')[0];
        if (key.includes('t.me/flap') || key.includes('x.com/flap') || key.includes('flap.sh') || key.length < 15) return;
        
        const POPULAR_SOCIALS_BLACKLIST = [
          'pepecoineth', 'pepe.vip', 'shibtoken', 'shib.io', 'dogecoin', 'dogecoin.com',
          'pancakeswap', 'babydogecoin', 'floki', 'floki.com', 'binance', 'cz_binance',
          'vitalikbuterin', 'ethereum', 'solana', 'tether', 'usdt', 'circle', 'usdc',
          'avax', 'avalanche', 'arbitrum', 'optimism', 'polygon', 'matic', 'uniswap',
          'jupiterexchange', 'jup.ag', 'raydium', 'orca_so', 'bonk_inu', 'wif', 'dogwifhat'
        ];
        const isBlacklisted = POPULAR_SOCIALS_BLACKLIST.some(term => key.includes(term));
        if (isBlacklisted) {
          isClone = true;
          cloneOf = '0x_famous_project_copycat';
          return;
        }

        if (registry[key] && registry[key] !== t.tokenAddress?.toLowerCase()) {
          isClone = true;
          cloneOf = registry[key];
        } else {
          registry[key] = t.tokenAddress?.toLowerCase();
        }
      };

      checkUrl(t.tgUrl);
      checkUrl(t.xUrl);
      checkUrl(t.websiteUrl);

      const targetWarning = isClone
        ? (cloneOf === '0x_famous_project_copycat'
            ? `🚨 COPIA DI PROGETTO FAMOSO (TRAPPA)!`
            : `🚨 Social clonato da ${cloneOf.slice(0,10)}...`)
        : null;

      const targetWebStatus = isClone
        ? (cloneOf === '0x_famous_project_copycat'
            ? `🚨 SOCIAL FALSI (copia famosa)`
            : `🚨 SOCIAL FALSI (clonati)`)
        : t.webStatus;

      if (t.hasSocialClone !== isClone || t.cloneWarning !== targetWarning) {
        changed = true;
        return {
          ...t,
          hasSocialClone: isClone,
          cloneWarning: targetWarning,
          webStatus: targetWebStatus
        };
      }
      return t;
    });

    if (changed) {
      setTokens(updated);
    }
  }, [tokens]);

  // Save to localStorage when tokens list changes
  useEffect(() => {
    localStorage.setItem('centaur_scanned_tokens', JSON.stringify(tokens));
  }, [tokens]);

  // Aggiorna le metriche di GMGN per i primi 15 token scansionati all'avvio dell'app per rimuovere dati incompleti
  useEffect(() => {
    const saved = localStorage.getItem('centaur_scanned_tokens');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      const nonHistorical = parsed.filter(t => !t.isHistorical).slice(0, 15);
      if (nonHistorical.length === 0) return;

      nonHistorical.forEach(async (tok) => {
        try {
          const gmgnRes = await fetch(`/api/gmgn/token/${tok.tokenAddress}`);
          const gmgnData = await gmgnRes.json();
          if (gmgnData && !gmgnData.error) {
            const info = gmgnData.info;
            const security = gmgnData.security;
            const bTax = security?.buy_tax !== undefined && security?.buy_tax !== null ? parseFloat(security.buy_tax) * 100 : null;
            const sTax = security?.sell_tax !== undefined && security?.sell_tax !== null ? parseFloat(security.sell_tax) * 100 : null;
            
            setTokens(prev => prev.map(t => {
              if (t.tokenAddress?.toLowerCase() === tok.tokenAddress?.toLowerCase()) {
                const hasTg = !!info?.link?.telegram;
                const isGeneric = info?.link?.twitter_username?.toLowerCase() === 'bnbchain' ||
                                  info?.link?.twitter_username?.includes('communities');
                const hasTw = !!info?.link?.twitter_username && !isGeneric;

                const tgUrl = info?.link?.telegram || t.tgUrl;
                const xUrl = hasTw ? (info.link.twitter_username.startsWith('http') ? info.link.twitter_username : `https://x.com/${info.link.twitter_username}`) : t.xUrl;
                const websiteUrl = info?.link?.website || t.websiteUrl;

                const finalHasTg = !!tgUrl;
                const finalHasTw = !!xUrl;
                const finalHasWeb = !!websiteUrl;
                const tStealth = !finalHasTg && !finalHasTw && !finalHasWeb;

                const twitterCreateTokenCount = info?.dev?.twitter_create_token_count || info?.twitter_create_token_count || t.twitterCreateTokenCount || 0;
                const twitterRenameCount = info?.dev?.twitter_rename_count || info?.twitter_rename_count || t.twitterRenameCount || 0;
                const twitterDup = info?.dev?.twitter_dup || info?.twitter_dup || info?.stat?.twitter_dup || t.twitterDup || 0;
                const telegramDup = info?.dev?.telegram_dup || info?.telegram_dup || info?.stat?.telegram_dup || t.telegramDup || 0;
                const websiteDup = info?.dev?.website_dup || info?.website_dup || info?.stat?.website_dup || t.websiteDup || 0;

                return {
                  ...t,
                  tokenName: info?.name || t.tokenName,
                  tokenSymbol: info?.symbol || t.tokenSymbol,
                  realLogo: info?.logo || t.realLogo,
                  tgUrl,
                  xUrl,
                  websiteUrl,
                  hasTelegram: finalHasTg,
                  hasTwitter: finalHasTw,
                  isStealth: tStealth,
                  buyTax: bTax !== null ? bTax : t.buyTax,
                  sellTax: sTax !== null ? sTax : t.sellTax,
                  taxKnown: bTax !== null || t.taxKnown,
                  kolCount: info?.wallet_tags_stat?.renowned_wallets || t.kolCount,
                  smartMoneyCount: info?.wallet_tags_stat?.smart_wallets || t.smartMoneyCount,
                  whaleCount: info?.wallet_tags_stat?.whale_wallets || t.whaleCount,
                  sniperCount: info?.wallet_tags_stat?.sniper_wallets || t.sniperCount,
                  creatorCreatedCount: info?.creator_created_count || info?.stat?.creator_created_count || info?.dev?.twitter_create_token_count || t.creatorCreatedCount,
                  liquidityUsd: info?.liquidity || t.liquidityUsd,
                  marketCapUsd: info?.price?.price ? (parseFloat(info.circulating_supply || info.total_supply || 1000000000) * parseFloat(info.price.price)) : (info?.usd_market_cap || t.marketCapUsd),
                  launchpadProgress: info?.launchpad_progress !== undefined ? info.launchpad_progress : t.launchpadProgress,
                  creatorHoldRate: (info?.stat?.creator_hold_rate || info?.dev?.creator_hold_rate) !== undefined ? (info.stat?.creator_hold_rate || info.dev?.creator_hold_rate) : t.creatorHoldRate,
                  top10HolderRate: info?.stat?.top_10_holder_rate !== undefined ? info.stat.top_10_holder_rate : t.top10HolderRate,
                  twitterCreateTokenCount,
                  twitterRenameCount,
                  twitterDup,
                  telegramDup,
                  websiteDup
                };
              }
              return t;
            }));
          }
        } catch (_) {}
      });
    } catch (_) {}
  }, []);

  const processTransaction = async (txHash, provider, isHistorical = false) => {
    try {
      const [tx, receipt] = await safeCall(async (p) => {
        return await Promise.all([
          p.getTransaction(txHash),
          p.getTransactionReceipt(txHash),
        ]);
      });
      if (!tx || !receipt) return;

      // Trova indirizzo token (solo se è transazione di Creazione - Transfer da 0x0)
      let tokenAddress = null;
      let isCreationTx = false;
      for (const log of receipt.logs) {
        const isTransfer = log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
        const isFromNull = log.topics[1] === '0x0000000000000000000000000000000000000000000000000000000000000000';
        const addr = log.address.toLowerCase();
        const isFlapSuffix = (addr.endsWith('7777') || addr.endsWith('8888')) && addr !== "0x88886f0fd371dff856291badced45922bc888888";
        
        if (isTransfer && isFromNull && isFlapSuffix) {
          tokenAddress = log.address;
          isCreationTx = true;
          break;
        }
      }
      if (!isCreationTx || !tokenAddress) return;

      const tokenKey = tokenAddress.toLowerCase();
      if (processedTokens.current.has(tokenKey)) return;
      processedTokens.current.add(tokenKey);

      // ── Step 0: Check Dev Initial Purchase ──
      let devBoughtAtLaunch = false;
      try {
        const creatorTopic = '0x' + tx.from.toLowerCase().slice(2).padStart(64, '0');
        for (const log of receipt.logs) {
          const isTransfer = log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
          if (isTransfer && log.address.toLowerCase() === tokenAddress.toLowerCase()) {
            if (log.topics[2]?.toLowerCase() === creatorTopic) {
              devBoughtAtLaunch = true;
              break;
            }
          }
        }
      } catch (_) {}

      if (!devBoughtAtLaunch && !isHistorical) {
        return;
      }

      // ── Step 1: GMGN API (Primary Source of Truth) ──
      const existing = tokens.find(t => t.tokenAddress?.toLowerCase() === tokenKey);

      let tokenName = existing?.tokenName || null;
      let tokenSymbol = existing?.tokenSymbol || null;
      let buyTax = existing?.buyTax || null;
      let sellTax = existing?.sellTax || null;
      let realLogo = existing?.realLogo || "";
      let tgUrl = existing?.tgUrl || null;
      let xUrl = existing?.xUrl || null;
      let websiteUrl = existing?.websiteUrl || null;
      let hasTelegram = !!tgUrl;
      let hasTwitter = !!xUrl;
      
      let kolCount = 0, smartMoneyCount = 0, whaleCount = 0, sniperCount = 0;
      let creatorCreatedCount = 0, liquidityUsd = 0, marketCapUsd = 0;
      let launchpadProgress = 0, creatorHoldRate = 0, top10HolderRate = 0;
      let biggestPool = '';
      let isHoneypot = false;
      let twitterCreateTokenCount = existing?.twitterCreateTokenCount || 0;
      let twitterRenameCount = existing?.twitterRenameCount || 0;
      let twitterDup = existing?.twitterDup || 0;
      let telegramDup = existing?.telegramDup || 0;
      let websiteDup = existing?.websiteDup || 0;
      let trueDev = tx.from;
      let bscScanSuccess = false;

      try {
        const gmgnRes = await fetch(`/api/gmgn/token/${tokenAddress}`);
        const gmgnData = await gmgnRes.json();
        if (gmgnData && !gmgnData.error) {
          const info = gmgnData.info;
          const security = gmgnData.security;
          
          if (info) {
            tokenName = info.name || tokenName;
            tokenSymbol = info.symbol || tokenSymbol;
            realLogo = info.logo || realLogo;
            trueDev = info.dev?.creator_address || trueDev;
            
            if (info.link) {
              const glink = info.link;
              if (glink.telegram) { tgUrl = glink.telegram; hasTelegram = true; }
              const isGeneric = glink.twitter_username?.toLowerCase() === 'bnbchain' ||
                                glink.twitter_username?.includes('communities');
              
              if (glink.twitter_username && !isGeneric) {
                xUrl = glink.twitter_username.startsWith('http')
                  ? glink.twitter_username
                  : `https://x.com/${glink.twitter_username}`;
                hasTwitter = true;
              }
              let webUrl = glink.website || null;
              const isWebGeneric = webUrl && (
                webUrl.includes('flap.sh') ||
                webUrl.includes('four.meme') ||
                webUrl.includes('debox.pro') ||
                webUrl.includes('binance.com') ||
                webUrl.includes('bnbchain.org')
              );
              if (webUrl && !isWebGeneric) { websiteUrl = webUrl; }
            }
            
            kolCount = info.wallet_tags_stat?.renowned_wallets || 0;
            smartMoneyCount = info.wallet_tags_stat?.smart_wallets || 0;
            whaleCount = info.wallet_tags_stat?.whale_wallets || 0;
            sniperCount = info.wallet_tags_stat?.sniper_wallets || 0;
            creatorCreatedCount = info.stat?.creator_created_count || info.creator_created_count || info.dev?.twitter_create_token_count || 0;
            liquidityUsd = info.liquidity || 0;
            marketCapUsd = info.price?.price ? (parseFloat(info.circulating_supply || info.total_supply || 1000000000) * parseFloat(info.price.price)) : (info.usd_market_cap || 0);
            launchpadProgress = info.launchpad_progress || 0;
            creatorHoldRate = info.stat?.creator_hold_rate || info.dev?.creator_hold_rate || 0;
            top10HolderRate = info.stat?.top_10_holder_rate || 0;
            biggestPool = info.biggest_pool_address || '';
            twitterCreateTokenCount = info.dev?.twitter_create_token_count || info.twitter_create_token_count || 0;
            twitterRenameCount = info.dev?.twitter_rename_count || info.twitter_rename_count || 0;
            twitterDup = info.dev?.twitter_dup || info.twitter_dup || info.stat?.twitter_dup || 0;
            telegramDup = info.dev?.telegram_dup || info.telegram_dup || info.stat?.telegram_dup || 0;
            websiteDup = info.dev?.website_dup || info.website_dup || info.stat?.website_dup || 0;
          }
          
          if (security) {
            isHoneypot = security.is_honeypot || false;
            if (security.buy_tax !== undefined && security.buy_tax !== null) {
              buyTax = parseFloat(security.buy_tax) * 100;
              sellTax = parseFloat(security.sell_tax) * 100;
            }
          }
        }
      } catch (_) {}

      // ── Step 1.5: Flap Fallback (Se GMGN non ha ancora indicizzato il token) ──
      if (buyTax === null) {
        try {
          const flapRes = await fetch(`/api/flap/${tokenAddress}`);
          const flapHtml = await flapRes.text();
          const parsed = parseFlapPage(flapHtml, tokenAddress);
          tokenName   = tokenName || parsed.tokenName;
          tokenSymbol = tokenSymbol || parsed.tokenSymbol;
          buyTax      = parsed.buyTax;
          sellTax     = parsed.sellTax;
          realLogo    = realLogo || parsed.realLogo;
          if (!hasTelegram && parsed.hasTelegram) { tgUrl = parsed.tgUrl; hasTelegram = true; }
          if (!hasTwitter && parsed.hasTwitter) { xUrl = parsed.xUrl; hasTwitter = true; }
          websiteUrl  = websiteUrl || parsed.websiteUrl;
        } catch (_) {}
      }

      // ── Step 2: GoPlus (Ulteriore Fallback & Security Check) ──
      let isMigrated = false;
      try {
        const gpRes  = await fetch(`https://api.gopluslabs.io/api/v1/token_security/56?contract_addresses=${tokenAddress}`);
        const gpData = await gpRes.json();
        const sec    = gpData?.result?.[tokenKey];
        if (sec) {
          if (sec.creator_address) trueDev = sec.creator_address;
          if (sec.is_in_dex === "1") isMigrated = true;
          tokenName   = tokenName || sec.token_name;
          tokenSymbol = tokenSymbol || sec.token_symbol;
          if (sec.is_honeypot === "1") { buyTax = 100; sellTax = 100; isHoneypot = true; }
        }
      } catch (_) {}

      if (isMigrated) { processedTokens.current.delete(tokenKey); return; }

      // Nomi di default se tutto fallisce
      tokenName   = tokenName   || "Sconosciuto";
      tokenSymbol = tokenSymbol || "???";

      const taxKnown  = buyTax !== null;
      const isHighTax = taxKnown && (buyTax > 9 || sellTax > 9);

      // ── Step 3: Proxy Impl → Check Innovazione ──
      let taxInnovation = "Standard (Nessuna Tassa)";
      if (buyTax > 0 || sellTax > 0) {
        taxInnovation = "Lettura contratto non disponibile";
        try {
          const code = await safeCall(p => p.getCode(tokenAddress));
          if (code.startsWith("0x363d3d373d3d3d363d73")) {
            const impl = "0x" + code.slice(22, 62).toLowerCase();
            
            if (STANDARD_IMPLS.includes(impl)) {
              taxInnovation = `🔁 Proxy Standard Flap (${impl.slice(0,10)}...)`;
            } else {
              implSeenCount[impl] = (implSeenCount[impl] || 0) + 1;
              const n = implSeenCount[impl];
              taxInnovation = `🆕 Proxy Custom/Unverified su Flap (${impl.slice(0,10)}...) — scam o innovativo!`;
            }
          } else if (code.length > 10) {
            taxInnovation = "🚀 Contratto nativo NON-proxy — innovazione totale!";
          }
        } catch (_) {}
      }

      // ── Step 4: Stealth + clone detection ──
      const isStealth = !hasTelegram && !hasTwitter && !websiteUrl;

      const tgCloneOf  = checkSocialClone(tgUrl, tokenAddress);
      const xCloneOf   = checkSocialClone(xUrl,  tokenAddress);
      const webCloneOf = checkSocialClone(websiteUrl, tokenAddress);
      
      const isTwitterSeriale = twitterCreateTokenCount > 1 || twitterRenameCount > 0 || twitterDup > 0;
      const isTelegramSeriale = telegramDup > 0;
      const isWebsiteSeriale = websiteDup > 0;
      
      const hasSocialClone = !!(tgCloneOf || xCloneOf || webCloneOf || isTwitterSeriale || isTelegramSeriale || isWebsiteSeriale);
      const cloneOf = tgCloneOf || xCloneOf || webCloneOf;
      
      let cloneWarning = null;
      if (hasSocialClone) {
        if (isTwitterSeriale || isTelegramSeriale || isWebsiteSeriale) {
          const reasons = [];
          if (isTwitterSeriale) reasons.push(`Twitter reusato/seriale (usato per ${twitterCreateTokenCount || 2} token)`);
          if (isTelegramSeriale) reasons.push(`Telegram reusato`);
          if (isWebsiteSeriale) reasons.push(`Sito web reusato`);
          cloneWarning = `🚨 SOCIAL REUSATI (${reasons.join(', ')})`;
        } else if (cloneOf === '0x_famous_project_copycat') {
          cloneWarning = `🚨 COPIA DI PROGETTO FAMOSO (TRAPPA)!`;
        } else {
          cloneWarning = `🚨 Social clonato da ${cloneOf.slice(0,10)}...`;
        }
      }

      // ── Step 5: Dev Clustering ──
      let devClusterHistory = "Analisi in corso...";
      let pastScamsCount    = 0;
      let funderText        = "";
      bscScanSuccess    = false;
      try {
        const scanRes  = await fetch(`https://api.bscscan.com/api?module=account&action=txlist&address=${trueDev}&startblock=0&endblock=99999999&page=1&offset=2&sort=asc`);
        const scanData = await scanRes.json();
        if (scanData.status === "1" && scanData.result?.length > 0) {
          const funder = scanData.result[0].from?.toLowerCase() === trueDev.toLowerCase()
            ? scanData.result[0].to : scanData.result[0].from;
          const cnt = await safeCall(p => p.getTransactionCount(funder));
          if      (cnt > 1000) { devClusterHistory = "✅ Funder: Exchange/Bridge"; funderText = `${funder.slice(0,10)}...`; }
          else if (cnt > 20)   { devClusterHistory = `🚨 Funder sospetto (${cnt} txs)`; pastScamsCount = cnt; funderText = `Possibile cluster scam: ${funder.slice(0,10)}...`; }
          else                 { devClusterHistory = `✅ Wallet privato (${cnt} txs)`; funderText = `${funder.slice(0,10)}...`; }
          bscScanSuccess = true;
        }
      } catch (_) {}

      if (!bscScanSuccess) {
        try {
          const cnt = await safeCall(p => p.getTransactionCount(trueDev));
          if (cnt > 10) { devClusterHistory = `🚨 Dev seriale (${cnt} TX)`; pastScamsCount = cnt; }
          else          { devClusterHistory = `✅ Dev nuovo (${cnt} TX)`; }
        } catch (_) {
          devClusterHistory = "Analisi dev non disponibile";
        }
      }

      const webStatus = isStealth
        ? "Nessun social pubblico"
        : cloneWarning || "✅ Social verificati";

      // also save biggestPool from GMGN for use in TokenDetailModal
      const tokenBase = {
        txHash, creator: trueDev, tokenAddress, tokenName, tokenSymbol, realLogo,
        isStealth, hasTelegram, hasTwitter, tgUrl, xUrl, websiteUrl,
        hasSocialClone, cloneWarning,
        taxInnovation, isHighTax, taxKnown, buyTax, sellTax,
        devClusterHistory, pastScamsCount, funderText, webStatus,
        block: receipt.blockNumber,
        timestamp: isHistorical ? 'Storico' : new Date().toLocaleTimeString('it-IT'),
        isHistorical,
        kolCount, smartMoneyCount, whaleCount, sniperCount, creatorCreatedCount,
        liquidityUsd, marketCapUsd, isHoneypot,
        launchpadProgress, creatorHoldRate, top10HolderRate,
        biggestPool,
        twitterCreateTokenCount, twitterRenameCount,
        twitterDup, telegramDup, websiteDup
      };

      setTokens(prev => {
        if (prev.some(t => t.tokenAddress?.toLowerCase() === tokenKey)) return prev;
        if (isHighTax) return prev;
        return [tokenBase, ...prev].sort((a, b) => b.block - a.block).slice(0, 100);
      });

      // Avvia un ciclo di aggiornamento in background per allineare le metriche di GMGN appena indicizzate
      if (!isHistorical) {
        let updateAttempts = 0;
        const updateInterval = setInterval(async () => {
          updateAttempts++;
          if (updateAttempts > 6) {
            clearInterval(updateInterval);
            return;
          }
          try {
            const gmgnRes = await fetch(`/api/gmgn/token/${tokenAddress}`);
            const gmgnData = await gmgnRes.json();
            if (gmgnData && !gmgnData.error) {
              const info = gmgnData.info;
              const security = gmgnData.security;
              const bTax = security?.buy_tax !== undefined && security?.buy_tax !== null ? parseFloat(security.buy_tax) * 100 : null;
              const sTax = security?.sell_tax !== undefined && security?.sell_tax !== null ? parseFloat(security.sell_tax) * 100 : null;
              
              if (bTax > 9 || sTax > 9 || security?.is_honeypot) {
                setTokens(prev => prev.filter(t => t.tokenAddress?.toLowerCase() !== tokenKey));
                clearInterval(updateInterval);
                return;
              }

              setTokens(prev => prev.map(t => {
                if (t.tokenAddress?.toLowerCase() === tokenKey) {
                  const hasTg = !!info?.link?.telegram;
                  const isGeneric = info?.link?.twitter_username?.toLowerCase() === 'bnbchain' ||
                                    info?.link?.twitter_username?.includes('communities');
                  const hasTw = !!info?.link?.twitter_username && !isGeneric;

                  const tgUrl = info?.link?.telegram || t.tgUrl;
                  const xUrl = hasTw ? (info.link.twitter_username.startsWith('http') ? info.link.twitter_username : `https://x.com/${info.link.twitter_username}`) : t.xUrl;
                  const websiteUrl = info?.link?.website || t.websiteUrl;

                  const finalHasTg = !!tgUrl;
                  const finalHasTw = !!xUrl;
                  const finalHasWeb = !!websiteUrl;
                  const tStealth = !finalHasTg && !finalHasTw && !finalHasWeb;

                  const twitterCreateTokenCount = info?.dev?.twitter_create_token_count || info?.twitter_create_token_count || t.twitterCreateTokenCount || 0;
                  const twitterRenameCount = info?.dev?.twitter_rename_count || info?.twitter_rename_count || t.twitterRenameCount || 0;
                  const twitterDup = info?.dev?.twitter_dup || info?.twitter_dup || info?.stat?.twitter_dup || t.twitterDup || 0;
                  const telegramDup = info?.dev?.telegram_dup || info?.telegram_dup || info?.stat?.telegram_dup || t.telegramDup || 0;
                  const websiteDup = info?.dev?.website_dup || info?.website_dup || info?.stat?.website_dup || t.websiteDup || 0;

                  return {
                    ...t,
                    tokenName: info?.name || t.tokenName,
                    tokenSymbol: info?.symbol || t.tokenSymbol,
                    realLogo: info?.logo || t.realLogo,
                    tgUrl,
                    xUrl,
                    websiteUrl,
                    hasTelegram: finalHasTg,
                    hasTwitter: finalHasTw,
                    isStealth: tStealth,
                    buyTax: bTax !== null ? bTax : t.buyTax,
                    sellTax: sTax !== null ? sTax : t.sellTax,
                    taxKnown: bTax !== null || t.taxKnown,
                    kolCount: info?.wallet_tags_stat?.renowned_wallets || t.kolCount,
                    smartMoneyCount: info?.wallet_tags_stat?.smart_wallets || t.smartMoneyCount,
                    whaleCount: info?.wallet_tags_stat?.whale_wallets || t.whaleCount,
                    sniperCount: info?.wallet_tags_stat?.sniper_wallets || t.sniperCount,
                    creatorCreatedCount: info?.stat?.creator_created_count || info?.creator_created_count || info?.dev?.twitter_create_token_count || t.creatorCreatedCount,
                    liquidityUsd: info?.liquidity || t.liquidityUsd,
                    marketCapUsd: info?.price?.price ? (parseFloat(info.circulating_supply || info.total_supply || 1000000000) * parseFloat(info.price.price)) : (info?.usd_market_cap || t.marketCapUsd),
                    launchpadProgress: info?.launchpad_progress !== undefined ? info.launchpad_progress : t.launchpadProgress,
                    creatorHoldRate: (info?.stat?.creator_hold_rate || info?.dev?.creator_hold_rate) !== undefined ? (info.stat?.creator_hold_rate || info.dev?.creator_hold_rate) : t.creatorHoldRate,
                    top10HolderRate: info?.stat?.top_10_holder_rate !== undefined ? info.stat.top_10_holder_rate : t.top10HolderRate,
                    biggestPool: info?.biggest_pool_address || t.biggestPool || '',
                    twitterCreateTokenCount,
                    twitterRenameCount,
                    twitterDup,
                    telegramDup,
                    websiteDup
                  };
                }
                return t;
              }));
            }
          } catch (_) {}
        }, 5000);
      }

    } catch (err) {
      console.error("processTransaction error:", err.message);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let timerId = null;

    const initScanner = async () => {
      try {
        const latestBlock = await safeCall(p => p.getBlockNumber());
        if (!isMounted) return;
        setCurrentBlock(latestBlock);
        setIsConnected(true);

        const pollLogs = async () => {
          if (!isMounted) return;
          try {
            const currentLatest = await safeCall(p => p.getBlockNumber());
            if (isMounted) setCurrentBlock(currentLatest);

            // Fetch last 50 blocks for reliability (covers ~150s at 3s/block)
            const startBlock = Math.max(0, currentLatest - 50);
            
            let logs = [];
            try {
              logs = await safeCall(p => p.getLogs({
                fromBlock: startBlock,
                toBlock: currentLatest,
                address: FLAP_FACTORY_ADDRESS
              }));
            } catch (logErr) {
              console.warn('getLogs failed, retrying with smaller range:', logErr.message);
              try {
                logs = await safeCall(p => p.getLogs({
                  fromBlock: currentLatest - 5,
                  toBlock: currentLatest,
                  address: FLAP_FACTORY_ADDRESS
                }));
              } catch (_) {}
            }

            for (const log of logs) {
              const txHash = log.transactionHash;
              if (!processedTxs.current.has(txHash)) {
                processedTxs.current.add(txHash);
                processTransaction(txHash, null, false);
              }
            }
          } catch (err) {
            console.error('Errore polling logs:', err.message);
            rotateRpc();
          }
          if (isMounted) {
            timerId = setTimeout(pollLogs, 4000);
          }
        };

        // Start first poll
        pollLogs();

      } catch (err) {
        setIsConnected(false);
      }
    };
    initScanner();
    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
    };
  }, []);

  return (
    <div className="scanner-container">
      <div className="scanner-status">
        <div className={`status-dot ${isConnected ? 'active' : 'inactive'}`}></div>
        <span className="font-mono text-sm text-bright">
          {isConnected ? 'LIVE — FLAP.SH MONITOR' : 'CONNESSIONE...'}
        </span>
        <div className="filter-badge"><Zap size={11} className="mr-1 inline-icon"/>CENTAUR SCANNER</div>
        <button 
          onClick={() => {
            if (confirm("Vuoi resettare la lista in cache locale e avviare una nuova scansione dei blocchi live?")) {
              localStorage.removeItem('centaur_scanned_tokens');
              processedTokens.current = new Set();
              processedTxs.current = new Set();
              setTokens([]);
              fetchLiveLaunches();
            }
          }}
          className="reset-list-btn"
        >
          RESET LISTA
        </button>
        <span className="font-mono text-sm ml-auto text-cyan">BLK: {currentBlock}</span>
      </div>

      <div className="token-list">
        {tokens.length === 0 ? (
          <div className="empty-state font-mono text-muted">
            <Network size={28} className="mb-2 opacity-50 pulse-icon text-cyan" />
            <p>In attesa di nuovi lanci su Flap.sh...</p>
          </div>
        ) : tokens.map((token, idx) => {
          const isScrap = token.isHighTax || token.pastScamsCount > 0 ||
                          (token.webStatus||"").includes("SCARTO") || token.hasSocialClone || token.isHoneypot;
          const isPending = !token.taxKnown && !isScrap;
          const cardClass = isScrap ? 'card-rejected' : isPending ? 'card-pending' : 'card-passed';
          return (
            <div key={idx} className={`token-card animate-slide-in ${cardClass} ${token.isHistorical ? 'card-historical' : ''}`} onClick={() => setSelectedToken(token)} style={{ cursor: 'pointer' }}>

              {/* HEADER */}
              <div className="card-header">
                <div className="header-left">
                  <img
                    src={token.realLogo || `https://api.dicebear.com/9.x/shapes/svg?seed=${token.tokenAddress}`}
                    alt="logo"
                    className="token-logo"
                    onError={e => { e.target.src = `https://api.dicebear.com/9.x/shapes/svg?seed=${token.tokenAddress}`; }}
                  />
                  <div>
                    <span className="token-name">{token.tokenName}</span>
                    {token.tokenSymbol !== token.tokenName && (
                      <span className="token-symbol"> ${token.tokenSymbol}</span>
                    )}
                    <div className="token-addr">{token.tokenAddress?.slice(0,10)}...{token.tokenAddress?.slice(-6)}</div>
                  </div>
                </div>
                <div className="header-right">
                  <span className="timestamp-badge">
                    {token.isHistorical ? '📦 STORICO' : `⏱ ${token.timestamp}`} · #{token.block}
                  </span>
                  <a href={`https://bscscan.com/tx/${token.txHash}`} target="_blank" rel="noreferrer" className="tx-link" onClick={e => e.stopPropagation()}>TX ↗</a>
                </div>
              </div>

              {/* PHASES */}
              <div className="phases-grid">

                {/* FASE 1: TAX */}
                <div className="phase-box">
                  <div className="phase-title text-cyan"><Shield size={12} className="mr-1"/>FASE 1 · TAX</div>
                  {token.isHoneypot ? (
                    <div className="text-red font-bold text-xs">
                      <ShieldAlert size={11} className="inline-icon mr-1"/>
                      🚨 HONEYPOT!
                    </div>
                  ) : !token.taxKnown ? (
                    <div className="text-yellow text-xs font-bold">⚠️ Tax non rilevata<br/><span className="text-muted font-normal">Verifica su Flap</span></div>
                  ) : token.isHighTax ? (
                    <div className="text-red font-bold text-xs">
                      <ShieldAlert size={11} className="inline-icon mr-1"/>
                      SCARTO: {token.buyTax}%/{token.sellTax}%
                    </div>
                  ) : (
                    <div className="text-green font-bold text-xs">
                      <CheckCircle size={11} className="inline-icon mr-1"/>
                      {token.buyTax}% buy / {token.sellTax}% sell
                    </div>
                  )}
                </div>

                {/* FASE 2: SOCIAL */}
                <div className="phase-box">
                  <div className="phase-title text-purple"><Search size={12} className="mr-1"/>FASE 2 · SOCIAL</div>
                  {token.hasSocialClone ? (
                    <div className="text-red font-bold text-xs mb-1">
                      <ShieldAlert size={11} className="inline-icon mr-1"/>🚨 SOCIAL FALSI
                    </div>
                  ) : token.isStealth ? (
                    <div className="text-green font-bold text-xs mb-1">
                      <Target size={11} className="inline-icon mr-1"/>STEALTH LAUNCH
                    </div>
                  ) : (
                    <div className="social-badges">
                      {token.hasTelegram && (
                        <a href={token.tgUrl} target="_blank" rel="noreferrer" className="badge-link badge-green" onClick={e => e.stopPropagation()}>TG ↗</a>
                      )}
                      {token.hasTwitter && (
                        <a href={token.xUrl} target="_blank" rel="noreferrer" className="badge-link badge-blue" onClick={e => e.stopPropagation()}>X ↗</a>
                      )}
                      {token.websiteUrl && (
                        <a href={token.websiteUrl} target="_blank" rel="noreferrer" className="badge-link badge-cyan" onClick={e => e.stopPropagation()}>WEB ↗</a>
                      )}
                    </div>
                  )}
                  <div className={`text-xs mt-1 ${
                    (token.webStatus||"").includes('SCARTO') ? 'text-red font-bold' :
                    token.hasSocialClone ? 'text-red font-bold' :
                    (token.webStatus||"").includes('⚠️') ? 'text-yellow' : 'text-muted'
                  }`}>
                    {token.webStatus}
                  </div>
                </div>

                {/* FASE 4: DEV */}
                <div className="phase-box">
                  <div className="phase-title text-red"><Network size={12} className="mr-1"/>FASE 4 · DEV</div>
                  <a href={`https://gmgn.ai/bsc/address/${token.creator}`} target="_blank" rel="noreferrer" className="text-purple text-xs hover-underline font-mono" onClick={e => e.stopPropagation()}>
                    {token.creator?.slice(0,10)}...{token.creator?.slice(-4)} ↗
                  </a>
                  <div className={`text-xs font-bold mt-1 ${token.pastScamsCount > 0 || (token.creatorCreatedCount || 0) > 5 ? 'text-red' : 'text-green'}`}>
                    {token.devClusterHistory}
                    {token.creatorCreatedCount !== undefined && ` (Lanci: ${token.creatorCreatedCount})`}
                  </div>
                  {token.funderText && <div className="text-xs text-muted mt-1 font-mono">{token.funderText}</div>}
                </div>

                {/* FASE 5: GMGN METRICHE */}
                <div className="phase-box">
                  <div className="phase-title text-yellow"><Activity size={12} className="mr-1"/>GMGN METRICHE</div>
                  <div className="text-xs text-muted leading-relaxed font-mono">
                    Smart: <span className="text-bright font-bold">{token.smartMoneyCount || 0}</span> · KOL: <span className="text-bright font-bold">{token.kolCount || 0}</span><br/>
                    Whale: <span className="text-bright font-bold">{token.whaleCount || 0}</span> · Snip: <span className="text-bright font-bold">{token.sniperCount || 0}</span><br/>
                    💧 Liq: <span className="text-cyan font-bold">{token.liquidityUsd ? `$${parseFloat(token.liquidityUsd).toLocaleString('en-US', {maximumFractionDigits:0})}` : 'N/D'}</span>
                  </div>
                </div>

                {/* FASE 3: TAX IMPL */}
                <div className="phase-box">
                  <div className="phase-title text-bright"><Brain size={12} className="mr-1"/>FASE 3 · TAX IMPL</div>
                  <div className={`text-xs font-bold mb-2 ${
                    token.taxInnovation?.startsWith('🆕') ? 'text-green' :
                    token.taxInnovation?.startsWith('🚀') ? 'text-cyan' :
                    token.taxInnovation?.startsWith('🔁') ? 'text-red' : 'text-yellow'
                  }`}>{token.taxInnovation}</div>
                  <div className="link-row">
                    <a href={`https://flap.sh/bnb/${token.tokenAddress}`} target="_blank" rel="noreferrer" className="chip-link chip-cyan" onClick={e => e.stopPropagation()}>Flap ↗</a>
                    <a href={`https://gmgn.ai/bsc/token/${token.tokenAddress}`} target="_blank" rel="noreferrer" className="chip-link chip-muted" onClick={e => e.stopPropagation()}>GMGN ↗</a>
                  </div>
                </div>

              </div>
              
              {/* CLICK DETTAGLIO INDICATOR */}
              <div className="card-action-bar">
                <span className="action-text">
                  {isPending ? '⏳ ANALISI DI SICUREZZA IN CORSO...' : '🔍 ANALISI METRICHE E FAI FAST SWAP'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {selectedToken && (
        <TokenDetailModal
          token={selectedToken}
          onClose={() => setSelectedToken(null)}
        />
      )}
    </div>
  );
};

export default Scanner;
