import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { STATUS_LABEL } from '../lib/context.js';
import ItemCard from './ItemCard.jsx';

const Chip = ({ active, onClick, children }) => (
  <button onClick={onClick} className={`px-3 py-1 rounded-full text-xs border ${active ? 'bg-ink text-white border-ink' : 'border-line text-muted hover:text-ink'}`}>
    {children}
  </button>
);

// 学习条目列表：带筛选（全部/单词/句子、状态）和「遮住中文」自测开关
export default function ItemList({ items, setItems, currentCollectionId, showStatusFilter = true }) {
  const [collections, setCollections] = useState([]);
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('all');
  const [hideZh, setHideZh] = useState(false);

  useEffect(() => {
    api('/collections').then((d) => setCollections(d.collections)).catch(() => {});
  }, []);

  const shown = items.filter((i) => (kind === 'all' || i.kind === kind) && (status === 'all' || i.status === status));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <Chip active={kind === 'all'} onClick={() => setKind('all')}>全部 {items.length}</Chip>
        <Chip active={kind === 'word'} onClick={() => setKind('word')}>单词</Chip>
        <Chip active={kind === 'sentence'} onClick={() => setKind('sentence')}>句子</Chip>
        {showStatusFilter && (
          <>
            <span className="w-px h-4 bg-line mx-1" />
            <Chip active={status === 'all'} onClick={() => setStatus('all')}>所有状态</Chip>
            {Object.entries(STATUS_LABEL).map(([k, l]) => (
              <Chip key={k} active={status === k} onClick={() => setStatus(k)}>{l}</Chip>
            ))}
          </>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none">
          <input type="checkbox" className="accent-trail" checked={hideZh} onChange={(e) => setHideZh(e.target.checked)} />
          遮住中文自测
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="text-muted text-sm py-10 text-center">这里还没有内容</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              hideZh={hideZh}
              collections={collections}
              currentCollectionId={currentCollectionId}
              onUpdate={(n) => setItems((list) => list.map((x) => (x.id === n.id ? { ...x, ...n } : x)))}
              onRemoved={(id) => setItems((list) => list.filter((x) => x.id !== id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
