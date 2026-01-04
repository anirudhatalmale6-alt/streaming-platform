import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Streams from './pages/Streams';
import StreamDetail from './pages/StreamDetail';
import VODLibrary from './pages/VODLibrary';
import LinearChannels from './pages/LinearChannels';
import ChannelDetail from './pages/ChannelDetail';
import SocialAccounts from './pages/SocialAccounts';
import Analytics from './pages/Analytics';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="streams" element={<Streams />} />
        <Route path="streams/:id" element={<StreamDetail />} />
        <Route path="vod" element={<VODLibrary />} />
        <Route path="linear" element={<LinearChannels />} />
        <Route path="linear/:id" element={<ChannelDetail />} />
        <Route path="social" element={<SocialAccounts />} />
        <Route path="analytics" element={<Analytics />} />
      </Route>
    </Routes>
  );
}

export default App;
