# PulseMD - Virtual Clinic

Healthcare that comes to you.

This repository now includes a complete hackathon-ready MERN implementation beside the existing static app:

```text
api/
  src/
    config/db.js
    middleware/auth.js
    middleware/upload.js
    models/index.js
    routes/
      auth.js
      admin.js
      doctors.js
      patients.js
      appointments.js
      chat.js
      reports.js
      payments.js
      analytics.js
      emergency.js
      notifications.js
      ai.js
    seed.js
    server.js
  uploads/
react-client/
  src/
    components/
    context/
    data/
    pages/
    App.jsx
    main.jsx
```

## Backend Setup

```bash
cd api
npm install
cp .env.example .env
npm run seed
npm run dev
```

Required `.env` values:

```env
PORT=7000
MONGO_URI=mongodb://127.0.0.1:27017/pulsemd_virtual_clinic
JWT_SECRET=change-this-secret
CLIENT_ORIGIN=http://localhost:5173
```

Seeded demo users:

```text
admin@pulsemd.test / Password@123
doctor@pulsemd.test / Password@123
patient@pulsemd.test / Password@123
```

## Frontend Setup

```bash
cd react-client
npm install
npm run dev
```

Optional `.env`:

```env
VITE_API_URL=http://localhost:7000/api
```

## Key APIs

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/analytics
GET  /api/doctors
POST /api/appointments
GET  /api/chat/:receiverId
POST /api/chat
POST /api/chat/upload
POST /api/reports
POST /api/emergency
POST /api/ai/analyze
GET  /api/notifications
```

Uploads are saved in `api/uploads` and served from `/uploads/...`.

## Role-Based Panels

- Admin: analytics, doctor verification, patient management, appointments, emergency alerts, reports, settings.
- Doctor: profile, availability, appointments, chat, reports, earnings.
- Patient: doctor booking, chat with text/audio/media, report upload, voice-enabled symptom checker, emergency alert.

## Deployment

### Render Backend

1. Create a new Render Web Service from this repository.
2. Root directory: `api`
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables:
   - `MONGO_URI`
   - `JWT_SECRET`
   - `CLIENT_ORIGIN` set to your Vercel frontend URL

### Vercel Frontend

1. Create a new Vercel project from this repository.
2. Root directory: `react-client`
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add `VITE_API_URL=https://your-render-service.onrender.com/api`

## Notes

- Chat supports Socket.IO plus REST fallback.
- Audio recording uses `MediaRecorder` with browser permission handling.
- AI symptom checker uses browser speech recognition where supported and gracefully falls back to typed input.
- File validation allows images, PDFs, audio, and video up to 25 MB.
