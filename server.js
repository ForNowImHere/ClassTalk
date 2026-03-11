const express = require("express")
const http = require("http")
const { Server } = require("socket.io")

const app = express()
const server = http.createServer(app)

const io = new Server(server,{
maxHttpBufferSize:25*1024*1024,
cors:{origin:"*"}
})

const rooms={}

function randomCode(){
return Math.random().toString(36).slice(2,8).toUpperCase()
}

app.get("/",(req,res)=>{

res.send(`

<!DOCTYPE html>
<html>
<head>
<title>Lobby</title>

<style>

body{
background:#0f0f0f;
color:white;
font-family:Arial;
height:100vh;
display:flex;
align-items:center;
justify-content:center;
flex-direction:column
}

input{
padding:12px;
border:none;
border-radius:8px;
background:#1b1b1b;
color:white;
font-size:16px
}

button{
margin-top:10px;
padding:10px 20px;
border:none;
background:#2e2e2e;
color:white;
border-radius:8px;
cursor:pointer
}

button:hover{
background:#444
}

</style>

</head>

<body>

<h2>Join or Create Room</h2>

<input id="code" placeholder="Enter room code (optional)">

<button onclick="joinRoom()">Join</button>

<script>

function joinRoom(){

let code=document.getElementById("code").value.trim()

if(!code){
code=Math.random().toString(36).slice(2,8).toUpperCase()
}

location.href="/room/"+code

}

</script>

</body>
</html>

`)
})

app.get("/room/:id",(req,res)=>{

const id=req.params.id.toUpperCase()

res.send(`

<!DOCTYPE html>
<html>
<head>

<meta charset="UTF-8">
<title>Room ${id}</title>

<style>

body{
background:#0f0f0f;
color:white;
font-family:Arial;
height:100vh;
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
justify-content:center
}

.participant{
background:#222;
border-radius:8px;
padding:4px;
width:200px
}

video{
width:100%;
border-radius:6px
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

</style>

</head>

<body>

<div id="videoGrid"></div>

<div id="bottomBar">
<button id="muteBtn">Mic</button>
<button id="camBtn">Cam</button>
<button onclick="location.href='/'">Leave</button>
</div>

<script src="/socket.io/socket.io.js"></script>

<script>

const socket=io()
const room="${id}"

let localStream
const peers={}
const grid=document.getElementById("videoGrid")

function addVideo(id,stream){

if(document.getElementById("p_"+id)) return

const div=document.createElement("div")
div.className="participant"
div.id="p_"+id

const v=document.createElement("video")
v.autoplay=true
v.playsInline=true

if(id==="local") v.muted=true

v.srcObject=stream

div.appendChild(v)

grid.appendChild(div)

}

function createPeer(id){

const pc=new RTCPeerConnection({
iceServers:[
{urls:"stun:stun.l.google.com:19302"}
]
})

peers[id]=pc

localStream.getTracks().forEach(t=>{
pc.addTrack(t,localStream)
})

pc.ontrack=e=>{
addVideo(id,e.streams[0])
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

addVideo("local",stream)

socket.emit("join",{room})

})

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
document.getElementById("p_"+id)?.remove()
})

</script>

</body>
</html>

`)

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

rooms[r].users=rooms[r].users.filter(u=>u!==socket.id)

socket.to(r).emit("remove",socket.id)

if(!rooms[r].users.length) delete rooms[r]

}

})

})

server.listen(3000,()=>{
console.log("Server running on port 3000")
})
