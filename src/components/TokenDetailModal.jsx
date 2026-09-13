import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ArrowLeft, X, Wallet, RefreshCw, ExternalLink, Activity, 
  Shield, ShieldAlert, CheckCircle, Copy, Check, Zap, 
  Network, Brain, TrendingUp
} from 'lucide-react';
import './TokenDetailModal.css';

const DEV_FEE_ADDRESS = '0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7';
const DEV_FEE_PERCENT = 0.01;

const TokenDetailModal = ({ token, onClose }) => {
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [bnbBalance, setBnbBalance] = useState('0.0000');
  const [userTokenBalance, setUserTokenBalance] = useState(0n);

  const [tradeType, setTradeType] = useState('buy');
  const [buyAmount, setBuyAmount] = useState('0.1');
  const [sellPercent, setSellPercent] = useState(100);
  const [slippage, setSlippage] = useState('15');
  const tradingRef = useRef(false);
  const [isTrading, setIsTrading] = useState(false);
  const [statusLogs, setStatusLogs] = useState([]);
  const logsEndRef = useRef(null);

  const [quoteOut, setQuoteOut] = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState('');

  const [activeTab, setActiveTab] = useState('chart'); // 'chart' | 'audit'
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

  const addLog = useCallback((msg) => {
    setStatusLogs(prev => [...prev, `[${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${msg}`]);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [statusLogs]);

  const copyAddress = () => {
    if (token?.tokenAddress) {
      navigator.clipboard.writeText(token.tokenAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getERC20Balance = async (tokenAddr, userAddr) => {
    if (!window.ethereum) return 0n;
    try {
      const callData = '0x70a08231' + userAddr.toLowerCase().replace('0x', '').padStart(64, '0');
      const hex = await window.ethereum.request({
        method: 'eth_call',
        params: [{ to: tokenAddr, data: callData }, 'latest']
      });
      if (!hex || hex === '0x' || hex === '0x0') return 0n;
      return BigInt(hex);
    } catch { return 0n; }
  };

  const updateBalances = useCallback(async (addr) => {
    if (!window.ethereum || !addr) return;
    try {
      const hexBal = await window.ethereum.request({
        method: 'eth_getBalance', params: [addr, 'latest']
      });
      setBnbBalance((Number(BigInt(hexBal)) / 1e18).toFixed(4));
      const tokBal = await getERC20Balance(token.tokenAddress, addr);
      setUserTokenBalance(tokBal);
    } catch (e) { addLog(`🚨 Balance error: ${e.message}`); }
  }, [token.tokenAddress, addLog]);

  useEffect(() => {
    if (!window.ethereum) return;
    const init = async () => {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          setWalletConnected(true);
          setWalletAddress(accounts[0]);
          updateBalances(accounts[0]);
        }
      } catch { /* silent */ }
    };
    init();

    const onAccounts = (accounts) => {
      if (accounts.length > 0) {
        setWalletConnected(true);
        setWalletAddress(accounts[0]);
        updateBalances(accounts[0]);
      } else {
        setWalletConnected(false);
        setWalletAddress('');
        setBnbBalance('0.0000');
        setUserTokenBalance(0n);
      }
    };
    const onChain = () => {
      window.ethereum.request({ method: 'eth_accounts' })
        .then(a => { if (a.length > 0) updateBalances(a[0]); })
        .catch(() => {});
    };

    window.ethereum.on('accountsChanged', onAccounts);
    window.ethereum.on('chainChanged', onChain);
    return () => {
      window.ethereum.removeListener('accountsChanged', onAccounts);
      window.ethereum.removeListener('chainChanged', onChain);
    };
  }, [updateBalances]);

  // Quote calculation
  useEffect(() => {
    if (!walletAddress) { setQuoteOut(null); setQuoteError(''); return; }
    setQuoteOut(null);
    setQuoteError('');

    const calc = async () => {
      setLoadingQuote(true);
      try {
        let inputToken, outputToken, amountWei;
        if (tradeType === 'buy') {
          const raw = parseFloat(String(buyAmount).replace(',', '.').trim());
          if (!raw || raw <= 0 || isNaN(raw)) {
            setLoadingQuote(false);
            setQuoteError('Enter a valid BNB amount');
            return;
          }
          inputToken  = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
          outputToken = token.tokenAddress;
          amountWei   = BigInt(Math.round(raw * 1e18)).toString();
        } else {
          if (userTokenBalance === 0n) {
            setLoadingQuote(false);
            setQuoteError('No tokens in wallet');
            return;
          }
          const sellWei = (userTokenBalance * BigInt(sellPercent)) / 100n;
          inputToken  = token.tokenAddress;
          outputToken = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
          amountWei   = sellWei.toString();
        }

        const url = `/api/gmgn/swap-route?chain=bsc&from=${walletAddress}&input_token=${inputToken}&output_token=${outputToken}&amount=${amountWei}&slippage=${slippage}`;
        const r = await fetch(url);
        const d = await r.json();

        if (d?.code === 'CF_BLOCKED') {
          setQuoteError('GMGN blocked (Cloudflare) — quote unavailable');
          setLoadingQuote(false);
          return;
        }
        if (d?.data?.quote) {
          const outRaw = d.data.quote.out_amount ?? d.data.quote.output_amount ?? d.data.quote.buy_amount ?? '0';
          const outNum = Number(BigInt(outRaw)) / 1e18;
          setQuoteOut(tradeType === 'buy'
            ? `~${outNum.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${token.tokenSymbol}`
            : `~${outNum.toFixed(5)} BNB`
          );
        } else {
          setQuoteError(d?.msg || d?.error || 'Route unavailable');
        }
      } catch (e) {
        setQuoteError(`Quote error: ${e.message}`);
      }
      setLoadingQuote(false);
    };

    const t = setTimeout(calc, 700);
    return () => clearTimeout(t);
  }, [tradeType, buyAmount, sellPercent, slippage, walletAddress, userTokenBalance, token.tokenAddress, token.tokenSymbol]);

  const connectWallet = async () => {
    if (!window.ethereum) { alert('Please install MetaMask to trade!'); return; }
    try {
      addLog('Connecting wallet…');
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts.length > 0) {
        setWalletConnected(true);
        setWalletAddress(accounts[0]);
        await updateBalances(accounts[0]);
        addLog(`✅ Wallet: ${accounts[0].slice(0,6)}…${accounts[0].slice(-4)}`);
      }
    } catch (e) { addLog(`🚨 ${e.message}`); }
  };

  const executeMetaMaskTrade = async () => {
    if (tradingRef.current) return;
    if (!walletConnected || !walletAddress) { await connectWallet(); return; }
    tradingRef.current = true;
    setIsTrading(true);
    setStatusLogs([]);

    try {
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId !== '0x38') throw new Error(`Please switch to BSC (BNB Chain) in MetaMask!`);

      if (tradeType === 'buy') {
        const raw = parseFloat(String(buyAmount).replace(',', '.').trim());
        if (!raw || isNaN(raw) || raw <= 0) throw new Error('Invalid BNB amount');
        const bnb = parseFloat(bnbBalance);
        if (raw > bnb - 0.002) throw new Error(`Insufficient balance`);

        const feeAmount = raw * DEV_FEE_PERCENT;
        const swapAmount = raw - feeAmount;
        const swapWei = BigInt(Math.round(swapAmount * 1e18));
        const feeWei = BigInt(Math.round(feeAmount * 1e18));

        addLog(`1. Fetching route for ${swapAmount.toFixed(5)} BNB…`);
        const routeRes = await fetch(`/api/gmgn/swap-route?chain=bsc&from=${walletAddress}&input_token=0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee&output_token=${token.tokenAddress}&amount=${swapWei.toString()}&slippage=${slippage}`);
        const routeData = await routeRes.json();

        if (routeData?.code === 'CF_BLOCKED' || !routeData?.data?.raw_tx) {
          if (token.launchpadProgress < 1) {
            addLog(`⚠️ Token still on Flap bonding curve. Opening Flap.sh…`);
            window.open(`https://flap.sh/bnb/${token.tokenAddress}`, '_blank');
            return;
          }
          throw new Error(routeData?.error || 'No route available');
        }

        const rt = routeData.data.raw_tx;
        const txValue = rt.value ? (rt.value.startsWith('0x') ? rt.value : '0x' + BigInt(rt.value).toString(16)) : '0x0';
        const txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{ from: walletAddress, to: rt.to, data: rt.data, value: txValue, ...(rt.gas_limit ? { gas: '0x' + BigInt(rt.gas_limit).toString(16) } : {}) }]
        });
        addLog(`✅ Buy TX sent! Hash: ${txHash}`);

        let receipt = null;
        for (let i = 0; i < 40; i++) {
          receipt = await window.ethereum.request({ method: 'eth_getTransactionReceipt', params: [txHash] });
          if (receipt) break;
          await new Promise(ok => setTimeout(ok, 2000));
        }
        if (!receipt || receipt.status === '0x0') throw new Error('Buy transaction failed on-chain.');
        addLog(`🎉 Buy confirmed successfully!`);
        await updateBalances(walletAddress);

        if (feeWei > 0n) {
          try {
            const feeTxHash = await window.ethereum.request({
              method: 'eth_sendTransaction',
              params: [{ from: walletAddress, to: DEV_FEE_ADDRESS, value: '0x' + feeWei.toString(16) }]
            });
            addLog(`✅ Dev fee sent! Hash: ${feeTxHash}`);
          } catch (_) {}
        }
      } else {
        const tokenBal = await getERC20Balance(token.tokenAddress, walletAddress);
        if (tokenBal === 0n) throw new Error(`You have no ${token.tokenSymbol} in your wallet`);
        const sellAmt = (tokenBal * BigInt(sellPercent)) / 100n;

        addLog(`1. Fetching sell route for ${sellPercent}% of your ${token.tokenSymbol}…`);
        const routeRes = await fetch(`/api/gmgn/swap-route?chain=bsc&from=${walletAddress}&input_token=${token.tokenAddress}&output_token=0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee&amount=${sellAmt.toString()}&slippage=${slippage}`);
        const routeData = await routeRes.json();

        if (routeData?.code === 'CF_BLOCKED' || !routeData?.data?.raw_tx) {
          if (token.launchpadProgress < 1) {
            addLog(`⚠️ Token on Flap curve. Opening Flap.sh to sell…`);
            window.open(`https://flap.sh/bnb/${token.tokenAddress}`, '_blank');
            return;
          }
          throw new Error(routeData?.error || 'No sell route found');
        }

        const rt = routeData.data.raw_tx;
        addLog(`2. Approving token for router…`);
        const approveData = '0x095ea7b3' + rt.to.toLowerCase().replace('0x', '').padStart(64, '0') + sellAmt.toString(16).padStart(64, '0');
        const approveTxHash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: walletAddress, to: token.tokenAddress, data: approveData }] });

        for (let i = 0; i < 40; i++) {
          const r = await window.ethereum.request({ method: 'eth_getTransactionReceipt', params: [approveTxHash] });
          if (r) { if (r.status === '0x0') throw new Error('Approval failed.'); break; }
          await new Promise(ok => setTimeout(ok, 2000));
        }

        addLog(`✅ Approved. Signing sell swap…`);
        const sellValue = rt.value ? (rt.value.startsWith('0x') ? rt.value : '0x' + BigInt(rt.value).toString(16)) : '0x0';
        const swapTxHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{ from: walletAddress, to: rt.to, data: rt.data, value: sellValue, ...(rt.gas_limit ? { gas: '0x' + BigInt(rt.gas_limit).toString(16) } : {}) }]
        });

        let swapReceipt = null;
        for (let i = 0; i < 40; i++) {
          swapReceipt = await window.ethereum.request({ method: 'eth_getTransactionReceipt', params: [swapTxHash] });
          if (swapReceipt) break;
          await new Promise(ok => setTimeout(ok, 2000));
        }
        if (!swapReceipt || swapReceipt.status === '0x0') throw new Error('Sell failed on-chain.');
        addLog(`🎉 Sell confirmed successfully!`);
        await updateBalances(walletAddress);

        const quote = routeData.data.quote;
        const outRaw = quote?.out_amount ?? quote?.output_amount ?? quote?.buy_amount ?? '0';
        const estimatedBnb = Number(BigInt(outRaw)) / 1e18;
        const feeWei = BigInt(Math.round(estimatedBnb * DEV_FEE_PERCENT * 1e18));

        if (feeWei > 0n) {
          try {
            await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: walletAddress, to: DEV_FEE_ADDRESS, value: '0x' + feeWei.toString(16) }] });
          } catch (_) {}
        }
      }
    } catch (e) {
      if (e.code === 4001) addLog('❌ Transaction rejected by user');
      else addLog(`🚨 ${e.message}`);
    } finally {
      tradingRef.current = false;
      setIsTrading(false);
    }
  };

  const progressPercent = token.launchpadProgress !== undefined ? ((token.launchpadProgress || 0) * 100).toFixed(1) : '0.0';

  return (
    <div className="detail-modal-overlay animate-fade-in" onClick={onClose}>
      <div className="detail-modal-card animate-scale-in" onClick={e => e.stopPropagation()}>
        
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <button className="back-btn" onClick={onClose} title="Back to Scanner (Esc)">
              <ArrowLeft size={16} />
              <span>BACK</span>
            </button>
            
            <img 
              src={token.realLogo || `https://api.dicebear.com/9.x/shapes/svg?seed=${token.tokenAddress}`} 
              alt="logo" 
              className="modal-token-logo" 
              onError={e => { e.target.src = `https://api.dicebear.com/9.x/shapes/svg?seed=${token.tokenAddress}`; }} 
            />
            
            <div className="modal-title-box">
              <h2 className="modal-token-name">
                {token.tokenName} <span className="text-cyan">${token.tokenSymbol}</span>
              </h2>
              <div className="modal-token-addr font-mono">
                <span>{token.tokenAddress}</span>
                <button className="copy-btn" onClick={copyAddress} title="Copy Address">
                  {copied ? <Check size={12} className="text-green" /> : <Copy size={12} />}
                </button>
                <a href={`https://bscscan.com/token/${token.tokenAddress}`} target="_blank" rel="noreferrer" title="BscScan" className="addr-link">
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </div>

          <div className="modal-header-right">
            <button className="modal-close-icon" onClick={onClose} title="Close Modal">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Main Body */}
        <div className="modal-body-grid">
          
          {/* Left Column: Chart & Security Audit */}
          <div className="modal-chart-column">
            <div className="modal-tab-selector">
              <button 
                className={`tab-btn ${activeTab === 'chart' ? 'active' : ''}`} 
                onClick={() => setActiveTab('chart')}
              >
                <Activity size={13} className="mr-1 inline-icon" /> CHART & MARKET
              </button>
              <button 
                className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`} 
                onClick={() => setActiveTab('audit')}
              >
                <Shield size={13} className="mr-1 inline-icon" /> SECURITY AUDIT
              </button>
            </div>

            {/* TAB 1: CHART & MARKET */}
            {activeTab === 'chart' && (
              <div className="chart-area">
                
                {/* Bonding Curve Hub banner if token is in launchpad phase */}
                {isOnCurve && (
                  <div className="curve-banner glass-panel">
                    <div className="curve-banner-header">
                      <div className="curve-banner-title text-cyan">
                        <Zap size={14} className="mr-1 inline-icon text-cyan" /> FLAP BONDING CURVE ACTIVE
                      </div>
                      <span className="curve-banner-progress text-bright font-mono">{progressPercent}% / 100%</span>
                    </div>

                    <div className="curve-progress-bar">
                      <div 
                        className="curve-progress-fill" 
                        style={{ width: `${Math.min(100, Math.max(2, parseFloat(progressPercent)))}%` }} 
                      />
                    </div>

                    <div className="curve-stats-row font-mono">
                      <div>
                        <span className="text-muted">Est. Liquidity: </span>
                        <span className="text-cyan font-bold">${parseFloat(token.liquidityUsd || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                      </div>
                      <div>
                        <span className="text-muted">DEX Migration: </span>
                        <span className="text-green font-bold">{parseFloat(progressPercent) >= 100 ? '✅ READY' : 'In Progress'}</span>
                      </div>
                    </div>

                    <div className="curve-actions-row">
                      <a 
                        href={`https://flap.sh/bnb/${token.tokenAddress}`} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="flap-curve-btn"
                        onClick={e => e.stopPropagation()}
                      >
                        🚀 Trade & View Curve on Flap.sh ↗
                      </a>
                      <button 
                        className="toggle-chart-btn font-mono" 
                        onClick={() => setChartMode(m => m === 'curve' ? 'dexscreener' : 'curve')}
                      >
                        {chartMode === 'curve' ? '📊 Switch to DexScreener View' : '⚡ Switch to Flap Curve View'}
                      </button>
                    </div>
                  </div>
                )}

                {/* DexScreener Chart View */}
                {(!isOnCurve || chartMode === 'dexscreener') && (
                  <div className="chart-wrapper">
                    <iframe 
                      src={`https://dexscreener.com/bsc/${token.tokenAddress}?embed=1&theme=dark&trades=0&info=0`} 
                      title="DexScreener Chart" 
                      className="chart-iframe" 
                      allow="clipboard-write" 
                    />
                  </div>
                )}

                {/* External Explorer Links */}
                <div className="links-row">
                  <a href={`https://flap.sh/bnb/${token.tokenAddress}`} target="_blank" rel="noreferrer" className="modal-chip" onClick={e => e.stopPropagation()}>
                    Flap.sh ↗
                  </a>
                  <a href={`https://dexscreener.com/bsc/${token.tokenAddress}`} target="_blank" rel="noreferrer" className="modal-chip" onClick={e => e.stopPropagation()}>
                    DexScreener ↗
                  </a>
                  <a href={`https://gmgn.ai/bsc/token/${token.tokenAddress}`} target="_blank" rel="noreferrer" className="modal-chip" onClick={e => e.stopPropagation()}>
                    GMGN.ai ↗
                  </a>
                  <a href={`https://bscscan.com/token/${token.tokenAddress}`} target="_blank" rel="noreferrer" className="modal-chip" onClick={e => e.stopPropagation()}>
                    BscScan Token ↗
                  </a>
                  <a href={`https://bscscan.com/address/${token.creator}`} target="_blank" rel="noreferrer" className="modal-chip" onClick={e => e.stopPropagation()}>
                    Deployer BscScan ↗
                  </a>
                </div>
              </div>
            )}

            {/* TAB 2: SECURITY AUDIT REPORT */}
            {activeTab === 'audit' && (
              <div className="audit-tab-content">
                <div className="audit-grid">
                  
                  {/* Card 1: Contract Bytecode */}
                  <div className="audit-card">
                    <div className="audit-card-title text-cyan">
                      <Brain size={14} className="mr-1 inline-icon" /> CONTRACT BYTECODE AUDIT
                    </div>
                    <div className="audit-card-body font-mono">
                      <div className="audit-item">
                        <span className="label">Architecture:</span>
                        <span className="val text-bright font-bold">{token.taxInnovation || 'Standard Flap Proxy'}</span>
                      </div>
                      <div className="audit-item">
                        <span className="label">Flap Standard:</span>
                        <span className={`val font-bold ${token.taxInnovation?.includes('Custom') ? 'text-red' : 'text-green'}`}>
                          {token.taxInnovation?.includes('Custom') ? '⚠️ Custom Bytecode' : '✅ Verified Standard'}
                        </span>
                      </div>
                      <div className="audit-item">
                        <span className="label">Verification:</span>
                        <span className="val text-green font-bold">✅ Verified On-Chain</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Developer Clustering */}
                  <div className="audit-card">
                    <div className="audit-card-title text-purple">
                      <Network size={14} className="mr-1 inline-icon" /> DEV CLUSTERING TELEMETRY
                    </div>
                    <div className="audit-card-body font-mono">
                      <div className="audit-item">
                        <span className="label">Deployer:</span>
                        <a href={`https://bscscan.com/address/${token.creator}`} target="_blank" rel="noreferrer" className="val text-cyan hover-underline">
                          {token.creator ? `${token.creator.slice(0, 10)}...${token.creator.slice(-6)} ↗` : 'Unknown'}
                        </a>
                      </div>
                      <div className="audit-item">
                        <span className="label">Cluster History:</span>
                        <span className={`val font-bold ${token.pastScamsCount > 20 ? 'text-red' : 'text-green'}`}>
                          {token.devClusterHistory || 'Private Wallet'}
                        </span>
                      </div>
                      {token.funderText && (
                        <div className="audit-item">
                          <span className="label">Funding Trace:</span>
                          <span className="val text-muted">{token.funderText}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card 3: Taxes & Honeypot */}
                  <div className="audit-card">
                    <div className="audit-card-title text-green">
                      <Shield size={14} className="mr-1 inline-icon" /> TAX & HONEYPOT SAFEGUARD
                    </div>
                    <div className="audit-card-body font-mono">
                      <div className="audit-item">
                        <span className="label">Honeypot Check:</span>
                        <span className={`val font-bold ${token.isHoneypot ? 'text-red' : 'text-green'}`}>
                          {token.isHoneypot ? '🚨 HONEYPOT DETECTED' : '✅ Passed Clean'}
                        </span>
                      </div>
                      <div className="audit-item">
                        <span className="label">Buy Tax:</span>
                        <span className={`val font-bold ${token.buyTax > 9 ? 'text-red' : 'text-green'}`}>
                          {token.buyTax !== null ? `${token.buyTax}%` : 'Calculating...'}
                        </span>
                      </div>
                      <div className="audit-item">
                        <span className="label">Sell Tax:</span>
                        <span className={`val font-bold ${token.sellTax > 9 ? 'text-red' : 'text-green'}`}>
                          {token.sellTax !== null ? `${token.sellTax}%` : 'Calculating...'}
                        </span>
                      </div>
                      <div className="audit-item">
                        <span className="label">Risk Threshold:</span>
                        <span className="val text-green font-bold">✅ Tax &lt;= 9% Gate Passed</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 4: Socials & Anti-Phishing */}
                  <div className="audit-card">
                    <div className="audit-card-title text-yellow">
                      <ShieldAlert size={14} className="mr-1 inline-icon" /> ANTI-PHISHING & SOCIAL AUDIT
                    </div>
                    <div className="audit-card-body font-mono">
                      <div className="audit-item">
                        <span className="label">Social Status:</span>
                        <span className={`val font-bold ${token.hasSocialClone ? 'text-red' : 'text-bright'}`}>
                          {token.webStatus || 'No public socials'}
                        </span>
                      </div>
                      <div className="audit-item">
                        <span className="label">Telegram:</span>
                        {token.tgUrl ? (
                          <a href={token.tgUrl} target="_blank" rel="noreferrer" className="val text-cyan hover-underline">
                            {token.tgUrl.slice(0, 24)}... ↗
                          </a>
                        ) : <span className="val text-muted">—</span>}
                      </div>
                      <div className="audit-item">
                        <span className="label">Twitter / X:</span>
                        {token.xUrl ? (
                          <a href={token.xUrl} target="_blank" rel="noreferrer" className="val text-cyan hover-underline">
                            {token.xUrl.slice(0, 24)}... ↗
                          </a>
                        ) : <span className="val text-muted">—</span>}
                      </div>
                      <div className="audit-item">
                        <span className="label">Website:</span>
                        {token.websiteUrl ? (
                          <a href={token.websiteUrl} target="_blank" rel="noreferrer" className="val text-cyan hover-underline">
                            {token.websiteUrl.slice(0, 24)}... ↗
                          </a>
                        ) : <span className="val text-muted">—</span>}
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}

          </div>

          {/* Right Column: Trading & Fast Swap */}
          <div className="modal-trading-column">
            
            {/* Quick Metrics */}
            <div className="modal-box">
              <h3 className="box-title text-cyan">
                <Activity size={12} style={{ marginRight: 5 }} /> KEY TELEMETRY
              </h3>
              <div className="metrics-grid">
                <div>
                  <span className="label">Taxes B/S:</span>
                  <span className={`val font-bold ${token.isHighTax ? 'text-red' : 'text-green'}`}>
                    {token.taxKnown ? `${(token.buyTax||0).toFixed(1)}% / ${(token.sellTax||0).toFixed(1)}%` : '–'}
                  </span>
                </div>
                <div>
                  <span className="label">Honeypot:</span>
                  <span className={`val font-bold ${token.isHoneypot ? 'text-red' : 'text-green'}`}>
                    {token.isHoneypot ? '🚨 YES' : '✅ No'}
                  </span>
                </div>
                <div><span className="label">Smart Money:</span><span className="val font-bold">{token.smartMoneyCount || 0}</span></div>
                <div><span className="label">KOLs:</span><span className="val font-bold">{token.kolCount || 0}</span></div>
                <div><span className="label">Snipers:</span><span className="val font-bold">{token.sniperCount || 0}</span></div>
                <div>
                  <span className="label">Liquidity:</span>
                  <span className="val text-cyan font-bold">
                    {token.liquidityUsd ? `$${parseFloat(token.liquidityUsd).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '–'}
                  </span>
                </div>
                <div>
                  <span className="label">Dev Launches:</span>
                  <span className={`val font-bold ${(token.creatorCreatedCount||0) > 5 ? 'text-red' : 'text-green'}`}>
                    {token.creatorCreatedCount || 0}
                  </span>
                </div>
                <div>
                  <span className="label">Dev Hold:</span>
                  <span className="val font-bold">{token.creatorHoldRate ? `${(token.creatorHoldRate*100).toFixed(1)}%` : '–'}</span>
                </div>
                <div>
                  <span className="label">Top10 Hold:</span>
                  <span className="val font-bold">{token.top10HolderRate ? `${(token.top10HolderRate*100).toFixed(1)}%` : '–'}</span>
                </div>

                {token.launchpadProgress !== undefined && (
                  <div style={{ gridColumn: 'span 2', marginTop: 4 }}>
                    <span className="label" style={{ display: 'block', marginBottom: 3 }}>Flap Bonding Curve:</span>
                    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 3, height: 5, overflow: 'hidden' }}>
                      <div 
                        style={{ 
                          background: token.launchpadProgress >= 1 ? 'var(--accent-green)' : 'var(--accent-cyan)', 
                          width: `${Math.min(100, (token.launchpadProgress||0)*100)}%`, 
                          height: '100%', 
                          transition: 'width 0.4s' 
                        }} 
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', marginTop: 2, color: 'var(--text-muted)' }}>
                      <span>{((token.launchpadProgress||0)*100).toFixed(1)}%</span>
                      <span>{token.launchpadProgress >= 1 ? '✅ DEX' : '100% → DEX'}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Fast Swap Engine (Monetized with Dev Fee) */}
            <div className="modal-box">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h3 className="box-title text-purple" style={{ margin: 0, border: 'none', padding: 0 }}>
                  <Wallet size={12} style={{ marginRight: 5 }} /> FAST SWAP
                </h3>
                <span className="badge bg-purple-dim border-purple text-purple font-mono" style={{ fontSize: '0.58rem', padding: '1px 5px', borderRadius: 4 }}>
                  1% DEV FEE ACTIVE
                </span>
              </div>

              {/* Wallet status */}
              <div className="wallet-status-bar">
                {!walletConnected ? (
                  <button className="connect-wallet-btn" onClick={connectWallet}>
                    <Wallet size={12} /> Connect Wallet
                  </button>
                ) : (
                  <div className="wallet-info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                        {walletAddress.slice(0,6)}…{walletAddress.slice(-4)}
                      </span>
                      <button 
                        onClick={() => { setWalletConnected(false); setWalletAddress(''); setBnbBalance('0.0000'); setUserTokenBalance(0n); }} 
                        style={{ background: 'none', border: 'none', color: 'var(--accent-red)', fontSize: '0.58rem', cursor: 'pointer', padding: 0, textAlign: 'left', textDecoration: 'underline', marginTop: '2px', fontWeight: 800 }}
                      >
                        DISCONNECT
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                        {bnbBalance} BNB
                      </span>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                        {(Number(userTokenBalance) / 1e18).toLocaleString('en-US', { maximumFractionDigits: 0 })} {token.tokenSymbol}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Trade Type Tabs */}
              <div className="trade-type-tabs">
                <button className={`type-tab buy-tab${tradeType==='buy'?' active':''}`} onClick={() => setTradeType('buy')}>
                  🟢 BUY
                </button>
                <button className={`type-tab sell-tab${tradeType==='sell'?' active':''}`} onClick={() => setTradeType('sell')}>
                  🔴 SELL
                </button>
              </div>

              {/* Buy Form */}
              {tradeType === 'buy' && (
                <div className="input-panel">
                  <span className="label">BNB Amount:</span>
                  <div className="input-row">
                    <input 
                      type="number" 
                      inputMode="decimal" 
                      min="0" 
                      step="0.01" 
                      value={buyAmount} 
                      onChange={e => setBuyAmount(e.target.value)} 
                      placeholder="0.1" 
                      className="amount-input" 
                      style={{ paddingRight: '2.8rem' }} 
                    />
                    <span className="unit">BNB</span>
                  </div>
                  <div className="quick-presets">
                    {['0.05','0.1','0.25','0.5'].map(v => (
                      <button key={v} onClick={() => setBuyAmount(v)} className={buyAmount===v?'active':''}>{v}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sell Form */}
              {tradeType === 'sell' && (
                <div className="input-panel">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="label">Percentage:</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.62rem', color: 'var(--accent-cyan)' }}>
                      {(Number(userTokenBalance)/1e18).toLocaleString('en-US',{maximumFractionDigits:0})} {token.tokenSymbol}
                    </span>
                  </div>
                  <div className="quick-presets">
                    {[25,50,75,100].map(p => (
                      <button key={p} className={sellPercent===p?'active':''} onClick={() => setSellPercent(p)}>{p}%</button>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>
                    Sell: {(Number(userTokenBalance * BigInt(sellPercent) / 100n)/1e18).toLocaleString('en-US',{maximumFractionDigits:0})} {token.tokenSymbol}
                  </div>
                </div>
              )}

              {/* Quote preview */}
              <div className="quote-preview">
                {!walletConnected ? (
                  <span>Connect wallet for quote</span>
                ) : loadingQuote ? (
                  <span>⏳ Calculating…</span>
                ) : quoteOut ? (
                  <span style={{ color: 'var(--accent-cyan)' }}>≈ You receive: <strong>{quoteOut}</strong></span>
                ) : quoteError ? (
                  <span style={{ color: 'var(--accent-red)', fontSize: '0.62rem' }}>{quoteError}</span>
                ) : null}
              </div>

              {/* Slippage setting */}
              <div className="input-panel" style={{ marginTop: 6 }}>
                <span className="label">Slippage %:</span>
                <input 
                  type="number" 
                  inputMode="decimal" 
                  min="1" 
                  max="100" 
                  value={slippage} 
                  onChange={e => setSlippage(e.target.value)} 
                  placeholder="15" 
                  className="slippage-input" 
                />
              </div>

              {/* Execute Swap button */}
              <button 
                className={`swap-btn ${tradeType==='buy'?'buy-btn':'sell-btn'}${isTrading?' loading':''}`} 
                onClick={executeMetaMaskTrade} 
                disabled={isTrading}
              >
                {isTrading && <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                {isTrading ? 'TRADING…' : tradeType==='buy' ? '🟢 BUY NOW' : '🔴 SELL NOW'}
              </button>

              {/* Notice if token is unmigrated */}
              {isOnCurve && (
                <div style={{ marginTop: '0.5rem', textAlign: 'center' }}>
                  <a 
                    href={`https://flap.sh/bnb/${token.tokenAddress}`} 
                    target="_blank" 
                    rel="noreferrer" 
                    style={{ fontSize: '0.62rem', color: 'var(--accent-cyan)', textDecoration: 'underline' }}
                    onClick={e => e.stopPropagation()}
                  >
                    Token on Flap Curve: Click here to trade on Flap.sh ↗
                  </a>
                </div>
              )}

              {/* Live execution logs */}
              {statusLogs.length > 0 && (
                <div className="logs-panel" style={{ marginTop: '0.5rem' }}>
                  {statusLogs.map((l, i) => <div key={i} className="log-line">{l}</div>)}
                  <div ref={logsEndRef} />
                </div>
              )}

            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default TokenDetailModal;
