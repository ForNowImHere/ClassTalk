// FULLY FUNCTIONAL WEBCAM + SCREEN SHARE + LOBBY + CHAT + VOICE ACTIVITY SERVER
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 50 * 1024 * 1024 });

const rooms = {};

function genRoom() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Lobby</title>
<style>
body{background:#0f0f0f;color:white;font-family:Arial;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center}
input,button{margin:4px;padding:8px;border-radius:6px;border:none;background:#222;color:white;cursor:pointer}
</style>
</head>
<body>
<h1>Lobby</h1>
<input id="name" placeholder="Your name" />
<input id="profile" type="file" accept="image/*" />
<br>
<button onclick="createRoom()">Create Room</button>
<input id="code" placeholder="Room Code" />
<button onclick="joinRoom()">Join Room</button>
<script>
function createRoom(){
  const name=document.getElementById('name').value||'Guest';
  const file=document.getElementById('profile').files[0];
  const reader=new FileReader();
  reader.onload=()=>{
    localStorage.setItem('user',JSON.stringify({name,profilePic:reader.result}));
    window.location.href='/room/'+('${genRoom()}');
  };
  if(file) reader.readAsDataURL(file);
  else {localStorage.setItem('user',JSON.stringify({name,profilePic:''})); window.location.href='/room/'+('${genRoom()}');}
}
function joinRoom(){
  const name=document.getElementById('name').value||'Guest';
  const file=document.getElementById('profile').files[0];
  const code=document.getElementById('code').value.trim().toUpperCase();
  if(!code)return alert('Enter a code');
  const reader=new FileReader();
  reader.onload=()=>{
    localStorage.setItem('user',JSON.stringify({name,profilePic:reader.result}));
    window.location.href='/room/'+code;
  };
  if(file) reader.readAsDataURL(file);
  else{localStorage.setItem('user',JSON.stringify({name,profilePic:''})); window.location.href='/room/'+code;}
}
</script>
</body>
</html>`);
});

// ROOM PAGE
app.get('/room/:id', (req,res)=>{
  const roomId=req.params.id;
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Room ${roomId}</title>
<style>
body{margin:0;background:#0f0f0f;color:white;font-family:Arial;overflow:hidden}
#videoGrid{position:absolute;top:0;left:0;right:0;bottom:60px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;padding:8px}
.tile{position:relative;background:#111;border-radius:8px;overflow:hidden}
video{width:100%;height:100%;object-fit:cover}
.nameTag{position:absolute;bottom:4px;left:4px;background:rgba(0,0,0,0.7);padding:2px 6px;border-radius:6px;font-size:12px;display:flex;align-items:center;gap:4px}
.nameTag img{width:18px;height:18px;border-radius:50%}
#users{position:absolute;top:10px;right:10px;width:220px;background:#151515;padding:8px;border-radius:8px;max-height:80vh;overflow:auto}
.user{background:#222;margin-bottom:6px;padding:6px;border-radius:6px;font-size:13px}
.slider{width:100%}
#chatOverlay{position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:none;justify-content:center;align-items:center}
#chatBox{width:500px;height:500px;background:#222;border-radius:10px;display:flex;flex-direction:column}
#messages{flex:1;overflow-y:auto;padding:10px}
#chatInput{display:flex;gap:6px;padding:10px}
input{flex:1;padding:6px;border:none;background:#111;color:white;border-radius:6px}
#bottomBar{position:absolute;bottom:0;left:0;right:0;height:60px;background:#151515;display:flex;justify-content:center;align-items:center;gap:10px}
button{padding:8px 12px;background:#222;border:none;color:white;border-radius:8px;cursor:pointer}
audio{display:none}
</style>
</head>
<body>
<div id="videoGrid"></div>
<div id="users"></div>
<div id="chatOverlay"><div id="chatBox"><div id="messages"></div><div id="chatInput"><input id="input" placeholder="message"><button onclick="send()">Send</button></div></div></div>
<div id="bottomBar">
<button onclick="toggleChat()">💬</button>
<button id="muteBtn" onclick="toggleMute()">🎤</button>
<button onclick="startCam()">📷</button>
<button onclick="shareScreen()">🖥️</button>
<button onclick="leaveRoom()">🚪 Leave</button>
</div>
<script src="/socket.io/socket.io.js"></script>
<script>
const socket=io();
const room='${roomId}';
const user=JSON.parse(localStorage.getItem('user'))||{name:'Guest',profilePic:''};
const peers={};
const users={};
let audioStream;
let camStream;
let screenStream;

function leaveRoom(){window.location.href='/';}
function toggleChat(){document.getElementById('chatOverlay').style.display=document.getElementById('chatOverlay').style.display==='flex'?'none':'flex'}
function send(){const input=document.getElementById('input');if(!input.value.trim())return;socket.emit('msg',input.value);input.value=''}
socket.on('msg',m=>{const div=document.createElement('div');div.innerHTML='<b>'+m.name+':</b> '+m.text;document.getElementById('messages').appendChild(div)});
function createTile(id,name,pic){let tile=document.createElement('div');tile.className='tile';tile.id='tile_'+id;let video=document.createElement('video');video.autoplay=true;video.playsInline=true;let tag=document.createElement('div');tag.className='nameTag';if(pic){const img=document.createElement('img');img.src=pic;tag.appendChild(img)}tag.append(name);tile.appendChild(video);tile.appendChild(tag);document.getElementById('videoGrid').appendChild(tile);return video}
async function peer(id){const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});peers[id]=pc;
if(audioStream)audioStream.getTracks().forEach(t=>pc.addTrack(t,audioStream));
if(camStream)camStream.getTracks().forEach(t=>pc.addTrack(t,camStream));
if(screenStream)screenStream.getTracks().forEach(t=>pc.addTrack(t,screenStream));
pc.ontrack=e=>{let tile=document.getElementById('tile_'+id);if(!tile){const video=createTile(id,users[id]?.name||'User',users[id]?.profilePic||'');video.srcObject=e.streams[0]}else{tile.querySelector('video').srcObject=e.streams[0]}};
pc.onicecandidate=e=>{if(e.candidate)socket.emit('ice',{to:id,c:e.candidate})};return pc}
socket.on('peers',list=>{for(const id of list){const pc=peer(id);pc.createOffer().then(o=>pc.setLocalDescription(o)).then(()=>socket.emit('offer',{to:id,o:pc.localDescription}))}});
socket.on('new',id=>peer(id));
socket.on('offer',async d=>{const pc=peer(d.from);await pc.setRemoteDescription(d.o);const ans=await pc.createAnswer();await pc.setLocalDescription(ans);socket.emit('answer',{to:d.from,a:ans})});
socket.on('answer',d=>{peers[d.from].setRemoteDescription(d.a)});
socket.on('ice',d=>{peers[d.from]?.addIceCandidate(d.c)});
socket.on('users',list=>{document.getElementById('users').innerHTML='';list.forEach(u=>{users[u.id]=u;const div=document.createElement('div');div.className='user';div.innerHTML='<b>'+u.name+'</b><input class=\'slider\' type=\'range\' min=0 max=1 step=0.01 oninput=\'vol("'+u.id+'",this.value)\'>';document.getElementById('users').appendChild(div)})});
function vol(id,v){const a=document.getElementById('a_'+id);if(a)a.volume=v}
async function startCam(){camStream=await navigator.mediaDevices.getUserMedia({video:{width:320,height:240,frameRate:10}});for(const id in peers){const sender=peers[id].getSenders().find(s=>s.track.kind==='video');if(sender)sender.replaceTrack(camStream.getVideoTracks()[0])}}
async function shareScreen(){screenStream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:5}});for(const id in peers){const sender=peers[id].getSenders().find(s=>s.track.kind==='video'&&s.track.label.includes('screen'));if(sender)sender.replaceTrack(screenStream.getVideoTracks()[0])}}
navigator.mediaDevices.getUserMedia({audio:true}).then(s=>{audioStream=s;voiceMeter();socket.emit('join',{room,name:user.name,profilePic:user.profilePic})});
let muted=false;
function toggleMute(){muted=!muted;audioStream.getAudioTracks().forEach(t=>t.enabled=!muted);document.getElementById('muteBtn').innerText=muted?'🔇':'🎤'}
function voiceMeter(){const ctx=new AudioContext();const analyser=ctx.createAnalyser();const src=ctx.createMediaStreamSource(audioStream);src.connect(analyser);analyser.fftSize=256;const data=new Uint8Array(analyser.frequencyBinCount);function loop(){analyser.getByteFrequencyData(data);const avg=data.reduce((a,b)=>a+b)/data.length;const glow=Math.min(20,avg/5);document.querySelectorAll('.slider').forEach(s=>{s.style.background='linear-gradient(to right,#3a6cff '+glow+'%,#444 '+glow+'%)'});requestAnimationFrame(loop)}loop()}
</script>
</body>
</html>`);
});

