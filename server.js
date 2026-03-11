// server.js

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server,{
  maxHttpBufferSize:25*1024*1024
});

const rooms = {};



/* =========================
   LOBBY PAGE
========================= */

app.get("/",(req,res)=>{

res.send(`<!DOCTYPE html>
<html>

<head>

<title>Call Lobby</title>

<style>

body{
background:#0f0f0f;
color:white;
font-family:Arial;
display:flex;
justify-content:center;
align-items:center;
height:100vh;
}

#box{
background:#1a1a1a;
padding:40px;
border-radius:10px;
width:400px;
text-align:center;
}

input{
width:100%;
padding:10px;
margin-top:10px;
background:#111;
border:none;
color:white;
border-radius:6px;
}

button{
width:100%;
padding:10px;
margin-top:10px;
background:#222;
border:none;
color:white;
border-radius:6px;
cursor:pointer;
}

button:hover{
background:#333;
}

</style>

</head>


<body>

<div id="box">

<h2>Video Call Lobby</h2>

<input id="name" placeholder="Your name">

<button onclick="createRoom()">Create Room</button>

<input id="roomID" placeholder="Enter Room ID">

<button onclick="joinRoom()">Join Room</button>

</div>

<script>

function createRoom(){

const id=Math.random().toString(36).slice(2,8)

join(id)

}

function joinRoom(){

const id=document.getElementById("roomID").value

if(!id) return

join(id)

}

function join(id){

const name=document.getElementById("name").value || "Guest"

localStorage.setItem("name",name)

location.href="/room/"+id

}

</script>

</body>

</html>`)

})



/* =========================
   ROOM PAGE
========================= */

app.get("/room/:id",(req,res)=>{

res.send(`<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<title>Room ${req.params.id}</title>

<style>

body{
background:#0f0f0f;
color:white;
font-family:Arial;
display:flex;
flex-direction:column;
height:100vh;
}

#videoGrid{
flex:1;
display:flex;
flex-wrap:wrap;
gap:10px;
padding:10px;
justify-content:center;
}

.participant{
background:#222;
padding:6px;
border-radius:8px;
width:220px;
}

video{
width:100%;
border-radius:6px;
}

.name{
text-align:center;
font-size:0.9em;
margin-top:4px;
}

#bottomBar{
display:flex;
gap:10px;
padding:10px;
background:#111;
}

button{
background:#222;
border:none;
color:white;
padding:8px;
border-radius:6px;
cursor:pointer;
}

button:hover{
background:#333;
}


/* CHAT */

#chat{
position:absolute;
right:10px;
bottom:70px;
width:520px;
height:420px;
background:#222;
border-radius:10px;
display:none;
flex-direction:column;
}

#chatMessages{
flex:1;
overflow:auto;
padding:10px;
font-size:0.9em;
}

#chatInput{
border:none;
padding:10px;
background:#111;
color:white;
}

</style>

</head>

<body>

<div id="videoGrid"></div>

<div id="chat">

<div id="chatMessages"></div>

<input id="chatInput" placeholder="message">

</div>


<div id="bottomBar">

<button id="mute">Mic</button>
<button id="cam">Cam</button>
<button id="screen">Screen</button>
<button onclick="toggleChat()">Chat</button>

</div>


<script src="/socket.io/socket.io.js"></script>

<script>

const socket = io()

const room = "${req.params.id}"

const name = localStorage.getItem("name") || "Guest"

let localStream

const peers = {}

const participants = {}

const grid = document.getElementById("videoGrid")



function addVideo(id,stream,label){

if(participants[id]) return

const div=document.createElement("div")
div.className="participant"

const v=document.createElement("video")
v.srcObject=stream
v.autoplay=true
v.playsInline=true

if(id==="local") v.muted=true

const n=document.createElement("div")
n.className="name"
n.textContent=label

div.appendChild(v)
div.appendChild(n)

grid.appendChild(div)

participants[id]=div

}



function removeVideo(id){

if(!participants[id]) return

participants[id].remove()

delete participants[id]

}



navigator.mediaDevices.getUserMedia({
video:true,
audio:true
}).then(stream=>{

localStream=stream

addVideo("local",stream,name)

socket.emit("join",{room,name})

})



function createPeer(id){

const pc=new RTCPeerConnection({
iceServers:[{urls:"stun:stun.l.google.com:19302"}]
})

peers[id]=pc

localStream.getTracks().forEach(track=>{
pc.addTrack(track,localStream)
})

pc.ontrack=e=>{
addVideo(id,e.streams[0],id)
}

pc.onicecandidate=e=>{
if(e.candidate){
socket.emit("ice",{to:id,c:e.candidate})
}
}

return pc

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
removeVideo(id)
})



/* CHAT */

function toggleChat(){

const c=document.getElementById("chat")

c.style.display = c.style.display==="flex" ? "none" : "flex"

}



const chatInput=document.getElementById("chatInput")
const chatMessages=document.getElementById("chatMessages")

chatInput.onkeydown=e=>{

if(e.key==="Enter"){

socket.emit("msg",chatInput.value)

chatMessages.innerHTML+="<div><b>You:</b> "+chatInput.value+"</div>"

chatInput.value=""

}

}



socket.on("msg",m=>{

chatMessages.innerHTML+="<div><b>"+m.name+":</b> "+m.text+"</div>"

chatMessages.scrollTop=chatMessages.scrollHeight

})

</script>

</body>

</html>`)

})



/* =========================
   SOCKET SERVER
========================= */

io.on("connection",socket=>{

socket.on("join",({room,name})=>{

socket.join(room)

if(!rooms[room]){
rooms[room]={users:[]}
}

rooms[room].users.push({id:socket.id,name})

socket.to(room).emit("new",socket.id)

})


socket.on("msg",text=>{

const room=[...socket.rooms].find(r=>r!==socket.id)
if(!room) return

const user=rooms[room].users.find(u=>u.id===socket.id)

io.to(room).emit("msg",{name:user.name,text})

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

rooms[r].users=rooms[r].users.filter(u=>u.id!==socket.id)

socket.to(r).emit("remove",socket.id)

if(!rooms[r].users.length){
delete rooms[r]
}

}

})

})


server.listen(process.env.PORT||3000,"0.0.0.0",()=>{
console.log("Server running")
})
