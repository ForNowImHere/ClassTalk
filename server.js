const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const DEFAULT_ICON = [
  "https://cdn.glitch.global/67560e0a-8219-49e8-b266-19355cf00f35/k12zoneguy1.png?v=1748558654514",
  "https://cdn.glitch.global/67560e0a-8219-49e8-b266-19355cf00f35/k12zoneguy2.png?v=1748558657344",
  "https://cdn.glitch.global/67560e0a-8219-49e8-b266-19355cf00f35/Noicon.png?v=1748558650328",
  "https://cdn.glitch.global/67560e0a-8219-49e8-b266-19355cf00f35/ee219e7a-ba9c-42f7-b9f0-2a574b256ab9.png?v=1748558651617"
];

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ===== UTIL =====
function generateRoomId() {
  const c = "abcdefghijklmnopqrstuvwxyz";
  const p = (n) => Array.from({ length: n }, () => c[Math.floor(Math.random() * c.length)]).join("");
  return `${p(3)}-${p(4)}-${p(3)}`;
}

// ===== ROUTES =====
app.get("/", (req, res) => {
  res.redirect(`/room/${generateRoomId()}`);
});

app.get("/room/:roomId", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Voice Room ${req.params.roomId}</title>

<style>
body { background:#111;color:#fff;font-family:Arial;margin:0 }
#users { display:flex;flex-wrap:wrap;gap:10px;padding:10px }
.user { background:#222;padding:10px;border-radius:8px;width:140px;text-align:center }
.user img { width:48px;height:48px;border-radius:50% }
.admin { color:gold;font-size:.8em }
.dots { font-size:20px;color:#0f0 }
button { background:#900;color:#fff;border:none;padding:5px;border-radius:4px;cursor:pointer }
</style>
</head>

<body>
<h2 style="padding:10px">Room: ${req.params.roomId}</h2>
<div id="users"></div>

<script src="/socket.io/socket.io.js"></script>
<script>
(async () => {
  const socket = io();
  const roomId = "${req.params.roomId}";
  const usersDiv = document.getElementById("users");

  let localStream;
  let peers = {};
  let myId = null;
  let isAdmin = false;

  const name = prompt("Name?", "Guest") || "Guest";
  let icon = prompt("Icon URL? (blank = random)", "");
  if (!icon) {
    const icons = ${JSON.stringify(DEFAULT_ICON)};
    icon = icons[Math.floor(Math.random() * icons.length)];
  }

  socket.emit("join-room", { roomId, name, icon });

  socket.on("your-id", id => myId = id);

  socket.on("kicked", () => {
    alert("You were kicked 😬");
    location.href = "/";
  });

  localStream = await navigator.mediaDevices.getUserMedia({ audio:true });

  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  const src = ctx.createMediaStreamSource(localStream);
  src.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);

  function updateLocalDots() {
    analyser.getByteFrequencyData(data);
    const avg = data.reduce((a,b)=>a+b,0)/data.length;
    const dots = "·".repeat(5-Math.min(5,avg/30|0))+"●".repeat(Math.min(5,avg/30|0));
    const el = document.getElementById("dots-"+myId);
    if (el) el.textContent = dots;
    requestAnimationFrame(updateLocalDots);
  }
  updateLocalDots();

  const rtcCfg = { iceServers:[{urls:"stun:stun.l.google.com:19302"}] };

  socket.on("user-list", users => {
    usersDiv.innerHTML = "";
    users.forEach(u => {
      if (u.id === myId) isAdmin = u.isAdmin;

      const div = document.createElement("div");
      div.className = "user";
      div.innerHTML = \`
        <img src="\${u.icon}">
        <div>\${u.name} \${u.isAdmin ? '<span class="admin">(admin)</span>' : ''}</div>
        <div class="dots" id="dots-\${u.id}">·····</div>
        \${isAdmin && u.id!==myId ? '<button data-id="'+u.id+'">Kick</button>' : ''}
      \`;

      if (isAdmin && u.id !== myId) {
        div.querySelector("button").onclick = () => socket.emit("kick-user", u.id);
      }
      usersDiv.appendChild(div);
    });
  });

  socket.on("user-joined", u => createPeer(u.id,true));
  socket.on("user-left", id => peers[id]?.close());

  socket.on("signal", async ({from,data}) => {
    if (!peers[from]) await createPeer(from,false);
    const pc = peers[from];
    if (data.type==="offer") {
      await pc.setRemoteDescription(data);
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      socket.emit("signal",{to:from,data:pc.localDescription});
    } else if (data.type==="answer") {
      await pc.setRemoteDescription(data);
    } else if (data.candidate) {
      await pc.addIceCandidate(data.candidate);
    }
  });

  async function createPeer(id,init) {
    const pc = new RTCPeerConnection(rtcCfg);
    peers[id]=pc;
    localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));

    pc.ontrack = e => {
      const a=document.createElement("audio");
      a.srcObject=e.streams[0];
      a.autoplay=true;
      a.style.display="none";
      document.body.appendChild(a);
    };

    pc.onicecandidate = e => e.candidate && socket.emit("signal",{to:id,data:{candidate:e.candidate}});

    if (init) {
      const off = await pc.createOffer();
      await pc.setLocalDescription(off);
      socket.emit("signal",{to:id,data:pc.localDescription});
    }
  }
})();
</script>
</body>
</html>`);
});

// ===== SERVER STATE =====
const rooms = {};

io.on("connection", socket => {
  socket.on("join-room", ({roomId,name,icon}) => {
    if (!rooms[roomId]) rooms[roomId]={users:[],admin:null};

    const room = rooms[roomId];
    if (!room.admin) room.admin = socket.id;

    const user = {
      id: socket.id,
      name,
      icon,
      isAdmin: socket.id === room.admin
    };

    room.users.push(user);
    socket.join(roomId);

    socket.emit("your-id", socket.id);
    io.to(roomId).emit("user-list", room.users);
    socket.to(roomId).emit("user-joined", user);

    socket.on("signal", d => io.to(d.to).emit("signal",{from:socket.id,data:d.data}));

    socket.on("kick-user", id => {
      if (socket.id !== room.admin) return;
      io.to(id).emit("kicked");
      io.sockets.sockets.get(id)?.disconnect();
    });

    socket.on("disconnect", () => {
      room.users = room.users.filter(u=>u.id!==socket.id);
      if (room.admin === socket.id && room.users[0]) {
        room.admin = room.users[0].id;
        room.users.forEach(u=>u.isAdmin=false);
        room.users[0].isAdmin=true;
      }
      if (!room.users.length) delete rooms[roomId];
      else io.to(roomId).emit("user-list", room.users);
    });
  });
});

server.listen(3000, () => console.log("🔥 Voice server running on 3000"));
