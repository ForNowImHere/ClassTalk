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

/* your existing JS continues here */

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
