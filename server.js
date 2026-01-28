const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// IMPORTANT: allow large binary payloads
const io = new Server(server, {
  maxHttpBufferSize: 50 * 1024 * 1024 // 50MB
});

const rooms = {};

function makeRoom() {
  return Math.random().toString(36).slice(2, 6) + "-" +
         Math.random().toString(36).slice(2, 6);
}

app.get("/", (req, res) => {
  res.redirect("/room/" + makeRoom());
});

app.get("/room/:id", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Room ${req.params.id}</title>
<style>
body{margin:0;background:#111;color:#fff;font-family:Arial}
#users{display:flex;gap:10px;padding:10px;flex-wrap:wrap}
.user{background:#222;padding:8px;border-radius:8px;width:140px;text-align:center}
video{width:240px;border-radius:8px;margin:6px}
#chat{position:fixed;right:10px;bottom:10px;width:320px;background:#222;padding:10px;border-radius:10px}
#msgs{height:220px;overflow-y:auto}
textarea{width:100%;resize:none}
.chatimg{max-width:100%;border-radius:6px;margin:4px 0}
</style>
</head>
<body>

<h3 style="margin:10px">Room ${req.params.id}</h3>
<div id="users"></div>
<video id="me" autoplay muted></video>

<div id="chat">
  <div id="msgs"></div>
  <textarea id="msg" placeholder="message"></textarea>
  <input type="file" id="file">
  <button id="send">Send</button>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
(async()=>{
const socket = io();
const roomId="${req.params.id}";
let myId;
let peers={};

const name=prompt("name","Guest")||"Guest";
socket.emit("join",{roomId,name});

// MEDIA
const stream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
document.getElementById("me").srcObject=stream;

const rtc={iceServers:[{urls:"stun:stun.l.google.com:19302"}]};

socket.on("id",id=>myId=id);

// USERS
socket.on("users",list=>{
  const u=document.getElementById("users");
  u.innerHTML="";
  list.forEach(x=>{
    const d=document.createElement("div");
    d.className="user";
    d.textContent=x.name;
    u.appendChild(d);
  });
});

// WEBRTC
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

socket.on("join-peer",d=>connect(d.id,true));
socket.on("leave-peer",id=>{
  if(peers[id]) peers[id].close();
});

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

// CHAT SEND
send.onclick=()=>{
  const text=msg.value.trim();
  const file=fileInput.files[0];

  if(text) socket.emit("chat-text",{roomId,text});

  if(file){
    if(file.size>50*1024*1024){
      alert("File too big");
      return;
    }
    const r=new FileReader();
    r.onload=()=>{
      socket.emit("chat-file",{
        roomId,
        name:file.name,
        type:file.type,
        data:r.result
      });
    };
    r.readAsArrayBuffer(file);
  }

  msg.value="";
  fileInput.value="";
};

// CHAT RECEIVE
const msgs=document.getElementById("msgs");

socket.on("chat-text",d=>{
  const div=document.createElement("div");
  div.textContent=d.text;
  msgs.appendChild(div);
  msgs.scrollTop=msgs.scrollHeight;
});

socket.on("chat-file",f=>{
  const blob=new Blob([f.data],{type:f.type});
  const url=URL.createObjectURL(blob);

  let el;
  if(f.type.startsWith("image/")){
    el=document.createElement("img");
    el.src=url;
    el.className="chatimg";
  }
  else if(f.type.startsWith("video/")){
    el=document.createElement("video");
    el.src=url;
    el.controls=true;
    el.style.width="100%";
  }
  else if(f.type.startsWith("audio/")){
    el=document.createElement("audio");
    el.src=url;
    el.controls=true;
  }
  else{
    el=document.createElement("a");
    el.href=url;
    el.download=f.name;
    el.textContent="Download "+f.name;
  }

  msgs.appendChild(el);
  msgs.scrollTop=msgs.scrollHeight;
});

})();
</script>
</body>
</html>`);
});

// ================= SERVER =================
io.on("connection",socket=>{

  socket.on("chat-text",d=>{
    io.to(d.roomId).emit("chat-text",{text:d.text});
  });

  socket.on("chat-file",d=>{
    io.to(d.roomId).emit("chat-file",d);
  });

  socket.on("signal",d=>{
    io.to(d.to).emit("signal",{from:socket.id,data:d.data});
  });

  socket.on("join",({roomId,name})=>{
    if(!rooms[roomId]) rooms[roomId]=[];
    rooms[roomId].push({id:socket.id,name});
    socket.join(roomId);

    socket.emit("id",socket.id);
    io.to(roomId).emit("users",rooms[roomId]);
    socket.to(roomId).emit("join-peer",{id:socket.id});

    socket.on("disconnect",()=>{
      rooms[roomId]=rooms[roomId].filter(u=>u.id!==socket.id);
      io.to(roomId).emit("users",rooms[roomId]);
      io.to(roomId).emit("leave-peer",socket.id);
    });
  });
});

server.listen(3000,()=>console.log("🔥 running on http://localhost:3000"));
