import React, { useEffect, useState, useRef } from 'react';  //useEffect: A React hook to handle side effects (e.g., setting up connections) when the component mounts or updates, useState: manages component state(track media options), useRef: hook to create mutable reference that persists across re-renders 
import { useNavigate, useParams } from 'react-router-dom'; //useNavigate: a hook to navigate to different routes and useParams to extract url params to get the  room id  for user from the url 
import { MediasoupClient } from './mediasoupClient'; //MediasoupClient: a custom hook to handle mediasoup client logic
//mediasoup handles webrtc connnections and media streaming

const VideoCall = () => {
  const navigate = useNavigate();  //navigation function for when user leaves the call
  const { roomId } = useParams();  //extracts the roomId from the URL, connects users to same mediasoup session
  const [showMediaPrompt, setShowMediaPrompt] = useState(true);  //keeps track of whether to show a pop-up asking if you want to use your camera or microphone
  const [mediaOptions, setMediaOptions] = useState({ video: false, audio: false });  //state object mediaOptions tracks user preferences for enabling video and audio streams
  const [remoteStreams, setRemoteStreams] = useState({});  //list of other people’s video or audio streams so we can show them on the screen
  const clientRef = useRef(null); //reference to the mediasoup client instance
  const localVideoRef = useRef(null);  //ref to the <video> DOM element for displaying the local user’s stream

  useEffect(() => {   //useEffect hook runs when the component joins the room or when roomId, showMediaPrompt, or mediaOptions change. It handles initialization and cleanup
    if (showMediaPrompt) return; 

    const init = async () => {  //handles the asynchronous setup of the Mediasoup client and WebRTC transports.
      try {
        const client = new MediasoupClient(roomId); //creates a new MediasoupClient instance with the specified roomId.
        clientRef.current = client;
        await client.connect();  //establishing a WebSocket connection to the server

        client.socket.emit('getRouterRtpCapabilities'); //requests the router's RTP capabilities from the server
        client.socket.on('router-rtp-capabilities', async (rtpCapabilities) => {
          try {
            await client.createDevice(rtpCapabilities); //creates a new mediasoup device with the received RTP capabilities
            client.socket.emit('createWebRtcTransport', { direction: 'send' }); //requests the creation of a WebRTC transport for sending media

            client.socket.on('webRtcTransportCreated-send', async (transportOptions) => {
              const sendTransport = client.device.createSendTransport(transportOptions); //creates a send transport with the received options
              //send directions for connecting to the server
              sendTransport.on('connect', ({ dtlsParameters }, callback) => {
                client.socket.emit('connectTransport', {
                  transportId: transportOptions.id,
                  dtlsParameters,
                });
                callback();
              });
            
              //Listens for the produce event on sendTransport, emitting a produce event with kind (audio/video) and rtpParameters (media encoding settings). The server responds with a producer ID, passed to callback. Errors trigger errback
              sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
                try {
                  client.socket.emit(
                    'produce',
                    {
                      transportId: sendTransport.id,
                      kind,
                      rtpParameters,
                    },
                    ({ id }) => {
                      callback({ id });
                    }
                  );
                } catch (error) {
                  console.error("Error in produce event:", error);
                  errback(error);
                }
              });

              client.sendTransport = sendTransport;  //stores the send transport for later use

              client.socket.emit('createWebRtcTransport', { direction: 'recv' }); //ask the server for another path, this time to receive other people’s video/audio, like opening a mailbox to get letters

              client.socket.on('webRtcTransportCreated-recv', async (recvOptions) => {
                const recvTransport = client.device.createRecvTransport(recvOptions);

                recvTransport.on('connect', ({ dtlsParameters }, callback) => {
                  client.socket.emit('connectTransport', {
                    transportId: recvOptions.id,
                    dtlsParameters,
                  });
                  callback();
                });

                client.recvTransport = recvTransport;

                try {
                  await client.produceLocalMedia(mediaOptions);
                  //  Set local video source
                  if (localVideoRef.current && client.localStream) {
                    localVideoRef.current.srcObject = client.localStream;
                  }
                } catch (err) {
                  console.error("Failed to produce local media:", err);
                }

                client.socket.on('new-producer', async ({ producerId, kind }) => {  //When someone else joins and shares their video/audio, we get a message about it
                  console.log(`New remote producer: ${producerId} (${kind})`);
                  try {
                    const consumer = await client.consumeRemoteMedia(producerId, kind);
                    console.log("Consumed remote track:", consumer.track);

                    setRemoteStreams((prev) => ({  //remoteStreams state, mapping the producerId to the consumer’s track (MediaStreamTrack) for rendering
                      ...prev,
                      [producerId]: consumer.track,
                    }));
                  } catch (err) {
                    console.error("Failed to consume new producer:", err);
                  }
                });

                client.socket.emit('getProducers'); //Emits getProducers to request a list of existing producers in the room
              });
            });
          } catch (err) {
            console.error("Device creation failed:", err);
          }
        });
//For each person already in the room, we grab their video/audio and add it to our list to show on the screen
        client.socket.on('producers', async (producers) => {
          console.log("Existing producers:", producers);
          for (const { producerId, kind } of producers) {
            try {
              const consumer = await client.consumeRemoteMedia(producerId, kind);
              setRemoteStreams((prev) => ({
                ...prev,
                [producerId]: consumer.track,
              }));
            } catch (err) {
              console.error(`Failed to consume producer ${producerId}:`, err);
            }
          }
        });
      } catch (err) {
        console.error("Initialization failed:", err);
      }
    };

    init(); //Call the init function to begin the Mediasoup setup

    return () => {  //cleanup function to close transports and disconnect the socket when the component unmounts
      if (clientRef.current) {
        Object.values(clientRef.current.producers).forEach((p) => p.close());
        if (clientRef.current.sendTransport) clientRef.current.sendTransport.close();
        if (clientRef.current.recvTransport) clientRef.current.recvTransport.close();
        if (clientRef.current.socket) clientRef.current.socket.disconnect();
        if (clientRef.current.localStream) {
          clientRef.current.localStream.getTracks().forEach((track) => track.stop());
        }
      }
    };
  }, [roomId, showMediaPrompt, mediaOptions]);  
  //We only run the checklist when the room, pop-up, or camera/microphone choices change

  const handleLeaveCall = () => {
    if (clientRef.current) { //turns everything off and redirects to home page
      Object.values(clientRef.current.producers).forEach((p) => p.close());
      if (clientRef.current.sendTransport) clientRef.current.sendTransport.close();
      if (clientRef.current.recvTransport) clientRef.current.recvTransport.close();
      if (clientRef.current.socket) clientRef.current.socket.disconnect();
      if (clientRef.current.localStream) {
        clientRef.current.localStream.getTracks().forEach((track) => track.stop());
      }
    }
    navigate('/');
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 bg-gray-900 min-h-screen">
      {showMediaPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow text-center">
            <h2 className="text-xl font-bold mb-4">Choose Media Options</h2>
            <div className="flex gap-4 justify-center mb-4">
              <label>
                <input
                  type="checkbox"
                  checked={mediaOptions.video}
                  onChange={() =>
                    setMediaOptions((prev) => ({ ...prev, video: !prev.video }))
                  }
                />
                Enable Video
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={mediaOptions.audio}
                  onChange={() =>
                    setMediaOptions((prev) => ({ ...prev, audio: !prev.audio }))
                  }
                />
                Enable Microphone
              </label>
            </div>
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded"
              onClick={() => setShowMediaPrompt(false)}
            >
              Join Meeting
            </button>
          </div>
        </div>
      )}

      <h2 className="text-xl font-bold text-white text-center">SFU Video Call (mediasoup)</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-6xl">
        {/* Local Video */}
        <div className="flex flex-col items-center">
          <video
            ref={localVideoRef}
            className="w-full rounded shadow border bg-black"
            autoPlay
            playsInline
            muted
          />
          <p className="text-white mt-1 text-sm">You</p>
        </div>

        {/* Remote Participants */}
        {Object.entries(remoteStreams).map(([producerId, track]) => (
          <div key={producerId} className="flex flex-col items-center">
            <video
              ref={(el) => {
                if (el) el.srcObject = new MediaStream([track]);
              }}
              className="w-full rounded shadow border bg-black"
              autoPlay
              playsInline
            />
            <p className="text-white mt-1 text-sm">Participant: {producerId}</p>
          </div>
        ))}
      </div>

      <div className="text-white mt-2">
        {Object.keys(remoteStreams).length === 0
          ? "Waiting for others to join..."
          : `${Object.keys(remoteStreams).length} participant(s) connected`}
      </div>

      <button
        onClick={handleLeaveCall}
        className="mt-6 bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded"
      >
        Leave Call
      </button>
    </div>
  );
};

export default VideoCall;
