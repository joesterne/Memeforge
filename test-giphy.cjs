const https = require('https');

const apiKey = process.env.GIPHY_API_KEY;
if (!apiKey) {
  console.error('Set GIPHY_API_KEY in the environment before running this test.');
  process.exit(1);
}

const url = new URL('https://api.giphy.com/v1/gifs/search');
url.searchParams.set('q', 'cat');
url.searchParams.set('api_key', apiKey);
url.searchParams.set('limit', '1');

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => console.log(data));
});
