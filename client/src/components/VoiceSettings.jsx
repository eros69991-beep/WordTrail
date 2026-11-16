import { useState } from 'react';
import { getVoiceSettings, saveVoiceSettings, speak, speechSupported } from '../lib/speech.js';

export default function VoiceSettings() {
  const [s, setS] = useState(getVoiceSettings());
  const update = (patch) => {
    const next = { ...s, ...patch };
    setS(next);
    saveVoiceSettings(next);
  };
  if (!speechSupported) return <p className="text-sm text-muted">这个浏览器不支持朗读</p>;
  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-medium mb-1.5">发音</div>
        <div className="grid grid-cols-2 gap-1 bg-paper rounded-lg p-1">
          {[['en-US', '美音'], ['en-GB', '英音']].map(([v, l]) => (
            <button
              key={v}
              onClick={() => update({ accent: v })}
              className={`py-1.5 rounded-md text-sm ${s.accent === v ? 'bg-card shadow-sm font-medium' : 'text-muted'}`}
            >
              {l}
            </button>
          ))}
        </div>
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
      <button className="btn btn-soft w-full" onClick={() => speak('This is how I sound.', s)}>🔊 试听</button>
    </div>
  );
}
