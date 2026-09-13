import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, X, ExternalLink, Activity, 
  Shield, ShieldAlert, CheckCircle, Copy, Check,
  TrendingUp, Layers, Users, Lock, AlertTriangle
} from 'lucide-react';
import './TokenDetailModal.css';

const TokenDetailModal = ({ token, onClose }) => {
  const [activeTab, setActiveTab] = useState('curve'); // 'curve' | 'audit'
  const isOnCurve = token.launchpadProgress !== undefined && token.launchpadProgress < 1;
  const [chartMode, setChartMode] = useState(isOnCurve ? 'curve' : 'dexscreener');
  const [copied, setCopied] = useState(false);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const copyAddress = () => {
    if (token?.tokenAddress) {
      navigator.clipboard.writeText(token.tokenAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const curvePercent = token.launchpadProgress !== undefined
    ? Math.min(100, Math.max(0, Math.round(token.launchpadProgress * 100)))
    : 0;

  const dexscreenerUrl = `https://dexscreener.com/bsc/${token.tokenAddress}?embed=1&theme=dark&trades=0&info=0`;

  return (
    <div className="detail-modal-overlay" onClick={onClose}>
      <div className="detail-modal-card" onClick={e => e.stopPropagation()}>
        
        {/* Top Navigation Bar: Guaranteed visible, dedicated Back button */}
        <div className="modal-top-nav-bar">
          <button className="back-to-scanner-btn" onClick={onClose} title="Back to Scanner Feed">
            <ArrowLeft size={16} />
            <span>← BACK TO SCANNER FEED</span>
          </button>
          
          <div className="top-nav-actions">
            <span className="esc-key-hint font-mono">ESC</span>
            <button className="modal-close-icon" onClick={onClose} title="Close modal (Esc)">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Token Identity Banner */}
        <div className="modal-token-banner">
          <div className="banner-left">
            <img
              src={token.realLogo || `https://api.dicebear.com/9.x/shapes/svg?seed=${token.tokenAddress}`}
              alt={token.tokenSymbol}
              className="modal-token-logo"
              onError={e => { e.target.src = `https://api.dicebear.com/9.x/shapes/svg?seed=${token.tokenAddress}`; }}
            />
            
            <div className="modal-title-box">
              <h2 className="modal-token-name">
                {token.tokenName}
                {token.tokenSymbol && (
                  <span className="token-symbol-badge"> ${token.tokenSymbol}</span>
                )}
              </h2>
              <div className="modal-token-addr">
                <span title={token.tokenAddress}>
                  {token.tokenAddress ? `${token.tokenAddress.slice(0, 8)}…${token.tokenAddress.slice(-6)}` : ''}
                </span>
                <button className="copy-btn" onClick={copyAddress} title="Copy Address">
                  {copied ? <Check size={11} color="var(--accent-green)" /> : <Copy size={11} />}
                </button>
                <a
                  href={`https://bscscan.com/token/${token.tokenAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="addr-link"
                  title="View on BscScan"
                >
                  <ExternalLink size={11} />
                </a>
              </div>
            </div>
          </div>

          <div className="banner-right">
            {isOnCurve ? (
              <span className="curve-status-chip on-curve">
                🚀 ON FLAP CURVE ({curvePercent}%)
              </span>
            ) : (
              <span className="curve-status-chip migrated">
                ✅ MIGRATED TO DEX
              </span>
            )}

            <a
              href={`https://flap.sh/bnb/${token.tokenAddress}`}
              target="_blank"
              rel="noreferrer"
              className="header-trade-cta"
            >
              <span>Trade on Flap.sh</span>
              <ExternalLink size={13} />
            </a>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="modal-tab-selector">
          <button
            className={`tab-btn ${activeTab === 'curve' ? 'active' : ''}`}
            onClick={() => setActiveTab('curve')}
          >
            <TrendingUp size={13} style={{ marginRight: 6 }} />
            📈 BONDING CURVE & CHART
          </button>
          <button
            className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            <Shield size={13} style={{ marginRight: 6 }} />
            🛡️ SECURITY AUDIT
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body-content">
          {activeTab === 'curve' && (
            <div className="tab-pane curve-pane">
              
              {/* Bonding Curve Telemetry Banner */}
              <div className="curve-telemetry-banner">
                <div className="curve-banner-header">
                  <div>
                    <span className="curve-title">FLAP.SH BONDING CURVE TELEMETRY</span>
                    <p className="curve-desc">
                      {isOnCurve 
                        ? 'Token is accumulating liquidity on Flap.sh bonding curve before DEX listing.'
                        : 'Bonding curve 100% completed. Liquidity has been seeded to PancakeSwap DEX.'}
                    </p>
                  </div>
                  <div className="curve-percent-badge font-mono">
                    {curvePercent}% <span className="curve-percent-sub">TO DEX</span>
                  </div>
                </div>

                <div className="curve-progress-bar-bg">
                  <div 
                    className="curve-progress-bar-fill" 
                    style={{ width: `${Math.max(4, curvePercent)}%` }}
                  />
                </div>

                {/* Key Metrics Grid */}
                <div className="curve-stats-grid">
                  <div className="curve-stat-card">
                    <span className="stat-label">MARKET CAP</span>
                    <span className="stat-value font-mono text-cyan">
                      {token.marketCapUsd ? `$${Number(token.marketCapUsd).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : 'N/A'}
                    </span>
                  </div>
                  <div className="curve-stat-card">
                    <span className="stat-label">CURVE LIQUIDITY</span>
                    <span className="stat-value font-mono text-green">
                      {token.liquidityUsd ? `$${Number(token.liquidityUsd).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : 'N/A'}
                    </span>
                  </div>
                  <div className="curve-stat-card">
                    <span className="stat-label">TOP 10 HOLDERS</span>
                    <span className="stat-value font-mono">
                      {token.top10HolderRate ? `${(Number(token.top10HolderRate) * 100).toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="curve-stat-card">
                    <span className="stat-label">DEV HOLDING</span>
                    <span className="stat-value font-mono">
                      {token.creatorHoldRate !== undefined ? `${(Number(token.creatorHoldRate) * 100).toFixed(2)}%` : '0%'}
                    </span>
                  </div>
                </div>

                {/* Primary CTA Button */}
                <div className="curve-actions-row">
                  <a
                    href={`https://flap.sh/bnb/${token.tokenAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="curve-primary-btn"
                  >
                    🚀 TRADE ON FLAP.SH OFFICIAL PORTAL ↗
                  </a>
                  {chartMode === 'curve' ? (
                    <button
                      className="curve-secondary-btn"
                      onClick={() => setChartMode('dexscreener')}
                    >
                      📊 View DexScreener Chart
                    </button>
                  ) : (
                    <button
                      className="curve-secondary-btn"
                      onClick={() => setChartMode('curve')}
                    >
                      🔄 Back to Curve Telemetry
                    </button>
                  )}
                </div>
              </div>

              {/* Chart embed if user toggles or if migrated */}
              {chartMode === 'dexscreener' && (
                <div className="chart-embed-wrapper">
                  <iframe
                    src={dexscreenerUrl}
                    title="DexScreener Chart"
                    className="chart-iframe"
                    loading="lazy"
                  />
                </div>
              )}

              {/* Quick Links Row */}
              <div className="quick-links-bar">
                <span className="quick-links-label">Direct Explorers:</span>
                <a 
                  href={`https://flap.sh/bnb/${token.tokenAddress}`} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="quick-chip"
                >
                  🚀 Flap.sh ↗
                </a>
                <a 
                  href={`https://dexscreener.com/bsc/${token.tokenAddress}`} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="quick-chip"
                >
                  📊 DexScreener ↗
                </a>
                <a 
                  href={`https://gmgn.ai/bsc/token/${token.tokenAddress}`} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="quick-chip"
                >
                  📈 GMGN.ai ↗
                </a>
                <a 
                  href={`https://bscscan.com/token/${token.tokenAddress}`} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="quick-chip"
                >
                  🔍 BscScan Token ↗
                </a>
                {token.creator && (
                  <a 
                    href={`https://bscscan.com/address/${token.creator}`} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="quick-chip"
                  >
                    👨‍💻 Deployer BscScan ↗
                  </a>
                )}
              </div>

            </div>
          )}

          {activeTab === 'audit' && (
            <div className="tab-pane audit-pane">
              <div className="audit-header-summary">
                <h3 className="audit-summary-title">
                  <Shield size={18} className="text-cyan" />
                  AUTOMATED CONTRACT & DEV AUDIT REPORT
                </h3>
                <p className="audit-summary-desc">
                  Real-time algorithmic checks analyzing smart contract bytecode, transaction clustering, dev funding origins, and anti-honeypot safeties.
                </p>
              </div>

              <div className="audit-grid">
                {/* 1. Contract Bytecode Audit */}
                <div className="audit-card">
                  <div className="audit-card-top">
                    <span className="audit-card-title">1. BYTECODE & PROXY INTEGRITY</span>
                    <span className={`audit-badge ${token.taxInnovation?.includes('Custom') || token.taxInnovation?.includes('Suspicious') ? 'badge-warn' : 'badge-good'}`}>
                      {token.taxInnovation?.includes('Custom') || token.taxInnovation?.includes('Suspicious') ? '⚠️ SUSPICIOUS' : '✅ VERIFIED'}
                    </span>
                  </div>
                  <div className="audit-card-body">
                    <div className="audit-row">
                      <span className="lbl">Architecture:</span>
                      <span className="val text-bright font-bold">{token.taxInnovation || 'Standard Flap Proxy'}</span>
                    </div>
                    <div className="audit-row">
                      <span className="lbl">Proxy Type:</span>
                      <span className={`val font-bold ${token.taxInnovation?.includes('Custom') ? 'text-red' : 'text-green'}`}>
                        {token.taxInnovation?.includes('Custom') ? 'Non-Standard Minimal Proxy' : 'Official ERC-1167 Flap Implementation'}
                      </span>
                    </div>
                    <div className="audit-row">
                      <span className="lbl">Honeypot Detected:</span>
                      <span className={`val font-bold ${token.isHoneypot ? 'text-red' : 'text-green'}`}>
                        {token.isHoneypot ? '🚨 YES — High Honeypot Risk' : '✅ NO — Standard Transferability'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Dev Wallet Clustering */}
                <div className="audit-card">
                  <div className="audit-card-top">
                    <span className="audit-card-title">2. DEV ON-CHAIN CLUSTERING</span>
                    <span className={`audit-badge ${(token.pastScamsCount && token.pastScamsCount > 20) ? 'badge-danger' : 'badge-good'}`}>
                      {(token.pastScamsCount && token.pastScamsCount > 20) ? '🚨 HIGH RISK' : '✅ CLEAN'}
                    </span>
                  </div>
                  <div className="audit-card-body">
                    <div className="audit-row">
                      <span className="lbl">Deployer Cluster:</span>
                      <span className="val text-bright font-bold">{token.devClusterHistory || 'Private Wallet'}</span>
                    </div>
                    <div className="audit-row">
                      <span className="lbl">Funding Source:</span>
                      <span className="val text-cyan">{token.funderText || 'Exchange / Private'}</span>
                    </div>
                    <div className="audit-row">
                      <span className="lbl">Serial Launches:</span>
                      <span className="val font-mono">{token.creatorCreatedCount ? `${token.creatorCreatedCount} previous tokens` : '1st Launch'}</span>
                    </div>
                  </div>
                </div>

                {/* 3. Tax & Safeties */}
                <div className="audit-card">
                  <div className="audit-card-top">
                    <span className="audit-card-title">3. TAX & HONEYPOT SAFEGUARD</span>
                    <span className={`audit-badge ${((token.buyTax && token.buyTax > 9) || (token.sellTax && token.sellTax > 9)) ? 'badge-danger' : 'badge-good'}`}>
                      {((token.buyTax && token.buyTax > 9) || (token.sellTax && token.sellTax > 9)) ? '🚨 PREDATORY' : '✅ SAFE (<9%)'}
                    </span>
                  </div>
                  <div className="audit-card-body">
                    <div className="audit-row">
                      <span className="lbl">Buy Tax:</span>
                      <span className="val font-mono text-bright">{token.buyTax !== null && token.buyTax !== undefined ? `${token.buyTax}%` : '0%'}</span>
                    </div>
                    <div className="audit-row">
                      <span className="lbl">Sell Tax:</span>
                      <span className="val font-mono text-bright">{token.sellTax !== null && token.sellTax !== undefined ? `${token.sellTax}%` : '0%'}</span>
                    </div>
                    <div className="audit-row">
                      <span className="lbl">Dev Token Hold:</span>
                      <span className="val font-mono text-bright">{token.creatorHoldRate ? `${(token.creatorHoldRate * 100).toFixed(2)}%` : '0%'}</span>
                    </div>
                  </div>
                </div>

                {/* 4. Social & Phishing Checks */}
                <div className="audit-card">
                  <div className="audit-card-top">
                    <span className="audit-card-title">4. SOCIAL CLONE & PHISHING</span>
                    <span className={`audit-badge ${token.hasSocialClone ? 'badge-danger' : 'badge-good'}`}>
                      {token.hasSocialClone ? '🚨 CLONE DETECTED' : '✅ ORIGINAL'}
                    </span>
                  </div>
                  <div className="audit-card-body">
                    <div className="audit-row">
                      <span className="lbl">Social Status:</span>
                      <span className="val text-bright">{token.webStatus || 'No Public Socials'}</span>
                    </div>
                    <div className="audit-row">
                      <span className="lbl">Telegram:</span>
                      <span className="val">{token.tgUrl ? <a href={token.tgUrl} target="_blank" rel="noreferrer" className="text-cyan">Joined ↗</a> : 'None'}</span>
                    </div>
                    <div className="audit-row">
                      <span className="lbl">Twitter / X:</span>
                      <span className="val">{token.xUrl ? <a href={token.xUrl} target="_blank" rel="noreferrer" className="text-cyan">Linked ↗</a> : 'None'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Return Bar for Easy Dismissal */}
        <div className="modal-bottom-return-bar">
          <button className="bottom-back-btn" onClick={onClose} title="Return to Live Scanner Feed">
            <ArrowLeft size={15} />
            <span>← Return to Live Scanner Feed</span>
          </button>
          <span className="bottom-esc-hint font-mono">Press ESC or click outside to dismiss</span>
        </div>

      </div>
    </div>
  );
};

export default TokenDetailModal;
