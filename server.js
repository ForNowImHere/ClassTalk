const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 25*1024*1024,
  cors: { origin: "*" }
});

const rooms = {};

// Lobby page
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Lobby</title>
<style>
body { font-family:Arial; background:#0f0f0f; color:white; display:flex; justify-content:center; align-items:center; height:100vh; flex-direction:column; }
input { padding:8px; margin:6px; border-radius:6px; border:none; background:#111; color:white; }
button { padding:8px 12px; margin:6px; border-radius:6px; border:none; background:#222; color:white; cursor:pointer; }
button:hover { background:#333; }
</style>
</head>
<body>
<h2>Enter Room Code or leave blank for random:</h2>
<input id="roomInput" placeholder="Room code (optional)">
<h2>Enter your name:</h2>
<input id="nameInput" placeholder="Your name">
<button id="joinBtn">Join Room</button>

<script>
document.getElementById("joinBtn").onclick = () => {
  let code = document.getElementById("roomInput").value.trim();
  let name = document.getElementById("nameInput").value.trim() || "User";
  if(!code) code = Math.random().toString(36).slice(2,8);
  window.location.href = "/room/" + code + "?name=" + encodeURIComponent(name);
}
</script>
</body>
</html>`);
});

// Room page
app.get("/room/:id", (req,res)=>{
  const roomId = req.params.id;
  const name = req.query.name || "User";
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Room ${roomId}</title>
<style>
body{font-family:Arial;background:#0f0f0f;color:white;display:flex;flex-direction:column;height:100vh;margin:0;overflow:hidden;}
#videoGrid{flex:1;display:flex;flex-wrap:wrap;gap:8px;padding:8px;justify-content:center;overflow:auto;}
.participant{background:#222;border-radius:10px;padding:4px;width:180px;position:relative;transition:0.2s;}
.participant video{width:100%;border-radius:6px;}
.name-label{text-align:center;margin-top:4px;font-size:0.9em;}
.mic-activity{height:4px;width:0%;background:lime;border-radius:2px;margin-top:2px;transition:0.05s;}
#bottomBar{display:flex;gap:6px;padding:8px;background:#141414;flex-wrap:wrap;}
button{background:#111;border:none;color:white;padding:8px;border-radius:6px;cursor:pointer;}
button:hover{background:#222;}
#chatOverlay{position:absolute;bottom:70px;right:10px;width:300px;height:400px;background:#222;border-radius:10px;display:none;flex-direction:column;overflow:hidden;}
#chatHeader{background:#333;padding:6px;display:flex;justify-content:space-between;cursor:pointer;}
#chatMessages{flex:1;padding:8px;overflow:auto;font-size:0.85em;}
#chatInputBar{display:flex;gap:4px;padding:6px;border-top:1px solid #333;}
#chatInputBar input{flex:1;background:#111;color:white;border:none;border-radius:6px;padding:5px;}
</style>
</head>
<body>
<div id="videoGrid"></div>

<div id="chatOverlay">
<div id="chatHeader">Chat <button id="chatClose">×</button></div>
<div id="chatMessages"></div>
<div id="chatInputBar">
<input id="chatInput" placeholder="message">
<button id="chatSend">Send</button>
</div>
</div>

<div id="bottomBar">
<button id="muteBtn">Mic ON</button>
<button id="camBtn">Cam ON</button>
<button id="screenBtn">Share Screen</button>
<button id="deafenBtn">Hear ON</button>
<button id="chatToggle">Chat</button>
<button id="leaveBtn">Leave</button>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
const room = "${roomId}";
const myName = "${name}";
let localStream, screenStream=null;
let muted=false, camOff=false, deafened=false;
const peers={}, participants={};
const grid=document.getElementById("videoGrid");

function addParticipant(id,name,stream){
  if(participants[id]) return;
  const div=document.createElement("div");
  div.className="participant";
  div.id="p_"+id;
  const v=document.createElement("video");
  v.autoplay=true;
  v.playsInline=true;
  if(id==="local") v.muted=true;
  v.srcObject=stream;
  const label=document.createElement("div");
  label.className="name-label";
  label.textContent=name;
  const micAct=document.createElement("div");
  micAct.className="mic-activity";
  div.appendChild(v);
  div.appendChild(label);
  div.appendChild(micAct);
  grid.appendChild(div);
  participants[id]=div;
  monitorMic(id,stream,micAct);
}

function removeParticipant(id){
  if(!participants[id]) return;
  participants[id].remove();
  delete participants[id];
  if(peers[id]){ peers[id].close(); delete peers[id]; }
}

function createPeer(id){
  const pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
  peers[id]=pc;
  localStream.getTracks().forEach(t=>{ pc.addTrack(t,localStream); });
  if(screenStream) screenStream.getTracks().forEach(t=>{ pc.addTrack(t,screenStream); });
  pc.ontrack=e=>{ addParticipant(id,id,e.streams[0]); };
  pc.onicecandidate=e=>{ if(e.candidate) socket.emit("ice",{to:id,c:e.candidate}); };
  return pc;
}

navigator.mediaDevices.getUserMedia({video:true,audio:true}).then(stream=>{
  localStream=stream;
  addParticipant("local",myName,stream);
  socket.emit("join",{room,name:myName});
}).catch(()=>{ alert("Camera/Mic permission required") });

document.getElementById("muteBtn").onclick=()=>{
  muted=!muted;
  localStream.getAudioTracks()[0].enabled=!muted;
  document.getElementById("muteBtn").textContent=muted?"Mic OFF":"Mic ON";
}
document.getElementById("camBtn").onclick=()=>{
  camOff=!camOff;
  localStream.getVideoTracks()[0].enabled=!camOff;
  document.getElementById("camBtn").textContent=camOff?"Cam OFF":"Cam ON";
}
document.getElementById("deafenBtn").onclick=()=>{
  deafened=!deafened;
  Object.values(participants).forEach(p=>{
    p.querySelector("video").muted=deafened;
  });
  document.getElementById("deafenBtn").textContent=deafened?"Hear OFF":"Hear ON";
}
document.getElementById("screenBtn").onclick=async()=>{
  if(screenStream) return;
  try{
    screenStream=await navigator.mediaDevices.getDisplayMedia({video:true});
    screenStream.getTracks().forEach(track=>{
      for(const id in peers) peers[id].addTrack(track,screenStream);
    });
    for(const id in peers){
      const pc=peers[id];
      const offer=await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer",{to:id,o:offer});
    }
    screenStream.getVideoTracks()[0].onended=()=>{
      screenStream=null;
      socket.emit("screenStop");
    }
  }catch(e){console.log(e);}
}
document.getElementById("leaveBtn").onclick=()=>{ location.href="/"; }

socket.on("new",async id=>{
  const pc=createPeer(id);
  const offer=await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("offer",{to:id,o:offer});
});
socket.on("offer",async d=>{
  const pc=createPeer(d.from);
  await pc.setRemoteDescription(d.o);
  const answer=await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit("answer",{to:d.from,a:answer});
});
socket.on("answer",d=>{ peers[d.from]?.setRemoteDescription(d.a); });
socket.on("ice",d=>{ peers[d.from]?.addIceCandidate(d.c); });
socket.on("remove",id=>{ removeParticipant(id); });

// Chat
const chat=document.getElementById("chatOverlay");
const chatMessages=document.getElementById("chatMessages");
const chatInput=document.getElementById("chatInput");
function addMsg(html){ const d=document.createElement("div"); d.innerHTML=html; chatMessages.appendChild(d); chatMessages.scrollTop=chatMessages.scrollHeight; }
document.getElementById("chatToggle").onclick=()=>{ chat.style.display="flex"; }
document.getElementById("chatClose").onclick=()=>{ chat.style.display="none"; }
document.getElementById("chatSend").onclick=sendChat;
chatInput.onkeydown=e=>{ if(e.key==="Enter") sendChat(); }
function sendChat(){
  if(!chatInput.value.trim()) return;
  socket.emit("msg",chatInput.value);
  addMsg("<b>You</b>: "+chatInput.value);
  chatInput.value="";
}
socket.on("msg",m=>{ addMsg("<b>"+m.name+"</b>: "+m.text); });

// mic activity monitoring
function monitorMic(id,stream,bar){
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  source.connect(analyser);
  analyser.fftSize = 256;
  const data = new Uint8Array(analyser.frequencyBinCount);
  function update(){
    analyser.getByteFrequencyData(data);
    let sum = data.reduce((a,b)=>a+b,0);
    let level = Math.min(sum/data.length/128,1)*100;
    bar.style.width = level+"%";
    requestAnimationFrame(update);
  }
  update();
}

</script>
</body>
</html>`);
});

// Socket.io
io.on("connection",socket=>{
  socket.on("join",({room,name})=>{
    socket.join(room);
    if(!rooms[room]) rooms[room]={users:[]};
    rooms[room].users.push({id:socket.id,name});
    socket.to(room).emit("new",socket.id);
  });
  socket.on("msg",(text)=>{
    const room=[...socket.rooms].find(r=>r!==socket.id);
    if(!room) return;
    io.to(room).emit("msg",{name:"User",text});
  });
  socket.on("offer",d=>{ socket.to(d.to).emit("offer",{from:socket.id,o:d.o}); });
  socket.on("answer",d=>{ socket.to(d.to).emit("answer",{from:socket.id,a:d.a}); });
  socket.on("ice",d=>{ socket.to(d.to).emit("ice",{from:socket.id,c:d.c}); });
  socket.on("disconnect",()=>{
    for(const r in rooms){
      if(!rooms[r]) continue;
      rooms[r].users = rooms[r].users.filter(u=>u.id!==socket.id);
      socket.to(r).emit("remove",socket.id);
      if(!rooms[r].users.length) delete rooms[r];
    }
  });
});

server.listen(process.env.PORT||3000,"0.0.0.0",()=>{console.log("Server running");});
