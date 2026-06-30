const fs = require('fs');

async function main() {
  const url = 'https://flap.sh/_next/static/chunks/app/%5Bchain%5D/%5Bcoin%5D/page-0ad43e4efd2958dc.js?dpl=dpl_DsPbnYfLAFR3vbsYRwkJsah44XLB';
  try {
    const res = await fetch(url);
    const js = await res.text();
    
    // Regex to match local API routes starting with "/api/" or containing "api"
    const matches = js.match(/"\/api\/[^"]+"/g) || [];
    console.log('Unique /api/ routes found in JS:', [...new Set(matches)]);
    
    // Let's also check for queries to goldsky, indexers or other graphql endpoints
    const graphQLMatches = js.match(/https?:\/\/[^"]+/g) || [];
    const subgraphUrl = graphQLMatches.filter(u => u.includes('subgraph') || u.includes('goldsky') || u.includes('indexer') || u.includes('taxed'));
    console.log('Potential indexer/subgraph URLs:', [...new Set(subgraphUrl)]);
    
  } catch (err) {
    console.error(err);
  }
}

main();
