const socket = io();
const muteButton = document.getElementById("mute-button");
const leaveButton = document.getElementById("leave-button");

let localStream;
let myPeer; // Peer connection instance
const peers = {};  // Store peer connections for each user

const roomId = window.location.pathname.split("/")[1] || "default-room";

// Prompt the user to enter a name before joining
const userName = prompt("Enter your name:", "Anonymous");
if (!userName) {
    alert("You must enter a name to join the meeting.");
    window.location.href = "/";
}

// Notify the server about the username and room ID
socket.emit("join-room", { roomId, userName });

// Get only audio stream (no video)
navigator.mediaDevices
    .getUserMedia({ audio: true, video: false }) // Only audio
    .then((stream) => {
        localStream = stream;

        // Create a new peer connection for this user
        myPeer = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        // Add the audio track to the peer connection
        stream.getTracks().forEach((track) => {
            myPeer.addTrack(track, stream);
        });

        // Handle ICE candidates
        myPeer.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("signal", { signal: event.candidate, target: roomId });
            }
        };

        // Handle incoming audio streams (remote peers)
        myPeer.ontrack = (event) => {
            const remoteAudio = document.createElement("audio");
            remoteAudio.srcObject = event.streams[0];
            remoteAudio.autoplay = true;
            remoteAudio.controls = true; // Controls for remote users
            document.body.append(remoteAudio);
        };

        // Handle signaling between peers (offer, answer, candidate)
        socket.on("signal", async (payload) => {
            const { signal, from } = payload;

            if (signal.type === "offer") {
                await myPeer.setRemoteDescription(new RTCSessionDescription(signal));
                const answer = await myPeer.createAnswer();
                await myPeer.setLocalDescription(answer);
                socket.emit("signal", { signal: myPeer.localDescription, target: from });
            } else if (signal.type === "answer") {
                await myPeer.setRemoteDescription(new RTCSessionDescription(signal));
            } else if (signal.candidate) {
                await myPeer.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }
        });

        socket.on("user-connected", (user) => {
            connectToNewUser(user.userId, user.userName, stream);
        });

        // Handle disconnection
        socket.on("user-disconnected", (userId) => {
            if (peers[userId]) {
                peers[userId].close();
                delete peers[userId];
            }
        });
    })
    .catch((err) => {
        console.error("Error accessing media devices:", err);
    });

// Function to handle new users joining
function connectToNewUser(userId, userName, stream) {
    const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    // Add local audio track to the peer connection
    stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
    });

    // Handle ICE Candidate exchange
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("signal", { signal: event.candidate, target: userId });
        }
    };

    // When remote stream is added, play the remote audio
    peerConnection.ontrack = (event) => {
        const remoteAudio = document.createElement("audio");
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.autoplay = true;
        remoteAudio.controls = true; // Controls for remote users
        document.body.append(remoteAudio);
    };

    // Create an offer to send to the new user
    peerConnection.createOffer()
        .then((offer) => {
            return peerConnection.setLocalDescription(offer);
        })
        .then(() => {
            socket.emit("signal", { signal: peerConnection.localDescription, target: userId });
        });

    // Store the peer connection for future use
    peers[userId] = peerConnection;
}

// Mute Button functionality
muteButton.addEventListener("click", () => {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    muteButton.textContent = audioTrack.enabled ? "Mute" : "Unmute";
});

// Leave Button functionality
leaveButton.addEventListener("click", () => {
    socket.disconnect();
    window.location.href = "/";
});
