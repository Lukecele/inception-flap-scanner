const { ethers } = require('ethers');

const RPC_URL = 'https://bsc-dataseed.binance.org';
const factoryAddr = '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0';
const tokenAddr = '0xbd6bab2a8911ced4ba8150fdd35e5f7d4e807777';

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  const latest = await provider.getBlockNumber();
  const fromBlock = latest - 1000;
  console.log('Latest block:', latest, 'scanning from:', fromBlock);
  
  const tokenTopic = '0x' + tokenAddr.toLowerCase().replace('0x', '').padStart(64, '0');
  
  const logs = await provider.send('eth_getLogs', [{
    fromBlock: '0x' + fromBlock.toString(16),
    toBlock: 'latest',
    address: factoryAddr,
    topics: [null, tokenTopic]
  }]);
  
  console.log('Found logs:', logs.length);
  if (logs.length > 0) {
    const log = logs[0];
    console.log('Log data:', log.data);
    console.log('Log topics:', log.topics);
    
    const abi = [
      'event TokenCreated(address indexed token, address creator, string name, string symbol, string desc, string logo, string website, string twitter, string telegram, uint256 index)'
    ];
    const iface = new ethers.Interface(abi);
    try {
      const parsed = iface.parseLog(log);
      console.log('Parsed Event Data:', parsed.args);
    } catch (e) {
      console.log('Failed to parse:', e.message);
    }
  }
}

main();
