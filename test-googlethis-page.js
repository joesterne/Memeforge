import google from 'googlethis';

async function run() {
  const page1 = await google.image('funny cat gif', { safe: false });
  console.log('p1:', page1.length);
  // does googlethis support page? or pagination?
  // let's try additional request?
}
run();
