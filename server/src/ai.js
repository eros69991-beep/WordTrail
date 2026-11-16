// DeepSeek 调用（OpenAI 兼容接口）。没配置 key 时进入「模拟模式」，方便本地开发测试。

const API_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/chat/completions';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
export const MOCK = !process.env.DEEPSEEK_API_KEY || process.env.AI_MOCK === '1';

async function chatJSON(system, user, maxTokens = 2000) {
  const res = await fetch(API_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(90000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`DeepSeek ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

const TRANSLATE_SYSTEM = `你是专业的英译中译者，服务对象是正在学英语的中国读者。
规则：
1. 逐句翻译，输入有几句，输出就有几句，顺序一一对应，不合并、不拆分、不遗漏。
2. 译文自然通顺，符合中文表达习惯，但不要意译到丢失原意。
3. 技术术语（如 API、token、deploy、commit、framework）第一次出现时写成「中文（英文）」，例如「部署（deploy）」；没有通用中文译法的保留英文。
4. 代码、变量名、函数名、命令、网址原样保留。
5. 人名、品牌名、产品名保留英文。
只输出 JSON：{"t": ["第1句译文", "第2句译文", ...]}`;

/** 批量翻译句子，返回等长数组 */
export async function translateBatch(sentences) {
  if (MOCK) {
    await new Promise((r) => setTimeout(r, 150));
    return sentences.map((s) => `【模拟译文】${s.slice(0, 40)}${s.length > 40 ? '…' : ''}`);
  }
  const numbered = sentences.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const out = await chatJSON(
    TRANSLATE_SYSTEM,
    `共 ${sentences.length} 句，请翻译：\n${numbered}`,
    Math.min(8000, 200 + sentences.join(' ').length * 2),
  );
  const arr = Array.isArray(out.t) ? out.t : null;
  if (!arr || arr.length !== sentences.length) {
    throw new Error(`译文条数不对：期望 ${sentences.length}，得到 ${arr ? arr.length : '无'}`);
  }
  return arr.map((x) => String(x).replace(/^\d+\.\s*/, '').trim());
}

const WORD_SYSTEM = `你是英汉词典编辑，服务对象是学英语的中国人。
给定一个英文单词（或短语），输出 JSON：
{
  "lemma": "原形，比如 running → run；短语保持原样",
  "phonetic": "美式音标，用 /.../ 包起来，短语可留空",
  "meanings": [{"pos": "词性缩写如 n. v. adj.", "zh": "常用中文释义，多个用；分隔"}],
  "examples": [{"en": "常见英文例句", "zh": "中文翻译"}]
}
meanings 最多 4 条，按常用程度排序；examples 给 3 句，贴近日常和工作场景，句子不要太长。`;

/** 查单词：常见释义 + 例句 + 音标 */
export async function lookupWordAI(word) {
  if (MOCK) {
    return {
      lemma: word,
      phonetic: '',
      meanings: [{ pos: 'n.', zh: `【模拟释义】${word}` }],
      examples: [
        { en: `This is an example with ${word}.`, zh: `这是一个包含 ${word} 的例句。` },
        { en: `I learned the word "${word}" today.`, zh: `我今天学了「${word}」这个词。` },
      ],
    };
  }
  return chatJSON(WORD_SYSTEM, word, 800);
}

/** 单词在原句中的具体意思 */
export async function contextMeaningAI(word, sentence) {
  if (MOCK) return `【模拟】「${word}」在本句中的意思`;
  const out = await chatJSON(
    '你帮学英语的中国人理解单词。给定单词和它所在的原句，用一句简短中文说明这个词在这句里的具体意思（不超过 30 字）。只输出 JSON：{"m": "..."}',
    `单词：${word}\n原句：${sentence}`,
    200,
  );
  return String(out.m || '').trim();
}

/** 免费词典接口查音标（查不到返回 null） */
export async function dictionaryPhonetic(word) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    for (const entry of data) {
      if (entry.phonetic) return entry.phonetic;
      const p = (entry.phonetics || []).find((x) => x.text);
      if (p) return p.text;
    }
  } catch {
    /* 网络失败就算了 */
  }
  return null;
}
