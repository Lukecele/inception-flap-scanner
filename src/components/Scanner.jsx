import React, { useState, useEffect, useRef } from 'react';
import { Shield, ShieldAlert, Network, CheckCircle, Search, Brain, Zap, Target, Activity, ChevronRight } from 'lucide-react';
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

const SYSTEM_DOMAINS = [
  'flap.sh','binance.com','mypinata.cloud','w3.org','bscscan.com',
  'warpcast.com','taxed.fun','debox.pro','allnodes.com','publicnode.com',
  'flapdotsh',
];

const STANDARD_IMPLS = [
  '0x024f18294970b5c76c0691b87f138a0317156422',
  '0x29e6383f0ce68507b5a72a53c2b118a118332aa8'
];

const formatTimeAgo = (unixSec) => {
  if (!unixSec) return 'Just now';
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000 - unixSec));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
};

const implSeenCount = {};
const socialRegistry = {};

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
}

seedSocialRegistry(historicalTokensData);

let rpcIndex = 0;
function getProvider() {
  return new ethers.JsonRpcProvider(RPC_NODES[rpcIndex]);
}
function rotateRpc() {
  rpcIndex = (rpcIndex + 1) % RPC_NODES.length;
}

async function safeCall(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const p = getProvider();
      return await fn(p);
    } catch (err) {
      rotateRpc();
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}

