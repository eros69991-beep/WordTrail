import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.js';

function ImportPanel({ onDone }) {
  const { toast } = useApp();
  const [tab, setTab] = useState('url');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();

  const submit = async (body) => {
    setBusy(true);
    try {
      const d = await api('/articles', { method: 'POST', body });
      onDone(d.id);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 800_000) return toast('文件太大了（最多约 800KB）', 'error');
    const reader = new FileReader();
    reader.onload = () => submit({ text: String(reader.result), title: f.name.replace(/\.(txt|md)$/i, '') });
    reader.readAsText(f);
  };

  const tabs = [['url', '网址'], ['text', '粘贴'], ['file', '上传 txt']];

  return (
    <section className="bg-card border border-line rounded-2xl p-4 sm:p-5">
      <div className="flex gap-1 mb-4">
        {tabs.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-sm ${tab === k ? 'bg-trail text-white' : 'text-muted hover:bg-paper'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'url' && (
        <form className="flex flex-col sm:flex-row gap-2" onSubmit={(e) => { e.preventDefault(); if (url.trim()) submit({ url }); }}>
          <input className="input" type="url" placeholder="粘贴新闻或技术文档的链接，例如 https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn btn-primary shrink-0" disabled={busy || !url.trim()}>{busy ? '正在抓取…' : '导入'}</button>
        </form>
      )}

      {tab === 'text' && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) submit({ text, title }); }}>
          <input className="input" placeholder="标题（可不填）" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="input min-h-40 font-read" placeholder="把英文文章粘贴到这里。代码可以用 ``` 包起来，不会被翻译。" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex justify-end">
            <button className="btn btn-primary" disabled={busy || !text.trim()}>{busy ? '处理中…' : '开始阅读'}</button>
          </div>
        </form>
      )}

      {tab === 'file' && (
        <div>
          <input ref={fileRef} type="file" accept=".txt,.md,text/plain" className="hidden" onChange={onFile} />
          <button className="w-full border-2 border-dashed border-line rounded-xl py-8 text-muted hover:border-trail hover:text-trail transition" onClick={() => fileRef.current.click()} disabled={busy}>
            {busy ? '处理中…' : '点击选择 .txt 或 .md 文件'}
          </button>
        </div>
      )}
      <p className="text-xs text-muted mt-3">导入的文章只有你自己能看到。</p>
    </section>
  );
}

export default function LibraryPage() {
  const { toast } = useApp();
  const navigate = useNavigate();
  const [articles, setArticles] = useState(null);

  const load = () => api('/articles').then((d) => setArticles(d.articles)).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (a) => {
    if (!confirm(`删除《${a.title}》？收藏过的单词和句子会保留。`)) return;
    await api(`/articles/${a.id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold mb-1">书架</h1>
        <p className="text-muted text-sm">导入一篇英文文章，逐句对照着读。</p>
      </div>

      <ImportPanel onDone={(id) => navigate(`/read/${id}`)} />

      <section>
        <h2 className="text-sm font-medium text-muted mb-3">我的文章</h2>
        {articles === null ? (
          <p className="text-muted text-sm">加载中…</p>
        ) : articles.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">还没有文章，先导入一篇吧。</p>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-3">
            {articles.map((a) => {
              const pct = a.total ? Math.round((a.translated / a.total) * 100) : 0;
              let host = '';
              try { host = a.source_url ? new URL(a.source_url).hostname.replace(/^www\./, '') : ''; } catch { /* 忽略 */ }
              return (
                <li key={a.id} className="group bg-card border border-line rounded-xl p-4 hover:border-trail/40 transition relative">
                  <Link to={`/read/${a.id}`} className="block">
                    <h3 className="font-read text-lg leading-snug line-clamp-2 pr-6">{a.title}</h3>
                    <div className="text-xs text-muted mt-2 flex gap-2 flex-wrap">
                      <span>{host || '手动导入'}</span>
                      <span>·</span>
                      <span>{a.total} 句</span>
                      <span>·</span>
                      <span>{new Date(a.created_at).toLocaleDateString('zh-CN')}</span>
                    </div>
                    {pct < 100 && (
                      <div className="mt-3 h-1 bg-paper rounded-full overflow-hidden">
                        <div className="h-full bg-amber" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </Link>
                  <button onClick={() => remove(a)} className="absolute top-3 right-3 text-muted hover:text-[#8b2c2c] sm:opacity-0 group-hover:opacity-100 transition text-sm" aria-label="删除">✕</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
