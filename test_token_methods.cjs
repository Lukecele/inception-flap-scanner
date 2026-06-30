const { ethers } = require('ethers');

const RPC_URL = 'https://bsc-dataseed.binance.org';
const tokenAddr = '0xbd6bab2a8911ced4ba8150fdd35e5f7d4e807777';

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  // Let's try calling some standard properties
  const abi = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function website() view returns (string)',
    'function twitter() view returns (string)',
    'function telegram() view returns (string)',
    'function desc() view returns (string)',
    'function description() view returns (string)',
    'function logo() view returns (string)'
  ];
  
  const contract = new ethers.Contract(tokenAddr, abi, provider);
  
  for (const method of ['website', 'twitter', 'telegram', 'desc', 'description', 'logo']) {
    try {
      const val = await contract[method]();
      console.log(`${method}:`, val);
    } catch (e) {
      console.log(`${method}: FAILED (${e.message.slice(0, 50)})`);
    }
  }
}

main();
