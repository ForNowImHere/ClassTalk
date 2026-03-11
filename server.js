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
background:#111;
color:white;
margin:0;
font-family:sans-serif;
display:flex;
flex-direction:column;
height:100vh
}

#videos{
flex:1;
display:flex;
flex-wrap:wrap;
gap:10px;
padding:10px;
justify-content:center
}

video{
width:300px;
background:black;
border-radius:10px
}

#controls{
padding:10px;
background:#222
}

</style>

</head>

<body>

<div id="videos"></div>

<div id="controls">
Room: ${room}
<button onclick="leave()">Leave</button>
</div>

<script src="/socket.io/socket.io.js"></script>

<script>

const socket = io()

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
