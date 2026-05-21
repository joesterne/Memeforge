import fetch from 'node-fetch';
async function test() {
  const res = await fetch('https://media.tenor.com/P1j37Iijv7wAAAPo/cat-funny.mp4');
  console.log(res.headers.get('access-control-allow-origin'));
}
test();
