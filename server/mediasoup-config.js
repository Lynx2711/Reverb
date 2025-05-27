const mediasoup = require('mediasoup');

async function createWorker() {
  const worker = await mediasoup.createWorker({
    rtcMinPort: 10000,
    rtcMaxPort: 20000,
  });

  worker.on('died', () => {
    console.error('❌ mediasoup worker died, exiting in 2s...');
    setTimeout(() => process.exit(1), 2000);
  });

  console.log('✅ mediasoup Worker created');
  return worker;
}

module.exports = { createWorker };
