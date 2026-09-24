
export async function onRequestGet({ env }) {
  const raw = await env.BLOG_KV.get('posts');
  let data = [];
  try { data = raw ? JSON.parse(raw) : []; } catch (e) { data = []; }
  const now = Date.now();
  const allPosts = Array.isArray(data) ? data : [];
  const visible = allPosts.filter(post => !post.publishAt || (Number.isFinite(Date.parse(post.publishAt)) && Date.parse(post.publishAt) <= now));
  const upcoming = allPosts.map(post => Date.parse(post.publishAt)).filter(time => Number.isFinite(time) && time > now);
  const nextPublishAt = upcoming.length ? new Date(Math.min(...upcoming)).toISOString() : '';
  return RESP(visible, 200, nextPublishAt ? { 'X-Next-Publish-At': nextPublishAt } : {});
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
  'Access-Control-Expose-Headers': 'X-Next-Publish-At',
};
function RESP(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', ...CORS, ...extraHeaders },
  });
}