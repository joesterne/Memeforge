fetch("https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=funny&limit=20").then(r => {
    console.log("Status:", r.status, r.statusText);
    return r.text();
}).then(r => console.log(r.substring(0, 200))).catch(console.error);
