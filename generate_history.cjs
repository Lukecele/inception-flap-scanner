const { OpenApiClient } = require('/home/luca/.nvm/versions/node/v22.22.1/lib/node_modules/gmgn-cli/dist/client/OpenApiClient.js');
const fs = require('fs');

async function generateHistory() {
  console.log("Fetching historical tokens from GMGN API...");
  const client = new OpenApiClient({
    apiKey: 'gmgn_6c719521eb31032ca2ecf471b0143fab',
    host: 'https://openapi.gmgn.ai'
  });

  try {
    const res = await client.getTrenches('bsc', ['new_creation', 'near_completion', 'completed'], ['flap'], 80);
    const validTokens = [];
    
    // Combine lists
    const rawList = [
      ...(Array.isArray(res?.new_creation) ? res.new_creation : []),
      ...(Array.isArray(res?.near_completion) ? res.near_completion : []),
      ...(Array.isArray(res?.completed) ? res.completed : [])
    ];

    // Remove duplicates
    const seen = new Set();
    const uniqueList = [];
    for (const item of rawList) {
      if (item.address && !seen.has(item.address.toLowerCase())) {
        seen.add(item.address.toLowerCase());
        uniqueList.push(item);
      }
    }

    console.log(`Found ${uniqueList.length} unique tokens from GMGN.`);

    for (const item of uniqueList) {
      const buyTax = item.buy_tax !== null && item.buy_tax !== undefined ? item.buy_tax * 100 : null;
      const sellTax = item.sell_tax !== null && item.sell_tax !== undefined ? item.sell_tax * 100 : null;
      const isHighTax = buyTax !== null && (buyTax > 9 || sellTax > 9);
      
      if (isHighTax) {
        continue;
      }
      
      const tgUrl = item.telegram || null;
      const isTweet = item.twitter_is_tweet || 
                      item.twitter?.includes('/status/') || 
                      item.twitter?.includes('/i/status/');
      const isGeneric = item.twitter_handle?.toLowerCase() === 'bnbchain' || item.twitter?.toLowerCase() === 'bnbchain';
      
      const xUrl = item.twitter && !isTweet && !isGeneric ? (item.twitter.startsWith('http') ? item.twitter : `https://x.com/${item.twitter}`) : null;
      const websiteUrl = item.website || null;
      const hasTelegram = !!tgUrl;
      const hasTwitter = !!xUrl;
      const isStealth = !tgUrl && !xUrl && !websiteUrl;

      // Format timestamp
      const date = new Date(item.created_timestamp * 1000);
      const timeStr = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      const dayStr = date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
      const timestamp = `${dayStr} ${timeStr}`;

      validTokens.push({
        txHash: '0x',
        creator: item.creator,
        tokenAddress: item.address,
        tokenName: item.name,
        tokenSymbol: item.symbol,
        realLogo: item.logo,
        isStealth,
        hasTelegram,
        hasTwitter,
        tgUrl,
        xUrl,
        websiteUrl,
        hasSocialClone: false,
        cloneWarning: null,
        taxInnovation: buyTax === 0 ? "Standard (Nessuna Tassa)" : "Proxy Standard Flap",
        isHighTax: false,
        taxKnown: buyTax !== null,
        buyTax,
        sellTax,
        devClusterHistory: "✅ Verificato GMGN",
        pastScamsCount: 0,
        funderText: "Exchange/Bridge",
        webStatus: isStealth ? "Nessun social pubblico" : "✅ Social verificati",
        block: 0,
        timestamp,
        isHistorical: true,
        kolCount: item.renowned_count || 0,
        smartMoneyCount: item.smart_degen_count || 0,
        whaleCount: 0,
        sniperCount: item.sniper_count || 0,
        creatorCreatedCount: item.creator_created_count || 0,
        liquidityUsd: item.liquidity || 0,
        marketCapUsd: item.usd_market_cap || 0,
        isHoneypot: item.is_honeypot === 'yes',
        launchpadProgress: item.launchpad_progress || 0,
        creatorHoldRate: item.creator_hold_rate || 0,
        top10HolderRate: item.top_10_holder_rate || 0
      });
    }

    fs.writeFileSync('./src/assets/historical_tokens.json', JSON.stringify(validTokens, null, 2));
    console.log(`Successfully saved ${validTokens.length} valid historical tokens from GMGN.`);
  } catch (err) {
    console.error("Error fetching trenches:", err.message);
  }
}

generateHistory();
