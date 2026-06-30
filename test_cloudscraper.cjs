const cloudscraper = require('cloudscraper');

const tokenAddr = '0xbd6bab2a8911ced4ba8150fdd35e5f7d4e807777';
const url = `https://gmgn.ai/api/v1/token_trades/bsc/${tokenAddr}?limit=100`;

console.log('Fetching from GMGN via cloudscraper:', url);

cloudscraper.get(url, (err, res, body) => {
  if (err) {
    console.error('Error fetching trades:', err.message);
  } else {
    console.log('Response Status:', res.statusCode);
    try {
      const data = JSON.parse(body);
      console.log('Success! Trades found:', data?.data?.history?.length);
      if (data?.data?.history?.length > 0) {
        console.log('Sample trade:', JSON.stringify(data.data.history[0], null, 2));
      }
    } catch (parseErr) {
      console.error('Failed to parse body as JSON:', parseErr.message);
      console.log('Body snippet:', body.slice(0, 500));
    }
  }
});
