import { RESP, onRequestOptions, authed, readList } from '../../_lib.js';
export { onRequestOptions };

// GET /api/admin/posts —— 后台读取全部文章（含定时发布，需鉴权），返回完整正文供编辑。
export async function onRequestGet({ request, env }) {
  if (!(await authed(request, env))) return RESP({ error: 'X-Admin-Token 校验失败' }, 401);
  try {
    const posts = await readList(env, 'posts', { strict: true });
    return RESP(posts, 200, { 'Cache-Control': 'private, no-store' });
  } catch (e) {
    return RESP({ error: e.message }, 500);
  }
}
