import google from 'googlethis';

async function run() {
  const page1 = await google.image('funny cat gif', { safe: false });
  console.log('p1:', page1.length);
  // does it support page in options? Let's check docs or just test.
  // actually looking at googlethis source, it might just scrape the first block.
}
run();
