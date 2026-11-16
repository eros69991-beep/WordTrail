import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, localDate } from '../lib/api.js';
import { useApp, STATUS_LABEL, STATUS_STYLE } from '../lib/context.js';

export default function CollectionsPage() {
  const { toast } = useApp();
  const [data, setData] = useState(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => api('/collections').then(setData).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api('/collections', { method: 'POST', body: { name } });
      setName('');
      setCreating(false);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  if (!data) return <p className="text-muted text-sm">加载中…</p>;
  const today = localDate();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold mb-1">学习</h1>
        <p className="text-muted text-sm">阅读时收藏的单词和句子，按天自动归进学习集。</p>
      </div>

      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        {Object.entries(STATUS_LABEL).map(([k, l]) => (
          <Link key={k} to={`/status/${k}`} className="bg-card border border-line rounded-2xl p-3 sm:p-4 hover:border-trail/40 transition">
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[k]}`}>{l}</span>
            <div className="text-2xl sm:text-3xl font-semibold mt-2">{data.statusCounts[k] || 0}</div>
          </Link>
        ))}
      </section>

      <section>
        <div className="flex items-center mb-3">
          <h2 className="text-sm font-medium text-muted">学习集</h2>
          <button className="ml-auto btn btn-ghost !py-1 text-trail" onClick={() => setCreating((v) => !v)}>＋ 新建</button>
        </div>
        {creating && (
          <form onSubmit={create} className="flex gap-2 mb-3">
            <input autoFocus className="input" placeholder="比如：待复习、面试英语、技术词汇" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn btn-primary shrink-0">创建</button>
          </form>
        )}
        {data.collections.length === 0 ? (
          <p className="text-muted text-sm py-10 text-center">
            还没有学习集。去<Link to="/" className="text-trail mx-1">书架</Link>读一篇文章，点单词就能收藏。
          </p>
        ) : (
          <ul className="space-y-2">
            {data.collections.map((c) => (
              <li key={c.id}>
                <Link to={`/study/${c.id}`} className="flex items-center gap-3 bg-card border border-line rounded-xl px-4 py-3.5 hover:border-trail/40 transition">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate flex items-center gap-2">
                      {c.name}
                      {c.day === today && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber text-ink font-semibold">今天</span>}
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {c.words} 个单词 · {c.sentences} 个句子
                      {c.review > 0 && <span className="text-[#8a6410]"> · {c.review} 待复习</span>}
                    </div>
                  </div>
                  {c.total > 0 && (
                    <div className="w-16 h-1.5 bg-paper rounded-full overflow-hidden shrink-0" title="已掌握比例">
                      <div className="h-full bg-trail" style={{ width: `${(c.mastered / c.total) * 100}%` }} />
                    </div>
                  )}
                  <span className="text-muted">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
