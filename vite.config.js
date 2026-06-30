import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'https';
import fs from 'fs';
import crypto from 'crypto';

const flapProxy = () => ({
  name: 'flap-proxy',
  configureServer(server) {
    const apiKey = 'gmgn_6c719521eb31032ca2ecf471b0143fab';
    const host = 'https://openapi.gmgn.ai';

    // Helper universale per fare chiamate HTTP pulite all'API di GMGN senza usare la CLI
    const fetchFromGmgn = (path, res) => {
      const options = {
        method: 'GET',
        headers: { 'X-APIKEY': apiKey, 'Content-Type': 'application/json' }
      };
      https.get(`${host}${path}`, options, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = response.statusCode;
          res.end(data);
        });
      }).on('error', (e) => {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e.message }));
      });
    };

    // 1. STREAM LANCIPAD: Solo i token appena nati (new_creation), rimosso 'completed' vecchio
    server.middlewares.use('/api/gmgn/launches', async (req, res) => {
      try {
        const { OpenApiClient } = require('gmgn-cli/dist/client/OpenApiClient.js');
        const client = new OpenApiClient({ apiKey, host });
        const apiRes = await client.getTrenches('bsc', ['new_creation'], ['flap'], 80);
        
        const rawList = Array.isArray(apiRes?.new_creation) ? apiRes.new_creation : [];
        const formattedList = rawList.map(item => {
          const buyTax = item.buy_tax !== null ? item.buy_tax * 100 : null;
          const sellTax = item.sell_tax !== null ? item.sell_tax * 100 : null;
          return {
            tokenAddress: item.address,
            tokenName: item.name || "Sconosciuto",
            tokenSymbol: item.symbol || "???",
            realLogo: item.logo,
            creator: item.creator,
            buyTax, sellTax,
            taxKnown: buyTax !== null,
            isHighTax: buyTax > 9 || sellTax > 9,
            isStealth: !item.telegram && !item.twitter && !item.website,
            tgUrl: item.telegram, xUrl: item.twitter, websiteUrl: item.website,
            smartMoneyCount: item.smart_degen_count || 0,
            kolCount: item.renowned_count || 0,
            sniperCount: item.sniper_count || 0,
            launchpadProgress: item.launchpad_progress || 0,
            liquidityUsd: item.liquidity || 0,
            marketCapUsd: item.usd_market_cap || 0,
            isHoneypot: item.is_honeypot === 'yes',
            taxInnovation: buyTax === 0 ? "Standard (No Tax)" : "Proxy Standard Flap"
          };
        });

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, tokens: formattedList }));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });

    // 2. DETTAGLIO TOKEN (Sostituito exec con API diretta)
    server.middlewares.use('/api/gmgn/token', (req, res) => {
      const parts = req.url.split('/');
      const tokenAddress = parts[parts.length - 1].split('?')[0];
      fetchFromGmgn(`/v1/token/info/bsc/${tokenAddress}`, res);
    });

    // 3. HOLDERS (Sostituito exec con API diretta)
    server.middlewares.use('/api/gmgn/holders', (req, res) => {
      const parts = req.url.split('/');
      const tokenAddress = parts[parts.length - 1].split('?')[0];
      fetchFromGmgn(`/v1/token/holders/bsc/${tokenAddress}?limit=20`, res);
    });

    // 4. TRADERS TRANSACTION (Sostituito exec con API diretta)
    server.middlewares.use('/api/gmgn/traders', (req, res) => {
      const parts = req.url.split('/');
      const tokenAddress = parts[parts.length - 1].split('?')[0];
      fetchFromGmgn(`/v1/token/traders/bsc/${tokenAddress}?limit=20`, res);
    });

    // 5. QUOTE / SWAP ROUTE (Invariato e funzionante)
    server.middlewares.use('/api/gmgn/swap-route', (req, res) => {
      const query = req.url.split('?')[1] || '';
      const params = new URLSearchParams(query);
      let privateKeyPem;
      try { privateKeyPem = fs.readFileSync('./gmgn_private.pem', 'utf8'); } catch (e) {
        res.statusCode = 500; res.end(JSON.stringify({ error: 'Key pem missing' })); return;
      }
      const timestamp = Math.floor(Date.now() / 1000);
      const clientId = crypto.randomUUID();
      const subPath = '/v1/trade/quote';
      const queryParams = {
        chain: 'bsc', from_address: (params.get('from')||'').toLowerCase(),
        input_token: params.get('input_token'), output_token: params.get('output_token'),
        input_amount: params.get('amount'), slippage: params.get('slippage') || '15',
        timestamp: String(timestamp), client_id: clientId
      };
      const sortedQs = Object.keys(queryParams).sort().map(k => `${k}=${queryParams[k]}`).join('&');
      const message = `${subPath}:${sortedQs}::${timestamp}`;
      const signature = crypto.sign(null, Buffer.from(message, 'utf-8'), privateKeyPem).toString('base64');
      
      const url = `${host}${subPath}?${new URLSearchParams(queryParams).toString()}`;
      https.get(url, { headers: { 'X-APIKEY': apiKey, 'X-Signature': signature } }, (apiRes) => {
        let d = ''; apiRes.on('data', chunk => d += chunk);
        apiRes.on('end', () => { res.setHeader('Content-Type', 'application/json'); res.end(d); });
      });
    });
  }
});

export default defineConfig({
  plugins: [react(), flapProxy()],
  server: { allowedHosts: true }
})
