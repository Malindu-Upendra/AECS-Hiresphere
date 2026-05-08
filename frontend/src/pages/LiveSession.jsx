import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { fetchAuthSession } from 'aws-amplify/auth';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const SESSION_URL = import.meta.env.VITE_SESSION_SERVICE_URL || 'http://localhost:3006';

export default function LiveSession() {
  const { bookingId } = useParams();
  const navigate = useNavigate();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingCandidates = useRef([]);
  const isSettingRemote = useRef(false);

  const [status, setStatus] = useState('init'); // init | waiting | peer-joined | connecting | connected | peer-left | error
  const [peerJoinedAlert, setPeerJoinedAlert] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let pc;
    let socket;
    let isMounted = true;

    async function setup() {
      // Get media
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        if (isMounted) setErrorMsg('Camera/microphone access denied. Please allow permissions and try again.');
        return;
      }
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Build peer connection
      pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (e) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
        if (isMounted) setStatus('connected');
      };

      pc.onicecandidate = (e) => {
        if (e.candidate && socketRef.current) {
          socketRef.current.emit('ice-candidate', { roomId: bookingId, candidate: e.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' && isMounted) {
          setErrorMsg('Connection failed. Please try rejoining.');
        }
      };

      // Auth token
      const session = await fetchAuthSession();
      const token = session.tokens?.accessToken?.toString();

      // Connect signaling
      socket = io(SESSION_URL, { auth: { token }, transports: ['websocket', 'polling'] });
      socketRef.current = socket;

      socket.on('connect_error', () => {
        if (isMounted) setErrorMsg('Cannot reach session server. Make sure it is running.');
      });

      socket.on('connect', () => {
        socket.emit('join-room', bookingId);
      });

      // Joined room — check if we're the first or second person
      socket.on('room-joined', ({ count }) => {
        if (!isMounted) return;
        if (count === 1) {
          // We're alone — wait for the other person
          setStatus('waiting');
        } else {
          // Someone is already here — start connecting
          setStatus('connecting');
        }
      });

      // Other peer joined — we (the one already waiting) create the offer
      socket.on('peer-joined', async () => {
        if (!isMounted) return;
        setStatus('connecting');
        // Show a brief "joined" alert
        setPeerJoinedAlert(true);
        setTimeout(() => setPeerJoinedAlert(false), 3000);
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('offer', { roomId: bookingId, offer });
        } catch (err) {
          console.error('Error creating offer:', err);
        }
      });

      // Receive offer — we are the second joiner, create answer
      socket.on('offer', async ({ offer }) => {
        if (isMounted) setStatus('connecting');
        try {
          isSettingRemote.current = true;
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          isSettingRemote.current = false;

          // Flush any queued ICE candidates
          for (const c of pendingCandidates.current) {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          }
          pendingCandidates.current = [];

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('answer', { roomId: bookingId, answer });
        } catch (err) {
          console.error('Error handling offer:', err);
        }
      });

      socket.on('answer', async ({ answer }) => {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));

          for (const c of pendingCandidates.current) {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          }
          pendingCandidates.current = [];
        } catch (err) {
          console.error('Error handling answer:', err);
        }
      });

      socket.on('ice-candidate', async ({ candidate }) => {
        if (!candidate) return;
        if (pc.remoteDescription && pc.remoteDescription.type) {
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
        } else {
          pendingCandidates.current.push(candidate);
        }
      });

      socket.on('peer-left', () => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        if (isMounted) setStatus('peer-left');
      });
    }

    setup();

    return () => {
      isMounted = false;
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      pcRef.current?.close();
      socketRef.current?.emit('leave-room');
      socketRef.current?.disconnect();
    };
  }, [bookingId]);

  const toggleAudio = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setAudioMuted(m => !m); }
  };

  const toggleVideo = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setVideoOff(v => !v); }
  };

  const endCall = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    socketRef.current?.emit('leave-room');
    socketRef.current?.disconnect();
    navigate('/bookings');
  };

  if (errorMsg) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white px-8">
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-lg mb-6">{errorMsg}</p>
          <button onClick={() => navigate('/bookings')} className="bg-indigo-600 px-6 py-2 rounded-lg hover:bg-indigo-700">
            Back to Bookings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col select-none">

      {/* Remote video — fills the screen */}
      <div className="flex-1 relative bg-gray-800">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />

        {(status === 'waiting' || status === 'connecting') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin mb-4" />
            {status === 'waiting' ? (
              <>
                <p className="text-white text-lg font-medium">Waiting for the other participant...</p>
                <p className="text-gray-400 text-sm mt-1">You are in the room. Share your session to invite them.</p>
                <div className="mt-4 flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-white text-sm">1 participant (you)</span>
                </div>
              </>
            ) : (
              <>
                <p className="text-white text-lg font-medium">Participant has joined — connecting...</p>
                <p className="text-gray-400 text-sm mt-1">Establishing secure connection</p>
                <div className="mt-4 flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-white text-sm">2 participants in room</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Peer joined toast */}
        {peerJoinedAlert && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-green-600 text-white text-sm px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2 animate-bounce">
            <span className="w-2 h-2 rounded-full bg-white" />
            The other participant has joined!
          </div>
        )}

        {status === 'peer-left' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-white text-xl font-medium mb-2">The other participant left</p>
            <p className="text-gray-400 text-sm mb-6">The session has ended.</p>
            <button onClick={() => navigate('/bookings')} className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">
              Back to Bookings
            </button>
          </div>
        )}

        {/* Session badge */}
        <div className="absolute top-4 left-4 bg-black/50 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Live Session
        </div>
      </div>

      {/* Local video — picture in picture */}
      <div className="absolute top-4 right-4 w-44 rounded-xl overflow-hidden shadow-2xl border-2 border-gray-700 bg-gray-800">
        <video ref={localVideoRef} autoPlay playsInline muted className="w-full" />
        {videoOff && (
          <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
            <span className="text-gray-400 text-xs">Camera off</span>
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="bg-gray-900 border-t border-gray-700 py-4 flex items-center justify-center gap-5">
        {/* Mute audio */}
        <ControlButton
          active={audioMuted}
          onClick={toggleAudio}
          label={audioMuted ? 'Unmute' : 'Mute'}
          icon={
            audioMuted
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          }
        />

        {/* Toggle video */}
        <ControlButton
          active={videoOff}
          onClick={toggleVideo}
          label={videoOff ? 'Show Video' : 'Hide Video'}
          icon={
            videoOff
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 00-2 2v4a2 2 0 002 2h9a2 2 0 002-2V10a2 2 0 00-2-2H3zM1 1l22 22" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 00-2 2v4a2 2 0 002 2h9a2 2 0 002-2V10a2 2 0 00-2-2H3z" />
          }
        />

        {/* End call */}
        <button
          onClick={endCall}
          className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 transition-colors flex items-center justify-center shadow-lg"
          title="End call"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function ControlButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${active ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'}`}
    >
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {icon}
      </svg>
    </button>
  );
}
