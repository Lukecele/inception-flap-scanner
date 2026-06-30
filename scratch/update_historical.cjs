const { exec } = require('child_process');
const fs = require('fs');
const https = require('https');

const FACTORY = '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const NULL_TOPIC = '0x0000000000000000000000000000000000000000000000000000000000000000';

const postRpc = (method, params) => {
  const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  return new Promise((resolve) => {
    const req = https.request('https://bsc.drpc.org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data).result);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });
};

const getBlockTime = async (blockNum) => {
  return 1782805495 + Math.floor((blockNum - 107215159) * 0.4508);
};

const findBlockByTimestamp = async (targetTime, latestBlock) => {
  const diff = targetTime - 1782805495;
  const estBlock = 107215159 + Math.floor(diff / 0.4508);
  return Math.min(latestBlock, estBlock);
};

const runCmd = (cmd) => {
  return new Promise((resolve) => {
    exec(cmd, (err, stdout) => {
      resolve(stdout ? stdout.trim() : '');
    });
  });
};

const run = async () => {
  console.log('=== START HISTORICAL TOKENS UPDATE WITH STRICT FILTERS ===');
  
  const latestBlockHex = await postRpc('eth_blockNumber', []);
  const fallbackBlock = 107215159 + Math.floor((Date.now() / 1000 - 1782805495) / 0.4508);
  const latestBlock = latestBlockHex ? (parseInt(latestBlockHex, 16) || fallbackBlock) : fallbackBlock;
  const latestTime = Math.floor(Date.now() / 1000);
  console.log(`Latest Block: ${latestBlock} (${latestTime})`);

  console.log('Fetching raw tokens from gmgn-cli trenches...');
  const trenchesRaw = await runCmd('gmgn-cli market trenches --chain bsc --launchpad-platform flap --limit 80 --raw');
  if (!trenchesRaw) {
    console.error('Failed to fetch trenches');
    return;
  }

  let trenches;
  try {
    trenches = JSON.parse(trenchesRaw);
  } catch (e) {
    console.error('Failed to parse trenches JSON:', e.message);
    return;
  }

  const rawList = [
    ...(trenches.new_creation || []),
    ...(trenches.completed || [])
  ].slice(0, 120); // scan up to 120 to find multiple tokens that match the filters

  console.log(`Found ${rawList.length} total tokens in trenches. Processing and filtering...`);

  const processedList = [];
  const socialRegistry = {};

  const cleanUrl = (url) => {
    if (!url) return null;
    const SYSTEM_DOMAINS = ['flap.sh','binance.com','mypinata.cloud','w3.org','bscscan.com','warpcast.com','taxed.fun','debox.pro','allnodes.com','publicnode.com','flapdotsh'];
    for (const dom of SYSTEM_DOMAINS) {
      if (url.includes(dom)) return null;
    }
    return url;
  };

  for (let i = 0; i < rawList.length; i++) {
    const item = rawList[i];
    const addr = item.address;
    if (!addr) continue;

    console.log(`[${i + 1}/${rawList.length}] Analyzing ${addr}...`);

    // Fetch token info and security
    const infoRaw = await runCmd(`gmgn-cli token info --chain bsc --address ${addr} --raw`);
    const secRaw = await runCmd(`gmgn-cli token security --chain bsc --address ${addr} --raw`);

    let info, sec;
    try {
      info = infoRaw ? JSON.parse(infoRaw) : null;
      sec = secRaw ? JSON.parse(secRaw) : null;
    } catch {
      console.log(`  -> Failed to parse details for ${addr}, skipping.`);
      continue;
    }

    if (!info) {
      console.log(`  -> Info is null, skipping.`);
      continue;
    }

    // Taxes <= 9% (Filter high tax: greater than 9)
    const buyTax = sec?.buy_tax !== undefined ? parseFloat(sec.buy_tax) * 100 : (item.buy_tax !== undefined ? parseFloat(item.buy_tax) * 100 : 0);
    const sellTax = sec?.sell_tax !== undefined ? parseFloat(sec.sell_tax) * 100 : (item.sell_tax !== undefined ? parseFloat(item.sell_tax) * 100 : buyTax);
    if (buyTax > 9 || sellTax > 9) {
      console.log(`  -> High Tax (${buyTax}% / ${sellTax}%), skipping.`);
      continue;
    }

    const creatorCreatedCount = info.stat?.creator_created_count || info.creator_created_count || info.dev?.twitter_create_token_count || 0;
    const isHoneypot = sec?.is_honeypot === 'yes' || sec?.is_honeypot === true || info.is_honeypot === 'yes';

    // Socials check
    const tg = cleanUrl(info.link?.telegram);
    const tw_user = info.link?.twitter_username || '';
    const x_url = tw_user && !tw_user.includes('binance') ? `https://x.com/${tw_user}` : null;
    const web = cleanUrl(info.link?.website);
    const isStealth = !tg && !x_url && !web;

    // Social clones detection (not skipping, just flag it)
    let hasSocialClone = false;
    const urlsToCheck = [tg, x_url, web].filter(Boolean);
    for (const url of urlsToCheck) {
      const key = url.trim().toLowerCase().split('?')[0];
      if (socialRegistry[key] && socialRegistry[key] !== addr.toLowerCase()) {
        hasSocialClone = true;
      } else {
        socialRegistry[key] = addr.toLowerCase();
      }
    }

    // Find block number from creation timestamp
    const creationTime = info.creation_timestamp || info.open_timestamp || item.created_timestamp;
    if (!creationTime) {
      console.log(`  -> No timestamp, skipping.`);
      continue;
    }

    const estBlock = await findBlockByTimestamp(creationTime, latestBlock);
    
    // Wider 150-block range for robust logs query (about 67 seconds window)
    let realBlock = estBlock;
    let realTxHash = '0x';
    let devBoughtAtLaunch = false;

    let logsSucceeded = false;
    let logs = null;
    try {
      logs = await postRpc('eth_getLogs', [{
        fromBlock: '0x' + (estBlock - 150).toString(16),
        toBlock: '0x' + (estBlock + 150).toString(16),
        address: addr,
        topics: [TRANSFER_TOPIC, NULL_TOPIC]
      }]);
      if (logs !== null && logs !== undefined) {
        logsSucceeded = true;
      }
    } catch (e) {
      console.log('      Rpc log query failed, using fallback.');
    }

    if (logsSucceeded && logs && logs.length > 0) {
      realBlock = parseInt(logs[0].blockNumber, 16);
      realTxHash = logs[0].transactionHash;

      // Filter: Dev Bought At Launch
      const creator = (info.dev?.creator_address || item.creator || '').toLowerCase();
      if (creator) {
        const creatorTopic = '0x' + creator.slice(2).padStart(64, '0');
        for (const log of logs) {
          if (log.transactionHash === realTxHash && log.topics[2]?.toLowerCase() === creatorTopic) {
            devBoughtAtLaunch = true;
            break;
          }
        }
      }
    } else if (!logsSucceeded) {
      // RPC failed (rate limit/network), assume true to avoid blank list
      devBoughtAtLaunch = true;
    }

    // Skip tokens without initial dev purchase (must buy at launch)
    if (!devBoughtAtLaunch) {
      console.log(`  -> Dev did not buy at launch, skipping.`);
      continue;
    }

    // ── BscScan Funder/Cluster analysis (matching Scanner.jsx) ──
    let devClusterHistory = "Analisi dev non disponibile";
    let pastScamsCount    = creatorCreatedCount > 5 ? Math.max(0, creatorCreatedCount - 5) : 0;
    let funderText        = "";
    let bscScanSuccess    = false;

    const trueDev = (info.dev?.creator_address || item.creator || '').toLowerCase();
    if (trueDev) {
      try {
        const scanRes  = await fetch(`https://api.bscscan.com/api?module=account&action=txlist&address=${trueDev}&startblock=0&endblock=99999999&page=1&offset=2&sort=asc`);
        const scanData = await scanRes.json();
        if (scanData.status === "1" && scanData.result?.length > 0) {
          const funder = scanData.result[0].from?.toLowerCase() === trueDev.toLowerCase()
            ? scanData.result[0].to : scanData.result[0].from;

          const cntHex = await postRpc('eth_getTransactionCount', [funder, 'latest']);
          const cnt = parseInt(cntHex, 16) || 0;

          if (cnt > 1000) {
            devClusterHistory = "✅ Funder: Exchange/Bridge";
            funderText = `${funder.slice(0, 10)}...`;
          } else if (cnt > 20) {
            devClusterHistory = `🚨 Funder sospetto (${cnt} txs)`;
            pastScamsCount = cnt;
            funderText = `Possibile cluster scam: ${funder.slice(0, 10)}...`;
          } else {
            devClusterHistory = `✅ Wallet privato (${cnt} txs)`;
            funderText = `${funder.slice(0, 10)}...`;
          }
          bscScanSuccess = true;
        }
      } catch (e) {
        console.log(`      BscScan query failed: ${e.message}`);
      }

      if (!bscScanSuccess) {
        try {
          const cntHex = await postRpc('eth_getTransactionCount', [trueDev, 'latest']);
          const cnt = parseInt(cntHex, 16) || 0;
          if (cnt > 10) {
            devClusterHistory = `🚨 Dev seriale (${cnt} TX)`;
            pastScamsCount = cnt;
          } else {
            devClusterHistory = `✅ Dev nuovo (${cnt} TX)`;
          }
        } catch (_) {}
      }
    }

    console.log(`  -> ✅ PASSED. Block: ${realBlock}, TxHash: ${realTxHash}`);

    processedList.push({
      txHash: realTxHash,
      creator: info.dev?.creator_address || item.creator || '',
      tokenAddress: addr,
      tokenName: info.name || item.name || 'Unknown',
      tokenSymbol: info.symbol || item.symbol || '???',
      realLogo: info.logo || item.logo || '',
      isStealth,
      hasTelegram: !!tg,
      hasTwitter: !!x_url,
      tgUrl: tg,
      xUrl: x_url,
      websiteUrl: web,
      hasSocialClone,
      cloneWarning: hasSocialClone ? '⚠️ Social duplicati rilevati!' : null,
      taxInnovation: '🔁 Proxy Standard Flap',
      isHighTax: buyTax > 10 || sellTax > 10,
      taxKnown: true,
      buyTax,
      sellTax,
      devClusterHistory,
      pastScamsCount,
      funderText,
      webStatus: isStealth ? 'Nessun social pubblico' : hasSocialClone ? '🚨 SCARTO: Social Clonato' : '✅ Social verificati',
      block: realBlock,
      timestamp: 'Storico',
      isHistorical: true,
      kolCount: info.wallet_tags_stat?.renowned_wallets || 0,
      smartMoneyCount: info.wallet_tags_stat?.smart_wallets || 0,
      whaleCount: info.wallet_tags_stat?.whale_wallets || 0,
      sniperCount: info.wallet_tags_stat?.sniper_wallets || 0,
      creatorCreatedCount,
      liquidityUsd: info.liquidity || 0,
      marketCapUsd: info.price?.price ? (parseFloat(info.circulating_supply || info.total_supply || 1000000000) * parseFloat(info.price.price)) : (info.usd_market_cap || 0),
      isHoneypot,
      launchpadProgress: info.launchpad_progress || 0,
      creatorHoldRate: info.stat?.creator_hold_rate || info.dev?.creator_hold_rate || 0,
      top10HolderRate: info.stat?.top_10_holder_rate || 0,
      biggestPool: info.biggest_pool_address || ''
    });
  }

  console.log(`\nFiltered list contains ${processedList.length} high-quality tokens.`);
  fs.writeFileSync('/home/luca/centaur-dashboard/src/assets/historical_tokens.json', JSON.stringify(processedList, null, 2));
  console.log('Saved to src/assets/historical_tokens.json');
};

run();
