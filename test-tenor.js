fetch("https://g.tenor.com/v1/search?q=funny&key=LIVDSRZULELA&limit=20").then(r => {
    console.log("Status:", r.status, r.statusText);
    return r.text();
}).then(console.log).catch(console.error);
