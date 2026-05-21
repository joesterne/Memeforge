import { decodeFrames } from 'modern-gif';
import fetch from 'node-fetch';

async function test() {
  const buffer = await fetch('https://media.tenor.com/P1j37Iijv7wAAAPo/cat-funny.mp4?format=gif').then(r => r.arrayBuffer());
  const frames = await decodeFrames(buffer);
  console.log('Frame data type:', frames[0].data.constructor.name);
}
test().catch(console.error);
