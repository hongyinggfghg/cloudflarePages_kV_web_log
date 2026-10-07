// Cloudflare Pages Functions 共享工具库。
// 只导出工具函数，不含任何 onRequest* 处理器，因此不会匹配到路由。

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token, Authorization',
  'Access-Control-Max-Age': '86400',
};

export function RESP(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra },
  });
}

export function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

// 统一鉴权：X-Admin-Token 或 Authorization: Bearer。
// 未设置 ADMIN_TOKEN 时一律拒绝；两侧都做 SHA-256 后再比较，避免时序侧信道。
export async function authed(request, env) {
  const t = env.ADMIN_TOKEN;
  if (!t) return false;
  let given = (request.headers.get('X-Admin-Token') || '').trim();
  if (!given) {
    const auth = request.headers.get('Authorization') || '';
    if (auth.toLowerCase().startsWith('bearer ')) given = auth.slice(7).trim();
  }
  if (!given) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(t)),
  ]);
  return hex(a) === hex(b);
}

// 读 KV 中的 JSON 数组。
// strict = true（写路径）：数据损坏时抛错，调用方转成 500 拒绝写入，
// 防止用空数组覆盖真实数据导致全站文章静默清空。
// strict = false（公开读路径）：降级为空数组并记录错误，保证站点仍能打开。
export async function readList(env, key, { strict = false } = {}) {
  const raw = await env.BLOG_KV.get(key);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) throw new Error('内容不是 JSON 数组');
    return v;
  } catch (e) {
    if (strict) throw new Error(`KV 的 ${key} 键数据损坏，已拒绝写入以防覆盖丢失。请到 KV 面板检查或修复该键后重试`);
    console.error(`[kv-blog] KV 的 ${key} 键数据损坏：` + e.message);
    return [];
  }
}

export const byDateDesc = (a, b) => ((a.date || '') < (b.date || '') ? 1 : -1);

// 正文字符数（去标签、去空白），供列表接口计算 words 字段
export const textLen = html => String(html || '').replace(/<[^>]+>/g, '').replace(/\s/g, '').length;
