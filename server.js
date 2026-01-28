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
  const charset = "abcdefghijklmnopqrstuvwxyz";
  const part = len =>
    Array.from({ length: len }, () =>
      charset[Math.floor(Math.random() * charset.length)]
    ).join("");
  return `${part(3)}-${part(4)}-${part(3)}`;
}

// Redirect root to new room
app.get('/', (req,res) => res.redirect(`/room/${generateRoomId()}`));

// Serve room HTML
app.get('/room/:roomId', (req,res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Voice & Chat Room - ${req.params.roomId}</title>
<style>
body { background:#111; color:white; font-family:Arial,sans-serif; margin:0; padding:0; }
#users { display:flex; flex-wrap:wrap; gap:10px; padding:10px; }
.user { background:#222; padding:10px; border-radius:8px; width:140px; text-align:center; }
.user img { border-radius:50%; width:48px; height:48px; }
.name { margin:6px 0; font-weight:bold; }
.admin { color:gold; font-size:0.9em; }
.dots { font-size:22px; color:#0f0; }
button.kick { margin-top:6px; background:#900; border:none; color:white; padding:5px 10px; border-radius:4px; cursor:pointer; }
#chat { padding:10px; max-width:600px; margin-top:20px; }
#chat-messages { height:300px; overflow-y:auto; border:1px solid #444; padding:5px; background:#222; border-radius:8px; }
#chat-input { width:70%; padding:5px; border-radius:4px; border:none; }
#send-chat { padding:5px 10px; border-radius:4px; }
</style>
</head>
<body>
<h1 style="margin:10px;">Room: ${req.params.roomId}</h1>
<div id="users"></div>

<div id="chat">
  <div id="chat-messages"></div>
  <input id="chat-input" type="text" placeholder="Type a message..."/>
  <button id="send-chat">Send</button>
  <input type="file" id="chat-file" style="margin-top:5px;"/>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
(async () => {
  const socket = io();
  const roomId = "${req.params.roomId}";
  let localStream = null, peers = {}, userId = null, isAdmin = false;

  // Name + icon
  const userName = prompt("Enter your name:","Guest")||"Guest";
  let userIcon = prompt("Enter icon URL (blank=default)","");
  const defaultIcons = ${JSON.stringify(DEFAULT_ICON)};
  if(!userIcon) userIcon = defaultIcons[Math.floor(Math.random()*defaultIcons.length)];

  const usersDiv = document.getElementById('users');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const sendChatBtn = document.getElementById('send-chat');
  const chatFileInput = document.getElementById('chat-file');

  // Join room
  socket.emit('join-room',{roomId,name:userName,icon:userIcon});

  // Mic access
  try { localStream = await navigator.mediaDevices.getUserMedia({audio:true}); }
  catch { alert('Microphone denied'); return; }

  // Volume indicator
  const audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  const analyser = audioCtx.createAnalyser(); analyser.fftSize=256;
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  audioCtx.createMediaStreamSource(localStream).connect(analyser);

  function updateVolume() {
    analyser.getByteFrequencyData(dataArray);
    const avg = dataArray.reduce((a,b)=>a+b,0)/dataArray.length;
    const dotsCount = Math.min(5,Math.floor(avg/30));
    const dots = "·".repeat(5-dotsCount) + "●".repeat(dotsCount);
    const meDots = document.getElementById('dots-'+userId);
    if(meDots) meDots.textContent = dots;
    requestAnimationFrame(updateVolume);
  }
  updateVolume();

  // WebRTC config
  const rtcConfig={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};

  // Chat sending
  sendChatBtn.onclick=()=>{ const text=chatInput.value.trim(); if(!text)return; socket.emit('chat-message',{roomId,text}); chatInput.value=''; };

  chatFileInput.onchange=()=>{
    const file = chatFileInput.files[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>socket.emit('chat-file',{roomId,fileName:file.name,fileType:file.type,fileData:reader.result});
    reader.readAsDataURL(file);
    chatFileInput.value='';
  };

  // Receive messages
  socket.on('chat-message', msg => addChat(msg.name,msg.icon,msg.text,msg.timestamp,false));
  socket.on('chat-file', msg => {
    let content;
    if(msg.fileType.startsWith('image/')) content = '<img src="'+msg.fileData+'" style="max-width:200px;border-radius:4px;">';
    else if(msg.fileType.startsWith('video/')) content = '<video src="'+msg.fileData+'" controls style="max-width:200px;border-radius:4px;"></video>';
    else content = '<a href="'+msg.fileData+'" download="'+msg.fileName+'">'+msg.fileName+'</a>';
    addChat(msg.name,msg.icon,content,msg.timestamp,true);
  });

  function addChat(name,icon,text,timestamp,isHTML=false){
    const div=document.createElement('div');
    div.style.marginBottom='8px'; div.style.display='flex'; div.style.alignItems='center';
    const time=new Date(timestamp).toLocaleTimeString();
    div.innerHTML = '<img src="'+icon+'" style="width:32px;height:32px;border-radius:50%;margin-right:6px;">'+
      '<div><strong>'+name+'</strong> <span style="color:#888;font-size:0.8em;">['+time+']</span><br>'+
      (isHTML?text:linkify(text))+'</div>';
    chatMessages.appendChild(div);
    chatMessages.scrollTop=chatMessages.scrollHeight;
  }

  function linkify(text){ return text.replace(/(https?:\/\/[^\s]+)/g,'<a href="$1" target="_blank" style="color:#0af;">$1</a>'); }

  // Update user list
  socket.on('user-list', users=>{
    usersDiv.innerHTML='';
    users.forEach(u=>{
      if(u.id===userId) isAdmin = u.isAdmin;
      const userEl=document.createElement('div');
      userEl.className='user'; userEl.id='user-'+u.id;
      userEl.innerHTML = '<img src="'+u.icon+'"><div class="name">'+u.name+(u.isAdmin?'<span class="admin">(admin)</span>':'')+'</div><div class="dots" id="dots-'+u.id+'">·····</div>'+
        (isAdmin && u.id!==userId?'<button class="kick" data-id="'+u.id+'">Kick</button>':'');
      usersDiv.appendChild(userEl);
      const btn=userEl.querySelector('button.kick');
      if(btn) btn.onclick=()=>{ if(confirm('Kick '+u.name+'?')) socket.emit('kick-user',u.id); };
    });
  });

  // Receive your ID
  socket.on('your-id', id=>userId=id);

  // WebRTC signaling
  socket.on('signal', async ({from,data})=>{
    if(!peers[from]) await createPeerConnection(from,false);
    const pc=peers[from];
    if(data.type==='offer'){
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal',{to:from,data:pc.localDescription});
    } else if(data.type==='answer') await pc.setRemoteDescription(new RTCSessionDescription(data));
    else if(data.candidate) try{await pc.addIceCandidate(new RTCIceCandidate(data.candidate));}catch(e){console.warn(e);}
  });

  socket.on('user-joined', async u=>{ if(u.id!==userId) await createPeerConnection(u.id,true); });
  socket.on('user-left', id=>{ if(peers[id]){peers[id].close(); delete peers[id];} const el=document.getElementById('user-'+id); if(el) el.remove(); });

  async function createPeerConnection(peerId,isInitiator){
    const pc = new RTCPeerConnection(rtcConfig);
    peers[peerId]=pc;
    localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
    pc.ontrack = e=>{
      let audio=document.getElementById('audio-'+peerId);
      if(!audio){ audio=document.createElement('audio'); audio.id='audio-'+peerId; audio.autoplay=true; audio.playsInline=true; audio.style.display='none'; document.body.appendChild(audio);}
      audio.srcObject=e.streams[0];
    };
    pc.onicecandidate=e=>{if(e.candidate)socket.emit('signal',{to:peerId,data:{candidate:e.candidate}});}
    if(isInitiator){
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('signal',{to:peerId,data:pc.localDescription});
    }
  }

  window.addEventListener('beforeunload',()=>socket.disconnect());

})();
</script>
</body>
</html>
  `);
});

// Rooms in memory
const rooms = {}; // roomId => { users:[{id,name,icon,isAdmin}], adminId }

io.on('connection', socket=>{
  socket.on('join-room', ({roomId,name,icon})=>{
    if(!rooms[roomId]) rooms[roomId]={users:[],adminId:null};
    const room=rooms[roomId];
    const userId=socket.id;
    if(!room.adminId) room.adminId=userId;
    const isAdmin=room.adminId===userId;
    room.users.push({id:userId,name:name||'Guest',icon:icon||DEFAULT_ICON,isAdmin});
    socket.join(roomId);
    socket.emit('your-id',userId);
    io.to(roomId).emit('user-list',room.users);
    socket.to(roomId).emit('user-joined',{id:userId,name,icon,isAdmin});

    // Relay signals
    socket.on('signal',({to,data})=>{ io.to(to).emit('signal',{from:socket.id,data}); });

    // Kick
    socket.on('kick-user',kickId=>{
      if(socket.id!==room.adminId) return;
      const kickedSocket = io.sockets.sockets.get(kickId);
      if(kickedSocket){ kickedSocket.emit('kicked'); kickedSocket.disconnect(); }
    });

    // Chat messages
    socket.on('chat-message', ({roomId,text})=>{
      const user = room.users.find(u=>u.id===socket.id); if(!user) return;
      io.to(roomId).emit('chat-message',{userId:user.id,name:user.name,icon:user.icon,text,timestamp:Date.now()});
    });

    socket.on('chat-file', ({roomId,fileName,fileType,fileData})=>{
      const user=room.users.find(u=>u.id===socket.id); if(!user)return;
      io.to(roomId).emit('chat-file',{userId:user.id,name:user.name,icon:user.icon,fileName,fileType,fileData,timestamp:Date.now()});
    });

    // Disconnect
    socket.on('disconnect',()=>{
      if(!rooms[roomId]) return;
      room.users = room.users.filter(u=>u.id!==userId);
      if(room.adminId===userId){
        if(room.users.length>0){ room.adminId=room.users[0].id; room.users[0].isAdmin=true; } else { delete rooms[roomId]; return; }
      }
      io.to(roomId).emit('user-list',room.users);
      io.to(roomId).emit('user-left',userId);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT,()=>console.log("Server running on port "+PORT));