// SERVER SOCKET
io.on('connection', socket => {
  socket.on('join', ({ room, name, profilePic }) => {
    socket.join(room);
    if(!rooms[room]) rooms[room]={users:[]};
    rooms[room].users.push({id:socket.id,name,profilePic});
    socket.emit('peers', rooms[room].users.filter(u=>u.id!==socket.id).map(u=>u.id));
    socket.to(room).emit('new', socket.id);
    io.to(room).emit('users', rooms[room].users);
  });
  socket.on('msg', text=>{
    const room=[...socket.rooms].find(r=>r!==socket.id);
    if(!room)return;
    const user=rooms[room].users.find(u=>u.id===socket.id);
    io.to(room).emit('msg',{name:user.name,text});
  });
  socket.on('offer', d=>socket.to(d.to).emit('offer',{from:socket.id,o:d.o}));
  socket.on('answer', d=>socket.to(d.to).emit('answer',{from:socket.id,a:d.a}));
  socket.on('ice', d=>socket.to(d.to).emit('ice',{from:socket.id,c:d.c}));
  socket.on('disconnect',()=>{
    for(const room in rooms){
      rooms[room].users=rooms[room].users.filter(u=>u.id!==socket.id);
      io.to(room).emit('users', rooms[room].users);
      if(!rooms[room].users.length) delete rooms[room];
    }
  });
});

server.listen(3000,()=>console.log('✅ WebRTC Video Chat Server with Lobby running on port 3000'))
