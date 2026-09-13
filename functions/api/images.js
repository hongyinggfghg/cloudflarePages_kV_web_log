
// GET /api/images —— 列出图床里的图片（需鉴权），配合 admin.html 的图床管理卡片使用
export async function onRequestGet({ request, env }) {
  const t = env.ADMIN_TOKEN;
  const h = (request.headers.get('X-Admin-Token') || '').trim();
  if (!t || h !== t) return RESP({ error: '鉴权失败：X-Admin-Token 不正确' }, 401);
  if (!env.IMG_R2) return RESP({ error: '未绑定 R2 存储桶（IMG_R2）' }, 500);
  try {
    const listed = await env.IMG_R2.list({ prefix: 'img/', limit: 1000 });
    const cdn = (env.IMG_CDN_URL || '').trim().replace(/\/+$/, '');
    const origin = new URL(request.url).origin;
    const images = listed.objects
      .map(o => ({
        key: o.key,
        size: o.size,
        uploaded: o.uploaded instanceof Date ? o.uploaded.toISOString() : String(o.uploaded),
        url: cdn ? `${cdn}/${o.key}` : `${origin}/images/${o.key}`,
      }))
      .sort((a, b) => (a.key < b.key ? 1 : -1)); 
    return RESP({ images, truncated: !!listed.truncated });
  } catch (e) {
    return RESP({ error: '读取 R2 列表失败：' + e.message }, 500);
  }
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
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}
