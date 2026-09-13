
// GET /images/<key> —— 访问层：从 R2 读取图片返回给浏览器。
export async function onRequestGet({ request, params, env }) {
  if (!env.IMG_R2) return new Response('未绑定 R2 存储桶（IMG_R2）', { status: 500 });
  const key = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  if (!key.startsWith('img/')) return new Response('Not found', { status: 404 });

  const obj = await env.IMG_R2.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = {
    'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable', 
    'ETag': obj.httpEtag,
    'Access-Control-Allow-Origin': '*',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    'X-Content-Type-Options': 'nosniff',
  };
  if (request.headers.get('If-None-Match') === obj.httpEtag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(obj.body, { headers });
}
