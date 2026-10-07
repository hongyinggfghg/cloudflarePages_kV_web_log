import { RESP, onRequestOptions, readList, textLen } from '../_lib.js';
export { onRequestOptions };

// GET /api/posts —— 公开文章列表。
// 列表不返回正文 content（正文由文章页按 id 从 GET /api/post?id= 获取），
// 但附带 words（正文字符数）供前端计算阅读时长与总字数。
export async function onRequestGet({ env }) {
  const posts = await readList(env, 'posts');
  const now = Date.now();
  const visible = posts.filter(post => !post.publishAt || (Number.isFinite(Date.parse(post.publishAt)) && Date.parse(post.publishAt) <= now));
  const upcoming = posts.map(post => Date.parse(post.publishAt)).filter(time => Number.isFinite(time) && time > now);
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
