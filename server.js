const express = require("express")
const http = require("http")
const { Server } = require("socket.io")

const app = express()
const server = http.createServer(app)
const io = new Server(server)

const rooms = {}

app.get("/", (req,res)=>{

res.send(`
<!DOCTYPE html>
<html>
<head>

<title>Join Room</title>

<style>

body{
background:#0f0f0f;
color:white;
font-family:Arial;
display:flex;
align-items:center;
justify-content:center;
height:100vh;
margin:0
}

#box{
background:#1a1a1a;
padding:30px;
border-radius:20px;
display:flex;
flex-direction:column;
gap:10px;
width:320px
}

input,select{
padding:10px;
border-radius:10px;
border:none;
background:#111;
color:white
}

button{
padding:10px;
border-radius:10px;
border:none;
background:#222;
color:white;
cursor:pointer
}

video{
width:100%;
border-radius:10px;
background:black
}

</style>

</head>

<body>

<div id="box">

<h2>Join Room</h2>

<input id="name" placeholder="Your name">

<input id="room" placeholder="Room code (optional)">

<select id="mic"></select>
<select id="cam"></select>

<video id="preview" autoplay muted></video>

<button onclick="join()">Join</button>

</div>

<script>

let stream

async function init(){

const devices = await navigator.mediaDevices.enumerateDevices()

const mic=document.getElementById("mic")
const cam=document.getElementById("cam")

devices.forEach(d=>{

if(d.kind==="audioinput"){
let o=document.createElement("option")
o.value=d.deviceId
o.text=d.label || "Mic"
mic.appendChild(o)
}

if(d.kind==="videoinput"){
let o=document.createElement("option")
o.value=d.deviceId
o.text=d.label || "Camera"
cam.appendChild(o)
}

})

startPreview()

mic.onchange=startPreview
cam.onchange=startPreview

}

async function startPreview(){

if(stream) stream.getTracks().forEach(t=>t.stop())

stream = await navigator.mediaDevices.getUserMedia({
audio:{deviceId:mic.value},
video:{deviceId:cam.value}
})

preview.srcObject=stream

}

function join(){

let name=document.getElementById("name").value.trim()
let room=document.getElementById("room").value.trim()

if(!name) return alert("enter name")

if(!room) room=Math.random().toString(36).slice(2,7)

location.href="/room/"+room+"?name="+encodeURIComponent(name)

}

init()

</script>

</body>
</html>
`)

})

app.get("/room/:id",(req,res)=>{

res.send(`

<!DOCTYPE html>
<html>
<head>

<style>

body{
margin:0;
background:#0f0f0f;
color:white;
font-family:Arial;
height:100vh;
display:flex;
flex-direction:column
}

#grid{
flex:1;
display:flex;
flex-wrap:wrap;
gap:10px;
padding:10px;
justify-content:center
}

.user{
background:#1b1b1b;
border-radius:16px;
padding:6px;
width:220px;
text-align:center
}

.user video{
width:100%;
border-radius:10px
}

.avatar{
height:120px;
display:flex;
align-items:center;
justify-content:center;
font-size:40px;
background:#333;
border-radius:10px
}

.name{
margin-top:4px
}

.speaking{
box-shadow:0 0 15px lime
}

#bar{
background:#141414;
padding:10px;
display:flex;
gap:10px
}

button{
padding:10px;
border:none;
border-radius:10px;
background:#222;
color:white
}

#chat{
position:absolute;
right:10px;
bottom:70px;
width:300px;
height:300px;
background:#222;
border-radius:12px;
display:none;
flex-direction:column
}

#msgs{
flex:1;
overflow:auto;
padding:5px
}

</style>

</head>

<body>

<div id="grid"></div>

<div id="chat">
<div id="msgs"></div>
<input id="chatInput">
</div>

<div id="bar">

<button id="mic">Mic</button>
<button id="cam">Cam</button>
<button id="chatBtn">Chat</button>
<button onclick="location.href='/'">Leave</button>

</div>

<script src="/socket.io/socket.io.js"></script>

<script>

const socket = io()
const url=new URL(location.href)

const name=url.searchParams.get("name")
const room="${req.params.id}"

const peers={}
const users={}
const grid=document.getElementById("grid")

let stream

navigator.mediaDevices.getUserMedia({video:true,audio:true}).then(s=>{

stream=s

addUser("self",name,s)

socket.emit("join",{room,name})

})

function addUser(id,name,stream){

if(users[id]) return

const div=document.createElement("div")
div.className="user"

let vid=document.createElement("video")
vid.srcObject=stream
vid.autoplay=true
vid.playsInline=true

const label=document.createElement("div")
label.className="name"
label.textContent=name

div.appendChild(vid)
div.appendChild(label)

grid.appendChild(div)

users[id]=div

}

function createPeer(id,init){

const pc=new RTCPeerConnection({
iceServers:[{urls:"stun:stun.l.google.com:19302"}]
})

peers[id]=pc

stream.getTracks().forEach(t=>pc.addTrack(t,stream))

pc.ontrack=e=>{

addUser(id,id,e.streams[0])

}

pc.onicecandidate=e=>{
if(e.candidate){
socket.emit("ice",{to:id,c:e.candidate})
}
}

if(init){

pc.createOffer()
.then(o=>pc.setLocalDescription(o))
.then(()=>{
socket.emit("offer",{to:id,o:pc.localDescription})
})

}

return pc

}

socket.on("users",list=>{
list.forEach(id=>createPeer(id,true))
})

socket.on("new",id=>{
createPeer(id,false)
})

socket.on("offer",async d=>{

const pc=createPeer(d.from,false)

await pc.setRemoteDescription(d.o)

const ans=await pc.createAnswer()

await pc.setLocalDescription(ans)

socket.emit("answer",{to:d.from,a:ans})

})

socket.on("answer",d=>{
peers[d.from].setRemoteDescription(d.a)
})

socket.on("ice",d=>{
peers[d.from].addIceCandidate(d.c)
})

document.getElementById("mic").onclick=()=>{
let t=stream.getAudioTracks()[0]
t.enabled=!t.enabled
}

document.getElementById("cam").onclick=()=>{
let t=stream.getVideoTracks()[0]
t.enabled=!t.enabled
}

document.getElementById("chatBtn").onclick=()=>{
chat.style.display=chat.style.display==="flex"?"none":"flex"
}

chatInput.onkeydown=e=>{
if(e.key==="Enter"){
socket.emit("msg",chatInput.value)
chatInput.value=""
}
}

socket.on("msg",m=>{
let d=document.createElement("div")
d.textContent=m
msgs.appendChild(d)
})

</script>

</body>
</html>

`)

})

io.on("connection",socket=>{

socket.on("join",data=>{

socket.room=data.room
socket.join(data.room)

if(!rooms[data.room]) rooms[data.room]=[]

socket.emit("users",rooms[data.room])

rooms[data.room].forEach(id=>{
io.to(id).emit("new",socket.id)
})

rooms[data.room].push(socket.id)

})

socket.on("offer",d=>{
io.to(d.to).emit("offer",{from:socket.id,o:d.o})
})

socket.on("answer",d=>{
io.to(d.to).emit("answer",{from:socket.id,a:d.a})
})

socket.on("ice",d=>{
io.to(d.to).emit("ice",{from:socket.id,c:d.c})
})

socket.on("msg",m=>{
io.to(socket.room).emit("msg",m)
})

socket.on("disconnect",()=>{

if(!socket.room) return

rooms[socket.room]=rooms[socket.room].filter(i=>i!==socket.id)

})

})

server.listen(3000,()=>console.log("running on http://localhost:3000"))
