const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server,{
  maxHttpBufferSize:25*1024*1024,
  cors:{origin:"*"}
});

const rooms = {};

app.get("/",(req,res)=>{
  res.redirect("/room/"+Math.random().toString(36).slice(2,9));
});

app.get("/room/:id",(req,res)=>{

res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Room ${req.params.id}</title>

<style>
*{box-sizing:border-box;margin:0;padding:0}

body{
height:100vh;
background:#0f0f0f;
color:white;
font-family:Arial;
display:flex;
flex-direction:column;
overflow:hidden
}

#videoGrid{
flex:1;
display:flex;
flex-wrap:wrap;
gap:8px;
padding:8px;
overflow:auto;
justify-content:center
}

.participant{
background:#222;
border-radius:8px;
padding:4px;
width:200px;
position:relative;
transition:0.2s
}

.participant video{
width:100%;
border-radius:6px
}

.name-label{
text-align:center;
font-size:0.9em;
margin-top:3px
}

.speaking{
box-shadow:0 0 12px lime
}

#bottomBar{
display:flex;
gap:6px;
padding:8px;
background:#141414
}

button{
background:#111;
border:none;
color:white;
padding:8px;
border-radius:6px;
cursor:pointer
}

button:hover{
background:#222
}

input{
background:#111;
border:none;
color:white;
padding:6px;
border-radius:6px
}

#chatOverlay{
position:absolute;
bottom:70px;
right:10px;
width:520px;
height:420px;
background:#222;
border-radius:10px;
display:none;
flex-direction:column
}

#chatHeader{
background:#333;
padding:6px;
text-align:center;
cursor:pointer
}

#chatMessages{
flex:1;
padding:8px;
overflow:auto;
font-size:0.9em
}

#chatInputBar{
display:flex;
gap:6px;
padding:6px
}

#chatInputBar input{
flex:1
}
</style>
</head>

<body>

<div id="videoGrid"></div>

<div id="chatOverlay">
<div id="chatHeader">Chat (click to close)</div>
<div id="chatMessages"></div>

<div id="chatInputBar">
<input id="chatInput">
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
const room = "${req.params.id}";

let localStream;
let screenStream=null;

let muted=false;
let camOff=false;
let deafened=false;

const peers={}
const participants={}

const grid=document.getElementById("videoGrid")

function addParticipant(id,name,stream){

if(participants[id]) return

const div=document.createElement("div")
div.className="participant"
div.id="p_"+id

const v=document.createElement("video")
v.autoplay=true
v.playsInline=true

if(id==="local") v.muted=true

v.srcObject=stream

const label=document.createElement("div")
label.className="name-label"
label.textContent=name

div.appendChild(v)
div.appendChild(label)

grid.appendChild(div)

participants[id]=div
}

function removeParticipant(id){

if(!participants[id]) return

participants[id].remove()

delete participants[id]

if(peers[id]){
peers[id].close()
delete peers[id]
}

}

function createPeer(id){

const pc=new RTCPeerConnection({
iceServers:[
{urls:"stun:stun.l.google.com:19302"},
{urls:"stun:stun1.l.google.com:19302"}
]
})

peers[id]=pc

localStream.getTracks().forEach(t=>{
pc.addTrack(t,localStream)
})

if(screenStream){
screenStream.getTracks().forEach(t=>{
pc.addTrack(t,screenStream)
})
}

pc.ontrack=e=>{
addParticipant(id,id,e.streams[0])
}

pc.onicecandidate=e=>{
if(e.candidate){
socket.emit("ice",{to:id,c:e.candidate})
}
}

return pc
}

navigator.mediaDevices.getUserMedia({
video:true,
audio:true
}).then(stream=>{

localStream=stream

addParticipant("local","You",stream)

socket.emit("join",{room})

}).catch(()=>{
alert("Camera/Mic permission required")
})

document.getElementById("muteBtn").onclick=()=>{
muted=!muted
localStream.getAudioTracks()[0].enabled=!muted
document.getElementById("muteBtn").textContent=muted?"Mic OFF":"Mic ON"
}

