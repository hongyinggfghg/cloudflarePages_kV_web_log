import { RESP, onRequestOptions, authed, readList, byDateDesc } from '../_lib.js';
export { onRequestOptions };

// GET /api/post?id= —— 单篇文章（含正文）。文章页按需拉取正文用。
// 未到 publishAt 的定时文章对未鉴权请求返回 404，与 /api/posts 的公开口径一致。
export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return RESP({ error: '缺少 ?id= 参数' }, 400);
  const posts = await readList(env, 'posts');
  const post = posts.find(p => p.id === id);
  if (!post) return RESP({ error: '没有找到 ' + id }, 404);
  // 与 GET /api/posts 口径一致：publishAt 无法解析（脏数据）时视为没有定时，照常返回
  const at = post.publishAt ? Date.parse(post.publishAt) : NaN;
  const hidden = Number.isFinite(at) && at > Date.now();
  if (hidden && !(await authed(request, env))) return RESP({ error: '文章不存在或尚未公开' }, 404);
  return RESP(post, 200, { 'Cache-Control': 'private, no-store' });
}

// 字段白名单：只把这些字段写进 KV，其余一律丢弃
const POST_FIELDS = ['id', 'title', 'content', 'date', 'category', 'excerpt', 'tags', 'heat', 'featured', 'seed', 'cover', 'publishAt'];
// id 用作 hash 路由 #/post/:id 的一部分，禁止空白、/ 与 #；限长 64
const ID_RE = /^[^\s/#]{1,64}$/;

export async function onRequestPost({ request, env }) {
  if (!(await authed(request, env))) return RESP({ error: 'X-Admin-Token 校验失败' }, 401);
  let post;
  try { post = await request.json(); } catch (e) {
    return RESP({ error: '请求体不是合法 JSON' }, 400);
  }
  if (!post || typeof post !== 'object' || Array.isArray(post)) {
    return RESP({ error: '请求体必须是文章对象' }, 400);
  }
  if (typeof post.id !== 'string' || !ID_RE.test(post.id)) {
    return RESP({ error: 'id 必须是 1-64 位的非空字符串，且不含空格、/ 和 #' }, 400);
  }
  for (const k of ['title', 'date', 'content']) {
    if (typeof post[k] !== 'string' || !post[k].trim()) {
      return RESP({ error: '文章缺少有效的 ' + k + ' 字段' }, 400);
    }
  }
  if (post.publishAt != null && post.publishAt !== '' &&
      (typeof post.publishAt !== 'string' || !Number.isFinite(Date.parse(post.publishAt)))) {
    return RESP({ error: 'publishAt 必须是有效的日期时间字符串' }, 400);
  }
  if (post.tags != null && (!Array.isArray(post.tags) || post.tags.some(t => typeof t !== 'string'))) {
    return RESP({ error: 'tags 必须是字符串数组' }, 400);
  }
  if (post.heat != null && typeof post.heat !== 'number' || Number.isNaN(post.heat)) {
    return RESP({ error: 'heat 必须是数字' }, 400);
  }
  if (post.featured != null && typeof post.featured !== 'boolean') {
    return RESP({ error: 'featured 必须是布尔值' }, 400);
  }
  // 按白名单拣选字段，避免任意键写进 KV
  const clean = {};
  for (const k of POST_FIELDS) {
    if (post[k] !== undefined && post[k] !== null) clean[k] = post[k];
  }
  post = clean;
  let posts;
  try {
    posts = await readList(env, 'posts', { strict: true });
  } catch (e) {
    return RESP({ error: e.message }, 500);
  }
  const i = posts.findIndex(p => p.id === post.id);
  if (i >= 0) posts[i] = post; else posts.push(post);
  posts.sort(byDateDesc);
  await env.BLOG_KV.put('posts', JSON.stringify(posts));
  return RESP({ ok: true, action: i >= 0 ? 'updated' : 'created', total: posts.length });
}

export async function onRequestDelete({ request, env }) {
  if (!(await authed(request, env))) return RESP({ error: 'X-Admin-Token 校验失败' }, 401);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return RESP({ error: '缺少 ?id= 参数' }, 400);
  let posts;
  try {
    posts = await readList(env, 'posts', { strict: true });
  } catch (e) {
    return RESP({ error: e.message }, 500);
  }
  const next = posts.filter(p => p.id !== id);
  if (next.length === posts.length) return RESP({ error: '没有找到 ' + id }, 404);
  await env.BLOG_KV.put('posts', JSON.stringify(next));
  return RESP({ ok: true, total: next.length });
}
