
// POST   /api/upload        上传图片到 R2 图床，返回 { ok, url, key, size, contentType }
// DELETE /api/upload?key=   删除一张图片
// 请求体两种形式（兼顾网页与第三方工具）：
//   1. multipart/form-data —— 网页上传、PicGo「自定义 Web 上传」，文件字段名任意（优先取 file）
//   2. 原始图片二进制 —— ShareX 等工具直接 POST 文件本体，扩展名由 Content-Type 推断

const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/avif': 'avif', 'image/bmp': 'bmp', 'image/x-icon': 'ico',
};
const MAX_SIZE = 20 * 1024 * 1024; // 单张图片上限 20MB

function authed(request, env) {
  const t = env.ADMIN_TOKEN;
  if (!t) return false;
  const h = (request.headers.get('X-Admin-Token') || '').trim();
  if (h) return h === t;
  const auth = request.headers.get('Authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim() === t;
  const q = (new URL(request.url).searchParams.get('token') || '').trim();
  return q !== '' && q === t;
}

// 对外访问地址：优先用自定义 CDN 域名（环境变量 IMG_CDN_URL），否则走本站 /images/ 读取接口
function publicUrl(request, env, key) {
  const cdn = (env.IMG_CDN_URL || '').trim().replace(/\/+$/, '');
  return cdn ? cdn + '/' + key : new URL('/images/' + key, request.url).toString();
}

function pickExt(name, type) {
  const m = (name || '').match(/\.([a-z0-9]{2,5})$/i);
  if (m) return m[1].toLowerCase();
  return MIME_EXT[(type || '').toLowerCase()] || 'bin';
}


function randKey(ext) {
  const d = new Date();
  const dir = `img/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const rand = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())).replace(/-/g, '').slice(0, 12);
  return `${dir}/${Date.now().toString(36)}-${rand}.${ext}`;
}

const isFile = v => v && typeof v === 'object' && typeof v.arrayBuffer === 'function';

async function save(request, env, buf, type, name) {
  const key = randKey(pickExt(name, type));
  await env.IMG_R2.put(key, buf, {
    httpMetadata: {
      contentType: type || 'application/octet-stream',
      cacheControl: 'public, max-age=31536000, immutable',
    }
  });
  return RESP({ ok: true, url: publicUrl(request, env, key), key, size: buf.byteLength, contentType: type || null });
}

export async function onRequestPost({ request, env }) {
  if (!authed(request, env)) return RESP({ error: '鉴权失败：X-Admin-Token 不正确' }, 401);
  if (!env.IMG_R2) return RESP({ error: '未绑定 R2 存储桶：请在 Pages 设置里添加变量 IMG_R2 并指向图床桶' }, 500);

  const ct = (request.headers.get('Content-Type') || '').toLowerCase();

 
  if (ct.startsWith('image/')) {
    const mime = ct.split(';')[0].trim();
    if (!MIME_EXT[mime]) return RESP({ error: '不支持的图片类型：' + mime }, 400);
    const buf = await request.arrayBuffer();
    if (!buf.byteLength) return RESP({ error: '请求体为空' }, 400);
    if (buf.byteLength > MAX_SIZE) return RESP({ error: '图片超过 20MB 限制' }, 400);
    return save(request, env, buf, mime, new URL(request.url).searchParams.get('filename') || '');
  }

  
  if (ct.includes('multipart/form-data')) {
    const form = await request.formData();
    let file = form.get('file');
    if (!isFile(file)) for (const v of form.values()) { if (isFile(v)) { file = v; break; } }
    if (!isFile(file)) return RESP({ error: '表单里没有文件字段（建议字段名为 file）' }, 400);
    if (file.size > MAX_SIZE) return RESP({ error: '图片超过 20MB 限制' }, 400);
    const type = (file.type || '').toLowerCase().split(';')[0];
    if (type && !MIME_EXT[type]) return RESP({ error: '不支持的图片类型：' + (type || '未知') }, 400);
    return save(request, env, await file.arrayBuffer(), type, file.name || '');
  }

  return RESP({ error: '不支持的请求体：请用 multipart/form-data（字段 file）或直接发送图片二进制' }, 400);
}

export async function onRequestDelete({ request, env }) {
  if (!authed(request, env)) return RESP({ error: '鉴权失败：X-Admin-Token 不正确' }, 401);
  if (!env.IMG_R2) return RESP({ error: '未绑定 R2 存储桶（IMG_R2）' }, 500);
  const key = new URL(request.url).searchParams.get('key');
  if (!key || !key.startsWith('img/')) return RESP({ error: '缺少或非法 ?key= 参数' }, 400);
  await env.IMG_R2.delete(key);
  return RESP({ ok: true });
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token, Authorization',
  'Access-Control-Max-Age': '86400',
};
function RESP(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}
