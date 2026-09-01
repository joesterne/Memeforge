const fs = require('fs');
fetch('https://imgflip.com/memetemplates?search=work')
  .then(r => r.text())
  .then(text => {
    const itemRegex = /<img class="shadow"[^>]+alt="([^"]+)"\s+src="(\/\/i\.imgflip\.com\/[^"]+)"/g;
    let match;
    let count = 0;
    while ((match = itemRegex.exec(text)) !== null && count < 20) {
      console.log(match[1], match[2]);
      count++;
    }
  });
