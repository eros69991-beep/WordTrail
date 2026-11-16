import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { speak } from '../lib/speech.js';
import { useApp, STATUS_LABEL } from '../lib/context.js';

// 点单词弹出的小卡片：电脑上浮在单词旁边，手机上从底部弹出
export default function WordPopup({ word, sentenceId, rect, onClose, onSaved }) {
  const { toast } = useApp();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [isMobile] = useState(() => window.innerWidth < 640);
  const boxRef = useRef();
  const [pos, setPos] = useState(null);

  useEffect(() => {
    let live = true;
    setInfo(null);
    setError('');
    api(`/lookup?word=${encodeURIComponent(word)}`)
      .then((d) => live && setInfo(d))
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [word]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 电脑端：根据单词位置摆放卡片，避免超出屏幕
  useLayoutEffect(() => {
    if (isMobile || !boxRef.current) return;
    const h = boxRef.current.offsetHeight;
    const w = 340;
    const left = Math.min(Math.max(8, rect.left - 20), window.innerWidth - w - 8);
    const below = rect.bottom + 8;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, rect.top - h - 8) : below;
    setPos({ left, top });
  }, [rect, info, error, isMobile]);

  const save = async () => {
    setSaving(true);
    try {
      const d = await api('/items', { method: 'POST', body: { kind: 'word', text: word, sentenceId } });
      toast(d.existed ? `「${d.item.text}」已在学习中，加入了今天的学习集` : `已加入「${d.collection.name}」`);
      onSaved?.(d.item.text);
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <>
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <div className="font-read text-2xl font-semibold leading-tight break-words">{info?.word || word.toLowerCase()}</div>
          <div className="text-sm text-muted mt-0.5 h-5">
            {info?.phonetic}
            {info?.lemma && info.lemma !== info.word && <span className="ml-2">原形 {info.lemma}</span>}
          </div>
        </div>
        <button className="ml-auto shrink-0 w-9 h-9 rounded-full bg-trail-soft text-trail grid place-items-center hover:bg-[#d4e3d9]" onClick={() => speak(info?.word || word)} aria-label="发音">🔊</button>
      </div>

      <div className="mt-3 text-sm">
        {error ? (
          <p className="text-[#8b2c2c]">{error}</p>
        ) : !info ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-3 bg-paper rounded w-3/4" />
            <div className="h-3 bg-paper rounded w-1/2" />
            <div className="h-3 bg-paper rounded w-2/3" />
          </div>
        ) : (
          <>
            <ul className="space-y-1">
              {info.meanings.map((m, i) => (
                <li key={i}><span className="text-muted italic mr-1.5">{m.pos}</span>{m.zh}</li>
              ))}
            </ul>
            {info.examples?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-line space-y-2.5">
                {info.examples.slice(0, 2).map((ex, i) => (
                  <div key={i}>
                    <button className="font-read text-left hover:text-trail" onClick={() => speak(ex.en)}>{ex.en} <span className="text-xs">🔊</span></button>
                    <div className="text-muted text-xs mt-0.5">{ex.zh}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-4">
        {info?.saved ? (
          <button className="btn btn-soft w-full" onClick={save} disabled={saving}>
            已收藏（{STATUS_LABEL[info.saved.status]}）· 再加入今天
          </button>
        ) : (
          <button className="btn btn-primary w-full" onClick={save} disabled={saving || !!error}>
            {saving ? '收藏中…' : '☆ 收藏到今日学习'}
          </button>
        )}
      </div>
    </>
  );

  return (
    <>
      <div className={`fixed inset-0 z-40 ${isMobile ? 'bg-black/25' : ''}`} onClick={onClose} />
      {isMobile ? (
        <div className="fixed z-50 inset-x-0 bottom-0 bg-card rounded-t-2xl shadow-2xl p-5 pb-8 pb-safe max-h-[75vh] overflow-y-auto">
          <div className="w-10 h-1 bg-line rounded-full mx-auto mb-4" />
          {body}
        </div>
      ) : (
        <div
          ref={boxRef}
          className="fixed z-50 w-[340px] bg-card border border-line rounded-2xl shadow-2xl p-4 max-h-[70vh] overflow-y-auto"
          style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
        >
          {body}
        </div>
      )}
    </>
  );
}
