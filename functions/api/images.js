
// GET /api/images —— 列出图床里的图片（需鉴权），配合 admin.html 的图床管理卡片使用。
// R2 单次 list() 上限 1000 条，因此支持游标分页：首次不带参数，之后带上一页返回的 ?cursor= 继续；
// 返回的 cursor 为 null / truncated 为 false 时表示已经枚举到末尾。
export async function onRequestGet({ request, env }) {
  const t = env.ADMIN_TOKEN;
  const h = (request.headers.get('X-Admin-Token') || '').trim();
  if (!t || h !== t) return RESP({ error: '鉴权失败：X-Admin-Token 不正确' }, 401);
  if (!env.IMG_R2) return RESP({ error: '未绑定 R2 存储桶（IMG_R2）' }, 500);
  const url = new URL(request.url);
  try {
    const listed = await env.IMG_R2.list({
      prefix: 'img/',
      limit: 1000,
      cursor: url.searchParams.get('cursor') || undefined,
    });
    const cdn = (env.IMG_CDN_URL || '').trim().replace(/\/+$/, '');
    const images = listed.objects
      .map(o => ({
        key: o.key,
        size: o.size,
        uploaded: o.uploaded instanceof Date ? o.uploaded.toISOString() : String(o.uploaded),
        url: cdn ? `${cdn}/${o.key}` : `${url.origin}/images/${o.key}`,
      }))
      .sort((a, b) => (a.key < b.key ? 1 : -1)); // 键里带时间戳，倒序即最新在前
    return RESP({
      images,
      truncated: !!listed.truncated,
      cursor: listed.truncated && listed.cursor ? listed.cursor : null,
    });
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
