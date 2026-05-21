const https = require('https');
https.get('https://html.duckduckgo.com/html/?q=cat+gif', (res) => {
  let data = '';
  res.on('data', (d) => data += d);
  res.on('end', () => {
    const urls = [];
    const regex = /<img.*?src="([^"]+)".*?>/g;
    let match;
    while(match = regex.exec(data)) {
      urls.push(match[1]);
    }
    console.log(urls);
  });
});
