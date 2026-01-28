
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const DEFAULT_ICON = [
  "https://cdn.glitch.global/67560e0a-8219-49e8-b266-19355cf00f35/k12zoneguy1.png?v=1748558654514",
  "https://cdn.glitch.global/67560e0a-8219-49e8-b266-19355cf00f35/k12zoneguy2.png?v=1748558657344",
  "https://cdn.glitch.global/67560e0a-8219-49e8-b266-19355cf00f35/Noicon.png?v=1748558650328",
  "https://cdn.glitch.global/67560e0a-8219-49e8-b266-19355cf00f35/ee219e7a-ba9c-42f7-b9f0-2a574b256ab9.png?v=1748558651617"
];

const app = express();
const server = http.createServer(app);
const io = new Server(server);

function generateRoomId() {
  const charset = "abcdefghijklmnopqrstuvwxyz";
  const part = (len) =>
    Array.from({ length: len }, () =>
      charset[Math.floor(Math.random() * charset.length)]
    ).join("");

  return `${part(3)}-${part(4)}-${part(3)}`;
}


// Redirect root to a new room
app.get('/', (req, res) => {
  const roomId = generateRoomId();
  res.redirect(`/room/${roomId}`);
});

// Serve the main room page (single HTML)
app.get('/room/:roomId', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Voice Chat Room - ${req.params.roomId}</title>
<style>
  body { background: #111; color: white; font-family: Arial, sans-serif; margin: 0; padding: 0; }
  #users { display: flex; flex-wrap: wrap; padding: 10px; gap: 10px; }
  .user { background: #222; padding: 10px; border-radius: 8px; width: 140px; text-align: center; }
  .user img { border-radius: 50%; width: 48px; height: 48px; }
  .name { margin: 6px 0; font-weight: bold; }
  .admin { color: gold; font-size: 0.9em; }
  .dots { font-size: 22px; color: #0f0; }
  button.kick { margin-top: 6px; background: #900; border: none; color: white; padding: 5px 10px; border-radius: 4px; cursor: pointer; }
</style>
</head>
<body>
<h1 style="margin:10px;">Voice Chat Room: ${req.params.roomId}</h1>
<div id="users"></div>

<script src="/socket.io/socket.io.js"></script>
<script>
(async () => {
  const socket = io();
  const roomId = "${req.params.roomId}";
  let localStream = null;
  let peers = {};
  let userId = null;
  let isAdmin = false;

  // Prompt for name and icon
  const userName = prompt("Enter your name:", "Guest") || "Guest";
  let userIcon = prompt("Enter icon URL (leave blank for default):", "");
  const defaultIcons = ${JSON.stringify(DEFAULT_ICON)};
  if (!userIcon) userIcon = defaultIcons[Math.floor(Math.random() * defaultIcons.length)];

  const usersDiv = document.getElementById('users');

  socket.emit('join-room', { roomId, name: userName, icon: userIcon });

  // Mic access
  try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { alert('Mic access denied'); return; }

  // Volume indicator setup
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  audioCtx.createMediaStreamSource(localStream).connect(analyser);

  function updateVolumeIndicator() {
    analyser.getByteFrequencyData(dataArray);
    const avg = dataArray.reduce((a,b) => a+b,0)/dataArray.length;
    const dotsCount = Math.min(5, Math.floor(avg / 30));
    const dots = "·".repeat(5-dotsCount) + "●".repeat(dotsCount);
    const meDots = document.getElementById('dots-' + userId);
    if (meDots) meDots.textContent = dots;
    requestAnimationFrame(updateVolumeIndicator);
  }
  updateVolumeIndicator();

  // WebRTC config
  const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  // Update user list
  socket.on('user-list', users => {
    usersDiv.innerHTML = '';
    users.forEach(u => {
      if (u.id === userId) isAdmin = u.isAdmin;
      const userEl = document.createElement('div');
      userEl.className = 'user';
      userEl.id = 'user-' + u.id;
      userEl.innerHTML = \`
        <img src="\${u.icon}" alt="icon" />
        <div class="name">\${u.name} \${u.isAdmin ? '<span class="admin">(admin)</span>' : ''}</div>
        <div class="dots" id="dots-\${u.id}">·····</div>
        \${isAdmin && u.id !== userId ? '<button class="kick" data-id="' + u.id + '">Kick</button>' : ''}
      \`;
      usersDiv.appendChild(userEl);

      // Kick button click
      const btn = userEl.querySelector('button.kick');
      if (btn) btn.onclick = () => { if(confirm('Kick '+u.name+'?')) socket.emit('kick-user', u.id); }
    });
  });

  socket.on('your-id', id => userId = id);

  // WebRTC signaling
  socket.on('signal', async ({ from, data }) => {
    if (!peers[from]) await createPeerConnection(from, false);
    const pc = peers[from];
    if (data.type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { to: from, data: pc.localDescription });
    } else if (data.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data));
    } else if (data.candidate) {
      try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch(e){console.warn(e);}
    }
  });

  socket.on('user-joined', async (newUser) => { if(newUser.id!==userId) await createPeerConnection(newUser.id,true); });
  socket.on('user-left', id => { if(peers[id]) { peers[id].close(); delete peers[id]; } const el=document.getElementById('user-'+id); if(el) el.remove(); });

  async function createPeerConnection(peerId, isInitiator) {
    const pc = new RTCPeerConnection(rtcConfig);
    peers[peerId] = pc;
    localStream.getTracks().forEach(track=>pc.addTrack(track, localStream));
    pc.ontrack = event => {
      let audioEl = document.getElementById('audio-'+peerId);
      if(!audioEl){
        audioEl=document.createElement('audio');
        audioEl.id='audio-'+peerId;
        audioEl.autoplay=true;
        audioEl.playsInline=true;
        audioEl.style.display='none';
        document.body.appendChild(audioEl);
      }
      audioEl.srcObject=event.streams[0];
    };
    pc.onicecandidate = e => { if(e.candidate) socket.emit('signal',{to:peerId,data:{candidate:e.candidate}}); }
    if(isInitiator){
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('signal',{to:peerId,data:pc.localDescription});
    }
  }

  window.addEventListener('beforeunload',()=>socket.disconnect());
})();
</script>
</body>
</html>
  `);
});

// Server state in memory
const rooms = {}; // roomId => { users: [{id, name, icon, isAdmin}], adminId }

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, name, icon }) => {
    if (!rooms[roomId]) rooms[roomId] = { users: [], adminId: null };

    const room = rooms[roomId];
    const userId = socket.id;

    // Assign admin if none
    if (!room.adminId) room.adminId = userId;

    const isAdmin = room.adminId === userId;

    room.users.push({ id: userId, name: name || 'Guest', icon: icon || DEFAULT_ICON, isAdmin });

    socket.join(roomId);

    // Notify user their id
    socket.emit('your-id', userId);

    // Broadcast updated user list
    io.to(roomId).emit('user-list', room.users);

    // Notify others new user joined
    socket.to(roomId).emit('user-joined', { id: userId, name, icon, isAdmin });

    // Relay signaling messages
    socket.on('signal', ({ to, data }) => {
      io.to(to).emit('signal', { from: socket.id, data });
    });

    // Kick user event (admin only)
    socket.on('kick-user', (kickId) => {
      if (socket.id !== room.adminId) return;
      const kickedSocket = io.sockets.sockets.get(kickId);
      if (kickedSocket) {
        kickedSocket.emit('kicked');
        kickedSocket.disconnect();
      };
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      if (!rooms[roomId]) return;
      room.users = room.users.filter(u => u.id !== userId);

      // If admin left, assign new admin (oldest user)
      if (room.adminId === userId) {
        if (room.users.length > 0) {
          room.adminId = room.users[0].id;
          room.users[0].isAdmin = true;
        } else {
          delete rooms[roomId];
          return;
        }
      }

      io.to(roomId).emit('user-list', room.users);
      io.to(roomId).emit('user-left', userId);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Voice chat server listening on port " + PORT));
