async function main() {
  const url = 'https://flap.sh/_next/static/chunks/app/%5Bchain%5D/%5Bcoin%5D/page-0ad43e4efd2958dc.js?dpl=dpl_DsPbnYfLAFR3vbsYRwkJsah44XLB';
  try {
    console.log(`Fetching ${url}...`);
    const res = await fetch(url);
    const js = await res.text();
    console.log(`JS Length: ${js.length}`);
    
    // Find all occurrences of HTTP urls or endpoints
    const matches = js.match(/https?:\/\/[^\s"'`{}()]+/g) || [];
    console.log('Matches:', matches);
    
    // Also search for words like "trades", "price", "swap" to see what context they are used in
    const searchTerms = ['taxed', 'gql', 'graphql', 'query', 'fetch', 'api'];
    for (const term of searchTerms) {
      const idx = js.toLowerCase().indexOf(term);
      if (idx !== -1) {
        console.log(`Found "${term}" at index ${idx}. Snippet:`, js.slice(Math.max(0, idx - 100), idx + 200));
      }
    }
  } catch (err) {
    console.error(err);
  }
}

main();
