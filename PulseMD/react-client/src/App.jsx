import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { useAuth } from './context/AuthContext.jsx';
import Auth from './pages/Auth.jsx';
import { AdminDashboard, DoctorDashboard, PatientDashboard } from './pages/Dashboard.jsx';
import { DoctorsDirectory, ListPage } from './pages/Directory.jsx';
import Chat from './pages/Chat.jsx';
import Profile from './pages/Profile.jsx';

function Protected({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={`/${user.role}`} replace />;
  return children;
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? `/${user.role}` : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<Auth mode="login" />} />
      <Route path="/register" element={<Auth mode="register" />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/admin" element={<Protected role="admin"><AdminDashboard /></Protected>} />
        <Route path="/admin/doctors" element={<Protected role="admin"><ListPage title="Doctor verification" endpoint="/admin/doctors" /></Protected>} />
        <Route path="/admin/patients" element={<Protected role="admin"><ListPage title="Manage patients" endpoint="/admin/patients" /></Protected>} />
        <Route path="/admin/appointments" element={<Protected role="admin"><ListPage title="Appointments" endpoint="/admin/appointments" /></Protected>} />
        <Route path="/admin/emergency" element={<Protected role="admin"><ListPage title="Emergency alerts" endpoint="/admin/emergencies" /></Protected>} />
        <Route path="/admin/reports" element={<Protected role="admin"><ListPage title="Reports" endpoint="/admin/reports" /></Protected>} />
        <Route path="/admin/settings" element={<Protected role="admin"><ListPage title="App settings" endpoint="/admin/settings" /></Protected>} />

        <Route path="/doctor" element={<Protected role="doctor"><DoctorDashboard /></Protected>} />
        <Route path="/doctor/appointments" element={<Protected role="doctor"><ListPage title="Doctor appointments" endpoint="/doctors/appointments" /></Protected>} />
        <Route path="/doctor/chat" element={<Protected role="doctor"><Chat /></Protected>} />
        <Route path="/doctor/reports" element={<Protected role="doctor"><ListPage title="Patient reports" endpoint="/doctors/reports" /></Protected>} />
        <Route path="/doctor/profile" element={<Protected role="doctor"><Profile /></Protected>} />

        <Route path="/patient" element={<Protected role="patient"><PatientDashboard /></Protected>} />
        <Route path="/patient/doctors" element={<Protected role="patient"><DoctorsDirectory /></Protected>} />
        <Route path="/patient/appointments" element={<Protected role="patient"><ListPage title="My appointments" endpoint="/appointments" /></Protected>} />
        <Route path="/patient/chat" element={<Protected role="patient"><Chat /></Protected>} />
        <Route path="/patient/profile" element={<Protected role="patient"><Profile /></Protected>} />
      </Route>
    </Routes>
  );
}
