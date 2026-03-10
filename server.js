const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 25 * 1024 * 1024
});

const rooms = {};

function genRoom() {
  return Math.random().toString(36).slice(2, 9);
}

app.get("/", (req, res) => res.redirect("/room/" + genRoom()));

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
  height:100vh;
  display:flex;
  background:#0f0f0f;
  color:white;
  font-family:Arial;
}
#users{
  width:260px;
  background:#141414;
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
    <button id="muteBtn" onclick="toggleMute()">Mic: ON</button>
    <button id="deafenBtn" onclick="toggleDeafen()">Hear: ON</button>
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

function addMsg(html){
  const d=document.createElement("div");
  d.className="msg";
  d.innerHTML=html;
  messages.appendChild(d);
  messages.scrollTop=messages.scrollHeight;
}

navigator.mediaDevices.getUserMedia({audio:true}).then(s=>{
  stream=s;
  socket.emit("join",{room,name});
  initMeter();
}).catch(()=>alert("Mic denied"));

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
        oninput="setVol('\${u.id}',this.value)">
    \`;
    usersDiv.appendChild(d);
  });
});

/* ===== VOICE ===== */

function peer(id){
  const pc=new RTCPeerConnection({
    iceServers:[{urls:"stun:stun.l.google.com:19302"}]
  });
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

/* ===== MUTE / DEAFEN ===== */

function toggleMute(){
  muted=!muted;
  stream.getAudioTracks().forEach(t=>t.enabled=!muted);
  document.getElementById("muteBtn").textContent =
    muted ? "Mic: OFF" : "Mic: ON";
}

function toggleDeafen(){
  deafened=!deafened;
  document.querySelectorAll("audio").forEach(a=>a.muted=deafened);
  document.getElementById("deafenBtn").textContent =
    deafened ? "Hear: OFF" : "Hear: ON";
}

function setVol(id,v){
  const a=document.getElementById("a_"+id);
  if(a) a.volume=v;
}

/* ===== MIC METER ===== */

function initMeter(){
  const ctx=new AudioContext();
  const analyser=ctx.createAnalyser();
  analyser.fftSize=256;
  const src=ctx.createMediaStreamSource(stream);
  src.connect(analyser);
  const data=new Uint8Array(analyser.frequencyBinCount);

  function tick(){
    analyser.getByteFrequencyData(data);
    const avg=data.reduce((a,b)=>a+b,0)/data.length;
    const glow=Math.min(20,avg/4);
    document.getElementById("muteBtn").style.boxShadow =
      "0 0 "+glow+"px lime";
    requestAnimationFrame(tick);
  }
  document.body.onclick=()=>ctx.resume();
  tick();
}
</script>
</body>
</html>`);
});

/* ===== SERVER SOCKET ===== */

io.on("connection",s=>{
  s.on("join",({room,name})=>{
    s.join(room);
    if(!rooms[room]) rooms[room]={admin:s.id,users:[]};
    rooms[room].users.push({id:s.id,name,admin:s.id===rooms[room].admin});
    s.to(room).emit("new",s.id);
    io.to(room).emit("users",rooms[room].users);
  });

  s.on("msg",text=>{
    const room=[...s.rooms].find(r=>r!==s.id);
    if(!room) return;
    const user=rooms[room].users.find(u=>u.id===s.id);
    io.to(room).emit("msg",{name:user.name,text});
  });

  s.on("file",f=>{
    const room=[...s.rooms].find(r=>r!==s.id);
    if(!room) return;
    const user=rooms[room].users.find(u=>u.id===s.id);
    io.to(room).emit("file",{name:user.name,type:f.type,data:f.data,file:f.name});
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

server.listen(3000,()=>console.log("✅ CHAT + VOICE FULLY FIXED"));
