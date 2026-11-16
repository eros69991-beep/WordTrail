// 浏览器自带朗读（免费）。口音和语速存在本机

const KEY = 'wt_voice';

export function getVoiceSettings() {
  try {
    return { accent: 'en-US', rate: 0.9, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { accent: 'en-US', rate: 0.9 };
  }
}

export function saveVoiceSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 忽略 */ }
}

let voices = [];
function loadVoices() {
  if (typeof speechSynthesis === 'undefined') return;
  voices = speechSynthesis.getVoices();
}
if (typeof speechSynthesis !== 'undefined') {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

// 优先挑听起来自然的声音
const PREFERRED = ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Ava', 'Daniel', 'Google UK English Female', 'Microsoft Sonia', 'Serena'];

function pickVoice(lang) {
  const candidates = voices.filter((v) => v.lang.replace('_', '-').startsWith(lang));
  if (!candidates.length) return voices.find((v) => v.lang.startsWith('en')) || null;
  for (const name of PREFERRED) {
    const v = candidates.find((c) => c.name.includes(name));
    if (v) return v;
  }
  return candidates.find((v) => v.localService) || candidates[0];
}

export const speechSupported = typeof speechSynthesis !== 'undefined';

export function speak(text, opts = {}) {
  if (!speechSupported || !text) return;
  const { accent, rate } = { ...getVoiceSettings(), ...opts };
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = accent;
  const v = pickVoice(accent);
  if (v) u.voice = v;
  u.rate = rate;
  speechSynthesis.speak(u);
}
