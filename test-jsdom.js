import { JSDOM } from 'jsdom';
const dom = new JSDOM(`<!DOCTYPE html><html><body><script type="module" src="http://localhost:3000/src/main.tsx"></script></body></html>`, {
  url: "http://localhost:3000/editor/new",
  runScripts: "dangerously",
  resources: "usable"
});

dom.window.console.log = (msg) => { console.log('LOG:', msg); };
dom.window.console.error = (msg) => { console.error('ERROR:', msg); };
dom.window.addEventListener("error", (event) => {
  console.error("PAGE ERROR:", event.error);
});
setTimeout(() => {
  console.log("Done");
}, 5000);
