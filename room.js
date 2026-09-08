const socket = io();
const peer = new Peer();

let myVideoStream = null;
let currentRoom = null;

const urlParams = window.location.pathname.split('/');
const roomCode = urlParams[urlParams.length - 1];

// Microphone is REQUIRED
navigator.mediaDevices.getUserMedia({ audio: true })
    .then(async (audioStream) => {
        // Start with microphone
        myVideoStream = audioStream;

        // Show local stream if your video element supports audio
        document.getElementById('my-video').srcObject = audioStream;

        // Try to enable camera, but don't require it
        try {
            const videoStream = await navigator.mediaDevices.getUserMedia({
                video: true
            });

            // Add camera tracks to the existing microphone stream
            videoStream.getVideoTracks().forEach(track => {
                myVideoStream.addTrack(track);
            });

            document.getElementById('my-video').srcObject = myVideoStream;

            console.log('Camera enabled');
        } catch (err) {
            console.log('Camera unavailable or permission denied. Continuing with microphone only.');
        }

        // Join room after microphone is available
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
        // Microphone is required
        console.error('Microphone is required:', err);
        alert('You must allow microphone access to join the room.');
    });

// Handle incoming messages
socket.on('message', message => {
    console.log('New message:', message);
});

// Notify user when successfully joined
socket.on('room-joined', roomCode => {
    console.log(`You have successfully joined room: ${roomCode}`);
});

// User connected
socket.on('user-connected', userId => {
    console.log(`User ${userId} connected`);
});

// User disconnected
socket.on('user-disconnected', userId => {
    console.log(`User ${userId} disconnected`);
});

// Send messages
function sendMessage() {
    const message = document.getElementById('chat-box').value;

    socket.emit('message', roomCode, message);

    document.getElementById('chat-box').value = '';
}
