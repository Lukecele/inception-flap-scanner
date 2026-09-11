const { OpenApiClient } = require('/home/luca/.nvm/versions/node/v22.22.1/lib/node_modules/gmgn-cli/dist/client/OpenApiClient.js');

async function main() {
  const client = new OpenApiClient({
    apiKey: process.env.GMGN_API_KEY || '',
    host: 'https://openapi.gmgn.ai'
  });
  
  console.log('Fetching trenches...');
  const apiRes = await client.getTrenches('bsc', ['new_creation', 'near_completion', 'completed'], ['flap'], 80);
  
  const rawList = [
    ...(Array.isArray(apiRes?.new_creation) ? apiRes.new_creation : []),
    ...(Array.isArray(apiRes?.near_completion) ? apiRes.near_completion : []),
    ...(Array.isArray(apiRes?.completed) ? apiRes.completed : [])
  ];
  
  const target = rawList.find(item => item.address?.toLowerCase() === '0xbd6bab2a8911ced4ba8150fdd35e5f7d4e807777');
  
  if (target) {
    console.log('Found token in trenches list:', JSON.stringify(target, null, 2));
  } else {
    console.log('Token not found in trenches list.');
  }
}

main();
