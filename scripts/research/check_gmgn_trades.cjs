const { OpenApiClient } = require('/home/luca/.nvm/versions/node/v22.22.1/lib/node_modules/gmgn-cli/dist/client/OpenApiClient.js');

async function main() {
  const client = new OpenApiClient({
    apiKey: process.env.GMGN_API_KEY || '',
    host: 'https://openapi.gmgn.ai'
  });
  
  const tokenAddr = '0xbd6bab2a8911ced4ba8150fdd35e5f7d4e807777';
  
  // Try different endpoints for token trades
  const endpoints = [
    { path: '/v1/market/token_trades', query: { chain: 'bsc', address: tokenAddr } },
    { path: '/v1/token/trades', query: { chain: 'bsc', address: tokenAddr } },
    { path: '/v1/token/trade_history', query: { chain: 'bsc', address: tokenAddr } }
  ];
  
  for (const ep of endpoints) {
    try {
      console.log(`Trying ${ep.path}...`);
      const res = await client.authExistRequest('GET', ep.path, ep.query);
      console.log(`Success on ${ep.path}:`, JSON.stringify(res, null, 2));
      return;
    } catch (err) {
      console.log(`Failed on ${ep.path}:`, err.message);
    }
  }
}

main();
