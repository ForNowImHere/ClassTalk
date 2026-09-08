const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 25 * 1024 * 1024,
  cors: { origin: "*" }
});

const rooms = {};

// =========================
// LOBBY PAGE
// =========================

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lobby</title>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  font-family: Arial, sans-serif;
}

body {
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #0f0f0f;
  color: white;
}

#lobbyBox {
  background: #222;
  padding: 20px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 300px;
  text-align: center;
}

input,
button {
  padding: 8px;
  border: none;
  border-radius: 8px;
  background: #111;
  color: white;
  cursor: pointer;
}

input:focus {
  outline: none;
}

button:hover {
  background: #333;
}
</style>
</head>

<body>

<div id="lobbyBox">
  <h2>Join or Create Room</h2>

  <input
    id="nameInput"
    placeholder="Enter your name"
    maxlength="30"
  >

  <input
    id="roomInput"
    placeholder="Room code (leave blank for random)"
    maxlength="30"
  >

  <button id="joinBtn">Join Room</button>
</div>

<script>
const joinBtn = document.getElementById("joinBtn");

joinBtn.onclick = () => {
  const name = document.getElementById("nameInput").value.trim();

  let room = document
    .getElementById("roomInput")
    .value
    .trim();

  if (!name) {
    alert("Enter your name");
    return;
  }

  if (!room) {
    room = Math.random()
      .toString(36)
      .slice(2, 7);
  }

  localStorage.setItem("username", name);

  window.location.href = "/room/" + encodeURIComponent(room);
};
</script>

</body>
</html>`);
});

// =========================
// ROOM PAGE
// =========================

app.get("/room/:id", (req, res) => {
  const roomID = req.params.id;

  res.send(`<!DOCTYPE html>
<html>
<head>

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>Room ${roomID}</title>

<style>

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  font-family: Arial, sans-serif;
}

body {
  height: 100vh;
  background: #0f0f0f;
  color: white;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* =========================
   VIDEO GRID
========================= */

#videoGrid {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  overflow: auto;
  justify-content: center;
  align-content: flex-start;
}

.participant {
  background: #222;
  border-radius: 12px;
  padding: 6px;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 160px;
}

.participant video {
  width: 100%;
  max-height: 400px;
  object-fit: cover;
  border-radius: 8px;
  background: #111;
}

.audio-only {
  width: 180px;
  height: 120px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #111;
  border-radius: 8px;
  color: #aaa;
  font-size: 14px;
}

.name-label {
  margin-top: 4px;
  font-size: 0.9em;
  text-align: center;
  word-break: break-word;
}

.mic-activity {
  height: 4px;
  width: 0%;
  background: #44ff44;
  margin-top: 4px;
  border-radius: 2px;
  transition: 0.05s;
}

/* =========================
   BOTTOM BAR
========================= */

#bottomBar {
  display: flex;
  gap: 6px;
  padding: 8px;
  background: #141414;
  justify-content: center;
  flex-wrap: wrap;
}

button {
  background: #111;
  border: none;
  color: white;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: 0.2s;
}

button:hover {
  background: #333;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* =========================
   CHAT
========================= */

#chatOverlay {
  position: absolute;
  bottom: 70px;
  right: 10px;
  width: 300px;
  height: 400px;
  background: #222;
  border-radius: 12px;
  display: none;
  flex-direction: column;
  overflow: hidden;
  z-index: 100;
}

#chatHeader {
  background: #333;
  padding: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}

#chatHeader button {
  padding: 2px 8px;
}

#chatMessages {
  flex: 1;
  padding: 8px;
  overflow: auto;
  font-size: 0.85em;
}

.chatMsg {
  padding: 4px 6px;
  border-radius: 8px;
  margin-bottom: 4px;
  background: #2a2a2a;
  word-break: break-word;
}

#chatInputBar {
  display: flex;
  gap: 6px;
  padding: 6px;
  border-top: 1px solid #333;
}

#chatInputBar input {
  flex: 1;
  background: #111;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 5px;
}

/* =========================
   MOBILE
========================= */

@media (max-width: 600px) {

  #videoGrid {
    gap: 5px;
    padding: 5px;
  }

  .participant {
    min-width: 140px;
  }

  #chatOverlay {
    width: calc(100% - 20px);
    right: 10px;
  }

  #bottomBar {
    padding: 6px;
  }

  #bottomBar button {
    font-size: 12px;
    padding: 7px 9px;
  }
}

