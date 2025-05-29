const socket = io();

// DOM Elements
const startCallButton = document.getElementById('start-call');
const muteMicButton = document.getElementById('mute-mic');
const hideCameraButton = document.getElementById('hide-camera');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');

let localStream;
let peerConnection;
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Get the room code from the URL
const roomCode = window.location.pathname.split('/')[2];

// Join the room on the server side
socket.emit('join-room', roomCode);

// Start the video call
async function startCall() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;

        peerConnection = new RTCPeerConnection(configuration);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.ontrack = (event) => {
            remoteVideo.srcObject = event.streams[0];
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', event.candidate, roomCode);
            }
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', offer, roomCode);
    } catch (error) {
        console.error('Error accessing media devices:', error);
    }
}

// Listen for incoming offer
socket.on('offer', async (offer) => {
    peerConnection = new RTCPeerConnection(configuration);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', answer, roomCode);
});

// Listen for incoming answer
socket.on('answer', (answer) => {
    peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

// Handle ICE candidates
socket.on('ice-candidate', (candidate) => {
    const iceCandidate = new RTCIceCandidate(candidate);
    peerConnection.addIceCandidate(iceCandidate);
});

// Mute microphone
muteMicButton.onclick = function() {
    const audioTracks = localStream.getAudioTracks();
    audioTracks.forEach(track => track.enabled = !track.enabled);
};

// Hide camera
hideCameraButton.onclick = function() {
    const videoTracks = localStream.getVideoTracks();
    videoTracks.forEach(track => track.enabled = !track.enabled);
};
