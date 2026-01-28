const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const DEFAULT_ICON = [
  "https://cdn.glitch.global/67560e0a-8219-49e8-b266-19355cf00f35/k12zoneguy1.png",
  "https://cdn.glitch.global/67560e0a-8219-49e8-b266-19355cf00f35/k12zoneguy2.png",
  "https://cdn.glitch.global/67560e0a-8219-49e8-b266-19355cf00f35/Noicon.png",
  "https://cdn.glitch.global/67560e0a-8219-49e8-b266-19355cf00f35/ee219e7a-ba9c-42f7-b9f0-2a574b256ab9.png"
];

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 25 * 1024 * 1024
});

function generateRoomId() {
  const c = "abcdefghijklmnopqrstuvwxyz";
  const p = l => Array.from({ length: l }, () => c[Math.floor(Math.random()*c.length)]).join("");
  return `${p(3)}-${p(4)}-${p(3)}`;
}

app.get("/", (req,res)=>res.redirect(`/room/${generateRoomId()}`));

app.get("/room/:roomId",(req,res)=>{
res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Room ${req.params.roomId}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">

<style>
body{margin:0;background:#111;color:white;font-family:Arial;height:100vh;display:flex}
#users{width:260px;background:#161616;border-right:1px solid #333;overflow-y:auto;padding:10px}
.user{background:#222;padding:8px;border-radius:8px;margin-bottom:8px;text-align:center}
.user img{width:48px;height:48px;border-radius:50%}
.admin{color:gold;font-size:.8em}

#chat{flex:1;display:flex;flex-direction:column;padding:10px}
#chat-messages{flex:1;overflow-y:auto;background:#222;border-radius:8px;padding:8px}
.message{display:flex;gap:8px;margin-bottom:8px}
.message img.avatar{width:32px;height:32px;border-radius:50%}

#chat-controls{display:flex;gap:6px;margin-top:8px}
#chat-input{flex:1;padding:8px;border-radius:6px;border:none;background:#111;color:white;outline:none}
#chat-input::placeholder{color:#777}
button{padding:8px 12px;border-radius:6px;border:none;cursor:pointer}
</style>
</head>

<body>
<div id="users"></div>

<div id="chat">
  <div id="chat-messages"></div>
  <div id="chat-controls">
    <input id="chat-input" placeholder="Type a message...">
    <button id="send-chat">Send</button>
    <input type="file" id="chat-file">
  </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
const roomId = "${req.params.roomId}";
let localStream;
const peers = {};

const usersDiv = document.getElementById("users");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatFile = document.getElementById("chat-file");

const name = prompt("Name:","Guest")||"Guest";
let icon = prompt("Icon URL (blank=random):","");
const icons = ${JSON.stringify(DEFAULT_ICON)};
if(!icon) icon = icons[Math.floor(Math.random()*icons.length)];

socket.emit("join-room",{roomId,name,icon});

// ===== VOICE =====
(async ()=>{
  localStream = await navigator.mediaDevices.getUserMedia({ audio:true });
})();

const rtcConfig = { iceServers:[{ urls:"stun:stun.l.google.com:19302" }] };

socket.on("signal", async ({from,data})=>{
  if(!peers[from]) await createPeer(from,false);
  const pc = peers[from];
  if(data.type==="offer"){
    await pc.setRemoteDescription(data);
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    socket.emit("signal",{to:from,data:pc.localDescription});
  } else if(data.type==="answer"){
    await pc.setRemoteDescription(data);
  } else if(data.candidate){
    try{ await pc.addIceCandidate(data.candidate); }catch{}
  }
});

socket.on("user-joined",async id=>{
  await createPeer(id,true);
});

socket.on("user-left",id=>{
  if(peers[id]) peers[id].close();
  delete peers[id];
});

async function createPeer(id,init){
  const pc = new RTCPeerConnection(rtcConfig);
  peers[id] = pc;
  localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));

  pc.ontrack = e=>{
    let a = document.getElementById("audio-"+id);
    if(!a){
      a=document.createElement("audio");
      a.id="audio-"+id;
      a.autoplay=true;
      document.body.appendChild(a);
    }
    a.srcObject=e.streams[0];
  };

  pc.onicecandidate = e=>{
    if(e.candidate) socket.emit("signal",{to:id,data:{candidate:e.candidate}});
  };

  if(init){
    const off = await pc.createOffer();
    await pc.setLocalDescription(off);
    socket.emit("signal",{to:id,data:pc.localDescription});
  }
}

// ===== CHAT =====
document.getElementById("send-chat").onclick = sendText;
chatInput.onkeydown = e => e.key==="Enter" && sendText();

function sendText(){
  const text = chatInput.value.trim();
  if(!text) return;
  socket.emit("chat-message",{roomId,text});
  chatInput.value="";
}

chatFile.onchange = ()=>{
  const file = chatFile.files[0];
  if(!file) return;
  if(file.size > 8*1024*1024){
    alert("8MB max");
    chatFile.value="";
    return;
  }
  const r = new FileReader();
  r.onload = ()=> socket.emit("chat-file",{roomId,fileName:file.name,fileType:file.type,fileData:r.result});
  r.readAsDataURL(file);
  chatFile.value="";
};

function addMessage(m){
  const msg=document.createElement("div");
  msg.className="message";

  const av=document.createElement("img");
  av.src=m.icon;
  av.className="avatar";
  msg.appendChild(av);

  const body=document.createElement("div");
  body.innerHTML="<b>"+m.name+"</b> <span style='color:#888'>["+new Date(m.timestamp).toLocaleTimeString()+"]</span><br>";

  if(m.fileData){
    if(m.fileType.startsWith("image/")){
      const i=document.createElement("img");
      i.src=m.fileData;i.style.maxWidth="220px";i.style.borderRadius="6px";
      body.appendChild(i);
    } else {
      const a=document.createElement("a");
      a.href=m.fileData;a.textContent="Download file";a.download=m.fileName;
      body.appendChild(a);
    }
  } else {
    body.innerHTML += m.text.replace(/(https?:\\/\\/[^\\s]+)/g,'<a href="$1" target="_blank">$1</a>');
  }

  msg.appendChild(body);
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

socket.on("chat-message",addMessage);
socket.on("chat-file",addMessage);

socket.on("user-list",users=>{
  usersDiv.innerHTML="";
  users.forEach(u=>{
    const d=document.createElement("div");
    d.className="user";
    d.innerHTML='<img src="'+u.icon+'"><br>'+u.name+(u.isAdmin?' <span class="admin">(admin)</span>':'');
    usersDiv.appendChild(d);
  });
});
</script>
</body>
</html>`);
});

// ===== SERVER LOGIC =====
const rooms = {};

io.on("connection",socket=>{
  socket.on("join-room",({roomId,name,icon})=>{
    if(!rooms[roomId]) rooms[roomId]={users:[],adminId:null};
    const room=rooms[roomId];
    if(!room.adminId) room.adminId=socket.id;

    room.users.push({id:socket.id,name,icon,isAdmin:room.adminId===socket.id});
    socket.join(roomId);

    socket.to(roomId).emit("user-joined",socket.id);
    io.to(roomId).emit("user-list",room.users);

    socket.on("signal",({to,data})=>{
      io.to(to).emit("signal",{from:socket.id,data});
    });

    socket.on("chat-message",({roomId,text})=>{
      const u=room.users.find(x=>x.id===socket.id);
      if(u) io.to(roomId).emit("chat-message",{name:u.name,icon:u.icon,text,timestamp:Date.now()});
    });

    socket.on("chat-file",data=>{
      const u=room.users.find(x=>x.id===socket.id);
      if(u) io.to(roomId).emit("chat-file",{name:u.name,icon:u.icon,...data,timestamp:Date.now()});
    });

    socket.on("disconnect",()=>{
      room.users=room.users.filter(u=>u.id!==socket.id);
      socket.to(roomId).emit("user-left",socket.id);
      io.to(roomId).emit("user-list",room.users);
      if(room.users.length===0) delete rooms[roomId];
    });
  });
});

server.listen(3000,()=>console.log("✅ Server running on 3000"));
