import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api, setUnauthorizedHandler } from './lib/api.js';
import { AppContext } from './lib/context.js';
import { ToastHost, useToastState } from './components/Toast.jsx';
import Layout from './components/Layout.jsx';
import AuthPage from './pages/AuthPage.jsx';
import LibraryPage from './pages/LibraryPage.jsx';
import ReaderPage from './pages/ReaderPage.jsx';
import CollectionsPage from './pages/CollectionsPage.jsx';
import CollectionPage from './pages/CollectionPage.jsx';
import StatusPage from './pages/StatusPage.jsx';

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = 加载中
  const toast = useToastState();

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);

  if (user === undefined) {
    return <div className="min-h-screen grid place-items-center text-muted">加载中…</div>;
  }

  return (
    <AppContext.Provider value={{ user, setUser, toast: toast.show }}>
      {user ? (
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<LibraryPage />} />
            <Route path="/read/:id" element={<ReaderPage />} />
            <Route path="/study" element={<CollectionsPage />} />
            <Route path="/study/:id" element={<CollectionPage />} />
            <Route path="/status/:status" element={<StatusPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      ) : (
        <AuthPage />
      )}
      <ToastHost messages={toast.messages} />
    </AppContext.Provider>
  );
}
