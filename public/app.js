const socket = io();
const peer = new Peer(); // Create a PeerJS object for WebRTC

let myVideoStream;
let myPeerId;
let currentRoom = null;
const roomStatusElement = document.getElementById('room-status');

// Handle creating a new room
document.getElementById('create-room-button').addEventListener('click', () => {
    // Request the server to create a new room (redirects to /join/{roomCode})
    window.location.href = '/create';
});

// Handle joining an existing room
document.getElementById('join-room-button').addEventListener('click', () => {
    const roomCode = document.getElementById('room-code-input').value;
    if (roomCode) {
        window.location.href = `/join/${roomCode}`; // Redirect to the room
    } else {
        roomStatusElement.textContent = 'Please enter a room code.';
    }
});

// Initialize webcam and audio
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        myVideoStream = stream;

        // Get the room code from the URL
        const urlParams = window.location.pathname.split('/');
        const roomCode = urlParams[urlParams.length - 1];  // Room code comes from URL path
        
        // Emit the user joining the room with the room code
        socket.emit('join-room', roomCode, peer.id);

        // Display my video stream in the local video element
        document.getElementById('my-video').srcObject = stream;
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
    roomStatusElement.textContent = `You have successfully joined room: ${roomCode}`;
});

// Notify user if the room is full
socket.on('room-full', (roomCode) => {
    roomStatusElement.textContent = `Sorry, room ${roomCode} is full.`;
});

// Notify when a user connects
socket.on('user-connected', (userId) => {
    console.log(`User ${userId} connected`);
    // Handle new peer connection here
});

// Notify when a user disconnects
socket.on('user-disconnected', (userId) => {
    console.log(`User ${userId} disconnected`);
    // Handle peer disconnection here
});
