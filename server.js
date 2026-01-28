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

// 🔥 THIS IS THE MOST IMPORTANT FIX
const io = new Server(server, {
  maxHttpBufferSize: 25 * 1024 * 1024 // 25MB
});

function generateRoomId() {
  const c = "abcdefghijklmnopqrstuvwxyz";
  const p = l => Array.from({ length: l }, () => c[Math.floor(Math.random()*c.length)]).join("");
  return `${p(3)}-${p(4)}-${p(3)}`;
}

app.get("/", (req,res)=>res.redirect(`/room/${generateRoomId()}`));

app.get("/room/:roomId", (req,res)=>{
res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Room ${req.params.roomId}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">

<style>
body{
  margin:0;
  background:#111;
  color:white;
  font-family:Arial;
  height:100vh;
  display:flex;
}

#users{
  width:260px;
  background:#161616;
  border-right:1px solid #333;
  overflow-y:auto;
  padding:10px;
}

.user{
  background:#222;
  padding:8px;
  border-radius:8px;
  margin-bottom:8px;
  text-align:center;
}

.user img{width:48px;height:48px;border-radius:50%}

.admin{color:gold;font-size:0.8em}

#chat{
  flex:1;
  display:flex;
  flex-direction:column;
  padding:10px;
}

#chat-messages{
  flex:1;
  overflow-y:auto;
  background:#222;
  border-radius:8px;
  padding:8px;
}

.message{
  display:flex;
  gap:8px;
  margin-bottom:8px;
}

.message img.avatar{
  width:32px;height:32px;border-radius:50%;
}

#chat-controls{
  display:flex;
  gap:6px;
  margin-top:8px;
}

#chat-input{
  flex:1;
  padding:8px;
  border-radius:6px;
  border:none;
}

button{
  padding:8px 12px;
  border-radius:6px;
  border:none;
  cursor:pointer;
}
</style>
</head>

<body>
<div id="users"></div>

<div id="chat">
  <div id="chat-messages"></div>

  <div id="chat-controls">
    <input id="chat-input" placeholder="Message...">
    <button id="send-chat">Send</button>
    <input type="file" id="chat-file">
  </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
const roomId = "${req.params.roomId}";

const usersDiv = document.getElementById("users");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatFile = document.getElementById("chat-file");

const name = prompt("Name:","Guest") || "Guest";
let icon = prompt("Icon URL (blank=random):","");
const icons = ${JSON.stringify(DEFAULT_ICON)};
if(!icon) icon = icons[Math.floor(Math.random()*icons.length)];

socket.emit("join-room",{roomId,name,icon});

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
    alert("8MB max file size");
    chatFile.value="";
    return;
  }

  const r = new FileReader();
  r.onload = ()=> socket.emit("chat-file",{
    roomId,
    fileName:file.name,
    fileType:file.type,
    fileData:r.result
  });
  r.readAsDataURL(file);
  chatFile.value="";
};

function addMessage({name,icon,text,fileData,fileType,time}){
  const msg = document.createElement("div");
  msg.className="message";

  const av = document.createElement("img");
  av.src = icon;
  av.className="avatar";
  msg.appendChild(av);

  const body = document.createElement("div");
  body.innerHTML = "<b>"+name+"</b> <span style='color:#888;font-size:0.8em'>["+new Date(time).toLocaleTimeString()+"]</span><br>";

  if(fileData){
    if(fileType.startsWith("image/")){
      const i=document.createElement("img");
      i.src=fileData; i.style.maxWidth="220px"; i.style.borderRadius="6px";
      body.appendChild(i);
    } else if(fileType.startsWith("video/")){
      const v=document.createElement("video");
      v.src=fileData; v.controls=true; v.style.maxWidth="220px";
      body.appendChild(v);
    } else {
      const a=document.createElement("a");
      a.href=fileData; a.download="file"; a.textContent="Download file";
      body.appendChild(a);
    }
  } else {
    body.innerHTML += text.replace(/(https?:\\/\\/[^\\s]+)/g,'<a href="$1" target="_blank">$1</a>');
  }

  msg.appendChild(body);
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

socket.on("chat-message",m=>addMessage({...m,time:m.timestamp}));
socket.on("chat-file",m=>addMessage({...m,time:m.timestamp}));

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

// ===== ROOMS =====
const rooms = {};

io.on("connection",socket=>{
  socket.on("join-room",({roomId,name,icon})=>{
    if(!rooms[roomId]) rooms[roomId]={users:[],adminId:null};
    const room=rooms[roomId];

    if(!room.adminId) room.adminId=socket.id;

    room.users.push({
      id:socket.id,
      name,
      icon,
      isAdmin:room.adminId===socket.id
    });

    socket.join(roomId);
    io.to(roomId).emit("user-list",room.users);

    socket.on("chat-message",({roomId,text})=>{
      const u=room.users.find(x=>x.id===socket.id);
      if(u) io.to(roomId).emit("chat-message",{name:u.name,icon:u.icon,text,timestamp:Date.now()});
    });

    socket.on("chat-file",data=>{
      const u=room.users.find(x=>x.id===socket.id);
      if(u) io.to(roomId).emit("chat-file",{name:u.name,icon:u.icon,...data,timestamp:Date.now()});
    });

    socket.on("disconnect",()=>{
      room.users = room.users.filter(u=>u.id!==socket.id);
      io.to(roomId).emit("user-list",room.users);
      if(room.users.length===0) delete rooms[roomId];
    });
  });
});

server.listen(3000,()=>console.log("✅ Server running on 3000"));
