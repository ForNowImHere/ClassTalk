const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server,{maxHttpBufferSize:25*1024*1024});

const rooms={};

function genRoom(){
  return Math.random().toString(36).slice(2,9);
}

app.get("/",(req,res)=>res.redirect("/room/"+genRoom()));

app.get("/room/:id",(req,res)=>{

res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Room ${req.params.id}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">

<style>
body{
margin:0;
display:flex;
height:100vh;
background:#0f0f0f;
color:white;
font-family:Arial;
}

#users{
width:220px;
background:#151515;
overflow-y:auto;
padding:10px;
}

.user{
background:#222;
margin-bottom:8px;
padding:8px;
border-radius:6px;
}

#main{
flex:1;
display:flex;
flex-direction:column;
padding:10px;
}

#messages{
flex:1;
overflow-y:auto;
background:#222;
border-radius:8px;
padding:8px;
}

.msg{margin-bottom:8px}

#videos{
display:flex;
flex-wrap:wrap;
gap:8px;
margin-top:8px;
}

video{
width:200px;
border-radius:8px;
background:black;
}

#controls{
display:flex;
gap:6px;
margin-top:8px;
}

input,button{
background:#111;
color:white;
border:none;
padding:8px;
border-radius:6px;
}

button{cursor:pointer}

audio{display:none}
</style>
</head>

<body>

<div id="users"></div>

<div id="main">

<div id="messages"></div>

<div id="videos"></div>

<div id="controls">
<input id="input" placeholder="message">
<button onclick="send()">Send</button>
<button onclick="toggleMute()" id="muteBtn">Mic</button>
<button onclick="startCam()">Camera</button>
<button onclick="shareScreen()">Screen</button>
<input type="file" id="file">
</div>

</div>

<script src="/socket.io/socket.io.js"></script>

<script>

const socket=io();
const room="${req.params.id}";
const name=prompt("Name","Guest")||"Guest";

const peers={};
let stream;

const messages=document.getElementById("messages");
const usersDiv=document.getElementById("users");
const videos=document.getElementById("videos");

function msg(t){
const d=document.createElement("div");
d.className="msg";
d.innerHTML=t;
messages.appendChild(d);
messages.scrollTop=messages.scrollHeight;
}

navigator.mediaDevices.getUserMedia({audio:true}).then(s=>{
stream=s;
socket.emit("join",{room,name});
}).catch(()=>alert("Mic denied"));

/* TEXT */

function send(){
const i=document.getElementById("input");
if(!i.value.trim())return;
socket.emit("msg",i.value);
i.value="";
}

document.getElementById("input").onkeydown=e=>{
if(e.key==="Enter")send();
};

socket.on("msg",m=>{
msg("<b>"+m.name+":</b> "+m.text);
});

/* FILES */

document.getElementById("file").onchange=()=>{
const f=document.getElementById("file").files[0];
if(!f)return;

const r=new FileReader();

r.onload=()=>{
socket.emit("file",{
name:f.name,
type:f.type,
data:r.result
});
};

r.readAsDataURL(f);
};

socket.on("file",m=>{
if(m.type.startsWith("image/")){
msg("<b>"+m.name+":</b><br><img src='"+m.data+"' style='max-width:200px'>");
}else{
msg("<b>"+m.name+":</b> <a href='"+m.data+"' download='"+m.file+"'>Download</a>");
}
});

/* USERS */

