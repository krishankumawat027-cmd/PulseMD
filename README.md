# 🩺 PulseMD — Virtual Healthcare Platform

> **Healthcare that comes to you.**

PulseMD is an AI-powered virtual healthcare platform designed to connect patients and doctors through a single digital healthcare experience.

It enables patients to discover doctors, book appointments, communicate through chat, audio and video consultations, and receive digital prescriptions.

---

## ✨ Features

### 👤 Patient Features

* 🔐 Secure registration and login
* 👨‍⚕️ Find and connect with doctors
* 📅 Book and manage appointments
* 💬 Real-time doctor-patient chat
* 📹 Video consultations
* 📞 Audio consultations
* 💊 Digital e-prescriptions
* 🤖 AI-powered symptom checker
* 🚨 Emergency / SOS assistance
* 📋 View consultation and prescription history
* 🌐 Hindi and English support
* 📱 Responsive mobile-friendly interface

### 👨‍⚕️ Doctor Features

* 🔐 Doctor authentication
* 👤 Doctor profile management
* 📅 Appointment management
* 🟢 Availability management
* 💬 Patient chat
* 📹 Video consultation
* 📞 Audio consultation
* 📝 Create digital prescriptions
* 📋 View patient consultation information
* 🔔 Consultation notifications

### 🤖 AI Features

PulseMD integrates AI to provide preliminary assistance such as:

* Symptom analysis
* General health information
* Preliminary health guidance
* Basic triage assistance

> ⚠️ AI-generated information is for educational and preliminary assistance only and should not replace professional medical diagnosis or treatment.

---

## 🔄 How PulseMD Works

```text
                    ┌──────────────┐
                    │    Patient   │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Login / Sign │
                    │     Up       │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Find Doctor  │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │Book Appointment│
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Consultation │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
           Chat         Audio         Video
              │            │            │
              └────────────┼────────────┘
                           ▼
                    ┌──────────────┐
                    │ E-Prescription│
                    └──────────────┘
```

---

## 🏗️ System Architecture

```text
┌───────────────────────────────┐
│           Frontend            │
│      React / Web Application   │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│          REST API             │
│       Node.js + Express       │
└───────────────┬───────────────┘
                │
        ┌───────┴────────┐
        ▼                ▼
┌──────────────┐  ┌──────────────┐
│   MongoDB    │  │ AI Services  │
│  + Mongoose  │  │              │
└──────────────┘  └──────────────┘
        │
        ▼
┌───────────────────────────────┐
│ Communication Services        │
│ Chat • Audio • Video          │
└───────────────────────────────┘
```

---

## 🛠️ Tech Stack

### Frontend

* React
* JavaScript / TypeScript
* HTML5
* CSS3
* Responsive UI

### Backend

* Node.js
* Express.js
* REST APIs

### Database

* MongoDB
* Mongoose

### Authentication

* JWT
* Role-based authentication
* Secure password handling
* Environment variables

### Communication

* Real-time chat
* Audio calling
* Video calling

### AI

* AI-powered symptom checker
* AI integration layer

---

## 📁 Project Structure

```text
PulseMD/
│
├── client/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── server/
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── middleware/
│   ├── services/
│   ├── config/
│   └── server.js
│
├── .gitignore
├── package.json
└── README.md
```

> The exact structure may vary depending on the current implementation.

---

# ⚙️ Installation & Setup

## 1. Clone the Repository

```bash
git clone https://github.com/krishankumawat027-cmd/PulseMD.git
```

```bash
cd PulseMD
```

---

## 2. Install Dependencies

If the project has separate frontend and backend:

```bash
cd client
npm install
```

Then:

```bash
cd ../server
npm install
```

---

## 3. Configure MongoDB

Create a MongoDB database using MongoDB Atlas or a local MongoDB installation.

Example connection string:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/pulsemd
```

---

## 4. Environment Variables

Create the required environment file in the backend.

Example:

```env
PORT=5000