const Scanner = () => {
  const [tokens, setTokens] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const processedTokens = useRef(new Set());
  const isPolling = useRef(false);

  const checkSocialClone = (url, tokenAddr) => {
    if (!url) return null;
    const key = url.trim().toLowerCase().split('?')[0];
    if (key.includes('t.me/flap') || key.includes('x.com/flap') || key.includes('flap.sh') || key.length < 15) return null;

    const POPULAR_SOCIALS_BLACKLIST = [
      'pepecoineth', 'pepe.vip', 'shibtoken', 'shib.io', 'dogecoin', 'dogecoin.com',
      'pancakeswap', 'babydogecoin', 'floki', 'floki.com', 'binance', 'cz_binance',
      'vitalikbuterin', 'ethereum', 'solana', 'tether', 'usdt', 'circle', 'usdc',
      'avax', 'avalanche', 'arbitrum', 'optimism', 'polygon', 'matic', 'uniswap',
      'jupiterexchange', 'jup.ag', 'raydium', 'orca_so', 'bonk_inu', 'wif', 'dogwifhat'
    ];
    if (POPULAR_SOCIALS_BLACKLIST.some(term => key.includes(term))) {
      return '0x_famous_project_copycat';
    }

    if (socialRegistry[key] && socialRegistry[key] !== tokenAddr.toLowerCase()) {
      return socialRegistry[key];
    }
    socialRegistry[key] = tokenAddr.toLowerCase();
    return null;
  };

  const enrichNewToken = async (rawToken) => {
    const addr = rawToken.tokenAddress;
    const tokenKey = addr.toLowerCase();
    const trueDev = rawToken.creator || "0x0000000000000000000000000000000000000000";

    // STRICT EXCLUSION: If tax > 9%, discard token before running further operations
    if ((rawToken.buyTax && rawToken.buyTax > 9) || (rawToken.sellTax && rawToken.sellTax > 9)) {
      return;
    }

    const tgCloneOf = checkSocialClone(rawToken.tgUrl, addr);
    const xCloneOf = checkSocialClone(rawToken.xUrl, addr);
    const webCloneOf = checkSocialClone(rawToken.websiteUrl, addr);
    
    let hasSocialClone = !!(tgCloneOf || xCloneOf || webCloneOf);
    let cloneWarning = null;
    if (hasSocialClone) {
      cloneWarning = (tgCloneOf === '0x_famous_project_copycat' || xCloneOf === '0x_famous_project_copycat')
        ? `🚨 FAMOUS PROJECT CLONE (TRAP)!`
        : `🚨 Socials cloned from ${ (tgCloneOf || xCloneOf || webCloneOf).slice(0, 10) }...`;
    }

    const createdTimestamp = rawToken.createdTimestamp || Math.floor(Date.now() / 1000);

    let enrichedToken = {
      ...rawToken,
      createdTimestamp,
      taxInnovation: "Analyzing contract...",
      devClusterHistory: "Analyzing BscScan...",
      pastScamsCount: 0,
      funderText: "",
      hasSocialClone,
      cloneWarning,
      webStatus: rawToken.isStealth ? "No public socials" : (cloneWarning || "✅ Verified socials"),
      timestamp: formatTimeAgo(createdTimestamp)
    };

    setTokens(prev => {
      const map = new Map();
      prev.forEach(t => map.set(t.tokenAddress.toLowerCase(), t));
      if (!map.has(tokenKey)) {
        map.set(tokenKey, enrichedToken);
      }
      return Array.from(map.values())
        .sort((a, b) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0))
        .slice(0, 100);
    });

    // PHASE 3 · TAX IMPL
    let taxInnovation = "Standard (No Tax)";
    if (rawToken.buyTax > 0 || rawToken.sellTax > 0) {
      taxInnovation = "Contract read unavailable";
      const code = await safeCall(p => p.getCode(addr));
      if (code && code.startsWith("0x363d3d373d3d3d363d73")) {
        const impl = "0x" + code.slice(22, 62).toLowerCase();
        if (STANDARD_IMPLS.includes(impl)) {
          taxInnovation = `🔁 Standard Flap Proxy (${impl.slice(0, 10)}...)`;
        } else {
          implSeenCount[impl] = (implSeenCount[impl] || 0) + 1;
          taxInnovation = `🆕 Custom Flap Proxy (${impl.slice(0, 10)}...) — Suspicious!`;
        }
      } else if (code && code.length > 10) {
        taxInnovation = "🚀 Native Contract — Clean Deployment";
      }
    }

    // PHASE 4 · DEV CLUSTERING
    let devClusterHistory = "Dev analysis unavailable";
    let funderText = "";
    let pastScamsCount = 0;
    let bscScanSuccess = false;

    try {
      const scanRes = await fetch(`https://api.bscscan.com/api?module=account&action=txlist&address=${trueDev}&startblock=0&endblock=99999999&page=1&offset=2&sort=asc`);
      if (scanRes.ok) {
        const scanData = await scanRes.json();
        if (scanData && scanData.status === "1" && scanData.result?.length > 0) {
          const funder = scanData.result[0].from?.toLowerCase() === trueDev.toLowerCase() ? scanData.result[0].to : scanData.result[0].from;
          const cnt = await safeCall(p => p.getTransactionCount(funder));
          if (cnt !== null && cnt !== undefined) {
            if (cnt > 1000) {
              devClusterHistory = "✅ Funder: Exchange/Bridge";
              funderText = `${funder.slice(0, 10)}...`;
            } else if (cnt > 20) {
              devClusterHistory = `🚨 Suspicious funder (${cnt} txs)`;
              pastScamsCount = cnt;
              funderText = `Scam cluster: ${funder.slice(0, 10)}...`;
            } else {
              devClusterHistory = `✅ Private wallet (${cnt} txs)`;
              funderText = `${funder.slice(0, 10)}...`;
            }
            bscScanSuccess = true;
          }
        }
      }
    } catch (_) {}

    if (!bscScanSuccess) {
      try {
        const cnt = await safeCall(p => p.getTransactionCount(trueDev));
        if (cnt !== null && cnt !== undefined) {
          devClusterHistory = cnt > 10 ? `🚨 Serial deployer (${cnt} TX)` : `✅ New deployer (${cnt} TX)`;
          pastScamsCount = cnt > 10 ? cnt : 0;
        }
      } catch (_) {}
    }

    setTokens(prev => {
      return prev.map(t => {
        if (t.tokenAddress?.toLowerCase() === tokenKey) {
          const webStatus = t.isStealth ? "No public socials" : (cloneWarning || "✅ Verified socials");
          return {
            ...t,
            taxInnovation,
            devClusterHistory,
            funderText,
            pastScamsCount,
            webStatus
          };
        }
        return t;
      }).sort((a, b) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0));
    });
  };

  const fetchLiveLaunches = async () => {
    try {
      const res = await fetch('/api/gmgn/launches');
      const data = await res.json();
      if (data.success && Array.isArray(data.tokens)) {
        setIsConnected(true);
        for (const token of data.tokens) {
          const addrKey = token.tokenAddress?.toLowerCase();
          if (!addrKey) continue;

          if (!processedTokens.current.has(addrKey)) {
            processedTokens.current.add(addrKey);
            enrichNewToken(token);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load stream launches:", err);
      setIsConnected(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetchLiveLaunches();

    const interval = setInterval(async () => {
      if (isPolling.current || !isMounted) return;
      isPolling.current = true;
      await fetchLiveLaunches();
      isPolling.current = false;
    }, 4000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const validTokens = tokens
    .filter(t => {
      const isBuyHigh = t.buyTax !== null && t.buyTax > 9;
      const isSellHigh = t.sellTax !== null && t.sellTax > 9;
      return !isBuyHigh && !isSellHigh;
    })
    .sort((a, b) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0));

  return (
    <div className="scanner-container">
      <div className="scanner-status">
        <div className={`status-dot ${isConnected ? 'active' : 'inactive'}`}></div>
        <span className="font-mono text-sm text-bright">
          {isConnected ? 'LIVE — GMGN STREAM (EXCLUDING TAX > 9%)' : 'CONNECTING STREAM...'}
        </span>
        <div className="filter-badge"><Zap size={11} className="mr-1 inline-icon"/>CENTAUR SCANNER</div>
        <button 
          onClick={() => {
            if (confirm("Reset token cache and reload live feed?")) {
              processedTokens.current = new Set();
              setTokens([]);
              fetchLiveLaunches();
            }
          }}
          className="reset-list-btn"
        >
          RESET STREAM
        </button>
        <span className="font-mono text-sm ml-auto text-cyan">AUDIT MODE ACTIVE</span>
      </div>

      {/* Visual Instruction Banner */}
      <div className="scanner-instruction-banner">
        <span className="instruction-icon">💡</span>
        <span className="instruction-text">
          <strong>INTERACTIVE FEED:</strong> Click any token card to view Flap Bonding Curve Telemetry, Live Chart & Deep Security Audit.
        </span>
        <span className="instruction-pill">CLICK CARD TO INSPECT</span>
      </div>

      <div className="token-list">
        {validTokens.length === 0 ? (
          <div className="empty-state font-mono text-muted">
            <Activity size={28} className="mb-2 opacity-50 pulse-icon text-cyan" />
            <p>Listening for new Flap launches...</p>
          </div>
        ) : validTokens.map((token, idx) => {
          const isScrap = token.pastScamsCount > 20 || token.hasSocialClone || 
                          token.isHoneypot || token.taxInnovation?.includes('Custom') || token.taxInnovation?.includes('Suspicious');
          const isPending = token.devClusterHistory === "Analyzing BscScan...";
          const cardClass = isScrap ? 'card-rejected' : isPending ? 'card-pending' : 'card-passed';
          
          return (
            <div key={idx} className={`token-card animate-slide-in ${cardClass}`} onClick={() => setSelectedToken(token)} role="button" tabIndex={0}>

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
                  <div className="header-meta-row">
                    <span className="timestamp-badge">
                      ⏱ {formatTimeAgo(token.createdTimestamp)} · 📦 {token.launchpadProgress && token.launchpadProgress >= 1 ? 'MIGRATED' : `${Math.round((token.launchpadProgress || 0) * 100)}% ON CURVE`}
                    </span>
                    <a href={`https://bscscan.com/token/${token.tokenAddress}`} target="_blank" rel="noreferrer" className="tx-link" onClick={e => e.stopPropagation()}>BscScan ↗</a>
                  </div>
                  <div className="card-inspect-pill" title="Click to view Bonding Curve & Security Details">
                    <span>INSPECT CURVE</span>
                    <ChevronRight size={13} className="pill-arrow" />
                  </div>
                </div>
              </div>

              <div className="phases-grid">
                <div className="phase-box">
                  <div className="phase-title text-cyan"><Shield size={12} className="mr-1"/>PHASE 1 · TAX</div>
                  {token.isHoneypot ? (
                    <div className="text-red font-bold text-xs"><ShieldAlert size={11} className="inline-icon mr-1"/>🚨 HONEYPOT!</div>
                  ) : token.buyTax === null ? (
                    <div className="text-yellow text-xs font-bold">⚠️ Calculating...</div>
                  ) : (
                    <div className="text-green font-bold text-xs">
                      <CheckCircle size={11} className="inline-icon mr-1"/>{token.buyTax}% buy / {token.sellTax}% sell
                    </div>
                  )}
                </div>

                <div className="phase-box">
                  <div className="phase-title text-purple"><Search size={12} className="mr-1"/>PHASE 2 · SOCIAL</div>
                  {token.hasSocialClone ? (
                    <div className="text-red font-bold text-xs mb-1"><ShieldAlert size={11} className="inline-icon mr-1"/>🚨 CLONED SOCIALS</div>
                  ) : token.isStealth ? (
                    <div className="text-green font-bold text-xs mb-1"><Target size={11} className="inline-icon mr-1"/>STEALTH LAUNCH</div>
                  ) : (
                    <div className="social-badges">
                      {token.tgUrl && <a href={token.tgUrl} target="_blank" rel="noreferrer" className="badge-link badge-green" onClick={e => e.stopPropagation()}>TG ↗</a>}
                      {token.hasTwitter && <a href={token.xUrl} target="_blank" rel="noreferrer" className="badge-link badge-blue" onClick={e => e.stopPropagation()}>X ↗</a>}
                      {token.websiteUrl && <a href={token.websiteUrl} target="_blank" rel="noreferrer" className="badge-link badge-cyan" onClick={e => e.stopPropagation()}>WEB ↗</a>}
                    </div>
                  )}
                  <div className={`text-xs mt-1 ${token.hasSocialClone ? 'text-red font-bold' : 'text-muted'}`}>
                    {token.webStatus}
                  </div>
                </div>

                <div className="phase-box">
                  <div className="phase-title text-red"><Network size={12} className="mr-1"/>PHASE 4 · DEV</div>
                  <a href={`https://gmgn.ai/bsc/address/${token.creator}`} target="_blank" rel="noreferrer" className="text-purple text-xs hover-underline font-mono" onClick={e => e.stopPropagation()}>
                    {token.creator?.slice(0,10)}...{token.creator?.slice(-4)} ↗
                  </a>
                  <div className={`text-xs font-bold mt-1 ${token.pastScamsCount > 20 ? 'text-red' : isPending ? 'text-yellow' : 'text-green'}`}>
                    {token.devClusterHistory}
                  </div>
                  {token.funderText && <div className="text-xs text-muted mt-1 font-mono">{token.funderText}</div>}
                </div>

                <div className="phase-box">
                  <div className="phase-title text-yellow"><Activity size={12} className="mr-1"/>GMGN METRICS</div>
                  <div className="text-xs text-muted leading-relaxed font-mono">
                    Smart: <span className="text-bright font-bold">{token.smartMoneyCount || 0}</span> · KOL: <span className="text-bright font-bold">{token.kolCount || 0}</span><br/>
                    Snip: <span className="text-bright font-bold">{token.sniperCount || 0}</span> · Prog: <span className="text-cyan font-bold">{token.launchpadProgress || 0}%</span><br/>
                    💧 Liq: <span className="text-cyan font-bold">${parseFloat(token.liquidityUsd || 0).toLocaleString('en-US', {maximumFractionDigits:0})}</span>
                  </div>
                </div>

                <div className="phase-box">
                  <div className="phase-title text-bright"><Brain size={12} className="mr-1"/>PHASE 3 · TAX IMPL</div>
                  <div className={`text-xs font-bold mb-2 ${
                    token.taxInnovation?.includes('🆕') || token.taxInnovation?.includes('🚀') ? 'text-cyan' :
                    token.taxInnovation?.includes('🔁') ? 'text-red' : 'text-yellow'
                  }`}>{token.taxInnovation}</div>
                  <div className="link-row">
                    <a href={`https://flap.sh/bnb/${token.tokenAddress}`} target="_blank" rel="noreferrer" className="chip-link chip-cyan" onClick={e => e.stopPropagation()}>Flap ↗</a>
                    <a href={`https://gmgn.ai/bsc/token/${token.tokenAddress}`} target="_blank" rel="noreferrer" className="chip-link chip-muted" onClick={e => e.stopPropagation()}>GMGN ↗</a>
                  </div>
                </div>

              </div>
              
              <div className="card-action-bar">
                <div className="action-bar-left">
                  <span className={`action-status-dot ${isScrap ? 'dot-danger' : isPending ? 'dot-pending' : 'dot-good'}`}></span>
                  <span className="action-text">
                    {isPending ? '⏳ ACQUIRING ANTI-SCAM SECURITY TELEMETRY...' : isScrap ? '🚨 ANOMALY DETECTED (CHECK AUDIT DETAILS)' : '✅ SECURITY AUDIT PASSED'}
                  </span>
                </div>
                <div className="action-bar-cta">
                  <span>CLICK TO VIEW CURVE & AUDIT</span>
                  <span className="action-cta-arrow">➔</span>
                </div>
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
