import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { speak } from '../lib/speech.js';
import { useApp, STATUS_LABEL, STATUS_STYLE } from '../lib/context.js';

const Play = ({ text, size = 'w-8 h-8' }) => (
  <button
    className={`${size} shrink-0 rounded-full bg-trail-soft text-trail grid place-items-center text-sm hover:bg-[#d4e3d9]`}
    onClick={(e) => { e.stopPropagation(); speak(text); }}
    aria-label="发音"
  >
    🔊
  </button>
);

export default function ItemCard({ item, hideZh, collections = [], currentCollectionId, onUpdate, onRemoved }) {
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [peek, setPeek] = useState(false);
  const blur = hideZh && !peek;

  const setStatus = async (status) => {
    try {
      const d = await api(`/items/${item.id}`, { method: 'PATCH', body: { status } });
      onUpdate?.(d.item);
    } catch (e) { toast(e.message, 'error'); }
  };

  const addTo = async (cid) => {
    setMenu(false);
    try {
      await api(`/collections/${cid}/items`, { method: 'POST', body: { itemId: item.id } });
      toast(`已加入「${collections.find((c) => c.id === cid)?.name}」`);
    } catch (e) { toast(e.message, 'error'); }
  };

  const removeFromSet = async () => {
    setMenu(false);
    await api(`/collections/${currentCollectionId}/items/${item.id}`, { method: 'DELETE' });
    onRemoved?.(item.id);
  };

  const destroy = async () => {
    setMenu(false);
    if (!confirm('彻底删除这条？所有学习集里都会删掉。')) return;
    await api(`/items/${item.id}`, { method: 'DELETE' });
    onRemoved?.(item.id);
  };

  const isWord = item.kind === 'word';
  const d = item.details || {};
  const others = collections.filter((c) => c.id !== currentCollectionId);

  return (
    <li className="bg-card border border-line rounded-2xl p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {isWord ? (
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-read text-2xl font-semibold">{item.text}</span>
              {item.phonetic && <span className="text-sm text-muted">{item.phonetic}</span>}
            </div>
          ) : (
            <p className="font-read text-lg leading-relaxed">{item.text}</p>
          )}
          <p
            className={`mt-1.5 text-[0.95rem] ${isWord ? '' : 'text-muted'} ${blur ? 'tr-hidden' : ''}`}
            onClick={() => hideZh && setPeek((v) => !v)}
          >
            {item.meaning}
          </p>
        </div>
        <Play text={item.text} size={isWord ? 'w-10 h-10' : 'w-9 h-9'} />
      </div>

      {(item.source_sentence && (isWord || item.source_sentence !== item.text)) || (isWord && (d.meanings?.length || d.examples?.length)) ? (
        <button className="mt-3 text-xs text-trail font-medium" onClick={() => setOpen((v) => !v)}>
          {open ? '收起 ▲' : isWord ? '原句 · 常见释义 · 例句 ▼' : '原句 ▼'}
        </button>
      ) : null}

      {open && (
        <div className="mt-3 space-y-4 text-sm">
          {item.source_sentence && (
            <div className="border-l-2 border-amber pl-3">
              <div className="flex gap-2 items-start">
                <p className="font-read flex-1 leading-relaxed">{item.source_sentence}</p>
                <Play text={item.source_sentence} size="w-7 h-7" />
              </div>
              {item.source_translation && <p className={`text-muted mt-1 ${blur ? 'tr-hidden' : ''}`}>{item.source_translation}</p>}
              {item.article_title && (
                <Link to={`/read/${item.article_id}`} className="text-xs text-muted hover:text-trail mt-1 inline-block">— {item.article_title}</Link>
              )}
            </div>
          )}
          {isWord && d.meanings?.length > 0 && (
            <div>
              <div className="text-xs text-muted mb-1">常见释义</div>
              <ul className={`space-y-0.5 ${blur ? 'tr-hidden' : ''}`}>
                {d.meanings.map((m, i) => <li key={i}><span className="italic text-muted mr-1.5">{m.pos}</span>{m.zh}</li>)}
              </ul>
            </div>
          )}
          {isWord && d.examples?.length > 0 && (
            <div>
              <div className="text-xs text-muted mb-1.5">常见例句</div>
              <ul className="space-y-2.5">
                {d.examples.map((ex, i) => (
                  <li key={i} className="flex gap-2 items-start">
                    <div className="flex-1">
                      <p className="font-read">{ex.en}</p>
                      <p className={`text-muted text-xs mt-0.5 ${blur ? 'tr-hidden' : ''}`}>{ex.zh}</p>
                    </div>
                    <Play text={ex.en} size="w-7 h-7" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <div className="flex gap-1 bg-paper rounded-lg p-1">
          {Object.keys(STATUS_LABEL).map((s) => (
            <button
              key={s}
              onClick={() => item.status !== s && setStatus(s)}
              className={`px-2.5 py-1 rounded-md text-xs ${item.status === s ? `${STATUS_STYLE[s]} font-medium shadow-sm` : 'text-muted'}`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="ml-auto relative">
          <button className="btn btn-ghost !px-2 !py-1 text-muted" onClick={() => setMenu((v) => !v)} aria-label="更多">⋯</button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 bottom-9 z-20 w-52 bg-card border border-line rounded-xl shadow-xl py-1 text-sm">
                {others.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-xs text-muted">加入学习集</div>
                    <div className="max-h-40 overflow-y-auto">
                      {others.map((c) => (
                        <button key={c.id} className="w-full text-left px-3 py-1.5 hover:bg-paper truncate" onClick={() => addTo(c.id)}>{c.name}</button>
                      ))}
                    </div>
                    <div className="border-t border-line my-1" />
                  </>
                )}
                {currentCollectionId && (
                  <button className="w-full text-left px-3 py-1.5 hover:bg-paper" onClick={removeFromSet}>从这个学习集移除</button>
                )}
                <button className="w-full text-left px-3 py-1.5 hover:bg-paper text-[#8b2c2c]" onClick={destroy}>彻底删除</button>
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
