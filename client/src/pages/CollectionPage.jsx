import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/context.js';
import ItemList from '../components/ItemList.jsx';

export default function CollectionPage() {
  const { id } = useParams();
  const { toast } = useApp();
  const navigate = useNavigate();
  const [collection, setCollection] = useState(null);
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    api(`/collections/${id}`)
      .then((d) => { setCollection(d.collection); setItems(d.items); })
      .catch((e) => toast(e.message, 'error'));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rename = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const d = await api(`/collections/${id}`, { method: 'PATCH', body: { name } });
      setCollection(d.collection);
      setEditing(false);
    } catch (err) { toast(err.message, 'error'); }
  };

  const remove = async () => {
    if (!confirm(`删除学习集「${collection.name}」？\n只在这个集里的单词和句子会一起删除，同时在其他学习集里的会保留。`)) return;
    await api(`/collections/${id}`, { method: 'DELETE' });
    navigate('/study');
  };

  if (!collection) return <p className="text-muted text-sm">加载中…</p>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link to="/study" className="text-sm text-muted hover:text-ink">← 学习</Link>

      <div className="flex items-start gap-3">
        {editing ? (
          <form onSubmit={rename} className="flex gap-2 flex-1">
            <input autoFocus className="input text-lg" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn btn-primary shrink-0">保存</button>
            <button type="button" className="btn btn-ghost shrink-0" onClick={() => setEditing(false)}>取消</button>
          </form>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-semibold break-words">{collection.name}</h1>
              {collection.day && <p className="text-xs text-muted mt-1">{collection.day} 收藏</p>}
            </div>
            <button className="btn btn-ghost border border-line shrink-0" onClick={() => { setName(collection.name); setEditing(true); }}>✎ 改名</button>
            <button className="btn btn-ghost shrink-0 text-[#8b2c2c]" onClick={remove} aria-label="删除学习集">删除</button>
          </>
        )}
      </div>

      {items && <ItemList items={items} setItems={setItems} currentCollectionId={collection.id} />}
    </div>
  );
}
