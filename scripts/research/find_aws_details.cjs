const fs = require('fs');

async function main() {
  const url = 'https://flap.sh/_next/static/chunks/app/%5Bchain%5D/%5Bcoin%5D/page-0ad43e4efd2958dc.js?dpl=dpl_DsPbnYfLAFR3vbsYRwkJsah44XLB';
  try {
    const res = await fetch(url);
    const js = await res.text();
    
    const key = 'x0j0yguk7i';
    const idx = js.indexOf(key);
    if (idx !== -1) {
      console.log('Found AWS Gateway at index:', idx);
      console.log('Snippet:', js.slice(Math.max(0, idx - 200), idx + 800));
    } else {
      console.log('Not found.');
    }
  } catch (err) {
    console.error(err);
  }
}

main();
