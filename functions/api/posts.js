import { RESP, onRequestOptions, readList, textLen } from '../_lib.js';
export { onRequestOptions };

// GET /api/posts —— 公开文章列表。
// 列表不返回正文 content（正文由文章页按 id 从 GET /api/post?id= 获取），
// 但附带 words（正文字符数）供前端计算阅读时长与总字数。
export async function onRequestGet({ env }) {
  const posts = await readList(env, 'posts');
  const now = Date.now();
  // 与 GET /api/post 口径一致：publishAt 无法解析（脏数据）时视为没有定时，照常公开
  const at = post => {
    const t = Date.parse(post.publishAt || '');
    return Number.isFinite(t) ? t : NaN;
  };
  const visible = posts.filter(post => {
    const t = at(post);
    return !Number.isFinite(t) || t <= now;
  });
  const upcoming = posts.map(at).filter(t => Number.isFinite(t) && t > now);
  const nextPublishAt = upcoming.length ? new Date(Math.min(...upcoming)).toISOString() : '';
  const list = visible.map(post => {
    const { content, ...rest } = post;
    return { ...rest, words: textLen(content) };
  });
  return RESP(list, 200, {
    ...(nextPublishAt ? { 'X-Next-Publish-At': nextPublishAt } : {}),
    'Cache-Control': 'private, no-store',
  });
}
