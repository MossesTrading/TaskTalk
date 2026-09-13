import { Navigate, Route, Routes } from 'react-router-dom';
import { DialogProvider } from './components/Dialog';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatInboxProvider } from './context/ChatInboxContext';
import { PresenceProvider } from './context/PresenceContext';
import { isProfileComplete } from './lib/profile';
import { AppShell } from './pages/AppShell';
import { ChatPage } from './pages/ChatPage';
import { ContactsPage } from './pages/ContactsPage';
import { FeedPage } from './pages/FeedPage';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';
import { ProfileSetupPage } from './pages/ProfileSetupPage';
import { RegisterPage } from './pages/RegisterPage';
import { TasksPage } from './pages/TasksPage';

export function App() {
  return (
    <DialogProvider>
      <AuthProvider>
        <Routes_ />
      </AuthProvider>
    </DialogProvider>
  );
}

// Alur: belum login → Masuk/Daftar, sudah login tapi profil belum lengkap → Lengkapi Profil,
// lengkap → Beranda / Chat / Kontak.
function Routes_() {
  const { session, initializing, profile, profileStatus } = useAuth();

  if (initializing || (session && (profileStatus === 'idle' || profileStatus === 'loading'))) {
    return (
      <div className="center-page">
        <span className="spinner" />
      </div>
    );
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/masuk" element={<LoginPage />} />
        <Route path="/daftar" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/masuk" replace />} />
      </Routes>
    );
  }

  if (!isProfileComplete(profile)) {
    return (
      <Routes>
        <Route path="/lengkapi-profil" element={<ProfileSetupPage />} />
        <Route path="*" element={<Navigate to="/lengkapi-profil" replace />} />
      </Routes>
    );
  }

  return (
    <PresenceProvider>
      <ChatInboxProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/beranda" element={<FeedPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:roomId" element={<ChatPage />} />
            <Route path="/task" element={<TasksPage />} />
            <Route path="/kontak" element={<ContactsPage />} />
            <Route path="/profil" element={<ProfilePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/beranda" replace />} />
        </Routes>
      </ChatInboxProvider>
    </PresenceProvider>
  );
}
