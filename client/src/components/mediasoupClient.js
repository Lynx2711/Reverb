import { io } from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

export class MediasoupClient {
  constructor(roomId) {
    this.roomId = roomId;
    this.socket = io('http://localhost:5000');
    this.device = null;
    this.sendTransport = null;
    this.recvTransport = null;
    this.producers = {};
    this.consumers = {};
    this.localStream = null;
  }

  async connect() {
    return new Promise((resolve) => {
      this.socket.on('connect', () => {
        this.socket.emit('joinRoom', { roomId: this.roomId });
        resolve();
      });
    });
  }

  async createDevice(routerRtpCapabilities) {
    this.device = new mediasoupClient.Device();
    await this.device.load({ routerRtpCapabilities });
  }

  async produceLocalMedia(mediaOptions) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(mediaOptions);
      this.localStream = stream;

      for (const track of stream.getTracks()) {
        const kind = track.kind;

        // Close existing producer if it exists
        if (this.producers[kind]) {
          console.log(`Replacing existing ${kind} producer`);
          this.producers[kind].close();
          delete this.producers[kind];
        }

        const producer = await this.sendTransport.produce({ track });
        this.producers[kind] = producer;

        console.log(`Produced ${kind} track → Producer ID: ${producer.id}`);
      }
    } catch (err) {
      console.error('Failed to produce local media:', err);
      throw err;
    }
  }

  async consumeRemoteMedia(producerId, kind) {
    return new Promise((resolve, reject) => {
      this.socket.emit(
        'consume',
        {
          producerId,
          rtpCapabilities: this.device.rtpCapabilities,
        },
        async ({ id, kind, rtpParameters }) => {
          try {
            const consumer = await this.recvTransport.consume({
              id,
              producerId,
              kind,
              rtpParameters,
            });

            this.consumers[consumer.id] = consumer;
            resolve(consumer);
          } catch (err) {
            console.error('Error creating consumer:', err);
            reject(err);
          }
        }
      );
    });
  }
}
