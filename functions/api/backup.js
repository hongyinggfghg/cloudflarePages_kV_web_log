export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_TOKEN || request.headers.get('X-Admin-Token') !== env.ADMIN_TOKEN) {
    return RESP({ error: 'X-Admin-Token 校验失败' }, 401);
  }
  if (!env.BLOG_KV) return RESP({ error: '未绑定 KV 命名空间（BLOG_KV）' }, 500);

  let backup;
  try { backup = await request.json(); } catch (e) {
    return RESP({ error: '请求体不是合法 JSON' }, 400);
  }
  if (!backup || !Array.isArray(backup.posts) || !Array.isArray(backup.timeline)) {
    return RESP({ error: '备份必须包含 posts 和 timeline 数组' }, 400);
  }

  const ids = new Set();
  for (const post of backup.posts) {
    if (!post || typeof post.id !== 'string' || !post.id.trim() || typeof post.title !== 'string' ||
        typeof post.date !== 'string' || typeof post.content !== 'string') {
      return RESP({ error: '文章条目缺少有效的 id、title、date 或 content' }, 400);
    }
    if (post.publishAt != null && post.publishAt !== '' &&
        (typeof post.publishAt !== 'string' || !Number.isFinite(Date.parse(post.publishAt)))) {
      return RESP({ error: '文章 publishAt 必须是有效的日期时间字符串' }, 400);
    }
    if (ids.has(post.id)) return RESP({ error: '备份中有重复的文章 ID：' + post.id }, 400);
    ids.add(post.id);
  }
  for (const item of backup.timeline) {
    if (!item || typeof item.date !== 'string' || typeof item.text !== 'string') {
      return RESP({ error: '时间线条目缺少有效的 date 或 text' }, 400);
    }
  }

  try {
    await Promise.all([
      env.BLOG_KV.put('posts', JSON.stringify(backup.posts, null, 2)),
      env.BLOG_KV.put('timeline', JSON.stringify(backup.timeline, null, 2)),
    ]);
    return RESP({ ok: true, posts: backup.posts.length, timeline: backup.timeline.length });
  } catch (e) {
    return RESP({ error: '写入 KV 失败：' + e.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
};
function RESP(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}
