const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 25 * 1024 * 1024
});

const rooms = {};

function roomId() {
  return Math.random().toString(36).slice(2, 10);
}

app.get("/", (req, res) => res.redirect("/room/" + roomId()));

app.get("/room/:id", (req, res) => {
res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Room ${req.params.id}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*{box-sizing:border-box}
body{
  margin:0;
  background:#0f0f0f;
  color:white;
  font-family:Arial;
  height:100vh;
  display:flex;
}
#users{
  width:260px;
  background:#151515;
  padding:10px;
  overflow-y:auto;
}
.user{
  background:#222;
  padding:8px;
  border-radius:8px;
  margin-bottom:8px;
}
.admin{color:gold;font-size:0.8em}
.slider{width:100%}

#main{
  flex:1;
  display:flex;
  flex-direction:column;
  padding:10px;
}
#messages{
  flex:1;
  background:#222;
  border-radius:8px;
  padding:8px;
  overflow-y:auto;
}
.msg{margin-bottom:8px}

#controls{
  display:flex;
  gap:6px;
  margin-top:8px;
}
input,button{
  background:#111;
  color:white;
  border:none;
  border-radius:6px;
  padding:8px;
}
input{flex:1}
button{cursor:pointer}
audio{display:none}
</style>
</head>

<body>
<div id="users"></div>

<div id="main">
  <div id="messages"></div>
  <div id="controls">
    <input id="input" placeholder="Type message…" />
    <button onclick="send()">Send</button>
    <button onclick="toggleMute()">Mute</button>
    <button onclick="toggleDeafen()">Deafen</button>
    <input type="file" id="file">
  </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
const room = "${req.params.id}";
const name = prompt("Name","Guest") || "Guest";

const messages = document.getElementById("messages");
const usersDiv = document.getElementById("users");
const input = document.getElementById("input");
const fileInput = document.getElementById("file");

let stream;
let muted=false;
let deafened=false;
const peers={};

navigator.mediaDevices.getUserMedia({audio:true}).then(s=>{
  stream=s;
  socket.emit("join",{room,name});
});

function addMsg(html){
  const d=document.createElement("div");
  d.className="msg";
  d.innerHTML=html;
  messages.appendChild(d);
  messages.scrollTop=messages.scrollHeight;
}

function send(){
  if(!input.value.trim()) return;
  socket.emit("msg",input.value);
  input.value="";
}

input.onkeydown=e=>{ if(e.key==="Enter") send(); };

fileInput.onchange=()=>{
  const f=fileInput.files[0];
  if(!f || f.size>8*1024*1024) return alert("8MB max");
  const r=new FileReader();
  r.onload=()=>socket.emit("file",{
    name:f.name,
    type:f.type,
    data:r.result
  });
  r.readAsDataURL(f);
  fileInput.value="";
};

socket.on("msg",m=>{
  addMsg("<b>"+m.name+":</b> "+m.text);
});

socket.on("file",m=>{
  if(m.type.startsWith("image/")){
    addMsg("<b>"+m.name+":</b><br><img src='"+m.data+"' style='max-width:220px;border-radius:6px'>");
  } else {
    addMsg("<b>"+m.name+":</b> <a href='"+m.data+"' download='"+m.file+"'>Download</a>");
  }
});

socket.on("users",list=>{
  usersDiv.innerHTML="";
  list.forEach(u=>{
    const d=document.createElement("div");
    d.className="user";
    d.innerHTML=\`
      <b>\${u.name}</b> \${u.admin?"<span class='admin'>(admin)</span>":""}
      <input class="slider" type="range" min="0" max="1" step="0.01"
        onchange="setVol('\${u.id}',this.value)">
    \`;
    usersDiv.appendChild(d);
  });
});

/* ===== VOICE ===== */

function peer(id){
  const pc=new RTCPeerConnection();
  peers[id]=pc;

  stream.getTracks().forEach(t=>pc.addTrack(t,stream));

  pc.ontrack=e=>{
    let a=document.getElementById("a_"+id);
    if(!a){
      a=document.createElement("audio");
      a.id="a_"+id;
      a.autoplay=true;
      document.body.appendChild(a);
    }
    a.srcObject=e.streams[0];
  };

  pc.onicecandidate=e=>{
    if(e.candidate) socket.emit("ice",{to:id,c:e.candidate});
  };

  return pc;
}

socket.on("new",async id=>{
  const pc=peer(id);
  const offer=await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("offer",{to:id,o:offer});
});

socket.on("offer",async d=>{
  const pc=peer(d.from);
  await pc.setRemoteDescription(d.o);
  const a=await pc.createAnswer();
  await pc.setLocalDescription(a);
  socket.emit("answer",{to:d.from,a});
});

socket.on("answer",d=>{
  peers[d.from].setRemoteDescription(d.a);
});

socket.on("ice",d=>{
  peers[d.from]?.addIceCandidate(d.c);
});

function toggleMute(){
  muted=!muted;
  stream.getTracks().forEach(t=>t.enabled=!muted);
}

function toggleDeafen(){
  deafened=!deafened;
  document.querySelectorAll("audio").forEach(a=>a.muted=deafened);
}

function setVol(id,v){
  const a=document.getElementById("a_"+id);
  if(a) a.volume=v;
}
</script>
</body>
</html>`);
});

/* ===== SOCKET SERVER ===== */

io.on("connection",s=>{
  s.on("join",({room,name})=>{
    s.join(room);
    if(!rooms[room]) rooms[room]={admin:s.id,users:[]};
    rooms[room].users.push({id:s.id,name,admin:s.id===rooms[room].admin});
    s.to(room).emit("new",s.id);
    io.to(room).emit("users",rooms[room].users);
  });

  s.on("msg",t=>{
    for(const r of s.rooms)
      io.to(r).emit("msg",{name:"User",text:t});
  });

  s.on("file",f=>{
    for(const r of s.rooms)
      io.to(r).emit("file",{name:"User",type:f.type,data:f.data,file:f.name});
  });

  s.on("offer",d=>s.to(d.to).emit("offer",{from:s.id,o:d.o}));
  s.on("answer",d=>s.to(d.to).emit("answer",{from:s.id,a:d.a}));
  s.on("ice",d=>s.to(d.to).emit("ice",{from:s.id,c:d.c}));

  s.on("disconnect",()=>{
    for(const r in rooms){
      rooms[r].users=rooms[r].users.filter(u=>u.id!==s.id);
      io.to(r).emit("users",rooms[r].users);
      if(!rooms[r].users.length) delete rooms[r];
    }
  });
});

server.listen(3000,()=>console.log("✅ FULL CHAT + VOICE RUNNING"));
