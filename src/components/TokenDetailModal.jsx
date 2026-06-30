import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Wallet, RefreshCw, ExternalLink, Activity, TrendingUp, TrendingDown } from 'lucide-react';
import './TokenDetailModal.css';

const SWAP_TOPIC = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
const WBNB = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';

const bscRpc = async (method, params = []) => {
  if (typeof window !== 'undefined' && window.ethereum) {
    try {
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId === '0x38' || chainId === '0x56' || chainId === 56 || chainId === '56') {
        const res = await window.ethereum.request({ method, params });
        if (res !== undefined && res !== null) return res;
      }
    } catch (e) {
      console.warn("window.ethereum RPC failed, falling back:", e);
    }
  }

  const PUBLIC_RPCS = [
    'https://bsc-mainnet.public.blastapi.io',
    'https://bsc-rpc.publicnode.com',
    'https://bsc.drpc.org',
    'https://bsc-dataseed.binance.org/',
    'https://bsc-dataseed1.defibit.io/',
    'https://bsc-dataseed1.ninicoin.io/'
  ];

  for (const rpc of PUBLIC_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
      });
      const d = await res.json();
      if (d.result !== undefined && d.result !== null) return d.result;
    } catch (e) {
      console.warn(`Public RPC ${rpc} failed:`, e.message);
    }
  }
  throw new Error("All BSC RPC nodes failed");
};

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

  const [activeTab, setActiveTab] = useState('chart');
  const [holders, setHolders] = useState([]);
  const [loadingHolders, setLoadingHolders] = useState(false);
  const [traders, setTraders] = useState([]);
  const [loadingTraders, setLoadingTraders] = useState(false);

  const [liveTrades, setLiveTrades] = useState([]);
  const [loadingTrades, setLoadingTrades] = useState(false);
  const [poolAddress, setPoolAddress] = useState(token.biggestPool || '');
  const [latestBlock, setLatestBlock] = useState(null);
  const tradesIntervalRef = useRef(null);

  useEffect(() => {
    if (poolAddress) return;
    fetch(`/api/gmgn/token/${token.tokenAddress}`)
      .then(r => r.json())
      .then(d => {
        const pool = d?.info?.biggest_pool_address || d?.info?.pool?.pool_address || '';
        if (pool) setPoolAddress(pool);
      })
      .catch(() => {});
  }, [token.tokenAddress, poolAddress]);

  const addLog = useCallback((msg) => {
    setStatusLogs(prev => [...prev, `[${new Date().toLocaleTimeString('it-IT')}] ${msg}`]);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [statusLogs]);

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
    } catch (e) { addLog(`🚨 Errore saldo: ${e.message}`); }
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
            setQuoteError('Inserisci un importo BNB valido');
            return;
          }
          inputToken  = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
          outputToken = token.tokenAddress;
          amountWei   = BigInt(Math.round(raw * 1e18)).toString();
        } else {
          if (userTokenBalance === 0n) {
            setLoadingQuote(false);
            setQuoteError('Nessun token in portafoglio');
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
          setQuoteError('GMGN bloccato (Cloudflare) — preventivo non calcolabile');
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
          setQuoteError(d?.msg || d?.error || 'Route non disponibile');
        }
      } catch (e) {
        setQuoteError(`Errore preventivo: ${e.message}`);
      }
      setLoadingQuote(false);
    };

    const t = setTimeout(calc, 700);
    return () => clearTimeout(t);
  }, [tradeType, buyAmount, sellPercent, slippage, walletAddress, userTokenBalance, token.tokenAddress, token.tokenSymbol]);

  useEffect(() => {
    if (activeTab !== 'holders' || holders.length > 0) return;
    setLoadingHolders(true);
    fetch(`/api/gmgn/holders/${token.tokenAddress}`)
      .then(r => r.json())
      .then(d => { if (d?.list) setHolders(d.list); })
      .catch(() => {})
      .finally(() => setLoadingHolders(false));
  }, [activeTab, token.tokenAddress, holders.length]);

  useEffect(() => {
    if (activeTab !== 'traders' || traders.length > 0) return;
    setLoadingTraders(true);
    fetch(`/api/gmgn/traders/${token.tokenAddress}`)
      .then(r => r.json())
      .then(d => { if (d?.list) setTraders(d.list); })
      .catch(() => {})
      .finally(() => setLoadingTraders(false));
  }, [activeTab, token.tokenAddress, traders.length]);

  const fetchTrades = useCallback(async (pool, sinceBlock) => {
    try {
      const latestHex = await bscRpc('eth_blockNumber');
      const latest = parseInt(latestHex, 16);

      if (pool && pool !== '0x0000000000000000000000000000000000000000') {
        try {
          const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/bsc/pools/${pool}/trades`);
          const json = await res.json();
          if (json.data && Array.isArray(json.data)) {
            const parsedTrades = json.data.map(item => {
              const attr = item.attributes;
              const isBuy = attr.kind === 'buy';
              const fromIsWbnb = attr.from_token_address.toLowerCase() === WBNB;
              const bnbRawAmt = fromIsWbnb ? attr.from_token_amount : attr.to_token_amount;
              const tokRawAmt = fromIsWbnb ? attr.to_token_amount : attr.from_token_amount;
              const bnbWei = BigInt(Math.round(parseFloat(bnbRawAmt) * 1e18)).toString();
              const tokWei = BigInt(Math.round(parseFloat(tokRawAmt) * 1e18)).toString();

              return {
                type: isBuy ? 'BUY' : 'SELL',
                bnbAmount: bnbWei,
                tokenAmount: tokWei,
                wallet: attr.tx_from_address,
                tx: attr.tx_hash,
                block: attr.block_number
              };
            });
            return { trades: parsedTrades, latestBlock: latest };
          }
        } catch (e) {
          console.warn("GeckoTerminal failed, using RPC");
        }
      }

      let rawLogs = [];
      const targetAddress = (pool && pool !== '0x0000000000000000000000000000000000000000') ? pool.toLowerCase() : token.tokenAddress.toLowerCase();
      const targetTopic = (pool && pool !== '0x0000000000000000000000000000000000000000') ? SWAP_TOPIC : '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

      // OTTIMIZZAZIONE RPC FLUIDA: Evita i cicli distruttivi se c'è un blocco di partenza attivo
      if (sinceBlock) {
        const fromHex = '0x' + sinceBlock.toString(16);
        const toHex = '0x' + latest.toString(16);
        try {
          const logs = await bscRpc('eth_getLogs', [{ fromBlock: fromHex, toBlock: toHex, address: targetAddress, topics: [targetTopic] }]);
          rawLogs = Array.isArray(logs) ? logs : [];
        } catch (_) { rawLogs = []; }
      } else {
        const numBatches = 8; // Dimezzato i batch iniziali per alleggerire il carico al primo avvio
        const batchPromises = [];
        for (let i = 0; i < numBatches; i++) {
          const toBlock = latest - (i * 12);
          const fromBlock = Math.max(0, toBlock - 11);
          batchPromises.push(
            bscRpc('eth_getLogs', [{
              fromBlock: '0x' + fromBlock.toString(16),
              toBlock: '0x' + toBlock.toString(16),
              address: targetAddress,
              topics: [targetTopic]
            }]).catch(() => [])
          );
        }
        const batchResults = await Promise.all(batchPromises);
        const logMap = new Map();
        batchResults.flat().forEach(log => {
          if (log && log.transactionHash) {
            logMap.set(`${log.transactionHash}-${log.logIndex || '0'}`, log);
          }
        });
        rawLogs = Array.from(logMap.values());
      }

      let parsedTrades = [];
      if (pool && pool !== '0x0000000000000000000000000000000000000000') {
        const t0isToken = token.tokenAddress.toLowerCase() < WBNB;
        parsedTrades = rawLogs.map(l => {
          const d = l.data.slice(2);
          const a0in  = BigInt('0x' + d.slice(0,   64));
          const a1in  = BigInt('0x' + d.slice(64,  128));
          const a0out = BigInt('0x' + d.slice(128, 192));
          const a1out = BigInt('0x' + d.slice(192, 256));
          const sender = '0x' + l.topics[1].slice(26);
          const to     = '0x' + l.topics[2].slice(26);
          let type, bnbAmount, tokenAmount, wallet;
          if (t0isToken) {
            if (a1in > 0n) { type='BUY';  tokenAmount=a0out; bnbAmount=a1in;  wallet=to; }
            else           { type='SELL'; tokenAmount=a0in;  bnbAmount=a1out; wallet=sender; }
          } else {
            if (a0in > 0n) { type='BUY';  tokenAmount=a1out; bnbAmount=a0in;  wallet=to; }
            else           { type='SELL'; tokenAmount=a1in;  bnbAmount=a0out; wallet=sender; }
          }
          return { type, bnbAmount: bnbAmount.toString(), tokenAmount: tokenAmount.toString(), wallet, tx: l.transactionHash, block: parseInt(l.blockNumber, 16) };
        }).reverse();
      } else {
        const factoryLower = '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0'.toLowerCase();
        const tokenLower = token.tokenAddress.toLowerCase();
        parsedTrades = rawLogs.map(l => {
          const fromAddr = '0x' + l.topics[1].slice(26);
          const toAddr   = '0x' + l.topics[2].slice(26);
          const value    = BigInt(l.data || '0x0');
          const fromLower = fromAddr.toLowerCase();
          const isBuy = fromLower === '0x0000000000000000000000000000000000000000' || fromLower === factoryLower || fromLower === tokenLower;
          return { type: isBuy ? 'BUY' : 'SELL', bnbAmount: '0', tokenAmount: value.toString(), wallet: isBuy ? toAddr : fromAddr, tx: l.transactionHash, block: parseInt(l.blockNumber, 16) };
        }).reverse();
      }
      return { trades: parsedTrades, latestBlock: latest };
    } catch (e) {
      return null;
    }
  }, [token.tokenAddress]);

  useEffect(() => {
    if (activeTab !== 'trades') {
      if (tradesIntervalRef.current) clearInterval(tradesIntervalRef.current);
      return;
    }
    setLoadingTrades(true);
    setLiveTrades([]);

    const poll = async (since) => {
      const result = await fetchTrades(poolAddress, since);
      if (result) {
        const { trades, latestBlock: lb } = result;
        setLiveTrades(prev => {
          const existingTxs = new Set(prev.map(t => t.tx));
          const newTrades = trades.filter(t => !existingTxs.has(t.tx));
          return [...newTrades, ...prev].slice(0, 200);
        });
        setLatestBlock(lb);
        setLoadingTrades(false);
        return lb;
      }
      setLoadingTrades(false);
      return since;
    };

    let currentBlock = null;
    poll(null).then(lb => { currentBlock = lb; });

    tradesIntervalRef.current = setInterval(async () => {
      currentBlock = await poll(currentBlock ? currentBlock - 2 : null);
    }, 6000);

    return () => {
      if (tradesIntervalRef.current) clearInterval(tradesIntervalRef.current);
    };
  }, [activeTab, poolAddress, fetchTrades]);

  const connectWallet = async () => {
    if (!window.ethereum) { alert('Installa MetaMask per fare trading!'); return; }
    try {
      addLog('Connessione wallet…');
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
      if (chainId !== '0x38') throw new Error(`Passa a BSC (BNB Chain) in MetaMask!`);

      if (tradeType === 'buy') {
        const raw = parseFloat(String(buyAmount).replace(',', '.').trim());
        if (!raw || isNaN(raw) || raw <= 0) throw new Error('Importo BNB non valido');
        const bnb = parseFloat(bnbBalance);
        if (raw > bnb - 0.002) throw new Error(`Saldo insufficiente`);

        const DEV_FEE_ADDRESS = '0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7';
        const DEV_FEE_PERCENT = 0.01;
        const feeAmount = raw * DEV_FEE_PERCENT;
        const swapAmount = raw - feeAmount;
        const swapWei = BigInt(Math.round(swapAmount * 1e18));
        const feeWei = BigInt(Math.round(feeAmount * 1e18));

        addLog(`1. Recupero route per ${swapAmount.toFixed(5)} BNB…`);
        const routeRes = await fetch(`/api/gmgn/swap-route?chain=bsc&from=${walletAddress}&input_token=0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee&output_token=${token.tokenAddress}&amount=${swapWei.toString()}&slippage=${slippage}`);
        const routeData = await routeRes.json();

        if (routeData?.code === 'CF_BLOCKED' || !routeData?.data?.raw_tx) {
          if (token.launchpadProgress < 1) {
            addLog(`⚠️ Token ancora su Flap Bonding Curve. Apro Flap.sh…`);
            window.open(`https://flap.sh/bnb/${token.tokenAddress}`, '_blank');
            return;
          }
          throw new Error(routeData?.error || 'Nessuna route disponibile');
        }

        const rt = routeData.data.raw_tx;
        const txValue = rt.value ? (rt.value.startsWith('0x') ? rt.value : '0x' + BigInt(rt.value).toString(16)) : '0x0';
        const txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{ from: walletAddress, to: rt.to, data: rt.data, value: txValue, ...(rt.gas_limit ? { gas: '0x' + BigInt(rt.gas_limit).toString(16) } : {}) }]
        });
        addLog(`✅ TX acquisto inviata! Hash: ${txHash}`);

        let receipt = null;
        for (let i = 0; i < 40; i++) {
          receipt = await window.ethereum.request({ method: 'eth_getTransactionReceipt', params: [txHash] });
          if (receipt) break;
          await new Promise(ok => setTimeout(ok, 2000));
        }
        if (!receipt || receipt.status === '0x0') throw new Error('Acquisto fallito su blockchain.');
        addLog(`🎉 Acquisto confermato con successo!`);
        await updateBalances(walletAddress);

        if (feeWei > 0n) {
          try {
            const feeTxHash = await window.ethereum.request({
              method: 'eth_sendTransaction',
              params: [{ from: walletAddress, to: DEV_FEE_ADDRESS, value: '0x' + feeWei.toString(16) }]
            });
            addLog(`✅ Dev fee inviata! Hash: ${feeTxHash}`);
          } catch (_) {}
        }
      } else {
        const tokenBal = await getERC20Balance(token.tokenAddress, walletAddress);
        if (tokenBal === 0n) throw new Error(`Non hai ${token.tokenSymbol} in portafoglio`);
        const DEV_FEE_ADDRESS = '0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7';
        const DEV_FEE_PERCENT = 0.01;
        const sellAmt = (tokenBal * BigInt(sellPercent)) / 100n;

        addLog(`1. Recupero route sell ${sellPercent}% dei tuoi ${token.tokenSymbol}…`);
        const routeRes = await fetch(`/api/gmgn/swap-route?chain=bsc&from=${walletAddress}&input_token=${token.tokenAddress}&output_token=0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee&amount=${sellAmt.toString()}&slippage=${slippage}`);
        const routeData = await routeRes.json();

        if (routeData?.code === 'CF_BLOCKED' || !routeData?.data?.raw_tx) {
          if (token.launchpadProgress < 1) {
            addLog(`⚠️ Token su Flap Curve. Apro Flap.sh per vendere…`);
            window.open(`https://flap.sh/bnb/${token.tokenAddress}`, '_blank');
            return;
          }
          throw new Error(routeData?.error || 'Nessuna sell route');
        }

        const rt = routeData.data.raw_tx;
        addLog(`2. Approvazione token per router…`);
        const approveData = '0x095ea7b3' + rt.to.toLowerCase().replace('0x', '').padStart(64, '0') + sellAmt.toString(16).padStart(64, '0');
        const approveTxHash = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: walletAddress, to: token.tokenAddress, data: approveData }] });

        for (let i = 0; i < 40; i++) {
          const r = await window.ethereum.request({ method: 'eth_getTransactionReceipt', params: [approveTxHash] });
          if (r) { if (r.status === '0x0') throw new Error('Approvazione fallita.'); break; }
          await new Promise(ok => setTimeout(ok, 2000));
        }

        addLog(`✅ Approvato. Firma swap vendita…`);
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
        if (!swapReceipt || swapReceipt.status === '0x0') throw new Error('Vendita fallita.');
        addLog(`🎉 Vendita confermata con successo!`);
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
      if (e.code === 4001) addLog('❌ Transazione rifiutata dall\'utente');
      else addLog(`🚨 ${e.message}`);
    } finally {
      tradingRef.current = false;
      setIsTrading(false);
    }
  };

  const tagStyle = (tag) => {
    if (tag === 'creator' || tag === 'dev') return { bg: 'rgba(249,199,79,0.15)', fg: '#f9c74f' };
    if (tag === 'sniper')      return { bg: 'rgba(255,78,100,0.15)',  fg: 'var(--accent-red)' };
    if (tag === 'smart_degen') return { bg: 'rgba(192,132,252,0.15)', fg: 'var(--accent-purple)' };
    if (tag === 'top_holder')  return { bg: 'rgba(102,252,241,0.15)', fg: 'var(--accent-cyan)' };
    return { bg: 'rgba(255,255,255,0.05)', fg: 'var(--text-muted)' };
  };

  const TableHead5 = ({ cols }) => (
    <thead>
      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', fontSize: '0.66rem' }}>
        {cols.map((c, i) => <th key={i} style={{ padding: '6px 8px', textAlign: i > 1 ? 'right' : 'left', fontWeight: 700 }}>{c}</th>)}
      </tr>
    </thead>
  );

  const HolderRow = ({ item, idx }) => {
    const ip = item.profit > 0;
    const hp = item.profit != null && item.profit !== 0;
    return (
      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', color: 'var(--text-bright)' }}>
        <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: '0.68rem' }}>
          <a href={`https://bscscan.com/address/${item.address}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-cyan)', textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
            {item.address ? `${item.address.slice(0,6)}…${item.address.slice(-4)}` : '—'}
          </a>
        </td>
        <td style={{ padding: '6px 8px' }}>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {item.maker_token_tags?.map((t, ti) => {
              const s = tagStyle(t);
              return <span key={ti} style={{ background: s.bg, color: s.fg, fontSize: '0.57rem', fontWeight: 800, padding: '1px 4px', borderRadius: 3, textTransform: 'uppercase' }}>{t}</span>;
            })}
          </div>
        </td>
        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.68rem' }}>
          {item.balance ? Math.round(item.balance).toLocaleString() : '0'}
        </td>
        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.68rem', color: 'var(--accent-cyan)' }}>
          {item.amount_percentage ? `${(item.amount_percentage * 100).toFixed(2)}%` : '0.00%'}
        </td>
        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.68rem', color: hp ? (ip ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--text-muted)' }}>
          {hp ? `${ip ? '+' : ''}${item.profit.toFixed(3)}` : '—'}
        </td>
      </tr>
    );
  };

  const Spinner = ({ msg }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2.5rem 0', gap: 8, color: 'var(--text-muted)' }}>
      <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
      <span style={{ fontSize: '0.72rem' }}>{msg}</span>
    </div>
  );

  return (
    <div className="detail-modal-overlay animate-fade-in" onClick={onClose}>
      <div className="detail-modal-card animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-left">
            <img src={token.realLogo || `https://api.dicebear.com/9.x/shapes/svg?seed=${token.tokenAddress}`} alt="logo" className="modal-token-logo" onError={e => { e.target.src = `https://api.dicebear.com/9.x/shapes/svg?seed=${token.tokenAddress}`; }} />
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-bright)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {token.tokenName} <span className="text-cyan">${token.tokenSymbol}</span>
              </h2>
              <div className="modal-token-addr">
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{token.tokenAddress}</span>
                <a href={`https://bscscan.com/token/${token.tokenAddress}`} target="_blank" rel="noreferrer" title="BscScan" style={{ flexShrink: 0 }}>
                  <ExternalLink size={10} style={{ verticalAlign: 'middle' }} />
                </a>
              </div>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} style={{ marginLeft: '1rem', flexShrink: 0 }}>
            <X size={14} /><span style={{ fontSize: '0.7rem', fontWeight: 800 }}>INDIETRO</span>
          </button>
        </div>

        <div className="modal-body-grid">
          <div className="modal-chart-column" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="modal-tab-selector" style={{ flexShrink: 0 }}>
              {[
                { id: 'chart',   label: '📈 GRAFICO' },
                { id: 'trades',  label: '⚡ TXS LIVE' },
                { id: 'holders', label: '👥 HOLDERS' },
                { id: 'traders', label: '📊 TRADERS' },
              ].map(({ id, label }) => (
                <button key={id} className={`tab-btn${activeTab === id ? ' active' : ''}`} onClick={() => setActiveTab(id)}>
                  {label}
                </button>
              ))}
            </div>

            {activeTab === 'chart' && (
              <div className="chart-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <iframe src={`https://www.gmgn.cc/kline/bsc/${token.tokenAddress}?theme=dark`} title="GMGN Kline Chart" className="chart-iframe" allow="clipboard-write" style={{ flex: 1, width: '100%', minHeight: '360px', border: 0 }} />
                <div className="links-row" style={{ flexShrink: 0, marginTop: '8px' }}>
                  {[
                    [`https://gmgn.ai/bsc/token/${token.tokenAddress}`, 'GMGN.ai ↗'],
                    [`https://flap.sh/bnb/${token.tokenAddress}`, 'Flap.sh ↗'],
                    [`https://dexscreener.com/bsc/${token.tokenAddress}`, 'DexScreener ↗'],
                    [`https://bscscan.com/address/${token.creator}`, 'Dev BscScan ↗'],
                  ].map(([href, label]) => (
                    <a key={label} href={href} target="_blank" rel="noreferrer" className="modal-chip" onClick={e => e.stopPropagation()}>{label}</a>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'trades' && (
              <div className="chart-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '400px', gap: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {poolAddress ? `Pool: ${poolAddress.slice(0,10)}…` : 'Pool non rilevato (token su bonding curve)'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {loadingTrades && <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-cyan)' }} />}
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Aggiornamento ottimizzato</span>
                  </div>
                </div>

                {loadingTrades && liveTrades.length === 0 ? (
                  <Spinner msg="Caricamento transazioni on-chain…" />
                ) : liveTrades.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    <span>Nessuna transazione recente trovata su questa bonding curve.</span>
                  </div>
                ) : (
                  <div style={{ overflowY: 'auto', flex: 1, maxHeight: '380px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: '0.64rem', color: 'var(--text-muted)', position: 'sticky', top: 0, background: '#0b0c10' }}>
                          <th style={{ padding: '5px 6px', textAlign: 'left', fontWeight: 700 }}>Tipo</th>
                          <th style={{ padding: '5px 6px', textAlign: 'left', fontWeight: 700 }}>Wallet</th>
                          <th style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700 }}>Token</th>
                          <th style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700 }}>BNB</th>
                          <th style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700 }}>Block</th>
                        </tr>
                      </thead>
                      <tbody>
                        {liveTrades.map((t, i) => {
                          const isBuy = t.type === 'BUY';
                          const bnbAmt = t.bnbAmount && t.bnbAmount !== '0' ? (Number(BigInt(t.bnbAmount)) / 1e18).toFixed(4) : '—';
                          const tokAmt = (Number(BigInt(t.tokenAmount)) / 1e18).toLocaleString('en-US', { maximumFractionDigits: 0 });
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.68rem' }}>
                              <td style={{ padding: '5px 6px' }}>
                                <span style={{ background: isBuy ? 'rgba(0,255,135,0.12)' : 'rgba(255,78,100,0.12)', color: isBuy ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 800, fontSize: '0.62rem', padding: '2px 6px', borderRadius: 3, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                  {isBuy ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                                  {t.type}
                                </span>
                              </td>
                              <td style={{ padding: '5px 6px', fontFamily: 'monospace' }}>
                                <a href={`https://bscscan.com/tx/${t.tx}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-cyan)', textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
                                  {t.wallet ? `${t.wallet.slice(0,6)}…${t.wallet.slice(-4)}` : '—'}
                                </a>
                              </td>
                              <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-bright)' }}>{tokAmt}</td>
                              <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'monospace', color: isBuy ? 'var(--accent-green)' : 'var(--accent-red)' }}>{bnbAmt}</td>
                              <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '0.62rem' }}>
                                {latestBlock ? latestBlock - t.block : t.block}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'holders' && (
              <div className="holders-tab-content" style={{ flex: 1, overflowY: 'auto', maxHeight: '420px' }}>
                {loadingHolders ? <Spinner msg="Caricamento Top Holders da GMGN…" /> : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <TableHead5 cols={['Wallet', 'Tag', 'Bilancio', '%', 'P/L BNB']} />
                    <tbody>
                      {holders.length === 0
                        ? <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.72rem' }}>Nessun dato JSON valido ricevuto</td></tr>
                        : holders.map((h, i) => <HolderRow key={i} item={h} idx={i} />)
                      }
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === 'traders' && (
              <div className="traders-tab-content" style={{ flex: 1, overflowY: 'auto', maxHeight: '420px' }}>
                {loadingTraders ? <Spinner msg="Caricamento Top Traders da GMGN…" /> : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <TableHead5 cols={['Wallet', 'Tag', 'Bilancio', '%', 'P/L BNB']} />
                    <tbody>
                      {traders.length === 0
                        ? <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.72rem' }}>Nessun dato JSON valido ricevuto</td></tr>
                        : traders.map((h, i) => <HolderRow key={i} item={h} idx={i} />)
                      }
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          <div className="modal-trading-column">
            <div className="modal-box">
              <h3 className="box-title text-cyan"><Activity size={12} style={{ marginRight: 5 }} />METRICHE</h3>
              <div className="metrics-grid">
                <div><span className="label">Tasse B/S:</span>
                  <span className={`val font-bold ${token.isHighTax ? 'text-red' : 'text-green'}`}>
                    {token.taxKnown ? `${(token.buyTax||0).toFixed(1)}% / ${(token.sellTax||0).toFixed(1)}%` : '–'}
                  </span>
                </div>
                <div><span className="label">Honeypot:</span>
                  <span className={`val font-bold ${token.isHoneypot ? 'text-red' : 'text-green'}`}>
                    {token.isHoneypot ? '🚨 SÌ' : '✅ No'}
                  </span>
                </div>
                <div><span className="label">Smart Money:</span><span className="val font-bold">{token.smartMoneyCount || 0}</span></div>
                <div><span className="label">KOLs:</span><span className="val font-bold">{token.kolCount || 0}</span></div>
                <div><span className="label">Snipers:</span><span className="val font-bold">{token.sniperCount || 0}</span></div>
                <div><span className="label">Liquidity:</span>
                  <span className="val text-cyan font-bold">
                    {token.liquidityUsd ? `$${parseFloat(token.liquidityUsd).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '–'}
                  </span>
                </div>
                <div><span className="label">Lanci Dev:</span>
                  <span className={`val font-bold ${(token.creatorCreatedCount||0) > 5 ? 'text-red' : 'text-green'}`}>
                    {token.creatorCreatedCount || 0}
                  </span>
                </div>
                <div><span className="label">Dev Hold:</span>
                  <span className="val font-bold">{token.creatorHoldRate ? `${(token.creatorHoldRate*100).toFixed(1)}%` : '–'}</span>
                </div>
                <div><span className="label">Top10 Hold:</span>
                  <span className="val font-bold">{token.top10HolderRate ? `${(token.top10HolderRate*100).toFixed(1)}%` : '–'}</span>
                </div>
                {token.launchpadProgress !== undefined && (
                  <div style={{ gridColumn: 'span 2', marginTop: 4 }}>
                    <span className="label" style={{ display: 'block', marginBottom: 3 }}>Curva Bonding Flap:</span>
                    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 3, height: 5, overflow: 'hidden' }}>
                      <div style={{ background: token.launchpadProgress >= 1 ? 'var(--accent-green)' : 'var(--accent-cyan)', width: `${Math.min(100, (token.launchpadProgress||0)*100)}%`, height: '100%', transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', marginTop: 2, color: 'var(--text-muted)' }}>
                      <span>{((token.launchpadProgress||0)*100).toFixed(1)}%</span>
                      <span>{token.launchpadProgress >= 1 ? '✅ DEX' : '100% → DEX'}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-box">
              <h3 className="box-title text-purple"><Wallet size={12} style={{ marginRight: 5 }} />FAST SWAP</h3>
              <div className="wallet-status-bar">
                {!walletConnected
                  ? <button className="connect-wallet-btn" onClick={connectWallet}><Wallet size={12} /> Connetti Wallet</button>
                  : <div className="wallet-info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                          {walletAddress.slice(0,6)}…{walletAddress.slice(-4)}
                        </span>
                        <button onClick={() => { setWalletConnected(false); setWalletAddress(''); setBnbBalance('0.0000'); setUserTokenBalance(0n); }} style={{ background: 'none', border: 'none', color: 'var(--accent-red)', fontSize: '0.58rem', cursor: 'pointer', padding: 0, textAlign: 'left', textDecoration: 'underline', marginTop: '2px', fontWeight: 800 }}>
                          SCONNETTI
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--accent-cyan)', fontWeight: 700 }}>{bnbBalance} BNB</span>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                          {(Number(userTokenBalance) / 1e18).toLocaleString('en-US', { maximumFractionDigits: 0 })} {token.tokenSymbol}
                        </span>
                      </div>
                    </div>
                }
              </div>

              <div className="trade-type-tabs">
                <button className={`type-tab buy-tab${tradeType==='buy'?' active':''}`} onClick={() => setTradeType('buy')}>🟢 COMPRA</button>
                <button className={`type-tab sell-tab${tradeType==='sell'?' active':''}`} onClick={() => setTradeType('sell')}>🔴 VENDI</button>
              </div>

              {tradeType === 'buy' && (
                <div className="input-panel">
                  <span className="label">Importo BNB:</span>
                  <div className="input-row">
                    <input type="number" inputMode="decimal" min="0" step="0.01" value={buyAmount} onChange={e => setBuyAmount(e.target.value)} placeholder="0.1" className="amount-input" style={{ paddingRight: '2.8rem' }} />
                    <span className="unit">BNB</span>
                  </div>
                  <div className="quick-presets">
                    {['0.05','0.1','0.25','0.5'].map(v => (
                      <button key={v} onClick={() => setBuyAmount(v)} className={buyAmount===v?'active':''}>{v}</button>
                    ))}
                  </div>
                </div>
              )}

              {tradeType === 'sell' && (
                <div className="input-panel">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="label">Percentuale:</span>
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
                    Vendi: {(Number(userTokenBalance * BigInt(sellPercent) / 100n)/1e18).toLocaleString('en-US',{maximumFractionDigits:0})} {token.tokenSymbol}
                  </div>
                </div>
              )}

              <div className="quote-preview">
                {!walletConnected
                  ? <span>Connetti wallet per preventivo</span>
                  : loadingQuote
                    ? <span>⏳ Calcolo…</span>
                    : quoteOut
                      ? <span style={{ color: 'var(--accent-cyan)' }}>≈ Ricevi: <strong>{quoteOut}</strong></span>
                      : quoteError
                        ? <span style={{ color: 'var(--accent-red)', fontSize: '0.62rem' }}>{quoteError}</span>
                        : null
                }
              </div>

              <div className="input-panel" style={{ marginTop: 6 }}>
                <span className="label">Slippage %:</span>
                <input type="number" inputMode="decimal" min="1" max="100" value={slippage} onChange={e => setSlippage(e.target.value)} placeholder="15" className="slippage-input" />
              </div>

              <button className={`swap-btn ${tradeType==='buy'?'buy-btn':'sell-btn'}${isTrading?' loading':''}`} onClick={executeMetaMaskTrade} disabled={isTrading}>
                {isTrading && <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                {isTrading ? 'IN CORSO…' : tradeType==='buy' ? '🟢 COMPRA ORA' : '🔴 VENDI ORA'}
              </button>

              {statusLogs.length > 0 && (
                <div className="logs-panel">
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
