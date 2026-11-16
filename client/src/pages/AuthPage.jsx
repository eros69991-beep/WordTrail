import { useState } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.js';

export default function AuthPage() {
  const { setUser } = useApp();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api(`/auth/${mode}`, { method: 'POST', body: { email, password } });
      setUser(d.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-trail text-paper p-12">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <img src="/favicon.svg" alt="" className="w-8 h-8 rounded-lg ring-1 ring-paper/30" /> WordTrail
        </div>
        <div className="space-y-6 max-w-md">
          <p className="font-read text-3xl leading-snug">
            Every word you look up<br />leaves a mark on the trail.
          </p>
          <p className="text-paper/70">读真实的英文新闻和技术文档，逐句对照翻译。<br />点一下就把生词和好句子收进今天的学习集。</p>
        </div>
        <div className="text-paper/50 text-sm">读 → 收藏 → 复习</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="lg:hidden flex items-center gap-2 text-xl font-semibold mb-8">
            <img src="/favicon.svg" alt="" className="w-8 h-8" /> WordTrail
          </div>
          <h1 className="text-2xl font-semibold">{mode === 'login' ? '登录' : '注册账号'}</h1>
          <div className="space-y-3">
            <input className="input" type="email" placeholder="邮箱" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className="input" type="password" placeholder={mode === 'register' ? '密码（至少 8 位）' : '密码'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-[#8b2c2c]">{error}</p>}
          <button className="btn btn-primary w-full !py-2.5" disabled={busy}>
            {busy ? '请稍候…' : mode === 'login' ? '登录' : '注册并开始'}
          </button>
          <p className="text-sm text-muted text-center">
            {mode === 'login' ? '还没有账号？' : '已经有账号了？'}
            <button type="button" className="text-trail font-medium ml-1" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
              {mode === 'login' ? '注册' : '去登录'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
