let videoSocket;
let room;
let localStream;
let peer;
let timerId;
let callStartedAt;
let callMode = 'video';

const stunConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

function initVideoPage() {
  App.mountPatientNav('appointments');
  App.requireAuth();
  room = localStorage.getItem('activeCallRoomId') || localStorage.getItem('doctorRoom');
  const doctor = JSON.parse(localStorage.getItem('activeDoctor') || 'null');
  callMode = localStorage.getItem('callMode') === 'audio' ? 'audio' : 'video';
  document.body.classList.toggle('audio-call', callMode === 'audio');

  const appointmentId = localStorage.getItem('activeAppointmentId');

  if (!room || !appointmentId) {
    alert('Choose a paid appointment first.');
    window.location.href = '/appointments.html';
    return;
  }

  App.request(`/api/payment/appointment/${appointmentId}`).then((appointment) => {
    if (appointment.paymentStatus !== 'paid') {
      alert('Please complete payment before joining consultation.');
      window.location.href = `/payment.html?appointmentId=${appointmentId}`;
    }
  });

  $('#roomName').textContent = room;
  $('#doctorName').textContent = doctor?.user?.name ? `Dr. ${doctor.user.name}` : 'Selected doctor';
  $('#doctorSpecialization').textContent = doctor?.specialization || 'Online consultation';
  $('#doctorFee').textContent = doctor?.fee !== undefined ? formatMoney(doctor.fee) : 'Fee shown during booking';
  $('#callTitle').textContent = callMode === 'audio' ? 'Audio call' : 'Video call';
  $('#localCallLabel').textContent = callMode === 'audio' ? 'Your audio' : 'Your camera';
  $('#remoteCallLabel').textContent = callMode === 'audio' ? 'Doctor audio' : 'Doctor camera';
  $('#cameraBtn').hidden = callMode === 'audio';

  if (doctor?.user?.name) {
    $('#doctorImage').setAttribute('data-initials', '👨‍⚕️');
    $('#doctorImage').textContent = '👨‍⚕️';
    $('#doctorImage').className = 'avatar avatar-fallback doctor-illustration';
  }

  const activeCallId = localStorage.getItem('activeVideoCallId') || localStorage.getItem('incomingCallId');
  if (activeCallId && room) {
    $('#videoStatus').textContent = 'Call ready. Joining room...';
    setTimeout(() => joinCall(), 200);
  }
}

async function joinCall() {
  $('#videoStatus').textContent = callMode === 'audio' ? 'Opening microphone...' : 'Opening camera...';

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: callMode === 'video', audio: true });
    $('#localVideo').srcObject = localStream;
  } catch (error) {
    $('#videoStatus').textContent = `Call permission error: ${error.message}`;
    $('#videoStatus').classList.add('error');
    return;
  }

  videoSocket = App.socket();
  peer = createPeerConnection();

  videoSocket.on('connect', () => {
    videoSocket.emit('patientConnect', { doctorId: room, type: callMode });
    videoSocket.emit('join-video', { roomId: room });
    $('#videoStatus').textContent = 'Waiting for doctor...';
    startTimer();
  });

  videoSocket.on('video-user-joined', async () => {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    videoSocket.emit('offer', { room, offer });
    $('#videoStatus').textContent = 'Ringing...';
  });

  videoSocket.on('offer', async ({ offer }) => {
    await peer.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    videoSocket.emit('answer', { room, answer });
  });

  videoSocket.on('answer', async ({ answer }) => {
    await peer.setRemoteDescription(new RTCSessionDescription(answer));
  });

  videoSocket.on('ice-candidate', async ({ candidate }) => {
    if (candidate) await peer.addIceCandidate(new RTCIceCandidate(candidate));
  });

  videoSocket.on('connect_error', () => {
    $('#videoStatus').textContent = 'Video signaling failed. Please log in again.';
    $('#videoStatus').classList.add('error');
  });

  $('#joinBtn').disabled = true;
  console.info('CALL_JOINING', { callId: localStorage.getItem('activeVideoCallId') || localStorage.getItem('incomingCallId'), roomId: room, patientId: App.user._id });
}

function createPeerConnection() {
  const connection = new RTCPeerConnection(stunConfig);
  localStream.getTracks().forEach((track) => connection.addTrack(track, localStream));
  connection.ontrack = (event) => {
    $('#remoteVideo').srcObject = event.streams[0];
    $('#videoStatus').textContent = 'Connected';
  };
  connection.onicecandidate = (event) => {
    if (event.candidate) videoSocket.emit('ice-candidate', { room, candidate: event.candidate });
  };
  return connection;
}

function toggleCamera() {
  const track = localStream?.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  $('#cameraBtn').textContent = track.enabled ? 'Camera off' : 'Camera on';
}

function toggleMute() {
  const track = localStream?.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  $('#muteBtn').textContent = track.enabled ? 'Mute' : 'Unmute';
}

function startTimer() {
  callStartedAt = Date.now();
  timerId = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartedAt) / 1000);
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const seconds = String(elapsed % 60).padStart(2, '0');
    $('#timer').textContent = `${minutes}:${seconds}`;
  }, 1000);
}

function leaveCall() {
  clearInterval(timerId);
  localStream?.getTracks().forEach((track) => track.stop());
  peer?.close();
  videoSocket?.disconnect();
  endActivePatientCall();
  window.location.href = '/appointments.html';
}

async function endActivePatientCall() {
  const callId = localStorage.getItem('activeVideoCallId');
  if (!callId) return;
  try {
    await App.request('/api/video-call/end', {
      method: 'POST',
      body: JSON.stringify({ callId, status: 'ended' })
    });
    localStorage.removeItem('activeVideoCallId');
  } catch (error) {
    console.warn('Could not update call status:', error.message);
  }
}
