const express = require("express")
const http = require("http")
const { Server } = require("socket.io")

const app = express()
const server = http.createServer(app)
const io = new Server(server)

const users = {}

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
height:100vh
}

#box{
background:#1b1b1b;
padding:40px;
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
border-radius:12px;
background:black
}

</style>
</head>

<body>

<div id="box">

<h2>Join Room</h2>

<input id="name" placeholder="Your name">

<input id="room" placeholder="Room code">

<select id="mic"></select>
<select id="cam"></select>

<video id="preview" autoplay muted></video>

<button onclick="join()">Join</button>

</div>

<script>

let stream

async function init(){

const devices = await navigator.mediaDevices.enumerateDevices()

const micSel = document.getElementById("mic")
const camSel = document.getElementById("cam")

devices.forEach(d=>{
if(d.kind==="audioinput"){
const o=document.createElement("option")
o.value=d.deviceId
o.text=d.label || "Mic"
micSel.appendChild(o)
}
if(d.kind==="videoinput"){
const o=document.createElement("option")
o.value=d.deviceId
o.text=d.label || "Camera"
camSel.appendChild(o)
}
})

startPreview()

micSel.onchange=startPreview
camSel.onchange=startPreview
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

const name=document.getElementById("name").value.trim()
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
background:#1f1f1f;
border-radius:16px;
padding:6px;
width:220px;
text-align:center;
position:relative
}

.user video{
width:100%;
border-radius:12px
}

.avatar{
width:100%;
height:120px;
border-radius:12px;
display:flex;
align-items:center;
justify-content:center;
font-size:50px;
background:#333
}

.name{
margin-top:4px
}

.speaking{
box-shadow:0 0 15px lime
}

#bar{
display:flex;
gap:10px;
padding:10px;
background:#141414
}

button{
padding:10px;
border:none;
border-radius:10px;
background:#222;
color:white
}

</style>

</head>

<body>

<div id="grid"></div>

<div id="bar">

<button id="micBtn">Mic</button>
<button id="camBtn">Cam</button>
<button id="leave">Leave</button>

</div>

<script src="/socket.io/socket.io.js"></script>

<script>

const socket = io()

const url=new URL(location.href)
const name=url.searchParams.get("name")

const room="${req.params.id}"

socket.emit("join",{room,name})

const grid=document.getElementById("grid")

const peers={}
const users={}

let stream

navigator.mediaDevices.getUserMedia({video:true,audio:true})
.then(s=>{

stream=s
addUser("self",name,s)

socket.emit("ready")

})

function addUser(id,name,stream){

if(users[id]) return

const div=document.createElement("div")
div.className="user"
div.id=id

let vid

if(stream){

vid=document.createElement("video")
vid.srcObject=stream
vid.autoplay=true
vid.playsInline=true

div.appendChild(vid)

}else{

const a=document.createElement("div")
a.className="avatar"
a.textContent=name[0].toUpperCase()

div.appendChild(a)

}

const n=document.createElement("div")
n.className="name"
n.textContent=name

div.appendChild(n)

grid.appendChild(div)

users[id]=div

}

socket.on("user",u=>{
addUser(u.id,u.name)
})

socket.on("leave",id=>{
users[id]?.remove()
delete users[id]
})

document.getElementById("leave").onclick=()=>{
location.href="/"
}

const micBtn=document.getElementById("micBtn")
const camBtn=document.getElementById("camBtn")

let mic=true
let cam=true

micBtn.onclick=()=>{
mic=!mic
stream.getAudioTracks()[0].enabled=mic
}

camBtn.onclick=()=>{
cam=!cam
stream.getVideoTracks()[0].enabled=cam
}

</script>

</body>
</html>

`)

})

io.on("connection",socket=>{

socket.on("join",data=>{

socket.room=data.room
socket.name=data.name

socket.join(data.room)

socket.to(data.room).emit("user",{id:socket.id,name:data.name})

})

socket.on("disconnect",()=>{

socket.to(socket.room).emit("leave",socket.id)

})

})

server.listen(3000,()=>console.log("server running"))
