export async function onRequestGet({ request, env }) {
  if (!env.ADMIN_TOKEN || request.headers.get('X-Admin-Token') !== env.ADMIN_TOKEN) {
    return RESP({ error: 'X-Admin-Token 校验失败' }, 401);
  }
  const raw = await env.BLOG_KV.get('posts');
  let data = [];
  try { data = raw ? JSON.parse(raw) : []; } catch (e) { data = []; }
  return RESP(Array.isArray(data) ? data : []);
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
};
function RESP(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', ...CORS },
  });
}
