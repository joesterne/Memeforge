const fs = require('fs');
let code = fs.readFileSync('src/pages/Home.tsx', 'utf-8');

// Fix importBookmarks mapping
const importTarget = `              tenorId: firstGif.id,
              url: firstGif.url,
              previewUrl: firstGif.previewUrl,
              title: firstGif.title,
              query: bookmark,
              importedAt: Date.now()`;
const newImportTarget = `              tenorId: firstGif.id,
              url: firstGif.url,
              previewUrl: firstGif.url,
              title: firstGif.name || bookmark,
              query: bookmark,
              importedAt: Date.now()`;
code = code.replace(importTarget, newImportTarget);

// Fix JSX mapping for thumbnails
const jsxTarget = `                  <img
                    src={gif.previewUrl}
                    alt={gif.title}
                    className="w-full h-32 object-cover"
                  />`;
const newJsxTarget = `                  <img
                    src={gif.url || gif.previewUrl}
                    alt={gif.title || gif.query}
                    className="w-full h-32 object-cover"
                  />`;
code = code.replace(jsxTarget, newJsxTarget);

fs.writeFileSync('src/pages/Home.tsx', code);
