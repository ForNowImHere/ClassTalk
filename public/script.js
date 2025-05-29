const socket = io();
const startCallButton = document.getElementById('start-call');
const muteAudioButton = document.getElementById('mute-audio');
const muteVideoButton = document.getElementById('mute-video');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');

let localStream;
let peerConnection;
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

startCallButton.onclick = startCall;

async function startCall() {
    try {
        // Get local media stream (audio and video)
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;

        // Initialize peer connection
        peerConnection = new RTCPeerConnection(configuration);

        // Add local tracks to the peer connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Handle remote stream (when the other peer sends their stream)
        peerConnection.ontrack = (event) => {
            console.log('Received remote stream');
            remoteVideo.srcObject = event.streams[0];  // Set the remote stream to remoteVideo
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', event.candidate);
            }
        };

        // Create offer and set local description
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', offer);

    } catch (error) {
        console.error('Error accessing media devices:', error);
    }
}

// Listen for incoming offer from the other peer
socket.on('offer', async (offer) => {
    try {
        peerConnection = new RTCPeerConnection(configuration);

        // Set remote description (the offer from the other peer)
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        // Add local media tracks to the peer connection
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        // Create an answer to send back to the other peer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer);

        // Handle remote streams when the other peer sends their stream
        peerConnection.ontrack = (event) => {
            console.log('Received remote stream');
            remoteVideo.srcObject = event.streams[0];  // Set the remote stream to remoteVideo
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', event.candidate);
            }
        };

    } catch (error) {
        console.error('Error handling offer:', error);
    }
});

// Listen for incoming answer from the other peer
socket.on('answer', (answer) => {
    try {
        peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
        console.error('Error setting remote description for answer:', error);
    }
});

// Handle incoming ICE candidates
socket.on('ice-candidate', (candidate) => {
    try {
        const iceCandidate = new RTCIceCandidate(candidate);
        peerConnection.addIceCandidate(iceCandidate);
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
    }
});

// Mute/Unmute Audio
muteAudioButton.onclick = () => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack.enabled) {
        audioTrack.enabled = false;  // Mute the audio
        muteAudioButton.textContent = 'Unmute Audio';
    } else {
        audioTrack.enabled = true;  // Unmute the audio
        muteAudioButton.textContent = 'Mute Audio';
    }

    // Notify peer of change by sending a new offer (renegotiate connection)
    updatePeerConnection();
};

// Show/Hide Video
muteVideoButton.onclick = () => {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack.enabled) {
        videoTrack.enabled = false;  // Hide the video
        muteVideoButton.textContent = 'Show Video';
    } else {
        videoTrack.enabled = true;  // Show the video
        muteVideoButton.textContent = 'Hide Video';
    }

    // Notify peer of change by sending a new offer (renegotiate connection)
    updatePeerConnection();
};

// Update the peer connection by renegotiating (sending new offer)
async function updatePeerConnection() {
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', offer);
    } catch (error) {
        console.error('Error renegotiating connection:', error);
    }
}
