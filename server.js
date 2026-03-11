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
<title>Lobby</title>

<style>

body{
background:#0f0f0f;
color:white;
font-family:Arial;
height:100vh;
display:flex;
align-items:center;
justify-content:center
}

#box{
background:#1b1b1b;
padding:40px;
border-radius:20px;
display:flex;
flex-direction:column;
gap:10px;
width:300px
}

input{
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

button:hover{
background:#333
}

</style>
</head>

<body>

<div id="box">

<h2>Join Room</h2>

<input id="code" placeholder="Room Code">

<button onclick="join()">Join / Create</button>

<button onclick="random()">Random Room</button>

</div>

<script>

function join(){
let code=document.getElementById("code").value.trim()

if(!code) code=Math.random().toString(36).substring(2,7)

location.href="/room/"+code
}

function random(){
let code=Math.random().toString(36).substring(2,7)
location.href="/room/"+code
}

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
border-radius:12px;
padding:6px;
width:220px
}

.participant video{
width:100%;
border-radius:8px
}

.name-label{
text-align:center;
font-size:0.9em;
margin-top:4px
}

#bottomBar{
display:flex;
gap:8px;
padding:10px;
background:#141414
}

button{
background:#111;
border:none;
color:white;
padding:10px;
border-radius:10px;
cursor:pointer
}

button:hover{
background:#222
}

#chatOverlay{
position:absolute;
bottom:80px;
right:10px;
width:420px;
height:320px;
background:#222;
border-radius:14px;
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
overflow:auto
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

<button id="muteBtn">Mic</button>
<button id="camBtn">Cam</button>
<button id="screenBtn">Screen</button>
<button id="chatToggle">Chat</button>
<button id="leaveBtn">Leave</button>

</div>

<script src="/socket.io/socket.io.js"></script>

<script>

const socket = io()
const room = "${req.params.id}"

socket.emit("join",room)

const chat=document.getElementById("chatOverlay")

document.getElementById("chatToggle").onclick=()=>{
chat.style.display="flex"
}

document.getElementById("chatHeader").onclick=()=>{
chat.style.display="none"
}

document.getElementById("leaveBtn").onclick=()=>{
location.href="/"
}

const chatInput=document.getElementById("chatInput")
const chatMessages=document.getElementById("chatMessages")

document.getElementById("chatSend").onclick=send

chatInput.onkeydown=e=>{
if(e.key==="Enter") send()
}

function send(){
if(!chatInput.value.trim()) return
socket.emit("msg",chatInput.value)
chatInput.value=""
}

socket.on("msg",m=>{
const d=document.createElement("div")
d.innerHTML="<b>"+m.id+"</b>: "+m.text
chatMessages.appendChild(d)
chatMessages.scrollTop=chatMessages.scrollHeight
})

</script>

</body>
</html>

`)
})

io.on("connection",(socket)=>{

socket.on("join",(room)=>{

socket.join(room)
socket.room=room

if(!rooms[room]) rooms[room]=[]

rooms[room].push(socket.id)

socket.to(room).emit("new",socket.id)

})

socket.on("msg",(text)=>{

if(!socket.room) return

io.to(socket.room).emit("msg",{
id:socket.id.slice(0,5),
text
})

})

socket.on("disconnect",()=>{

if(!socket.room) return

socket.to(socket.room).emit("remove",socket.id)

rooms[socket.room]=rooms[socket.room].filter(id=>id!==socket.id)

})

})

server.listen(3000,()=>{
console.log("server running on http://localhost:3000")
})