</style>
</head>

<body>

<!-- =========================
     VIDEO GRID
========================= -->

<div id="videoGrid"></div>

<!-- =========================
     CHAT
========================= -->

<div id="chatOverlay">

  <div id="chatHeader">
    <span>Chat</span>
    <button id="chatClose">×</button>
  </div>

  <div id="chatMessages"></div>

  <div id="chatInputBar">
    <input
      id="chatInput"
      placeholder="Message"
      maxlength="1000"
    >
    <button id="chatSend">Send</button>
  </div>

</div>

<!-- =========================
     CONTROLS
========================= -->

<div id="bottomBar">

  <button id="muteBtn">
    Mic ON
  </button>

  <button id="camBtn">
    Cam ON
  </button>

  <button id="screenBtn">
    Share Screen
  </button>

  <button id="deafenBtn">
    Hear ON
  </button>

  <button id="chatToggle">
    Chat
  </button>

  <button id="leaveBtn">
    Leave
  </button>

</div>

<script src="/socket.io/socket.io.js"></script>

<script>

// ======================================================
// SOCKET
// ======================================================

const socket = io();

const room =
  window.location.pathname
    .split("/")
    .pop();

let username =
  localStorage.getItem("username") || "User";

// ======================================================
// STATE
// ======================================================

let localStream = null;
let screenStream = null;

let muted = false;
let camOff = false;
let deafened = false;

const peers = {};
const participants = {};
const audioContexts = {};

const grid =
  document.getElementById("videoGrid");

// ======================================================
// AUDIO ANALYSER
// ======================================================

function setupAudioAnalyser(id, stream) {

  try {

    const audioTracks =
      stream.getAudioTracks();

    if (!audioTracks.length) {
      return;
    }

    const ctx =
      new (
        window.AudioContext ||
        window.webkitAudioContext
      )();

    const analyser =
      ctx.createAnalyser();

    analyser.fftSize = 256;

    const source =
      ctx.createMediaStreamSource(stream);

    source.connect(analyser);

    audioContexts[id] = {
      ctx,
      analyser
    };

  } catch (err) {

    console.error(
      "Audio analyser error:",
      err
    );

  }
}

function updateMicActivity() {

  for (const id in participants) {

    const participant =
      participants[id];

    const audioData =
      audioContexts[id];

    if (!audioData) {
      continue;
    }

    const data =
      new Uint8Array(
        audioData
          .analyser
          .frequencyBinCount
      );

    audioData.analyser
      .getByteFrequencyData(data);

    const volume =
      data.reduce(
        (a, b) => a + b,
        0
      ) / data.length;

    participant.micBar.style.width =
      Math.min(volume, 100) + "%";
  }
}

setInterval(
  updateMicActivity,
  100
);

// ======================================================
// PARTICIPANT MANAGEMENT
// ======================================================

function addParticipant(
  id,
  name,
  stream,
  isScreen = false
) {

  if (participants[id]) {
    return;
  }

  const div =
    document.createElement("div");

  div.className =
    "participant";

  div.id =
    "p_" + id;

  div.style.flex =
    isScreen
      ? "1 1 70%"
      : "0 1 200px";

  div.style.maxWidth =
    isScreen
      ? "80%"
      : "200px";

  const videoTracks =
    stream.getVideoTracks();

  let video = null;

  if (videoTracks.length > 0) {

    video =
      document.createElement("video");

    video.autoplay = true;
    video.playsInline = true;

    if (id === "local") {
      video.muted = true;
    }

    video.srcObject = stream;

    div.appendChild(video);

  } else {

    // Audio-only participant
    const audioOnly =
      document.createElement("div");

    audioOnly.className =
      "audio-only";

    audioOnly.textContent =
      "Audio only";

    div.appendChild(audioOnly);
  }

  const label =
    document.createElement("div");

  label.className =
    "name-label";

  label.textContent =
    name;

  const micBar =
    document.createElement("div");

  micBar.className =
    "mic-activity";

  div.appendChild(label);
  div.appendChild(micBar);

  if (isScreen) {
    grid.prepend(div);
  } else {
    grid.appendChild(div);
  }

  participants[id] = {
    div,
    video,
    micBar,
    isScreen
  };

  setupAudioAnalyser(
    id,
    stream
  );
}

