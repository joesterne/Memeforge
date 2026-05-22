const fs = (await import('fs')).default;
const buf = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAQAAAAEAAQMAAABmvDolAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAACtJREFUeNrtwQENAAAAwqD3T20PBxQAAAAAAAAAAAAAAAAAAAAAAAAAAAD8GD0AAAFE3HljAAAAAElFTkSuQmCC', 'base64');
if (!fs.existsSync('public')) fs.mkdirSync('public');
fs.writeFileSync('public/pwa-192x192.png', buf);
fs.writeFileSync('public/pwa-512x512.png', buf);
fs.writeFileSync('public/apple-touch-icon.png', buf);
fs.writeFileSync('public/mask-icon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="white"/></svg>');
