// 浏览器自带朗读（免费），用的是电脑系统里装的语音。
// 声音和语速存在本机；默认优先用 Allison，其次是「高品质 / 增强」版声音。

const KEY = 'wt_voice';
const DEFAULTS = { voiceName: '', rate: 0.9 };

export function getVoiceSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveVoiceSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 忽略 */ }
}

export const speechSupported = typeof speechSynthesis !== 'undefined';

let voices = [];
const listeners = new Set();
function loadVoices() {
  if (!speechSupported) return;
  voices = speechSynthesis.getVoices();
  listeners.forEach((fn) => fn(voices));
}
if (speechSupported) {
  loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

/** 订阅声音列表（有些浏览器是异步加载的） */
export function onVoices(fn) {
  listeners.add(fn);
  fn(voices);
  return () => listeners.delete(fn);
}

const isEnglish = (v) => v.lang.replace('_', '-').toLowerCase().startsWith('en');
const isHighQuality = (v) => /premium|enhanced|natural|高品质|增强|優化|neural/i.test(v.name);

// 默认挑选顺序：Allison 优先，然后是其他自然一点的声音
const PREFERRED = ['Allison', 'Ava', 'Zoe', 'Evan', 'Nathan', 'Susan', 'Tom', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny'];

/** 电脑上所有英文声音，高品质的排前面 */
export function englishVoices(list = voices) {
  return list
    .filter(isEnglish)
    .sort((a, b) => Number(isHighQuality(b)) - Number(isHighQuality(a)) || a.name.localeCompare(b.name));
}

export function defaultVoice(list = voices) {
  const en = englishVoices(list);
  for (const name of PREFERRED) {
    const hq = en.find((v) => v.name.includes(name) && isHighQuality(v));
    if (hq) return hq;
    const any = en.find((v) => v.name.includes(name));
    if (any) return any;
  }
  return en.find(isHighQuality) || en.find((v) => v.lang.startsWith('en-US')) || en[0] || null;
}

function pickVoice(voiceName) {
  if (voiceName) {
    const v = voices.find((x) => x.name === voiceName);
    if (v) return v;
  }
  return defaultVoice();
}

export function speak(text, opts = {}) {
  if (!speechSupported || !text) return;
  const { voiceName, rate } = { ...getVoiceSettings(), ...opts };
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(voiceName);
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  } else {
    u.lang = 'en-US';
  }
  u.rate = rate;
  speechSynthesis.speak(u);
}