function removeParticipant(id) {

  if (!participants[id]) {
    return;
  }

  participants[id].div.remove();

  delete participants[id];

  if (peers[id]) {

    peers[id].close();

    delete peers[id];
  }

  if (audioContexts[id]) {

    audioContexts[id]
      .ctx
      .close();

    delete audioContexts[id];
  }
}

// ======================================================
// PEER CONNECTION
// ======================================================

function createPeer(id) {

  if (peers[id]) {
    return peers[id];
  }

  const pc =
    new RTCPeerConnection({
      iceServers: [
        {
          urls:
            "stun:stun.l.google.com:19302"
        }
      ]
    });

  peers[id] = pc;

  // Add microphone/camera tracks
  if (localStream) {

    localStream
      .getTracks()
      .forEach(track => {

        pc.addTrack(
          track,
          localStream
        );

      });
  }

  // Add screen sharing track
  if (screenStream) {

    const screenTrack =
      screenStream
        .getVideoTracks()[0];

    if (screenTrack) {

      pc.addTrack(
        screenTrack,
        screenStream
      );
    }
  }

  // ====================================================
  // RECEIVE TRACK
  // ====================================================

  pc.ontrack = event => {

    const stream =
      event.streams[0];

    if (!stream) {
      return;
    }

    const videoTracks =
      stream.getVideoTracks();

    const isScreen =
      videoTracks.length > 0 &&
      videoTracks[0]
        .label
        .toLowerCase()
        .includes("screen");

    addParticipant(
      id,
      id,
      stream,
      isScreen
    );
  };

  // ====================================================
  // ICE
  // ====================================================

  pc.onicecandidate = event => {

    if (event.candidate) {

      socket.emit("ice", {
        to: id,
        c: event.candidate
      });

    }
  };

  pc.onconnectionstatechange = () => {

    if (
      pc.connectionState ===
        "failed" ||
      pc.connectionState ===
        "closed" ||
      pc.connectionState ===
        "disconnected"
    ) {

      console.log(
        "Peer disconnected:",
        id
      );
    }
  };

  return pc;
}

// ======================================================
// LOCAL MEDIA
//
// MICROPHONE = REQUIRED
// CAMERA      = OPTIONAL
// ======================================================

navigator.mediaDevices
  .getUserMedia({
    audio: true
  })

  .then(async audioStream => {

    // ------------------------------------------
    // Microphone successfully obtained
    // ------------------------------------------

    localStream =
      audioStream;

    // Display local audio participant
    addParticipant(
      "local",
      username,
      localStream
    );

    // ------------------------------------------
    // Try camera separately
    // ------------------------------------------

    try {

      const videoStream =
        await navigator
          .mediaDevices
          .getUserMedia({
            video: true
          });

      const videoTracks =
        videoStream
          .getVideoTracks();

      videoTracks.forEach(track => {

        localStream.addTrack(
          track
        );

      });

      // Update local participant
      const localParticipant =
        participants.local;

      if (
        localParticipant &&
        localParticipant.video
      ) {

        localParticipant.video.srcObject =
          localStream;

      } else if (localParticipant) {

        // Replace "Audio only"
        const audioOnly =
          localParticipant.div
            .querySelector(
              ".audio-only"
            );

        if (audioOnly) {
          audioOnly.remove();
        }

        const video =
          document.createElement("video");

        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = localStream;

        localParticipant.div
          .insertBefore(
            video,
            localParticipant.div
              .querySelector(
                ".name-label"
              )
          );

        localParticipant.video =
          video;
      }

      console.log(
        "Camera enabled"
      );

    } catch (err) {

      // Camera denied/not available
      console.log(
        "Camera unavailable. Continuing with microphone only."
      );

      camOff = true;

      const camBtn =
        document.getElementById(
          "camBtn"
        );

      camBtn.textContent =
        "Cam unavailable";

      camBtn.disabled = true;
    }

    // ------------------------------------------
    // Join room
    // ------------------------------------------

    socket.emit("join", {
      room,
      name: username
    });

  })

  .catch(err => {

    // ------------------------------------------
    // Microphone is required
    // ------------------------------------------

    console.error(
      "Microphone permission denied:",
      err
    );

    alert(
      "Microphone permission is required to join the room."
    );

  });

// ======================================================
// MICROPHONE BUTTON
// ======================================================

