const express = require("express")
const http = require("http")
const {Server} = require("socket.io")

const app = express()
const server = http.createServer(app)

const io = new Server(server)

const rooms = {}

function randomCode(){
    return Math.random().toString(36).substring(2,8).toUpperCase()
}

app.get("/",(req,res)=>{
res.send(`

<!DOCTYPE html>
<html>
<head>
<title>Lobby</title>

<style>

body{
background:#111;
color:white;
font-family:sans-serif;
display:flex;
flex-direction:column;
align-items:center;
justify-content:center;
height:100vh
}

input{
padding:10px;
border-radius:8px;
border:none;
margin-top:10px;
background:#222;
color:white
}

button{
padding:10px 20px;
margin-top:10px;
border:none;
border-radius:8px;
background:#444;
color:white;
cursor:pointer
}

</style>
</head>

<body>

<h2>Join Room</h2>

<input id="code" placeholder="room code optional">

<button onclick="join()">Join</button>

<script>

function randomCode(){
return Math.random().toString(36).substring(2,8).toUpperCase()
}

function join(){

let code=document.getElementById("code").value.trim()

if(code===""){
code=randomCode()
}

window.location="/room/"+code

}

</script>

</body>
</html>

`)
})

app.get("/room/:id",(req,res)=>{

const room = req.params.id

res.send(`

<!DOCTYPE html>
<html>
<head>

<title>Room ${room}</title>

<style>

body{
background:#0f0f0f;
color:white;
margin:0;
font-family:sans-serif;
display:flex;
flex-direction:column;
height:100vh
}

/* video grid */

#videos{
flex:1;
display:flex;
flex-wrap:wrap;
gap:12px;
padding:12px;
justify-content:center;
align-content:flex-start
}

video{
width:260px;
background:black;
border-radius:14px;
box-shadow:0 6px 18px rgba(0,0,0,.5)
}

/* bottom bar */

#controls{
background:#141414;
padding:12px;
display:flex;
gap:10px;
justify-content:center;
border-top:1px solid #222
}

button{
background:#1e1e1e;
border:none;
color:white;
padding:10px 16px;
border-radius:12px;
cursor:pointer;
font-size:14px;
transition:.15s
}

button:hover{
background:#2b2b2b
}

/* chat button */

#chatToggle{
position:fixed;
bottom:80px;
right:20px;
background:#4a6cff;
border-radius:20px
}

/* chat popup */

#chatBox{
position:fixed;
bottom:130px;
right:20px;
width:260px;
height:320px;
background:#1a1a1a;
border-radius:16px;
box-shadow:0 10px 25px rgba(0,0,0,.5);
display:none;
flex-direction:column;
overflow:hidden
}

#chatHeader{
background:#4a6cff;
padding:8px;
display:flex;
justify-content:space-between
}

#messages{
flex:1;
padding:8px;
overflow-y:auto;
font-size:13px
}

#chatInput{
border:none;
padding:8px;
outline:none;
background:#111;
color:white
}

</style>

</head>

<body>

<div id="videos"></div>

<div id="controls">

<button id="micBtn">🎤 Mic</button>
<button id="camBtn">📷 Cam</button>
<button onclick="leave()">🚪 Leave</button>

</div>

<button id="chatToggle">💬 Chat</button>

<div id="chatBox">

<div id="chatHeader">
Chat
<button onclick="closeChat()">X</button>
</div>

<div id="messages"></div>

<input id="chatInput" placeholder="message">

</div>

<script src="/socket.io/socket.io.js"></script>

<script>

const socket=io()
const room="${room}"

const peers={}
const videos=document.getElementById("videos")

let stream

navigator.mediaDevices.getUserMedia({video:true,audio:true}).then(s=>{

stream=s

addVideo("me",stream,true)

socket.emit("join",room)

})

function addVideo(id,stream,muted=false){

if(document.getElementById(id)) return

const v=document.createElement("video")

v.id=id
v.srcObject=stream
v.autoplay=true
v.muted=muted
v.playsInline=true

videos.appendChild(v)

}

function createPeer(id){

const pc=new RTCPeerConnection({
iceServers:[{urls:"stun:stun.l.google.com:19302"}]
})

stream.getTracks().forEach(t=>pc.addTrack(t,stream))

pc.ontrack=e=>{
addVideo(id,e.streams[0])
}

pc.onicecandidate=e=>{
if(e.candidate){
socket.emit("ice",{to:id,candidate:e.candidate})
}
}

peers[id]=pc

return pc

}

socket.on("users",users=>{

users.forEach(async id=>{

const pc=createPeer(id)

const offer=await pc.createOffer()

await pc.setLocalDescription(offer)

socket.emit("offer",{to:id,offer})

})

})

socket.on("offer",async data=>{

const pc=createPeer(data.from)

await pc.setRemoteDescription(data.offer)

const answer=await pc.createAnswer()

await pc.setLocalDescription(answer)

socket.emit("answer",{to:data.from,answer})

})

socket.on("answer",data=>{
peers[data.from]?.setRemoteDescription(data.answer)
})

socket.on("ice",data=>{
peers[data.from]?.addIceCandidate(data.candidate)
})

socket.on("user-left",id=>{
document.getElementById(id)?.remove()
delete peers[id]
})

function leave(){
location.href="/"
}

/* chat UI */

const chat=document.getElementById("chatBox")

document.getElementById("chatToggle").onclick=()=>{
chat.style.display="flex"
}

function closeChat(){
chat.style.display="none"
}

</script>

</body>
</html>

`)
})

io.on("connection",socket=>{

socket.on("join",room=>{

socket.join(room)

const clients=[...io.sockets.adapter.rooms.get(room)||[]]

socket.emit("users",clients.filter(id=>id!==socket.id))

socket.to(room).emit("offer-request",socket.id)

socket.room=room

})

socket.on("offer",data=>{
io.to(data.to).emit("offer",{from:socket.id,offer:data.offer})
})

socket.on("answer",data=>{
io.to(data.to).emit("answer",{from:socket.id,answer:data.answer})
})

socket.on("ice",data=>{
io.to(data.to).emit("ice",{from:socket.id,candidate:data.candidate})
})

socket.on("disconnect",()=>{

if(socket.room){
socket.to(socket.room).emit("user-left",socket.id)
}

})

})

server.listen(3000,()=>{
console.log("running on http://localhost:3000")
})
