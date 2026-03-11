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
<title>Room ${roomId}</title>
<style>
* { box-sizing: border-box; margin:0; padding:0; }
body {
    background:#0f0f0f;
    color:white;
    font-family: Arial, sans-serif;
    display:flex;
    flex-direction:column;
    height:100vh;
    overflow:hidden;
}
#videoGrid {
    flex:1;
    display:flex;
    flex-wrap:wrap;
    gap:8px;
    padding:8px;
    overflow:auto;
    justify-content:center;
}
.participant {
    background:#222;
    border-radius:12px;
    padding:4px;
    width:200px;
    position:relative;
    display:flex;
    flex-direction:column;
    align-items:center;
    transition:0.2s;
}
.participant video {
    width:100%;
    border-radius:10px;
}
.name-label {
    text-align:center;
    font-size:0.9em;
    margin-top:4px;
}
.screen-share {
    margin-top:4px;
    width:100%;
    border-radius:10px;
    display:none;
}
#bottomBar {
    display:flex;
    gap:6px;
    padding:8px;
    background:#141414;
}
button {
    background:#111;
    border:none;
    color:white;
    padding:8px;
    border-radius:6px;
    cursor:pointer;
}
button:hover { background:#222; }
#chatOverlay {
    position:absolute;
    bottom:70px;
    right:10px;
    width:400px;
    height:300px;
    background:#222;
    border-radius:10px;
    display:none;
    flex-direction:column;
}
#chatHeader {
    background:#333;
    padding:6px;
    text-align:center;
    cursor:pointer;
}
#chatMessages {
    flex:1;
    padding:6px;
    overflow:auto;
    font-size:0.9em;
}
#chatInputBar {
    display:flex;
    gap:6px;
    padding:6px;
}
#chatInputBar input {
    flex:1;
    background:#111;
    color:white;
    border:none;
    border-radius:6px;
    padding:4px;
}
</style>
</head>
<body>

<div id="videoGrid"></div>

<div id="chatOverlay">
    <div id="chatHeader">Chat (click to close)</div>
    <div id="chatMessages"></div>
    <div id="chatInputBar">
        <input id="chatInput" placeholder="Message">
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
let localStream, screenStream=null;
let muted=false, camOff=false, deafened=false;
const peers={}, participants={};

const grid=document.getElementById("videoGrid");

// add participant
function addParticipant(id,name,camStream,screenStreamParam=null){
    if(participants[id]) return;
    const div=document.createElement("div");
    div.className="participant";
    div.id="p_"+id;

    if(camStream){
        const v=document.createElement("video");
        v.autoplay=true;
        v.playsInline=true;
        if(id==="local") v.muted=true;
        v.srcObject=camStream;
        div.appendChild(v);
    }

    const label=document.createElement("div");
    label.className="name-label";
    label.textContent=name;
    div.appendChild(label);

    // screen share under camera if cam on
    if(camStream && screenStreamParam){
        const s=document.createElement("video");
        s.autoplay=true;
        s.playsInline=true;
        s.className="screen-share";
        s.srcObject=screenStreamParam;
        s.style.display="block";
        div.appendChild(s);
    }

    grid.appendChild(div);
    participants[id]=div;
}

// remove participant
function removeParticipant(id){
    if(!participants[id]) return;
    participants[id].remove();
    delete participants[id];
    if(peers[id]){ peers[id].close(); delete peers[id]; }
}

// Your usual WebRTC peer connection logic goes here
// Make sure to track camStream and screenStream separately and call addParticipant with both

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