document.getElementById(
  "muteBtn"
).onclick = () => {

  if (!localStream) {
    return;
  }

  const audioTracks =
    localStream
      .getAudioTracks();

  if (!audioTracks.length) {
    return;
  }

  muted = !muted;

  audioTracks.forEach(track => {

    track.enabled =
      !muted;

  });

  document.getElementById(
    "muteBtn"
  ).textContent =
    muted
      ? "Mic OFF"
      : "Mic ON";
};

// ======================================================
// CAMERA BUTTON
// ======================================================

document.getElementById(
  "camBtn"
).onclick = () => {

  if (!localStream) {
    return;
  }

  const videoTracks =
    localStream
      .getVideoTracks();

  // No camera
  if (!videoTracks.length) {
    return;
  }

  camOff = !camOff;

  videoTracks.forEach(track => {

    track.enabled =
      !camOff;

  });

  document.getElementById(
    "camBtn"
  ).textContent =
    camOff
      ? "Cam OFF"
      : "Cam ON";
};

// ======================================================
// DEAFEN BUTTON
// ======================================================

document.getElementById(
  "deafenBtn"
).onclick = () => {

  deafened = !deafened;

  Object.values(
    participants
  ).forEach(participant => {

    if (participant.video) {

      if (
        participant.id !== "local"
      ) {
        participant.video.muted =
          deafened;
      }
    }

  });

  document.getElementById(
    "deafenBtn"
  ).textContent =
    deafened
      ? "Hear OFF"
      : "Hear ON";
};

// ======================================================
// SCREEN SHARE
// ======================================================

document.getElementById(
  "screenBtn"
).onclick = async () => {

  if (screenStream) {
    return;
  }

  try {

    screenStream =
      await navigator
        .mediaDevices
        .getDisplayMedia({
          video: true
        });

    const screenTrack =
      screenStream
        .getVideoTracks()[0];

    if (!screenTrack) {
      screenStream = null;
      return;
    }

    addParticipant(
      "local-screen",
      username + " - Screen",
      screenStream,
      true
    );

    // ------------------------------------------
    // Add screen track to peers
    // ------------------------------------------

    for (const id in peers) {

      const pc =
        peers[id];

      pc.addTrack(
        screenTrack,
        screenStream
      );

      const offer =
        await pc.createOffer();

      await pc.setLocalDescription(
        offer
      );

      socket.emit("offer", {
        to: id,
        o: offer
      });
    }

    // ------------------------------------------
    // Screen share ended
    // ------------------------------------------

    screenTrack.onended =
      async () => {

        removeParticipant(
          "local-screen"
        );

        for (const id in peers) {

          const pc =
            peers[id];

          const sender =
            pc.getSenders()
              .find(
                sender =>
                  sender.track ===
                  screenTrack
              );

          if (sender) {

            pc.removeTrack(
              sender
            );
          }

          const offer =
            await pc.createOffer();

          await pc.setLocalDescription(
            offer
          );

          socket.emit("offer", {
            to: id,
            o: offer
          });
        }

        screenStream = null;
      };

  } catch (err) {

    console.error(
      "Screen share error:",
      err
    );

    screenStream = null;
  }
};

// ======================================================
// CHAT
// ======================================================

const chat =
  document.getElementById(
    "chatOverlay"
  );

const chatMessages =
  document.getElementById(
    "chatMessages"
  );

const chatInput =
  document.getElementById(
    "chatInput"
  );

document.getElementById(
  "chatToggle"
).onclick = () => {

  chat.style.display =
    "flex";
};

document.getElementById(
  "chatClose"
).onclick = () => {

  chat.style.display =
    "none";
};

document.getElementById(
  "chatSend"
).onclick =
  sendChat;

chatInput.onkeydown =
  event => {

    if (
      event.key ===
      "Enter"
    ) {

      event.preventDefault();

      sendChat();
    }
  };

function addMsg(name, text) {

  const div =
    document.createElement(
      "div"
    );

  div.className =
    "chatMsg";

  const nameElement =
    document.createElement(
      "b"
    );

  nameElement.textContent =
    name + ": ";

  const textElement =
    document.createTextNode(
      text
    );

  div.appendChild(
    nameElement
  );

  div.appendChild(
    textElement
  );

  chatMessages.appendChild(
    div
  );

  chatMessages.scrollTop =
    chatMessages.scrollHeight;
}

function sendChat() {

  const text =
    chatInput.value.trim();

  if (!text) {
    return;
  }

  socket.emit(
    "msg",
    text
  );

  addMsg(
    "You",
    text
  );

  chatInput.value =
    "";
}

