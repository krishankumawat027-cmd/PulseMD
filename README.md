# PulseMD - Virtual Clinic Telemedicine App

PulseMD - Virtual Clinic is a full-stack telemedicine starter with email/password authentication, MongoDB users, JWT-protected APIs, Socket.io chat rooms, and WebRTC video calls.

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express, Socket.io
- Database: MongoDB with Mongoose
- Auth: JWT and bcrypt password hashing
- Video: WebRTC with Google STUN server

## Project Structure

```text
backend/
  config/
    db.js
  controllers/
    authController.js
  middleware/
    auth.js
  models/
    User.js
    DoctorProfile.js
    Appointment.js
    Message.js
  routes/
    authRoutes.js
    patientRoutes.js
    doctorRoutes.js
  package.json
  server.js
frontend/
  css/
    style.css
  js/
    app.js
    auth.js
    doctors.js
    chat.js
    video.js
  login.html
  signup.html
  doctors.html
  chat.html
  video.html
```

## Local Setup

1. Install backend dependencies:

   ```bash
   cd backend
   npm install
   ```

2. Create `backend/.env` from `backend/.env.example`:

   ```env
   PORT=5000
   MONGO_URI=mongodb://127.0.0.1:27017/telemedicine_app
   JWT_SECRET=replace_this_with_a_long_random_secret
   CLIENT_ORIGIN=http://localhost:5000
   ```

   For emergency SMS alerts, add MSG91 credentials only to `backend/.env` or your deployment environment:

   ```env
   TWILIO_ACCOUNT_SID=your_twilio_account_sid
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   TWILIO_FROM_PHONE=+1234567890
   TWILIO_MESSAGING_SERVICE_SID=
   TWILIO_TIMEOUT_MS=8000
   TWILIO_VOICE_TIMEOUT_SECONDS=20
   SOS_LOCK_WINDOW_MS=45000
   FAST2SMS_API_KEY=your_fast2sms_authorization_key
   FAST2SMS_ROUTE=q
   FAST2SMS_LANGUAGE=english
   FAST2SMS_FLASH=0
   FAST2SMS_TIMEOUT_MS=8000
   FAST2SMS_RETRIES=1
   MSG91_AUTH_KEY=your_msg91_auth_key
   MSG91_FLOW_ID=your_msg91_flow_or_template_id
   MSG91_SENDER_ID=your_msg91_sender_id
   MSG91_ROUTE=4
   MSG91_UNICODE=1
   MSG91_MESSAGE_VAR=MESSAGE
   MSG91_LOCATION_VAR=LOCATION
   MSG91_LATITUDE_VAR=LATITUDE
   MSG91_LONGITUDE_VAR=LONGITUDE
   ```

   The Emergency Help button posts to `/send-sos`, which uses Fast2SMS Quick SMS (`route=q`) for the SOS location alert and logs the emergency event. Twilio and MSG91 remain available for the broader emergency notification service when configured.

3. Start MongoDB locally or use a hosted MongoDB URI.

4. Run the server:

   ```bash
   npm start
   ```

5. Open the app:

   ```text
   http://localhost:5000/login.html
   ```

## How To Test

1. Create a doctor account from `signup.html` and choose role `Doctor`.
2. Create a patient account in another browser or incognito window.
3. Open `doctors.html`, pick the doctor, then use Chat or Video.
4. The selected `doctorId` is saved to `localStorage` as `doctorRoom`.

## API Routes

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/doctors`

Additional patient and doctor routes are included for appointments and dashboard flows.

## Socket.io Events

Chat:

- `joinRoom` with `{ room }`
- `sendMessage` with `{ room, message }`
- `receiveMessage`

Video:

- `join-video` with `{ roomId }`
- `offer`
- `answer`
- `ice-candidate`

## Deployment

Render backend:

- Use `backend` as the root directory.
- Build command: `npm install`
- Start command: `npm start`
- Add `MONGO_URI`, `JWT_SECRET`, and `CLIENT_ORIGIN`.

Netlify frontend:

- Deploy the `frontend` folder.
- Set `window.API_BASE` in `frontend/js/config.js` to your Render backend URL.
- Example:

  ```js
  window.API_BASE = "https://your-render-app.onrender.com";
  ```

For production video calls, add HTTPS everywhere and configure TURN servers for networks where STUN alone is not enough.
