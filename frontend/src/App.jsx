import { Routes, Route, Navigate } from 'react-router-dom';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import SearchInterviewers from './pages/SearchInterviewers';
import BookingFlow from './pages/BookingFlow';
import MyBookings from './pages/MyBookings';
import Practicals from './pages/Practicals';
import Profile from './pages/Profile';
import Messages from './pages/Messages';
import Onboarding from './pages/Onboarding';
import LiveSession from './pages/LiveSession';

function ProtectedRoute({ children }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile) return <Navigate to="/onboarding" replace />;
  return children;
}

export default function App() {
  const { user, profile, loading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={
        <div
          className="relative min-h-screen flex items-center justify-center"
          style={{
            backgroundImage: 'url(https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1920&q=80)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative z-10 w-full flex flex-col items-center px-4">
            <div className="mb-6 text-center">
              <h1 className="text-3xl font-bold text-white tracking-tight">HireSphere</h1>
              <p className="text-indigo-200 text-sm mt-1">Your technical interview preparation platform</p>
            </div>
            <Authenticator>
              {({ user }) => user ? <Navigate to="/" replace /> : null}
            </Authenticator>
          </div>
        </div>
      } />
      <Route path="/onboarding" element={
        loading
          ? <div className="flex items-center justify-center h-screen">Loading...</div>
          : !user
            ? <Navigate to="/login" replace />
            : profile
              ? <Navigate to="/" replace />
              : <Onboarding />
      } />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="search" element={<SearchInterviewers />} />
        <Route path="book/:interviewerId" element={<BookingFlow />} />
        <Route path="bookings" element={<MyBookings />} />
        <Route path="practicals" element={<Practicals />} />
        <Route path="messages" element={<Messages />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="/session/:bookingId" element={
        loading
          ? <div className="flex items-center justify-center h-screen bg-gray-900" />
          : !user
            ? <Navigate to="/login" replace />
            : !profile
              ? <Navigate to="/onboarding" replace />
              : <LiveSession />
      } />
    </Routes>
  );
}