document.getElementById("camBtn").onclick=()=>{
camOff=!camOff
localStream.getVideoTracks()[0].enabled=!camOff
document.getElementById("camBtn").textContent=camOff?"Cam OFF":"Cam ON"
}

document.getElementById("deafenBtn").onclick=()=>{
deafened=!deafened

Object.values(participants).forEach(p=>{
p.querySelector("video").muted=deafened
})

document.getElementById("deafenBtn").textContent=deafened?"Hear OFF":"Hear ON"
}

document.getElementById("screenBtn").onclick=async()=>{

if(screenStream) return

try{

screenStream=await navigator.mediaDevices.getDisplayMedia({video:true})

screenStream.getTracks().forEach(track=>{

for(const id in peers){

peers[id].addTrack(track,screenStream)

}

})

for(const id in peers){

const pc=peers[id]

const offer=await pc.createOffer()

await pc.setLocalDescription(offer)

socket.emit("offer",{to:id,o:offer})

}

screenStream.getVideoTracks()[0].onended=()=>{

screenStream=null

socket.emit("screenStop")

}

}catch(e){console.log(e)}

}

document.getElementById("leaveBtn").onclick=()=>{
location.href="/"
}

socket.on("new",async id=>{

const pc=createPeer(id)

const offer=await pc.createOffer()

await pc.setLocalDescription(offer)

socket.emit("offer",{to:id,o:offer})

})

socket.on("offer",async d=>{

const pc=createPeer(d.from)

await pc.setRemoteDescription(d.o)

const answer=await pc.createAnswer()

await pc.setLocalDescription(answer)

socket.emit("answer",{to:d.from,a:answer})

})

socket.on("answer",d=>{
peers[d.from]?.setRemoteDescription(d.a)
})

socket.on("ice",d=>{
peers[d.from]?.addIceCandidate(d.c)
})

socket.on("remove",id=>{
removeParticipant(id)
})

const chat=document.getElementById("chatOverlay")
const chatMessages=document.getElementById("chatMessages")
const chatInput=document.getElementById("chatInput")

function addMsg(html){

const d=document.createElement("div")
d.innerHTML=html

chatMessages.appendChild(d)

chatMessages.scrollTop=chatMessages.scrollHeight
}

document.getElementById("chatToggle").onclick=()=>{
chat.style.display="flex"
}

document.getElementById("chatHeader").onclick=()=>{
chat.style.display="none"
}

document.getElementById("chatSend").onclick=sendChat
chatInput.onkeydown=e=>{
if(e.key==="Enter") sendChat()
}

function sendChat(){

if(!chatInput.value.trim()) return

socket.emit("msg",chatInput.value)

addMsg("<b>You</b>: "+chatInput.value)

chatInput.value=""
}

socket.on("msg",m=>{
addMsg("<b>"+m.name+"</b>: "+m.text)
})

</script>

</body>
</html>`)

})

io.on("connection",socket=>{

socket.on("join",({room})=>{

socket.join(room)

if(!rooms[room]){
rooms[room]={users:[]}
}

rooms[room].users.push(socket.id)

socket.to(room).emit("new",socket.id)

})

socket.on("msg",text=>{

const room=[...socket.rooms].find(r=>r!==socket.id)

if(!room) return

io.to(room).emit("msg",{name:"User",text})

})

socket.on("offer",d=>{
socket.to(d.to).emit("offer",{from:socket.id,o:d.o})
})

socket.on("answer",d=>{
socket.to(d.to).emit("answer",{from:socket.id,a:d.a})
})

socket.on("ice",d=>{
socket.to(d.to).emit("ice",{from:socket.id,c:d.c})
})

socket.on("disconnect",()=>{

for(const r in rooms){

if(!rooms[r]) continue

rooms[r].users=rooms[r].users.filter(u=>u!==socket.id)

socket.to(r).emit("remove",socket.id)

if(!rooms[r].users.length) delete rooms[r]

}

})

})

server.listen(process.env.PORT||3000,"0.0.0.0",()=>{
console.log("Server running")
})
