fetch("https://tenor.googleapis.com/v2/search?q=funny&key=LIVDSRZULELA&limit=20").then(r => {
    console.log("Status:", r.status, r.statusText);
    return r.text();
}).then(console.log).catch(console.error);
