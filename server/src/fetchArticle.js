import dns from 'node:dns/promises';
import net from 'node:net';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { domToBlocks } from './text.js';

// 防止有人用「导入网址」去访问服务器内网（SSRF）
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

async function assertPublicUrl(u) {
  let url;
  try {
    url = new URL(u);
  } catch {
    throw new UserError('网址格式不对');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new UserError('只支持 http/https 网址');
  const addrs = await dns.lookup(url.hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new UserError('找不到这个网站');
  if (addrs.some((a) => isPrivateIp(a.address))) throw new UserError('不支持这个地址');
  return url;
}

export class UserError extends Error {}

export async function fetchArticle(rawUrl) {
  let url = await assertPublicUrl(rawUrl);
  let res;
  for (let i = 0; i < 4; i++) {
    res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WordTrail/1.0; +reader)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }).catch(() => {
      throw new UserError('网页打不开，可能需要登录或被网站拦截了，可以直接复制正文粘贴进来');
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = await assertPublicUrl(new URL(res.headers.get('location'), url).toString());
      continue;
    }
    break;
  }
  if (!res.ok) throw new UserError(`网页返回错误（${res.status}），可以直接复制正文粘贴进来`);
  const type = res.headers.get('content-type') || '';
  if (!type.includes('html')) throw new UserError('这个网址不是网页文章');

  const html = (await res.text()).slice(0, 3_000_000);
  const dom = new JSDOM(html, { url: url.toString() });
  const parsed = new Readability(dom.window.document).parse();
  if (!parsed || !parsed.content) throw new UserError('没识别出正文，可以直接复制正文粘贴进来');

  const contentDom = new JSDOM(`<body>${parsed.content}</body>`);
  const blocks = domToBlocks(contentDom.window.document.body);
  if (!blocks.length) throw new UserError('没识别出正文，可以直接复制正文粘贴进来');

  // 去掉标题后面的网站名，比如 "xxx | TechCrunch"
  let title = (parsed.title || url.hostname).trim();
  const cut = title.split(/\s+[|–—]\s+|\s+-\s+(?=[^-]+$)/)[0];
  if (cut && cut.length >= 15) title = cut;
  return { title: title.slice(0, 300), blocks, url: url.toString() };
}
