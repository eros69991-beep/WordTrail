import { useEffect, useState } from 'react';
import {
  getVoiceSettings, saveVoiceSettings, speak, speechSupported, onVoices, englishVoices, defaultVoice,
} from '../lib/speech.js';

const accentLabel = (lang) => {
  const l = lang.replace('_', '-');
  if (l.startsWith('en-US')) return '美音';
  if (l.startsWith('en-GB')) return '英音';
  if (l.startsWith('en-AU')) return '澳洲';
  if (l.startsWith('en-IN')) return '印度';
  if (l.startsWith('en-IE')) return '爱尔兰';
  if (l.startsWith('en-ZA')) return '南非';
  return l;
};

export default function VoiceSettings() {
  const [s, setS] = useState(getVoiceSettings());
  const [voices, setVoices] = useState([]);

  useEffect(() => onVoices((list) => setVoices(englishVoices(list))), []);

  const update = (patch) => {
    const next = { ...s, ...patch };
    setS(next);
    saveVoiceSettings(next);
  };

  if (!speechSupported) return <p className="text-sm text-muted">这个浏览器不支持朗读</p>;

  const fallback = defaultVoice();
  const current = voices.find((v) => v.name === s.voiceName) ? s.voiceName : fallback?.name || '';

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-medium mb-1.5">声音</div>
        {voices.length === 0 ? (
          <p className="text-xs text-muted">正在读取电脑上的声音…</p>
        ) : (
          <select
            className="input !py-2 text-sm"
            value={current}
            onChange={(e) => {
              update({ voiceName: e.target.value });
              speak('Every word you look up leaves a mark on the trail.', { voiceName: e.target.value });
            }}
          >
            {voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}（{accentLabel(v.lang)}）
              </option>
            ))}
          </select>
        )}
        <p className="text-xs text-muted mt-1">声音来自你电脑系统，可在 系统设置 → 辅助功能 → 朗读内容 里下载更多高品质声音。</p>
      </div>
      <div>
        <div className="text-sm font-medium mb-1.5 flex justify-between">
          <span>语速</span>
          <span className="text-muted">{s.rate.toFixed(1)}x</span>
        </div>
        <input
          type="range" min="0.5" max="1.3" step="0.1" value={s.rate}
          onChange={(e) => update({ rate: Number(e.target.value) })}
          className="w-full accent-trail"
        />
      </div>
      <button className="btn btn-soft w-full" onClick={() => speak('Every word you look up leaves a mark on the trail.', s)}>🔊 试听</button>
    </div>
  );
}
