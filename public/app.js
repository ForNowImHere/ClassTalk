const express = require('express');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.get('/', (req, res) => {
    const newRoom = uuidv4();
    res.redirect(`/room/${newRoom}`);
});

app.get('/room/:roomId', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Live Meet Room</title>
    <style>
        body { margin: 0; background: #111; color: white; font-family: sans-serif; }
        canvas { display: block; width: 100vw; height: 100vh; background: #222; }
        #chat { position: absolute; bottom: 10px; left: 10px; background: rgba(0,0,0,0.5); padding: 10px; }
    </style>
</head>
<body>
    <canvas id="gridCanvas"></canvas>
    <div id="chat">
        <input id="chatInput" placeholder="Say something..." />
    </div>
    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        const roomId = location.pathname.split('/').pop();
        const canvas = document.getElementById('gridCanvas');
        const ctx = canvas.getContext('2d');
        const chatInput = document.getElementById('chatInput');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const user = {
            name: prompt('Enter your name'),
            image: \`https://robohash.org/\${Math.random().toString().slice(2)}\`
        };

        const peers = {};

        socket.emit('join-room', { roomId, user });

        socket.on('user-joined', ({ id, user }) => {
            peers[id] = user;
            drawGrid();
        });

        socket.on('existing-users', (ids) => {
            for (const id of ids) {
                peers[id] = { name: 'Unknown', image: 'https://via.placeholder.com/64' };
            }
            drawGrid();
        });

        socket.on('user-left', ({ id }) => {
            delete peers[id];
            drawGrid();
        });

        socket.on('chat-message', ({ from, msg }) => {
            console.log(\`\${peers[from]?.name || from}: \${msg}\`);
        });

        chatInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                socket.emit('chat-message', chatInput.value);
                chatInput.value = '';
            }
        });

        function drawGrid() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const keys = Object.keys(peers);
            keys.push('me');

            const cols = Math.ceil(Math.sqrt(keys.length));
            const size = canvas.width / cols;

            keys.forEach((id, i) => {
                const x = (i % cols) * size;
                const y = Math.floor(i / cols) * size;
                const name = id === 'me' ? user.name : peers[id]?.name || 'Unknown';
                const image = new Image();
                image.src = id === 'me' ? user.image : peers[id]?.image;
                image.onload = () => {
                    ctx.drawImage(image, x + 10, y + 10, size - 20, size - 20);
                    ctx.fillStyle = 'white';
                    ctx.fillText(name, x + 10, y + size - 10);
                };
            });
        }
    </script>
</body>
</html>
    `);
});

io.on('connection', (socket) => {
    socket.on('join-room', ({ roomId, user }) => {
        socket.join(roomId);
        socket.to(roomId).emit('user-joined', { id: socket.id, user });

        const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
        const otherUsers = clients.filter(id => id !== socket.id);
        socket.emit('existing-users', otherUsers);

        socket.on('chat-message', msg => io.to(roomId).emit('chat-message', { from: socket.id, msg }));

        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-left', { id: socket.id });
        });
    });
});

server.listen(3000, () => {
    console.log('✅ Live server on http://localhost:3000');
});