socket.on(
  "msg",
  message => {

    addMsg(
      message.name,
      message.text
    );
  }
);

// ======================================================
// WEBRTC SIGNALING
// ======================================================

socket.on(
  "new",
  async id => {

    try {

      const pc =
        createPeer(id);

      const offer =
        await pc.createOffer();

      await pc.setLocalDescription(
        offer
      );

      socket.emit(
        "offer",
        {
          to: id,
          o: offer
        }
      );

    } catch (err) {

      console.error(
        "Offer error:",
        err
      );
    }
  }
);

socket.on(
  "offer",
  async data => {

    try {

      const pc =
        createPeer(
          data.from
        );

      await pc.setRemoteDescription(
        data.o
      );

      const answer =
        await pc.createAnswer();

      await pc.setLocalDescription(
        answer
      );

      socket.emit(
        "answer",
        {
          to: data.from,
          a: answer
        }
      );

    } catch (err) {

      console.error(
        "Answer error:",
        err
      );
    }
  }
);

socket.on(
  "answer",
  async data => {

    try {

      const pc =
        peers[data.from];

      if (!pc) {
        return;
      }

      await pc.setRemoteDescription(
        data.a
      );

    } catch (err) {

      console.error(
        "Remote description error:",
        err
      );
    }
  }
);

socket.on(
  "ice",
  async data => {

    try {

      const pc =
        peers[data.from];

      if (!pc || !data.c) {
        return;
      }

      await pc.addIceCandidate(
        data.c
      );

    } catch (err) {

      console.error(
        "ICE error:",
        err
      );
    }
  }
);

socket.on(
  "remove",
  id => {

    removeParticipant(id);

  }
);

// ======================================================
// LEAVE
// ======================================================

document.getElementById(
  "leaveBtn"
).onclick = () => {

  if (localStream) {

    localStream
      .getTracks()
      .forEach(track => {
        track.stop();
      });
  }

  if (screenStream) {

    screenStream
      .getTracks()
      .forEach(track => {
        track.stop();
      });
  }

  window.location.href =
    "/";
};

</script>

</body>
</html>`);
});

// ======================================================
// SOCKET.IO
// ======================================================

io.on("connection", socket => {

  // =========================
  // JOIN
  // =========================

  socket.on(
    "join",
    ({ room, name }) => {

      socket.join(room);

      if (!rooms[room]) {
        rooms[room] = {
          users: []
        };
      }

      rooms[room].users.push({
        id: socket.id,
        name
      });

      socket.to(room).emit(
        "new",
        socket.id
      );
    }
  );

  // =========================
  // CHAT
  // =========================

  socket.on(
    "msg",
    text => {

      const room =
        [...socket.rooms]
          .find(
            r => r !== socket.id
          );

      if (!room) {
        return;
      }

      const user =
        rooms[room]
          ?.users
          .find(
            u =>
              u.id ===
              socket.id
          );

      io.to(room).emit(
        "msg",
        {
          name:
            user?.name ||
            "User",

          text
        }
      );
    }
  );

  // =========================
  // OFFER
  // =========================

  socket.on(
    "offer",
    data => {

      socket.to(
        data.to
      ).emit(
        "offer",
        {
          from:
            socket.id,

          o:
            data.o
        }
      );
    }
  );

  // =========================
  // ANSWER
  // =========================

  socket.on(
    "answer",
    data => {

      socket.to(
        data.to
      ).emit(
        "answer",
        {
          from:
            socket.id,

          a:
            data.a
        }
      );
    }
  );

  // =========================
  // ICE
  // =========================

  socket.on(
    "ice",
    data => {

      socket.to(
        data.to
      ).emit(
        "ice",
        {
          from:
            socket.id,

          c:
            data.c
        }
      );
    }
  );

  // =========================
  // DISCONNECT
  // =========================

  socket.on(
    "disconnect",
    () => {

      for (const room in rooms) {

        if (!rooms[room]) {
          continue;
        }

        rooms[room].users =
          rooms[room]
            .users
            .filter(
              user =>
                user.id !==
                socket.id
            );

        socket.to(room).emit(
          "remove",
          socket.id
        );

        if (
          rooms[room]
            .users
            .length === 0
        ) {

          delete rooms[room];

        }
      }
    }
  );

});

// ======================================================
// START SERVER
// ======================================================

server.listen(
  process.env.PORT || 3000,
  "0.0.0.0",
  () => {

    console.log(
      "Server running"
    );

  }
);
