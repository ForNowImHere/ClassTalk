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
  const charset = 'abcdefghijklmnopqrstuvwxyz';
  const part = (len) =>
    Array.from({ length: len }, () => charset[Math.floor(Math.random() * charset.length)]).join('');
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
<title>Video & Chat Room - ${req.params.roomId}</title>
<style>
body { background: #111; color: white; font-family: Arial, sans-serif; margin:0; padding:0;}
#users { display: flex; flex-wrap: wrap; padding: 10px; gap: 10px; }
.user { background: #222; padding: 10px; border-radius: 8px; width: 140px; text-align: center; }
.user img { border-radius: 50%; width: 48px; height: 48px; }
.name { margin: 6px 0; font-weight: bold; }
.admin { color: gold; font-size: 0.9em; }
.dots { font-size: 22px; color: #0f0; }
button.kick { margin-top: 6px; background: #900; border: none; color: white; padding: 5px 10px; border-radius: 4px; cursor: pointer; }
.video-container { display:flex; gap:10px; flex-wrap: wrap; padding:10px; }
video { width: 300px; border-radius: 8px; background: black; }
#chat-container { position: fixed; bottom:0; right:0; width:300px; background:#222; padding:10px; border-radius:8px; }
#chat-messages { height: 200px; overflow-y:auto; margin-bottom:5px; }
#chat-box { width:100%; margin-bottom:5px; }
</style>
</head>
<body>
<h1 style="margin:10px;">Room: ${req.params.roomId}</h1>

<div id="users"></div>
<div class="video-container">
  <video id="my-video" autoplay muted></video>
</div>

<div id="chat-container">
  <div id="chat-messages"></div>
  <textarea id="chat-box" placeholder="Send a message..."></textarea>
  <input type="file" id="chat-image-input" accept="image/*" />
  <button id="send-chat-btn">Send</button>
</div>

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
  let userIcon = prompt("Enter icon URL (leave blank for default):", "") || "";
  if (!userIcon) {
    const icons = ${JSON.stringify(DEFAULT_ICON)};
    userIcon = icons[Math.floor(Math.random() * icons.length)];
  }

  const usersDiv = document.getElementById('users');
  const videoContainer = document.querySelector('.video-container');

  // Join room
  socket.emit('join-room', { roomId, name: userName, icon: userIcon });

  // Setup local video + audio
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const myVideo = document.getElementById('my-video');
    myVideo.srcObject = localStream;
  } catch(e) {
    alert('Camera/mic access denied.');
    return;
  }

  const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  socket.on('your-id', id => { userId = id; });

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
      try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } 
      catch(e) { console.warn(e); }
    }
  });

  // User list
  socket.on('user-list', users => {
    usersDiv.innerHTML = '';
    users.forEach(u => {
      if (u.id === userId) isAdmin = u.isAdmin;
      const userEl = document.createElement('div');
      userEl.className = 'user';
      userEl.id = 'user-' + u.id;
      userEl.innerHTML = \`
        <img src="\${u.icon}" alt="icon"/>
        <div class="name">\${u.name} \${u.isAdmin?'<span class="admin">(admin)</span>':''}</div>
        <div class="dots" id="dots-\${u.id}">·····</div>
        \${isAdmin && u.id !== userId ? '<button class="kick" data-id="'+u.id+'">Kick</button>':''}
      \`;
      usersDiv.appendChild(userEl);

      if (isAdmin && u.id !== userId) {
        userEl.querySelector('button.kick').onclick = () => {
          if(confirm('Kick ' + u.name + '?')) socket.emit('kick-user', u.id);
        };
      }
    });
  });

  socket.on('user-joined', async (newUser) => {
    if (newUser.id === userId) return;
    await createPeerConnection(newUser.id, true);
  });

  socket.on('user-left', id => {
    if (peers[id]) { peers[id].close(); delete peers[id]; }
    const el = document.getElementById('user-' + id);
    if (el) el.remove();
    const vid = document.getElementById('video-' + id);
    if (vid) vid.remove();
  });

  async function createPeerConnection(peerId, initiator) {
    const pc = new RTCPeerConnection(rtcConfig);
    peers[peerId] = pc;

    // Add local tracks
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    // Handle remote track
    pc.ontrack = (event) => {
      let vid = document.getElementById('video-' + peerId);
      if (!vid) {
        vid = document.createElement('video');
        vid.id = 'video-' + peerId;
        vid.autoplay = true;
        vid.playsInline = true;
        videoContainer.appendChild(vid);
      }
      vid.srcObject = event.streams[0];
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('signal', { to: peerId, data: { candidate: e.candidate } });
    };

    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('signal', { to: peerId, data: pc.localDescription });
    }
  }

  window.addEventListener('beforeunload', () => { socket.disconnect(); });

  // ================= CHAT =================
  const chatBox = document.getElementById('chat-box');
  const chatMessages = document.getElementById('chat-messages');
  const chatImageInput = document.getElementById('chat-image-input');
  const sendBtn = document.getElementById('send-chat-btn');

  sendBtn.onclick = () => {
    const message = chatBox.value.trim();
    if (message) {
      socket.emit('chat-message', { roomId, message });
      chatBox.value = '';
    }
    const file = chatImageInput.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => socket.emit('chat-image', { roomId, imageData: reader.result });
      reader.readAsDataURL(file);
      chatImageInput.value = '';
    }
  };

  socket.on('chat-message', ({ from, message }) => {
    const div = document.createElement('div');
    div.textContent = message;
    div.style.color = from === userId ? '#0f0' : '#fff';
    div.style.marginBottom = '6px';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });

  socket.on('chat-image', ({ from, imageData }) => {
    const div = document.createElement('div');
    const img = document.createElement('img');
    img.src = imageData;
    img.style.maxWidth = '100%';
    img.style.borderRadius = '6px';
    img.style.marginBottom = '6px';
    div.appendChild(img);
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });

})();
</script>
</body>
</html>
  `);
});

// Server state
const rooms = {}; // roomId => { users: [{id,name,icon,isAdmin}], adminId }

io.on('connection', socket => {
  socket.on('join-room', ({ roomId, name, icon }) => {
    if (!rooms[roomId]) rooms[roomId] = { users: [], adminId: null };
    const room = rooms[roomId];
    const userId = socket.id;

    if (!room.adminId) room.adminId = userId;
    const isAdmin = room.adminId === userId;

    room.users.push({ id: userId, name: name||'Guest', icon: icon||DEFAULT_ICON[0], isAdmin });
    socket.join(roomId);

    socket.emit('your-id', userId);
    io.to(roomId).emit('user-list', room.users);
    socket.to(roomId).emit('user-joined', { id: userId, name, icon, isAdmin });

    // ================= CHAT EVENTS =================
    socket.on('chat-message', ({ roomId, message }) => {
      io.to(roomId).emit('chat-message', { from: socket.id, message });
    });

    socket.on('chat-image', ({ roomId, imageData }) => {
      io.to(roomId).emit('chat-image', { from: socket.id, imageData });
    });

    // Relay signaling
    socket.on('signal', ({ to, data }) => {
      io.to(to).emit('signal', { from: socket.id, data });
    });

    // Kick
    socket.on('kick-user', kickId => {
      if (socket.id !== room.adminId) return;
      const kickedSocket = io.sockets.sockets.get(kickId);
      if (kickedSocket) {
        kickedSocket.emit('kicked');
        kickedSocket.disconnect();
      }
    });

    socket.on('disconnect', () => {
      if (!rooms[roomId]) return;
      room.users = room.users.filter(u => u.id !== userId);

      if (room.adminId === userId) {
        if (room.users.length > 0) {
          room.adminId = room.users[0].id;
          room.users[0].isAdmin = true;
        } else { delete rooms[roomId]; return; }
      }

      io.to(roomId).emit('user-list', room.users);
      io.to(roomId).emit('user-left', userId);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on port " + PORT));
