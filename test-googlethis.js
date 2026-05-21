import google from 'googlethis';

async function run() {
  const images = await google.image('funny cat gif', { safe: false });
  console.log(images.slice(0, 2));
}

run();