MONGODB_URI=your_mongodb_connection_string

JWT_SECRET=your_jwt_secret

AI_API_KEY=your_ai_api_key

CLIENT_URL=http://localhost:5173
```

Add any additional API keys required by your current communication or AI services.

### 🔒 Important

Never upload `.env`, `.env.local`, database passwords, API keys, or JWT secrets to GitHub.

Add them to `.gitignore`:

```gitignore
.env
.env.local
.env.*.local
node_modules/
dist/
build/
```

---

# ▶️ Running the Project

### Start Backend

```bash
cd server
npm run dev
```

### Start Frontend

Open another terminal:

```bash
cd client
npm run dev
```

The application will be available at the local URL displayed by the frontend development server.

---

# 🔐 Security

PulseMD is designed with security and privacy in mind.

Security considerations include:

* JWT-based authentication
* Password hashing
* Role-based access control
* Protected API routes
* Environment-based secrets
* Database access controls
* Input validation
* Secure communication
* Restricted access to sensitive information

> PulseMD is currently a development/educational project. A production healthcare deployment would require comprehensive security testing, privacy controls, clinical validation, and applicable legal/regulatory compliance.

---

# 📞 Consultation Flow

PulseMD supports multiple consultation methods:

### Chat

Patient and doctor can communicate through the platform's chat system.

### Audio

Patients can join an audio consultation with their doctor.

### Video

Patients and doctors can conduct face-to-face online consultations through video.

### Appointment Notifications

The platform can notify users about upcoming and active consultations so that patients are aware when a doctor is ready to connect.

---

# 💊 E-Prescription

After a consultation, doctors can generate a digital prescription containing relevant information such as:

* Patient information
* Doctor information
* Medicines
* Dosage instructions
* Duration
* Additional instructions
* Consultation information

Patients can access their digital prescriptions from their account.

---

# 🚨 Emergency Assistance

PulseMD includes an emergency/SOS concept to help users quickly access emergency assistance.

> PulseMD should not be considered a replacement for local emergency services or immediate professional medical care.

---

# 🤖 AI Symptom Checker

The AI symptom checker allows users to enter symptoms and receive preliminary informational guidance.

```text
User Symptoms
      ↓
AI Processing
      ↓
Possible Health Information
      ↓
General Guidance
      ↓
Consult a Qualified Doctor
```

The AI system is not intended to independently diagnose medical conditions.

---

# 🚀 Roadmap

* [x] Patient authentication
* [x] Doctor authentication
* [x] Doctor profiles
* [x] Appointment system
* [x] E-prescriptions
* [x] Chat support
* [x] Audio consultation
* [x] Video consultation
* [x] AI symptom checker
* [x] Emergency/SOS concept
* [x] Online payments
* [ ] Pharmacy integration
* [ ] Medicine database
* [ ] Lab test booking
* [ ] Digital health records
* [ ] Medical report analysis
* [ ] Follow-up reminders
* [ ] Advanced notification system
* [ ] Production-grade video infrastructure
* [ ] Advanced security and compliance

---

# 🎯 Vision

PulseMD aims to simplify the healthcare journey by bringing essential healthcare services together in one platform.

> **From finding a doctor to consultation and e-prescription — PulseMD brings the healthcare journey together.**

---

# 👨‍💻 Developer

**Krishan Kumawat**

BCA Student | Full Stack Web Developer | AI & Startup Explorer

### Connect

* GitHub: "https://github.com/krishankumawat027-cmd"
* LinkedIn: "https://www.linkedin.com/in/krishan-kumawat-80b682391"

---

# 📄 License

This project is currently developed for **educational, experimentation, and demonstration purposes**.

---

## ⭐ Support

If you find PulseMD interesting, consider giving the repository a ⭐ **Star** on GitHub.

**PulseMD — Healthcare that comes to you.** 🩺
