const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 25 * 1024 * 1024,
  cors: { origin: "*" }
});

const rooms = {};

// --- Lobby page ---
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Lobby</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif}
body{height:100vh;display:flex;justify-content:center;align-items:center;background:#0f0f0f;color:white;}
#lobbyBox{background:#222;padding:20px;border-radius:12px;display:flex;flex-direction:column;gap:10px;width:300px;text-align:center;}
input,button{padding:8px;border:none;border-radius:8px;background:#111;color:white;cursor:pointer;}
input:focus{outline:none;}
button:hover{background:#333;}
</style>
</head>
<body>
<div id="lobbyBox">
<h2>Join or Create Room</h2>
<input id="nameInput" placeholder="Enter your name">
<input id="roomInput" placeholder="Room code (leave blank for random)">
<button id="joinBtn">Join Room</button>
</div>
<script>
const joinBtn=document.getElementById('joinBtn');
joinBtn.onclick=()=> {
  const name=document.getElementById('nameInput').value.trim();
  let room=document.getElementById('roomInput').value.trim();
  if(!name){alert('Enter your name');return;}
  if(!room){room=Math.random().toString(36).slice(2,7);}
  localStorage.setItem('username',name);
  window.location.href='/room/'+room;
}
</script>
</body>
</html>`);
});

// --- Room page ---
app.get('/room/:id', (req,res)=>{
  const roomID = req.params.id;
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Room ${roomID}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif;}
body{height:100vh;background:#0f0f0f;color:white;display:flex;flex-direction:column;overflow:hidden;}
#videoGrid{flex:1;display:flex;flex-wrap:wrap;gap:8px;padding:8px;overflow:auto;justify-content:center;}
.participant{background:#222;border-radius:12px;padding:6px;position:relative;display:flex;flex-direction:column;align-items:center;}
.participant video{width:100%;border-radius:8px;}
.name-label{margin-top:4px;font-size:0.9em;text-align:center;}
.mic-activity{height:4px;width:0%;background:#44ff44;margin-top:4px;border-radius:2px;transition:0.05s;}
#bottomBar{display:flex;gap:6px;padding:8px;background:#141414;justify-content:center;}
button{background:#111;border:none;color:white;padding:8px;border-radius:8px;cursor:pointer;transition:0.2s;}
button:hover{background:#333;}
input{background:#111;border:none;color:white;padding:6px;border-radius:6px;}
#chatOverlay{position:absolute;bottom:70px;right:10px;width:300px;height:400px;background:#222;border-radius:12px;display:none;flex-direction:column;overflow:hidden;}
#chatHeader{background:#333;padding:6px;display:flex;justify-content:space-between;cursor:pointer;}
#chatMessages{flex:1;padding:8px;overflow:auto;font-size:0.85em;}
.chatMsg{padding:4px 6px;border-radius:8px;margin-bottom:4px;background:#2a2a2a;}
#chatInputBar{display:flex;gap:6px;padding:6px;border-top:1px solid #333;}
#chatInputBar input{flex:1;background:#111;color:white;border:none;border-radius:6px;padding:5px;}
</style>
</head>
<body>
<div id="videoGrid"></div>
<div id="chatOverlay">
<div id="chatHeader">Chat <button id="chatClose">×</button></div>
<div id="chatMessages"></div>
<div id="chatInputBar"><input id="chatInput" placeholder="Message"><button id="chatSend">Send</button></div>
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
const socket=io();
const room="${roomID}";
let localStream,screenStream=null;
let muted=false,camOff=false,deafened=false;
const peers={},participants={};
const grid=document.getElementById('videoGrid');
let username=localStorage.getItem('username')||'User';

// --- AUDIO ANALYSER ---
const audioContexts={};
function setupAudioAnalyser(id,stream){
 const ctx=new (window.AudioContext||window.webkitAudioContext)();
 const analyser=ctx.createAnalyser();
 analyser.fftSize=256;
 const source=ctx.createMediaStreamSource(stream);
 source.connect(analyser);
 audioContexts[id]={ctx,analyser};
}
function updateMicActivity(){
 for(const id in participants){
   const p=participants[id];
   if(audioContexts[id]){
     const data=new Uint8Array(audioContexts[id].analyser.frequencyBinCount);
     audioContexts[id].analyser.getByteFrequencyData(data);
     const vol=data.reduce((a,b)=>a+b,0)/data.length;
     p.micBar.style.width=Math.min(vol,100)+'%';
   }
 }
}
setInterval(updateMicActivity,100);

// --- PARTICIPANT ---
function addParticipant(id,name,stream,isScreen=false){
 if(participants[id]) return;
 const div=document.createElement('div');
 div.className='participant';
 div.id='p_'+id;
 div.style.flex = isScreen?'1 1 70%':'1 1 200px';
 const video=document.createElement('video');
 video.autoplay=true; video.playsInline=true;
 if(id==='local') video.muted=true;
 video.srcObject=stream;
 const label=document.createElement('div');
 label.className='name-label'; label.textContent=name;
 const micBar=document.createElement('div'); micBar.className='mic-activity';
 div.appendChild(video); div.appendChild(label); div.appendChild(micBar);
 if(isScreen) grid.prepend(div); else grid.appendChild(div);
 participants[id]={div,video,micBar,isScreen};
 setupAudioAnalyser(id,stream);
}

function removeParticipant(id){
 if(!participants[id]) return;
 participants[id].div.remove();
 delete participants[id];
 if(peers[id]){peers[id].close(); delete peers[id];}
 if(audioContexts[id]){audioContexts[id].ctx.close(); delete audioContexts[id];}
}

// --- PEER ---
function createPeer(id){
 if(peers[id]) return peers[id];
 const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
 peers[id]=pc;
 localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
 if(screenStream) screenStream.getTracks().forEach(t=>pc.addTrack(t,screenStream));
 pc.ontrack=e=>{
   const isScreen = e.streams[0].getVideoTracks()[0].label.includes('screen')||false;
   addParticipant(id,id,e.streams[0],isScreen);
 };
 pc.onicecandidate=e=>{if(e.candidate) socket.emit('ice',{to:id,c:e.candidate});};
 return pc;
}

// --- LOCAL MEDIA ---
navigator.mediaDevices.getUserMedia({video:true,audio:true}).then(stream=>{
 localStream=stream;
 addParticipant('local',username,stream);
 socket.emit('join',{room,name:username});
}).catch(()=>alert('Camera/Mic permission required'));

// --- BUTTONS ---
document.getElementById('muteBtn').onclick=()=>{muted=!muted; localStream.getAudioTracks()[0].enabled=!muted; document.getElementById('muteBtn').textContent=muted?'Mic OFF':'Mic ON';}
document.getElementById('camBtn').onclick=()=>{camOff=!camOff; localStream.getVideoTracks()[0].enabled=!camOff; document.getElementById('camBtn').textContent=camOff?'Cam OFF':'Cam ON';}
document.getElementById('deafenBtn').onclick=()=>{deafened=!deafened; Object.values(participants).forEach(p=>{p.video.muted=deafened}); document.getElementById('deafenBtn').textContent=deafened?'Hear OFF':'Hear ON';}
document.getElementById('screenBtn').onclick=async()=>{
 if(screenStream) return;
 try{
   screenStream=await navigator.mediaDevices.getDisplayMedia({video:true});
   screenStream.getVideoTracks()[0].label='screen';
   for(const id in peers){
     const pc=peers[id];
     const sender=pc.addTrack(screenStream.getVideoTracks()[0],screenStream);
     pc._screenSender=sender;
     const offer=await pc.createOffer();
     await pc.setLocalDescription(offer);
     socket.emit('offer',{to:id,o:offer});
   }
   addParticipant('local-screen',username,screenStream,true);
   screenStream.getVideoTracks()[0].onended=()=>{
     removeParticipant('local-screen');
     for(const id in peers){
       const pc=peers[id];
       if(pc._screenSender){
         pc.removeTrack(pc._screenSender);
         delete pc._screenSender;
         pc.createOffer().then(o=>pc.setLocalDescription(o).then(()=>socket.emit('offer',{to:id,o:o})));
       }
     }
     screenStream=null;
   }
 }catch(e){console.error(e);}
}
document.getElementById('leaveBtn').onclick=()=>{window.location.href='/';}

// --- CHAT ---
const chat=document.getElementById('chatOverlay');
const chatMessages=document.getElementById('chatMessages');
const chatInput=document.getElementById('chatInput');
document.getElementById('chatToggle').onclick=()=>{chat.style.display='flex';}
document.getElementById('chatClose').onclick=()=>{chat.style.display='none';}
document.getElementById('chatSend').onclick=sendChat;
chatInput.onkeydown=e=>{if(e.key==='Enter') sendChat();}
function sendChat(){if(!chatInput.value.trim())return;socket.emit('msg',chatInput.value); addMsg('<b>You</b>: '+chatInput.value); chatInput.value='';}
function addMsg(html){const d=document.createElement('div');d.className='chatMsg';d.innerHTML=html;chatMessages.appendChild(d);chatMessages.scrollTop=chatMessages.scrollHeight;}
socket.on('msg',m=>{addMsg('<b>'+m.name+'</b>: '+m.text);});

// --- SOCKET.IO ---
socket.on('new',async id=>{const pc=createPeer(id); const offer=await pc.createOffer(); await pc.setLocalDescription(offer); socket.emit('offer',{to:id,o:offer});});
socket.on('offer',async d=>{const pc=createPeer(d.from); await pc.setRemoteDescription(d.o); const answer=await pc.createAnswer(); await pc.setLocalDescription(answer); socket.emit('answer',{to:d.from,a:answer});});
socket.on('answer',d=>{peers[d.from]?.setRemoteDescription(d.a);});
socket.on('ice',d=>{peers[d.from]?.addIceCandidate(d.c);});
socket.on('remove',id=>{removeParticipant(id);});
</script>
</body>
</html>`);
});

