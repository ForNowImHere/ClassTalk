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

// 🔴 IMPORTANT: allow big images
const io = new Server(server, {
  maxHttpBufferSize: 10 * 1024 * 1024 // 10MB
});

function generateRoomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const part = len =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${part(3)}-${part(4)}-${part(3)}`;
}

// redirect to room
app.get('/', (req, res) => {
  res.redirect(`/room/${generateRoomId()}`);
});

// ===== SINGLE HTML PAGE =====
app.get('/room/:roomId', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Room ${req.params.roomId}</title>
<style>
body{background:#111;color:white;font-family:Arial;margin:0}
#users{display:flex;gap:10px;flex-wrap:wrap;padding:10px}
.user{background:#222;padding:8px;border-radius:8px;width:140px;text-align:center}
.user img{width:48px;height:48px;border-radius:50%}
.admin{color:gold}
video{width:240px;border-radius:8px}
#chat{position:fixed;right:10px;bottom:10px;width:300px;background:#222;padding:10px;border-radius:10px}
#msgs{height:200px;overflow-y:auto;margin-bottom:6px}
textarea{width:100%}
img.chatimg{max-width:100%;border-radius:6px;margin-top:4px}
</style>
</head>
<body>

<h2 style="margin:10px">Room ${req.params.roomId}</h2>
<div id="users"></div>
<video id="me" autoplay muted></video>

<div id="chat">
  <div id="msgs"></div>
  <textarea id="msg" placeholder="type..."></textarea>
  <input type="file" id="img" accept="image/*">
  <button id="send">Send</button>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
(async()=>{
const socket = io();
const roomId="${req.params.roomId}";
let myId=null, peers={};

const name=prompt("name","Guest")||"Guest";
let icon=prompt("icon url (blank=random)","")||"";
if(!icon){
  const icons=${JSON.stringify(DEFAULT_ICON)};
  icon=icons[Math.floor(Math.random()*icons.length)];
}

socket.emit("join-room",{roomId,name,icon});

// media
const stream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
document.getElementById("me").srcObject=stream;

const rtc={iceServers:[{urls:"stun:stun.l.google.com:19302"}]};

socket.on("your-id",id=>myId=id);

// users
socket.on("user-list",users=>{
  const u=document.getElementById("users");
  u.innerHTML="";
  users.forEach(x=>{
    const d=document.createElement("div");
    d.className="user";
    d.innerHTML=\`
      <img src="\${x.icon}">
      <div>\${x.name} \${x.isAdmin?"<span class='admin'>(admin)</span>":""}</div>
    \`;
    u.appendChild(d);
  });
});

socket.on("user-joined",u=>connect(u.id,true));
socket.on("user-left",id=>{
  if(peers[id]) peers[id].close();
});

// webrtc
async function connect(id,init){
  const pc=new RTCPeerConnection(rtc);
  peers[id]=pc;
  stream.getTracks().forEach(t=>pc.addTrack(t,stream));

  pc.ontrack=e=>{
    let v=document.getElementById("v-"+id);
    if(!v){
      v=document.createElement("video");
      v.id="v-"+id;
      v.autoplay=true;
      document.body.appendChild(v);
    }
    v.srcObject=e.streams[0];
  };

  pc.onicecandidate=e=>{
    if(e.candidate) socket.emit("signal",{to:id,data:{candidate:e.candidate}});
  };

  if(init){
    const off=await pc.createOffer();
    await pc.setLocalDescription(off);
    socket.emit("signal",{to:id,data:pc.localDescription});
  }
}

socket.on("signal",async({from,data})=>{
  if(!peers[from]) await connect(from,false);
  const pc=peers[from];
  if(data.type==="offer"){
    await pc.setRemoteDescription(data);
    const ans=await pc.createAnswer();
    await pc.setLocalDescription(ans);
    socket.emit("signal",{to:from,data:pc.localDescription});
  }else if(data.type==="answer"){
    await pc.setRemoteDescription(data);
  }else if(data.candidate){
    await pc.addIceCandidate(data.candidate);
  }
});

// ===== CHAT =====
const msgs=document.getElementById("msgs");
document.getElementById("send").onclick=()=>{
  const t=document.getElementById("msg").value.trim();
  const f=document.getElementById("img").files[0];
  if(t) socket.emit("chat-message",{roomId,message:t});
  if(f){
    if(f.size>5*1024*1024) return alert("image too big");
    const r=new FileReader();
    r.onload=()=>socket.emit("chat-image",{roomId,imageData:r.result});
    r.readAsDataURL(f);
  }
  document.getElementById("msg").value="";
  document.getElementById("img").value="";
};

socket.on("chat-message",d=>{
  const div=document.createElement("div");
  div.textContent=d.message;
  msgs.appendChild(div);
  msgs.scrollTop=msgs.scrollHeight;
});

socket.on("chat-image",d=>{
  const img=document.createElement("img");
  img.src=d.imageData;
  img.className="chatimg";
  msgs.appendChild(img);
  msgs.scrollTop=msgs.scrollHeight;
});
})();
</script>
</body>
</html>`);
});

// ===== SERVER STATE =====
const rooms={};

io.on("connection",socket=>{

  // CHAT (GLOBAL, NOT INSIDE JOIN)
  socket.on("chat-message",d=>{
    io.to(d.roomId).emit("chat-message",{from:socket.id,message:d.message});
  });

  socket.on("chat-image",d=>{
    io.to(d.roomId).emit("chat-image",{from:socket.id,imageData:d.imageData});
  });

  socket.on("signal",d=>{
    io.to(d.to).emit("signal",{from:socket.id,data:d.data});
  });

  socket.on("join-room",({roomId,name,icon})=>{
    if(!rooms[roomId]) rooms[roomId]={users:[],adminId:null};
    const r=rooms[roomId];

    if(!r.adminId) r.adminId=socket.id;
    const isAdmin=r.adminId===socket.id;

    r.users.push({id:socket.id,name,icon,isAdmin});
    socket.join(roomId);

    socket.emit("your-id",socket.id);
    io.to(roomId).emit("user-list",r.users);
    socket.to(roomId).emit("user-joined",{id:socket.id});

    socket.on("disconnect",()=>{
      r.users=r.users.filter(u=>u.id!==socket.id);
      if(r.adminId===socket.id && r.users[0]){
        r.adminId=r.users[0].id;
        r.users[0].isAdmin=true;
      }
      io.to(roomId).emit("user-list",r.users);
      io.to(roomId).emit("user-left",socket.id);
    });
  });
});

server.listen(3000,()=>console.log("🔥 running on 3000"));