socket.on("users",list=>{
usersDiv.innerHTML="";

list.forEach(u=>{

const d=document.createElement("div");
d.className="user";

d.innerHTML=\`
<b>\${u.name}</b>
<input type="range" min="0" max="1" step="0.01"
oninput="vol('\${u.id}',this.value)">
\`;

usersDiv.appendChild(d);

});
});

function vol(id,v){
const a=document.getElementById("a_"+id);
if(a)a.volume=v;
}

/* PEER CONNECTION */

function peer(id){

const pc=new RTCPeerConnection({
iceServers:[
{urls:"stun:stun.l.google.com:19302"},
{urls:"stun:stun1.l.google.com:19302"},
{urls:"stun:stun2.l.google.com:19302"}
]
});

peers[id]=pc;

stream.getTracks().forEach(t=>pc.addTrack(t,stream));

pc.ontrack=e=>{

if(e.track.kind==="audio"){

let a=document.getElementById("a_"+id);

if(!a){
a=document.createElement("audio");
a.id="a_"+id;
a.autoplay=true;
document.body.appendChild(a);
}

a.srcObject=e.streams[0];

}else{

let v=document.getElementById("v_"+id);

if(!v){
v=document.createElement("video");
v.id="v_"+id;
v.autoplay=true;
v.playsInline=true;
videos.appendChild(v);
}

v.srcObject=e.streams[0];

}

};

pc.onicecandidate=e=>{
if(e.candidate){
socket.emit("ice",{to:id,c:e.candidate});
}
};

return pc;
}

/* CONNECT EXISTING PEERS */

socket.on("peers",async list=>{

for(const id of list){

const pc=peer(id);

const offer=await pc.createOffer();

await pc.setLocalDescription(offer);

socket.emit("offer",{to:id,o:offer});

}

});

/* NEW USER */

socket.on("new",async id=>{

const pc=peer(id);

const offer=await pc.createOffer();

await pc.setLocalDescription(offer);

socket.emit("offer",{to:id,o:offer});

});

/* SIGNALING */

socket.on("offer",async d=>{

const pc=peer(d.from);

await pc.setRemoteDescription(d.o);

const ans=await pc.createAnswer();

await pc.setLocalDescription(ans);

socket.emit("answer",{to:d.from,a:ans});

});

socket.on("answer",d=>{
peers[d.from].setRemoteDescription(d.a);
});

socket.on("ice",d=>{
peers[d.from]?.addIceCandidate(d.c);
});

/* CAMERA */

async function startCam(){

const cam=await navigator.mediaDevices.getUserMedia({
video:{
width:320,
height:240,
frameRate:10
}
});

const track=cam.getVideoTracks()[0];

for(const id in peers){
peers[id].addTrack(track,cam);
}

}

/* SCREEN SHARE */

async function shareScreen(){

const scr=await navigator.mediaDevices.getDisplayMedia({
video:{
frameRate:5
}
});

const track=scr.getVideoTracks()[0];

for(const id in peers){
peers[id].addTrack(track,scr);
}

}

/* MIC */

let muted=false;

function toggleMute(){

muted=!muted;

stream.getAudioTracks().forEach(t=>{
t.enabled=!muted;
});

document.getElementById("muteBtn").textContent=
muted?"Mic OFF":"Mic";

}

</script>
</body>
</html>`);

});

/* SERVER SOCKET */

io.on("connection",s=>{

s.on("join",({room,name})=>{

s.join(room);

if(!rooms[room])
rooms[room]={admin:s.id,users:[]};

rooms[room].users.push({id:s.id,name});

const others=rooms[room].users
.filter(u=>u.id!==s.id)
.map(u=>u.id);

s.emit("peers",others);

s.to(room).emit("new",s.id);

io.to(room).emit("users",rooms[room].users);

});

s.on("msg",text=>{

const room=[...s.rooms].find(r=>r!==s.id);
if(!room)return;

const user=rooms[room].users.find(u=>u.id===s.id);

io.to(room).emit("msg",{name:user.name,text});

});

s.on("file",f=>{

const room=[...s.rooms].find(r=>r!==s.id);
if(!room)return;

const user=rooms[room].users.find(u=>u.id===s.id);

io.to(room).emit("file",{
name:user.name,
type:f.type,
data:f.data,
file:f.name
});

});

s.on("offer",d=>s.to(d.to).emit("offer",{from:s.id,o:d.o}));
s.on("answer",d=>s.to(d.to).emit("answer",{from:s.id,a:d.a}));
s.on("ice",d=>s.to(d.to).emit("ice",{from:s.id,c:d.c}));

s.on("disconnect",()=>{

for(const r in rooms){

rooms[r].users=rooms[r].users.filter(u=>u.id!==s.id);

io.to(r).emit("users",rooms[r].users);

if(!rooms[r].users.length)
delete rooms[r];

}

});

});

server.listen(3000,()=>console.log("Voice + Camera + ScreenShare server running"));