// --- DISCONNECT ---
io.on('connection', socket => {
  socket.on('join',({room,name})=>{
    socket.join(room);
    if(!rooms[room]) rooms[room]={users:[]};
    rooms[room].users.push({id:socket.id,name});
    socket.to(room).emit('new',socket.id);
  });
  socket.on('msg',text=>{
    const room=[...socket.rooms].find(r=>r!==socket.id);
    if(!room) return;
    const user=rooms[room]?.users.find(u=>u.id===socket.id);
    io.to(room).emit('msg',{name:user?.name||'User',text});
  });
  socket.on('offer',d=>{socket.to(d.to).emit('offer',{from:socket.id,o:d.o});});
  socket.on('answer',d=>{socket.to(d.to).emit('answer',{from:socket.id,a:d.a});});
  socket.on('ice',d=>{socket.to(d.to).emit('ice',{from:socket.id,c:d.c});});
  socket.on('disconnect',()=>{
    for(const r in rooms){
      if(!rooms[r]) continue;
      rooms[r].users=rooms[r].users.filter(u=>u.id!==socket.id);
      socket.to(r).emit('remove',socket.id);
      if(!rooms[r].users.length) delete rooms[r];
    }
  });
});

server.listen(process.env.PORT||3000,'0.0.0.0',()=>{console.log('Server running');});
