const fs = require('fs');
const text = fs.readFileSync('imgflip_search.html', 'utf8');
const itemRegex = /<a class="s-result clearfix" href="\/i\/[^"]+"><img src="\/\/i\.imgflip\.com\/2\/([^"]+)"\/><div class="s-result-title">([^<]+)<\/div>/g;
let match;
let count = 0;
while ((match = itemRegex.exec(text)) !== null && count < 20) {
  console.log(match[1], match[2]);
  count++;
}
