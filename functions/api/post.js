
export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_TOKEN || request.headers.get('X-Admin-Token') !== env.ADMIN_TOKEN) {
    return RESP({ error: 'X-Admin-Token 校验失败' }, 401);
  }
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
  const raw = await env.BLOG_KV.get('posts');
  let posts = [];
  try { posts = raw ? JSON.parse(raw) : []; } catch (e) {}
  const i = posts.findIndex(p => p.id === post.id);
  if (i >= 0) posts[i] = post; else posts.push(post); 
  posts.sort((a, b) => (a.date < b.date ? 1 : -1));
  await env.BLOG_KV.put('posts', JSON.stringify(posts, null, 2));
  return RESP({ ok: true, action: i >= 0 ? 'updated' : 'created', total: posts.length });
}

export async function onRequestDelete({ request, env }) {
  if (!env.ADMIN_TOKEN || request.headers.get('X-Admin-Token') !== env.ADMIN_TOKEN) {
    return RESP({ error: 'X-Admin-Token 校验失败' }, 401);
  }
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return RESP({ error: '缺少 ?id= 参数' }, 400);
  const raw = await env.BLOG_KV.get('posts');
  let posts = [];
  try { posts = raw ? JSON.parse(raw) : []; } catch (e) {}
  const next = posts.filter(p => p.id !== id);
  if (next.length === posts.length) return RESP({ error: '没有找到 ' + id }, 404);
  await env.BLOG_KV.put('posts', JSON.stringify(next, null, 2));
  return RESP({ ok: true, total: next.length });
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
};
function RESP(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}