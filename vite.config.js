import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'https';
import { exec } from 'child_process';
import fs from 'fs';
import crypto from 'crypto';

const flapProxy = () => ({
  name: 'flap-proxy',
  configureServer(server) {
    const socialsDbPath = './scanned_socials.json';
    let db = { socials: {}, tokens: {} };
    try {
      if (fs.existsSync(socialsDbPath)) {
        const parsed = JSON.parse(fs.readFileSync(socialsDbPath, 'utf8'));
        if (parsed.socials && parsed.tokens) {
          db = parsed;
        } else {
          db.socials = parsed || {};
          db.tokens = {};
        }
      }
    } catch (e) {
      console.error("Failed to load scanned_socials.json:", e);
    }

    const saveSocialsDb = () => {
      try {
        fs.writeFileSync(socialsDbPath, JSON.stringify(db, null, 2));
      } catch (e) {
        console.error("Failed to save scanned_socials.json:", e);
      }
    };

    const registerSocialUrl = (url, tokenAddr) => {
      if (!url) return 0;
      const key = url.trim().toLowerCase().split('?')[0];
      if (key.includes('t.me/flap') || key.includes('x.com/flap') || key.includes('flap.sh') || key.length < 15) return 0;
      
      const lowercaseAddr = tokenAddr.toLowerCase();
      
      if (db.socials[key] && db.socials[key] !== lowercaseAddr) {
        return db.socials[key];
      }
      db.socials[key] = lowercaseAddr;
      saveSocialsDb();
      return 0;
    };

    const checkWebsiteForSolana = (url, tokenAddr) => {
      if (!url) return;
      const cleanUrl = url.trim();
      if (!cleanUrl.startsWith('http')) return;
      
      const lowercaseAddr = tokenAddr.toLowerCase();
      
      https.get(cleanUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        timeout: 5000
      }, (response) => {
        if (response.statusCode !== 200) return;
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          const lower = data.toLowerCase();
          const matches = ['solana', 'phantom wallet', 'phantom_wallet', 'pump.fun', 'pumpfun', 'raydium', 'jupiter', 'jup.ag', 'spl-20', 'solana network'].some(term => lower.includes(term));
          if (matches) {
            console.log(`[Solana Check] Solana reference found on website for ${lowercaseAddr}: ${cleanUrl}`);
            if (!db.tokens[lowercaseAddr]) db.tokens[lowercaseAddr] = {};
            db.tokens[lowercaseAddr].is_solana = true;
            saveSocialsDb();
          } else {
            if (!db.tokens[lowercaseAddr]) db.tokens[lowercaseAddr] = {};
            db.tokens[lowercaseAddr].is_solana = false;
            saveSocialsDb();
          }
        });
      }).on('error', () => {
        if (!db.tokens[lowercaseAddr]) db.tokens[lowercaseAddr] = {};
        if (db.tokens[lowercaseAddr].is_solana === undefined) {
          db.tokens[lowercaseAddr].is_solana = false;
          saveSocialsDb();
        }
      });
    };

    server.middlewares.use('/api/flap', (req, res) => {
      const token = req.url.replace('/', '').split('?')[0];
      https.get(`https://flap.sh/bnb/${token}`, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          res.setHeader('Content-Type', 'text/html');
          res.end(data);
        });
      }).on('error', (e) => {
        res.statusCode = 500;
        res.end(e.message);
      });
    });

    server.middlewares.use('/api/gmgn/token', (req, res) => {
      const parts = req.url.split('/');
      const tokenAddress = parts[parts.length - 1].split('?')[0];
      
      let info = null;
      let security = null;
      let completed = 0;

      const checkDone = () => {
        completed++;
        if (completed === 2) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ info, security }));
        }
      };

      exec(`gmgn-cli token info --chain bsc --address ${tokenAddress} --raw`, (err, stdout) => {
        if (!err && stdout) {
          try { 
            info = JSON.parse(stdout); 
            if (info && info.link) {
              const tgUrl = info.link.telegram || "";
              const xUrl = info.link.twitter_username ? (info.link.twitter_username.startsWith('http') ? info.link.twitter_username : `https://x.com/${info.link.twitter_username}`) : "";
              const websiteUrl = info.link.website || "";
              
              const tgDuplicateOf = registerSocialUrl(tgUrl, tokenAddress);
              const xDuplicateOf = registerSocialUrl(xUrl, tokenAddress);
              const webDuplicateOf = registerSocialUrl(websiteUrl, tokenAddress);
              
              if (tgDuplicateOf) {
                info.telegram_dup = 1;
                info.telegram_clone_of = tgDuplicateOf;
              }
              if (xDuplicateOf) {
                info.twitter_dup = 1;
                info.twitter_clone_of = xDuplicateOf;
              }
              if (webDuplicateOf) {
                info.website_dup = 1;
                info.website_clone_of = webDuplicateOf;
              }

              const lowercaseAddr = tokenAddress.toLowerCase();
              if (websiteUrl && websiteUrl.startsWith('http')) {
                if (db.tokens[lowercaseAddr]?.is_solana === undefined) {
                  checkWebsiteForSolana(websiteUrl, tokenAddress);
                } else if (db.tokens[lowercaseAddr]?.is_solana === true) {
                  info.website_is_solana = true;
                }
              }
            }
          } catch (_) {}
        }
        checkDone();
      });

      exec(`gmgn-cli token security --chain bsc --address ${tokenAddress} --raw`, (err, stdout) => {
        if (!err && stdout) {
          try { security = JSON.parse(stdout); } catch (_) {}
        }
        checkDone();
      });
    });

    server.middlewares.use('/api/gmgn/launches', async (req, res) => {
      try {
        // Fallback intelligente dei percorsi di inclusione (Locale NPM -> Docker Cloud -> PC NVM)
        let OpenApiClient;
        try {
          OpenApiClient = require('gmgn-cli/dist/client/OpenApiClient.js').OpenApiClient;
        } catch (e) {
          try {
            OpenApiClient = require('/usr/local/lib/node_modules/gmgn-cli/dist/client/OpenApiClient.js').OpenApiClient;
          } catch (e2) {
            OpenApiClient = require('/home/luca/.nvm/versions/node/v22.22.1/lib/node_modules/gmgn-cli/dist/client/OpenApiClient.js').OpenApiClient;
          }
        }

        if (!OpenApiClient) {
          throw new Error("Impossibile caricare l'SDK di gmgn-cli in nessun percorso.");
        }

        const client = new OpenApiClient({
          apiKey: 'gmgn_6c719521eb31032ca2ecf471b0143fab',
          host: 'https://openapi.gmgn.ai'
        });
        const apiRes = await client.getTrenches('bsc', ['new_creation', 'near_completion', 'completed'], ['flap'], 80);
        
        const rawList = [
          ...(Array.isArray(apiRes?.new_creation) ? apiRes.new_creation : []),
          ...(Array.isArray(apiRes?.near_completion) ? apiRes.near_completion : []),
          ...(Array.isArray(apiRes?.completed) ? apiRes.completed : [])
        ];

        const seen = new Set();
        const formattedList = [];
        for (const item of rawList) {
          if (item.address && !seen.has(item.address.toLowerCase())) {
            seen.add(item.address.toLowerCase());
            
            const buyTax = item.buy_tax !== null && item.buy_tax !== undefined ? item.buy_tax * 100 : null;
            const sellTax = item.sell_tax !== null && item.sell_tax !== undefined ? item.sell_tax * 100 : null;
            const isHighTax = buyTax !== null && (buyTax > 9 || sellTax > 9);
            
            if (isHighTax) continue;

            const tgUrl = item.telegram || null;
            const isGeneric = item.twitter_handle?.toLowerCase() === 'bnbchain' || 
                              item.twitter?.toLowerCase() === 'bnbchain' ||
                              item.twitter?.includes('communities');
            
            const xUrl = item.twitter && !isGeneric ? (item.twitter.startsWith('http') ? item.twitter : `https://x.com/${item.twitter}`) : null;
            
            let websiteUrl = item.website || null;
            const isWebGeneric = websiteUrl && (
              websiteUrl.includes('flap.sh') ||
              websiteUrl.includes('four.meme') ||
              websiteUrl.includes('debox.pro') ||
              websiteUrl.includes('binance.com') ||
              websiteUrl.includes('bnbchain.org')
            );
            if (isWebGeneric) websiteUrl = null;

            if (tgUrl) registerSocialUrl(tgUrl, item.address);
            if (xUrl) registerSocialUrl(xUrl, item.address);
            if (websiteUrl) registerSocialUrl(websiteUrl, item.address);

            const isStealth = !tgUrl && !xUrl && !websiteUrl;

            const date = new Date(item.created_timestamp * 1000);
            const timeStr = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            const dayStr = date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
            const timestamp = `${dayStr} ${timeStr}`;

            formattedList.push({
              txHash: '0x',
              creator: item.creator,
              tokenAddress: item.address,
              tokenName: item.name,
              tokenSymbol: item.symbol,
              realLogo: item.logo,
              isStealth,
              hasTelegram: !!tgUrl,
              hasTwitter: !!xUrl,
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
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, tokens: formattedList }));
      } catch (err) {
        // Logga l'errore esatto nel terminale del container cloud
        console.error("[CRITICAL BACKEND ERROR IN /api/gmgn/launches]:", err);
        res.statusCode = 500;
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });

    server.middlewares.use('/api/gmgn/holders', (req, res) => {
      const parts = req.url.split('/');
      const tokenAddress = parts[parts.length - 1].split('?')[0];

      exec(`gmgn-cli token holders --chain bsc --address ${tokenAddress}`, (err, stdout) => {
        if (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(stdout);
      });
    });

    server.middlewares.use('/api/gmgn/traders', (req, res) => {
      const parts = req.url.split('/');
      const tokenAddress = parts[parts.length - 1].split('?')[0];

      exec(`gmgn-cli token traders --chain bsc --address ${tokenAddress}`, (err, stdout) => {
        if (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(stdout);
      });
    });

    server.middlewares.use('/api/gmgn/swap-route', (req, res) => {
      const query = req.url.split('?')[1] || '';
      const params = new URLSearchParams(query);
      const tokenIn  = params.get('input_token')  || '';
      const tokenOut = params.get('output_token') || '';
      const amount   = params.get('amount')       || '0';
      const slippage = params.get('slippage')     || '15';
      const from     = params.get('from')         || '';

      const cleanTokenIn = tokenIn.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
        ? '0x0000000000000000000000000000000000000000'
        : tokenIn;
      const cleanTokenOut = tokenOut.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
        ? '0x0000000000000000000000000000000000000000'
        : tokenOut;

      const apiKey = 'gmgn_6c719521eb31032ca2ecf471b0143fab';
      let privateKeyPem;
      try {
        privateKeyPem = fs.readFileSync('./gmgn_private.pem', 'utf8');
      } catch (e) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Private key file gmgn_private.pem not found' }));
        return;
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const clientId = crypto.randomUUID();
      const subPath = '/v1/trade/quote';

      const queryParams = {
        chain: 'bsc',
        from_address: from.toLowerCase(),
        input_token: cleanTokenIn,
        output_token: cleanTokenOut,
        input_amount: amount,
        slippage: slippage,
        timestamp: String(timestamp),
        client_id: clientId
      };

      const sortedQs = Object.keys(queryParams)
        .sort()
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
        .join('&');

      const message = `${subPath}:${sortedQs}::${timestamp}`;

      let signature;
      try {
        const msgBuf = Buffer.from(message, 'utf-8');
        const sig = crypto.sign(null, msgBuf, privateKeyPem);
        signature = sig.toString('base64');
      } catch (e) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: `Signature failed: ${e.message}` }));
        return;
      }

      const urlParams = new URLSearchParams(queryParams);
      const url = `https://openapi.gmgn.ai${subPath}?${urlParams.toString()}`;

      const options = {
        method: 'GET',
        headers: {
          'X-APIKEY': apiKey,
          'X-Signature': signature,
          'Content-Type': 'application/json'
        }
      };

      const request = https.get(url, options, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          if (response.statusCode !== 200) {
            res.statusCode = response.statusCode;
          }
          try {
            const json = JSON.parse(data);
            if (json.data) {
              if (json.data.tx && !json.data.raw_tx) {
                json.data.raw_tx = json.data.tx;
              }
              if (!json.data.quote) {
                json.data.quote = {
                  out_amount: json.data.output_amount || json.data.amount_out || '0',
                  output_amount: json.data.output_amount || json.data.amount_out || '0',
                  buy_amount: json.data.output_amount || json.data.amount_out || '0'
                };
              }
            }
            res.end(JSON.stringify(json));
          } catch (e) {
            res.end(data);
          }
        });
      });
    });

    server.middlewares.use('/api/trades', (req, res) => {
      const urlObj = new URL(req.url, 'http://localhost');
      const poolAddress  = urlObj.searchParams.get('pool')   || '';
      const tokenAddress = urlObj.searchParams.get('token')  || '';
      const fromBlock    = urlObj.searchParams.get('from')   || '0x0';
      const toBlock      = urlObj.searchParams.get('to')      || 'latest';
      if (!tokenAddress) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'missing token param' }));
        return;
      }

      res.setHeader('Content-Type', 'application/json');

      const executeRpc = (method, params) => {
        const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
        const makeRequest = (host) => {
          return new Promise((resolve, reject) => {
            const options = {
              hostname: host,
              path: '/',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
              }
            };
            const request = https.request(options, (response) => {
              let data = '';
              response.on('data', chunk => data += chunk);
              response.on('end', () => {
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.error) reject(new Error(parsed.error.message));
                  else resolve(parsed.result);
                } catch (e) { reject(e); }
              });
            });
            request.on('error', reject);
            request.write(payload);
            request.end();
          });
        };

        return makeRequest('bsc.drpc.org')
          .catch(() => makeRequest('bsc-dataseed.binance.org'));
      };

      if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
        const SWAP_TOPIC = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
        executeRpc('eth_getLogs', [{ fromBlock, toBlock, address: poolAddress, topics: [SWAP_TOPIC] }])
          .then(logs => {
            const t0isToken = tokenAddress.toLowerCase() < '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';
            const trades = (logs || []).map(l => {
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
            res.end(JSON.stringify({ trades }));
          })
          .catch(err => {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          });
      } else {
        const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
        executeRpc('eth_getLogs', [{ fromBlock, toBlock, address: tokenAddress, topics: [TRANSFER_TOPIC] }])
          .then(logs => {
            const trades = (logs || []).map(l => {
              const fromAddr = '0x' + l.topics[1].slice(26);
              const toAddr   = '0x' + l.topics[2].slice(26);
              const value    = BigInt(l.data || '0x0');
              const isMint = fromAddr === '0x0000000000000000000000000000000000000000';
              const type = isMint ? 'BUY' : 'SELL';
              const wallet = isMint ? toAddr : fromAddr;
              return { type, bnbAmount: '0', tokenAmount: value.toString(), wallet, tx: l.transactionHash, block: parseInt(l.blockNumber, 16) };
            }).reverse();
            res.end(JSON.stringify({ trades }));
          })
          .catch(err => {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          });
      }
    });

    server.middlewares.use('/api/gmgn/swap', (req, res) => {
      const urlObj = new URL(req.url, 'http://localhost');
      const chain = urlObj.searchParams.get('chain') || 'bsc';
      const from = urlObj.searchParams.get('from');
      const inputToken = urlObj.searchParams.get('input_token');
      const outputToken = urlObj.searchParams.get('output_token');
      const amount = urlObj.searchParams.get('amount');
      const slippage = urlObj.searchParams.get('slippage') || '10';

      if (!from || !inputToken || !outputToken || !amount) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Missing parameters: from, input_token, output_token, amount" }));
        return;
      }

      const cmd = `gmgn-cli swap --chain ${chain} --from ${from} --input-token ${inputToken} --output-token ${outputToken} --amount ${amount} --slippage ${slippage} --raw`;
      
      exec(cmd, (err, stdout) => {
        if (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(stdout);
      });
    });
  }
});

export default defineConfig({
  plugins: [react(), flapProxy()],
  server: {
    allowedHosts: true
  }
})
