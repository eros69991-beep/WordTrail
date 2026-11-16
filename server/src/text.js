// 把文章拆成「块」（段落/标题/列表/代码），再把每块拆成句子

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

export const MAX_ARTICLE_CHARS = 60000;

const ABBR = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|Fig|Gen|Gov|Sen|Rep|U\.S|U\.K|a\.m|p\.m)\.$/;

function clean(s) {
  return s.replace(/\s+/g, ' ').trim();
}

export function splitSentences(text) {
  const out = [];
  for (const { segment } of segmenter.segment(clean(text))) {
    const s = segment.trim();
    if (!s) continue;
    // 很短的碎片（比如 "e.g." 被拆开），或上一句以 Dr. / Mr. 等缩写结尾，并到上一句
    const prev = out[out.length - 1];
    if (prev && ((s.length < 4 && !/^[A-Z]/.test(s)) || ABBR.test(prev))) {
      out[out.length - 1] += ' ' + s;
    } else {
      out.push(s);
    }
  }
  return out;
}

/**
 * 纯文本 / Markdown → blocks
 * 处理：``` 代码块、# 标题、- 列表、空行分段；段落内的单个换行视为同一段（修复复制时被打断的行）
 */
export function textToBlocks(raw) {
  const blocks = [];
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  let para = [];
  let inCode = false;
  let code = [];

  const flushPara = () => {
    const t = clean(para.join(' '));
    if (t) blocks.push({ type: 'p', text: t });
    para = [];
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (inCode) {
        blocks.push({ type: 'code', text: code.join('\n') });
        code = [];
        inCode = false;
      } else {
        flushPara();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      flushPara();
      continue;
    }
    const h = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (h) {
      flushPara();
      blocks.push({ type: 'h', text: clean(h[1]) });
      continue;
    }
    const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (li) {
      flushPara();
      blocks.push({ type: 'li', text: clean(li[1]) });
      continue;
    }
    para.push(line);
  }
  if (inCode && code.length) blocks.push({ type: 'code', text: code.join('\n') });
  flushPara();
  return blocks;
}

/**
 * Readability 输出的 HTML（已是 DOM 节点）→ blocks
 */
export function domToBlocks(root) {
  const blocks = [];
  const walk = (node) => {
    for (const el of node.children) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'pre') {
        const t = el.textContent.replace(/\n+$/, '');
        if (t.trim()) blocks.push({ type: 'code', text: t });
      } else if (/^h[1-6]$/.test(tag)) {
        const t = clean(el.textContent);
        if (t) blocks.push({ type: 'h', text: t });
      } else if (tag === 'li') {
        // 列表项里如果嵌套了列表，先取自身文字再递归
        const nested = el.querySelector('ul,ol,pre');
        if (nested) {
          const clone = el.cloneNode(true);
          clone.querySelectorAll('ul,ol,pre').forEach((n) => n.remove());
          const t = clean(clone.textContent);
          if (t) blocks.push({ type: 'li', text: t });
          walk(el);
        } else {
          const t = clean(el.textContent);
          if (t) blocks.push({ type: 'li', text: t });
        }
      } else if (tag === 'p' || tag === 'blockquote' || tag === 'figcaption' || tag === 'dd' || tag === 'dt') {
        if (el.querySelector('p,pre,ul,ol')) {
          walk(el);
        } else {
          const t = clean(el.textContent);
          if (t) blocks.push({ type: 'p', text: t });
        }
      } else if (['script', 'style', 'noscript', 'svg', 'img', 'figure', 'table', 'button', 'nav'].includes(tag)) {
        if (tag === 'figure') walk(el);
        // 其他忽略（表格第一版先不处理）
      } else if (el.children.length) {
        // div/section 等容器：如果只有文字没有子块，就当段落
        walk(el);
      } else {
        const t = clean(el.textContent);
        if (t && t.length > 20) blocks.push({ type: 'p', text: t });
      }
    }
  };
  walk(root);
  return blocks;
}

/**
 * blocks → 句子行（准备写入数据库）
 */
export function blocksToSentences(blocks) {
  const rows = [];
  let total = 0;
  blocks.forEach((b, blockIndex) => {
    if (total > MAX_ARTICLE_CHARS) return;
    if (b.type === 'code') {
      rows.push({ blockIndex, blockType: 'code', text: b.text });
      total += b.text.length;
      return;
    }
    for (const s of splitSentences(b.text)) {
      rows.push({ blockIndex, blockType: b.type, text: s });
      total += s.length;
    }
  });
  return rows;
}

// 判断一句话是否值得翻译（纯符号、纯数字、网址等跳过）
export function needsTranslation(s) {
  if (!/[A-Za-z]{2,}/.test(s)) return false;
  if (/^https?:\/\/\S+$/.test(s)) return false;
  return true;
}
