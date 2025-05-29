const socket = io();
const peer = new Peer(); // Create a PeerJS object for WebRTC

let myVideoStream;
let currentRoom = null;
const urlParams = window.location.pathname.split('/');
const roomCode = urlParams[urlParams.length - 1];  // Extract room code from the URL

// Initialize webcam and audio
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        myVideoStream = stream;
        document.getElementById('my-video').srcObject = stream;

        // Emit the user joining the room with the room code
        socket.emit('join-room', roomCode, peer.id);

        // Handle incoming WebRTC calls
        peer.on('call', call => {
            call.answer(myVideoStream);
            call.on('stream', remoteStream => {
                document.getElementById('remote-video').srcObject = remoteStream;
            });
        });
    })
    .catch(err => {
        console.log('Error accessing media devices:', err);
    });

// Handle incoming messages in the room
socket.on('message', message => {
    console.log('New message:', message);
    // You could display the messages in a chat window here
});

// Notify user when they've successfully joined the room
socket.on('room-joined', (roomCode) => {
    console.log(`You have successfully joined room: ${roomCode}`);
});

// Handle user connection/disconnection
socket.on('user-connected', (userId) => {
    console.log(`User ${userId} connected`);
});

socket.on('user-disconnected', (userId) => {
    console.log(`User ${userId} disconnected`);
});

// Handle sending messages
function sendMessage() {
    const message = document.getElementById('chat-box').value;
    socket.emit('message', roomCode, message);
    document.getElementById('chat-box').value = '';
}
