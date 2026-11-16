import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { speak } from '../lib/speech.js';
import { useApp } from '../lib/context.js';
import WordPopup from '../components/WordPopup.jsx';

const WORD_RE = /([A-Za-z](?:[A-Za-z'’-]*[A-Za-z])?)/;
const norm = (w) => w.replace(/’/g, "'").toLowerCase();

// 一句英文：每个单词都是可点击的 span
function SentenceText({ text, saved, activeWord }) {
  const parts = text.split(WORD_RE);
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <span key={i} data-word={p} className={`w ${saved.has(norm(p)) ? 'saved' : ''} ${activeWord === p ? 'active' : ''}`}>{p}</span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function Sentence({ s, showTr, saved, activeWord, onCollect }) {
  const [reveal, setReveal] = useState(false);
  const hidden = !showTr && !reveal;
  return (
    <div className="group/s mb-3" data-sid={s.id}>
      <div className="font-read text-[1.15rem] sm:text-[1.2rem] leading-[1.75]">
        <SentenceText text={s.text} saved={saved} activeWord={activeWord} />
        <span className="sent-actions inline-flex gap-0.5 ml-1.5 align-middle select-none">
          <button className="w-7 h-7 rounded-full text-sm hover:bg-trail-soft" title="朗读这句" onClick={() => speak(s.text)}>🔊</button>
          <button className="w-7 h-7 rounded-full text-sm hover:bg-amber-soft" title="收藏这句" onClick={() => onCollect(s.text, s.id)}>☆</button>
        </span>
      </div>
      {s.translation === null ? (
        <div className="h-4 w-2/3 bg-line/60 rounded animate-pulse mt-1" />
      ) : s.translation ? (
        <div
          className={`text-[0.95rem] text-muted leading-relaxed mt-0.5 select-none ${hidden ? 'tr-hidden' : ''}`}
          onClick={() => !showTr && setReveal((v) => !v)}
        >
          {s.translation}
        </div>
      ) : null}
    </div>
  );
}

export default function ReaderPage() {
  const { id } = useParams();
  const { toast } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(new Set());
  const [showTr, setShowTr] = useState(() => localStorage.getItem('wt_showTr') !== '0');
  const [progress, setProgress] = useState(null); // { done, total } | null
  const [trError, setTrError] = useState('');
  const [popup, setPopup] = useState(null);
  const [selBtn, setSelBtn] = useState(null);
  const articleRef = useRef();

  useEffect(() => {
    let live = true;
    api(`/articles/${id}`)
      .then((d) => {
        if (!live) return;
        setData(d);
        setSaved(new Set(d.savedWords));
      })
      .catch((e) => setError(e.message));
    return () => { live = false; };
  }, [id]);

  // 逐批翻译，直到全部完成
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const runTranslate = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setTrError('');
    const total = data.sentences.filter((s) => s.block_type !== 'code').length;
    try {
      for (let i = 0; i < 200 && mounted.current; i++) {
        const r = await api(`/articles/${id}/translate`, { method: 'POST' });
        if (r.busy) { await new Promise((ok) => setTimeout(ok, 1500)); continue; }
        if (r.updated.length) {
          const map = new Map(r.updated.map((u) => [u.id, u.translation]));
          setData((d) => ({ ...d, sentences: d.sentences.map((s) => (map.has(s.id) ? { ...s, translation: map.get(s.id) } : s)) }));
        }
        setProgress({ done: total - (r.remaining ?? 0), total });
        if (r.done) break;
      }
    } catch (e) {
      setTrError(e.message);
    }
    setProgress(null);
    running.current = false;
  }, [data?.article.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const needsTr = data?.sentences.some((s) => s.translation === null && s.block_type !== 'code');
  useEffect(() => {
    if (data && needsTr && !progress && !trError) runTranslate();
  }, [data?.article.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 把句子按段落（block）分组
  const blocks = useMemo(() => {
    if (!data) return [];
    const out = [];
    for (const s of data.sentences) {
      const last = out[out.length - 1];
      if (last && last.index === s.block_index) last.sentences.push(s);
      else out.push({ index: s.block_index, type: s.block_type, sentences: [s] });
    }
    return out;
  }, [data]);

  const collectSentence = async (text, sentenceId) => {
    setSelBtn(null);
    window.getSelection()?.removeAllRanges();
    try {
      const d = await api('/items', { method: 'POST', body: { kind: 'sentence', text, sentenceId } });
      toast(d.existed ? '这句已经收藏过，加入了今天的学习集' : `已加入「${d.collection.name}」`);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // 点单词
  const onArticleClick = (e) => {
    const el = e.target.closest('[data-word]');
    if (!el) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim().includes(' ')) return; // 正在划选一段
    const sid = Number(el.closest('[data-sid]')?.dataset.sid);
    setSelBtn(null);
    setPopup({ word: el.dataset.word, sentenceId: sid, rect: el.getBoundingClientRect() });
  };

  // 划选：选中多个词时出现「收藏选中内容」按钮（电脑拖选、手机长按都适用）
  useEffect(() => {
    let t;
    const onSel = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().replace(/\s+/g, ' ').trim();
        if (!sel || sel.isCollapsed || !text || !articleRef.current?.contains(sel.anchorNode)) {
          setSelBtn(null);
          return;
        }
        if (!/\s/.test(text)) { setSelBtn(null); return; } // 单个词交给点击处理
        const sidEl = (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest('[data-sid]');
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        setSelBtn({ text: text.slice(0, 1000), sentenceId: sidEl ? Number(sidEl.dataset.sid) : null, rect });
      }, 250);
    };
    document.addEventListener('selectionchange', onSel);
    return () => { document.removeEventListener('selectionchange', onSel); clearTimeout(t); };
  }, []);

  const toggleTr = () => {
    setShowTr((v) => {
      localStorage.setItem('wt_showTr', v ? '0' : '1');
      return !v;
    });
  };

  if (error) return <div className="py-20 text-center text-muted">{error} · <Link className="text-trail" to="/">回书架</Link></div>;
  if (!data) return <div className="py-20 text-center text-muted">加载中…</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="sticky top-14 z-20 -mx-4 px-4 py-2 bg-paper/90 backdrop-blur flex items-center gap-2 border-b border-line/60">
        <Link to="/" className="btn btn-ghost !px-2 text-muted">← 书架</Link>
        <div className="ml-auto flex items-center gap-2">
          {progress && <span className="text-xs text-muted">翻译中 {progress.done}/{progress.total}</span>}
          <button className={`btn ${showTr ? 'btn-soft' : 'btn-ghost border border-line'}`} onClick={toggleTr}>
            {showTr ? '隐藏译文' : '显示译文'}
          </button>
        </div>
      </div>

      {trError && (
        <div className="mt-4 p-3 rounded-xl bg-amber-soft text-sm flex items-center gap-3">
          <span className="flex-1">{trError}</span>
          <button className="btn btn-ghost !py-1" onClick={runTranslate}>重试</button>
        </div>
      )}

      <article ref={articleRef} onClick={onArticleClick} className="pt-6 pb-24">
        <h1 className="font-read text-3xl sm:text-4xl font-semibold leading-tight mb-2">{data.article.title}</h1>
        {data.article.source_url && (
          <a href={data.article.source_url} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-trail break-all">{data.article.source_url}</a>
        )}
        {!showTr && <p className="text-xs text-muted mt-3">译文已隐藏，点模糊的地方可以单独看一句。</p>}
        <div className="mt-8">
          {blocks.map((b) => {
            if (b.type === 'code') {
              return (
                <pre key={b.index} className="my-5 p-4 rounded-xl bg-[#1d2320] text-[#e8e6df] text-sm font-mono overflow-x-auto leading-relaxed">
                  {b.sentences[0].text}
                </pre>
              );
            }
            const inner = b.sentences.map((s) => (
              <Sentence key={s.id} s={s} showTr={showTr} saved={saved} activeWord={popup?.sentenceId === s.id ? popup.word : null} onCollect={collectSentence} />
            ));
            if (b.type === 'h') return <div key={b.index} className="mt-8 mb-2 [&_.font-read]:font-semibold [&_.font-read]:text-[1.35rem]">{inner}</div>;
            if (b.type === 'li') {
              return (
                <div key={b.index} className="flex gap-3 pl-1">
                  <span className="text-trail mt-[0.55rem] text-xs">●</span>
                  <div className="flex-1">{inner}</div>
                </div>
              );
            }
            return <div key={b.index} className="mb-5">{inner}</div>;
          })}
        </div>
      </article>

      {selBtn && (
        <button
          className="fixed z-40 btn btn-primary shadow-xl"
          style={{
            left: Math.min(Math.max(8, selBtn.rect.left + selBtn.rect.width / 2 - 70), window.innerWidth - 150),
            top: selBtn.rect.top > 70 ? selBtn.rect.top - 48 : selBtn.rect.bottom + 10,
          }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => collectSentence(selBtn.text, selBtn.sentenceId)}
        >
          ☆ 收藏选中内容
        </button>
      )}

      {popup && (
        <WordPopup
          word={popup.word}
          sentenceId={popup.sentenceId}
          rect={popup.rect}
          onClose={() => setPopup(null)}
          onSaved={(w) => setSaved((s) => new Set(s).add(w))}
        />
      )}
    </div>
  );
}
