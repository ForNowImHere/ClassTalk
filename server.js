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
<html lang="en">
<head>
<meta charset="UTF-8">
<title>WebRTC Room</title>
<style>
* { box-sizing: border-box; margin:0; padding:0; font-family: Arial,sans-serif; }
body { height:100vh; display:flex; flex-direction:column; background:#0f0f0f; color:white; overflow:hidden; }
#videoGrid { flex:1; display:flex; flex-wrap:wrap; gap:8px; padding:8px; overflow:auto; justify-content:center; }
.participant { background:#222; border-radius:12px; padding:6px; width:180px; display:flex; flex-direction:column; align-items:center; position:relative; }
.participant video { width:100%; border-radius:8px; }
.name-label { text-align:center; margin-top:4px; font-size:0.9em; }
.mic-activity { width:80%; height:6px; background:#444; border-radius:3px; margin-top:4px; }
.mic-activity-inner { width:0%; height:100%; background:lime; border-radius:3px; transition:width 0.1s; }
#bottomBar { display:flex; gap:6px; padding:8px; background:#141414; }
button { background:#111; border:none; color:white; padding:8px; border-radius:8px; cursor:pointer; transition:0.2s; }
button:hover { background:#222; }
#chatOverlay { position:absolute; bottom:70px; right:10px; width:300px; height:380px; background:#222; border-radius:12px; display:none; flex-direction:column; overflow:hidden; }
#chatHeader { background:#333; padding:6px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; }
#chatClose { background:#444; border:none; color:white; border-radius:50%; width:20px; height:20px; cursor:pointer; }
#chatMessages { flex:1; padding:8px; overflow:auto; font-size:0.85em; }
.chatMsg { padding:5px 7px; border-radius:10px; margin-bottom:5px; background:#2e2e2e; word-wrap:break-word; }
#chatInputBar { display:flex; gap:4px; padding:6px; border-top:1px solid #333; }
#chatInputBar input { flex:1; background:#111; color:white; border:none; border-radius:6px; padding:5px; }
</style>
</head>
<body>

<div id="videoGrid"></div>

<div id="chatOverlay">
  <div id="chatHeader">
    <span>Chat</span>
    <button id="chatClose">×</button>
  </div>
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
let localStream;
let screenStream = null;
let muted = false, camOff = false, deafened = false;
const peers = {};
const participants = {};
const grid = document.getElementById("videoGrid");
const chat = document.getElementById("chatOverlay");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");

// Prompt name
let username = prompt("Enter your display name") || "User";
const room = prompt("Enter room code") || Math.random().toString(36).slice(2,7);

function addParticipant(id, name, stream = null) {
  if(participants[id]) return;
  const div = document.createElement("div");
  div.className = "participant";
  div.id = "p_" + id;

  if(stream) {
    const v = document.createElement("video");
    v.autoplay = true; v.playsInline = true;
    if(id === "local") v.muted = true;
    v.srcObject = stream;
    div.appendChild(v);
  } else {
    const letter = document.createElement("div");
    letter.style.width="100%"; letter.style.height="120px"; letter.style.background="#444";
    letter.style.display="flex"; letter.style.justifyContent="center"; letter.style.alignItems="center";
    letter.style.fontSize="48px"; letter.style.borderRadius="8px";
    letter.textContent = name[0].toUpperCase();
    div.appendChild(letter);
  }

  const label = document.createElement("div");
  label.className="name-label"; label.textContent=name;
  div.appendChild(label);

  const micActivity = document.createElement("div");
  micActivity.className="mic-activity";
  const micInner = document.createElement("div");
  micInner.className="mic-activity-inner";
  micActivity.appendChild(micInner);
  div.appendChild(micActivity);

  grid.appendChild(div);
  participants[id] = {div, micInner};
}

function removeParticipant(id){
  if(!participants[id]) return;
  participants[id].div.remove();
  delete participants[id];
  if(peers[id]) { peers[id].close(); delete peers[id]; }
}

async function createPeer(id, isInitiator=false) {
  const pc = new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
  peers[id] = pc;

  if(localStream) localStream.getTracks().forEach(t=>pc.addTrack(t, localStream));
  if(screenStream) screenStream.getTracks().forEach(t=>pc.addTrack(t, screenStream));

  pc.ontrack = e => addParticipant(id, id, e.streams[0]);
  pc.onicecandidate = e => { if(e.candidate) socket.emit("ice",{to:id,c:e.candidate}); };

  if(isInitiator){
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("offer",{to:id,o:offer});
  }

  return pc;
}

// get media
navigator.mediaDevices.getUserMedia({video:true,audio:true}).then(stream=>{
  localStream = stream;
  addParticipant("local", username, stream);
  socket.emit("join",{room, name:username});
}).catch(()=>alert("Camera/Mic required"));

document.getElementById("muteBtn").onclick = () => {
  muted = !muted;
  if(localStream) localStream.getAudioTracks()[0].enabled = !muted;
  document.getElementById("muteBtn").textContent = muted?"Mic OFF":"Mic ON";
};
document.getElementById("camBtn").onclick = () => {
  camOff = !camOff;
  if(localStream) localStream.getVideoTracks()[0].enabled = !camOff;
  document.getElementById("camBtn").textContent = camOff?"Cam OFF":"Cam ON";
};
document.getElementById("deafenBtn").onclick = () => {
  deafened = !deafened;
  Object.values(participants).forEach(p=>{ p.div.querySelector("video")?.muted = deafened; });
  document.getElementById("deafenBtn").textContent = deafened?"Hear OFF":"Hear ON";
};
document.getElementById("screenBtn").onclick = async() => {
  if(screenStream) return;
  try{
    screenStream = await navigator.mediaDevices.getDisplayMedia({video:true});
    Object.values(peers).forEach(pc => screenStream.getTracks().forEach(track=>pc.addTrack(track, screenStream)));
    screenStream.getVideoTracks()[0].onended = () => { screenStream=null; };
  } catch(e){ console.log(e); }
};
document.getElementById("leaveBtn").onclick = () => location.href="/";
document.getElementById("chatToggle").onclick = ()=> chat.style.display="flex";
document.getElementById("chatClose").onclick = ()=> chat.style.display="none";
document.getElementById("chatSend").onclick = sendChat;
chatInput.onkeydown = e => { if(e.key==="Enter") sendChat(); };

function sendChat(){
  if(!chatInput.value.trim()) return;
  addMsg("<b>You</b>: "+chatInput.value);
  socket.emit("msg",{name:username,text:chatInput.value});
  chatInput.value="";
}

function addMsg(html){
  const d = document.createElement("div");
  d.className="chatMsg"; d.innerHTML=html;
  chatMessages.appendChild(d);
  chatMessages.scrollTop=chatMessages.scrollHeight;
}

// Socket events
socket.on("new", async id => { await createPeer(id,true); });
socket.on("offer", async d => {
  const pc = await createPeer(d.from);
  await pc.setRemoteDescription(d.o);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit("answer",{to:d.from,a:answer});
});
socket.on("answer", d => peers[d.from]?.setRemoteDescription(d.a));
socket.on("ice", d => peers[d.from]?.addIceCandidate(d.c));
socket.on("remove", id => removeParticipant(id));
socket.on("msg", m => addMsg("<b>"+m.name+"</b>: "+m.text));
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
