const fs = require('fs');

async function main() {
  const tokenAddr = '0xbd6bab2a8911ced4ba8150fdd35e5f7d4e807777';
  const url = `https://flap.sh/token/${tokenAddr}`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await res.text();
    fs.writeFileSync('flap_page.html', html);
    console.log('Saved flap_page.html');
    
    // Search for self-initiating Next.js state or JSON
    const scriptTags = html.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/g) || [];
    console.log(`Found ${scriptTags.length} script tags.`);
    for (let i = 0; i < scriptTags.length; i++) {
      const tag = scriptTags[i];
      if (tag.includes('self.__next_f') || tag.includes('bootstrap') || tag.includes('JSON.parse')) {
        console.log(`Tag ${i} contains potential Next.js state (length ${tag.length}).`);
      }
    }
  } catch (err) {
    console.error(err);
  }
}

main();
