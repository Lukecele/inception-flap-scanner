const fs = require('fs');

async function main() {
  const tokenAddr = '0xbd6bab2a8911ced4ba8150fdd35e5f7d4e807777';
  const url = `https://flap.sh/token/${tokenAddr}`;
  
  try {
    console.log(`Fetching ${url}...`);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await res.text();
    
    console.log(`HTML Length: ${html.length}`);
    
    // Check if there is __NEXT_DATA__
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      console.log('Found __NEXT_DATA__! Writing to file next_data.json...');
      fs.writeFileSync('next_data.json', nextDataMatch[1]);
      const data = JSON.parse(nextDataMatch[1]);
      console.log('Keys in next data:', Object.keys(data));
      if (data.props) {
        console.log('Keys in props:', Object.keys(data.props));
        if (data.props.pageProps) {
          console.log('Keys in pageProps:', Object.keys(data.props.pageProps));
        }
      }
    } else {
      console.log('No __NEXT_DATA__ found.');
      // Let's write the first 2000 chars of HTML
      console.log(html.slice(0, 1000));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
