const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { createWorker } = require('./mediasoup-config');
const mediasoup = require('mediasoup');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

const PORT = 5000;

let worker;
let router;
const peers = {}; // socketId -> { transports, producers, consumers, ... }

(async () => {
  worker = await createWorker();
  router = await worker.createRouter({ mediaCodecs: [
    {
      kind: "audio",
      mimeType: "audio/opus",
      clockRate: 48000,
      channels: 2
    },
    {
      kind: "video",
      mimeType: "video/VP8",
      clockRate: 90000,
      parameters: {},
    }
  ]});
  console.log('✅ mediasoup Router created');
})();

io.on('connection', (socket) => {
  const { roomId } = socket.handshake.query;
  console.log(`🔌 New client connected: ${socket.id} for room ${roomId}`);

  peers[socket.id] = {
    socket,
    transports: [],
    producers: [],
    consumers: [],
    roomId
  };

  const removePeer = () => {
    const peer = peers[socket.id];
    if (!peer) return;

    peer.transports.forEach(t => t.close());
    peer.producers.forEach(p => p.close());
    peer.consumers.forEach(c => c.close());
    delete peers[socket.id];

    socket.broadcast.emit('peer-disconnected', { socketId: socket.id });
    console.log(`❌ Peer disconnected: ${socket.id}`);
  };

  socket.on('disconnect', removePeer);
  socket.on('exitRoom', removePeer);

  socket.on('getRouterRtpCapabilities', (_, callback) => {
    socket.emit('router-rtp-capabilities', router.rtpCapabilities);
  });

  socket.on('createWebRtcTransport', async ({ direction }) => {
    try {
      const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: '127.0.0.1', announcedIp: null }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });

      peers[socket.id].transports.push(transport);

      const event = direction === 'send'
        ? 'webRtcTransportCreated-send'
        : 'webRtcTransportCreated-recv';

      socket.emit(event, {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });

      console.log(`✅ WebRTC Transport (${direction}) created for ${socket.id}`);

    } catch (err) {
      console.error('❌ Error creating transport:', err);
    }
  });

  socket.on('connectTransport', async ({ transportId, dtlsParameters }) => {
    const transport = peers[socket.id].transports.find(t => t.id === transportId);
    if (!transport) return;
    await transport.connect({ dtlsParameters });
    console.log(`🔗 Transport ${transportId} connected for ${socket.id}`);
  });

  socket.on('produce', async ({ kind, rtpParameters }, callback) => {
    const transport = peers[socket.id].transports[0]; // send transport
    const producer = await transport.produce({ kind, rtpParameters });
    peers[socket.id].producers.push(producer);

    // Notify other peers
    socket.broadcast.emit('new-producer', {
      producerId: producer.id,
      kind,
    });

    console.log(`📤 Producer created: ${producer.id} (${kind}) by ${socket.id}`);
    callback({ id: producer.id });
  });

  socket.on('getProducers', () => {
    const otherProducers = [];

    for (const id in peers) {
      if (id !== socket.id) {
        peers[id].producers.forEach(producer => {
          otherProducers.push({ producerId: producer.id, kind: producer.kind });
        });
      }
    }

    socket.emit('producers', otherProducers);
  });

  socket.on('consume', async ({ producerId, rtpCapabilities }) => {
    try {
      if (!router.canConsume({ producerId, rtpCapabilities })) {
        throw new Error('❌ Cannot consume this producer');
      }

      const consumerTransport = peers[socket.id].transports[1]; // recv transport
      const consumer = await consumerTransport.consume({
        producerId,
        rtpCapabilities,
        paused: false,
      });

      peers[socket.id].consumers.push(consumer);

      socket.emit('consumer', {
        consumerParameters: {
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        },
      });

      console.log(`📥 Consumer created for ${producerId} by ${socket.id}`);
    } catch (err) {
      console.error('❌ Error creating consumer:', err);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 SFU server running on http://localhost:${PORT}`);
});
