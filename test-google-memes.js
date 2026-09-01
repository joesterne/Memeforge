import google from 'googlethis';
async function run() {
  const images = await google.image('work meme template blank', { safe: false });
  console.log(images.slice(0, 3));
}
run();
