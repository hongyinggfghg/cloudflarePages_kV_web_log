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
  const at = post.publishAt ? Date.parse(post.publishAt) : NaN;
  const hidden = Number.isFinite(at) && at > Date.now();
  if (hidden && !(await authed(request, env))) return RESP({ error: '文章不存在或尚未公开' }, 404);
  return RESP(post, 200, { 'Cache-Control': 'private, no-store' });
}

export async function onRequestPost({ request, env }) {
  if (!(await authed(request, env))) return RESP({ error: 'X-Admin-Token 校验失败' }, 401);
  let post;
  try { post = await request.json(); } catch (e) {
    return RESP({ error: '请求体不是合法 JSON' }, 400);
  }
  if (!post.id || !post.title || !post.date) {
    return RESP({ error: '文章缺少 id / title / date 字段' }, 400);
  }
  if (post.publishAt != null && post.publishAt !== '' &&
      (typeof post.publishAt !== 'string' || !Number.isFinite(Date.parse(post.publishAt)))) {
    return RESP({ error: 'publishAt 必须是有效的日期时间字符串' }, 400);
  }
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
