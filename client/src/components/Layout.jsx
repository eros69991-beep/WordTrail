import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.js';
import VoiceSettings from './VoiceSettings.jsx';

const Logo = () => (
  <Link to="/" className="flex items-center gap-2 font-semibold text-lg tracking-tight">
    <img src="/favicon.svg" alt="" className="w-7 h-7" />
    WordTrail
  </Link>
);

const tabs = [
  { to: '/', label: '书架', icon: '📚', end: true },
  { to: '/study', label: '学习', icon: '🗂️' },
];

export default function Layout() {
  const { user, setUser } = useApp();
  const [menu, setMenu] = useState(false);

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  };

  return (
    <div className="min-h-screen pb-20 sm:pb-0">
      <header className="sticky top-0 z-30 bg-paper/90 backdrop-blur border-b border-line">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-6">
          <Logo />
          <nav className="hidden sm:flex gap-1">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) => `px-3 py-1.5 rounded-lg text-sm ${isActive ? 'bg-trail-soft text-trail font-medium' : 'text-muted hover:text-ink'}`}
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto relative">
            <button className="btn btn-ghost !px-2" onClick={() => setMenu((v) => !v)} aria-label="设置">
              ⚙️
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-11 z-20 w-72 bg-card border border-line rounded-2xl shadow-xl p-4 space-y-4">
                  <div className="text-xs text-muted truncate">{user.email}</div>
                  <VoiceSettings />
                  <button className="btn btn-ghost w-full text-[#8b2c2c]" onClick={logout}>退出登录</button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <Outlet />
      </main>

      {/* 手机底部导航 */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-line pb-safe">
        <div className="grid grid-cols-2">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => `flex flex-col items-center py-2 text-xs ${isActive ? 'text-trail font-medium' : 'text-muted'}`}
            >
              <span className="text-lg leading-none mb-0.5">{t.icon}</span>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
