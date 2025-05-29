const socket = io();
const peer = new Peer();  // Create a new PeerJS object for WebRTC

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
