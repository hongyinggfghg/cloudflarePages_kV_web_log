import { RESP, onRequestOptions, authed, readList, byDateDesc } from '../_lib.js';
export { onRequestOptions };

export async function onRequestGet({ env }) {
  const data = await readList(env, 'timeline');
  return RESP(data);
}

export async function onRequestPost({ request, env }) {
  if (!(await authed(request, env))) return RESP({ error: 'X-Admin-Token 校验失败' }, 401);
  let item;
  try { item = await request.json(); } catch (e) {
    return RESP({ error: '请求体不是合法 JSON' }, 400);
  }
  if (!item.date || !item.text) return RESP({ error: '缺少 date / text 字段' }, 400);
  let list;
  try {
    list = await readList(env, 'timeline', { strict: true });
  } catch (e) {
    return RESP({ error: e.message }, 500);
  }
  list.push(item);
  list.sort(byDateDesc);
  await env.BLOG_KV.put('timeline', JSON.stringify(list));
  return RESP({ ok: true, total: list.length });
}

export async function onRequestPut({ request, env }) {
  if (!(await authed(request, env))) return RESP({ error: 'X-Admin-Token 校验失败' }, 401);
  let body;
  try { body = await request.json(); } catch (e) {
    return RESP({ error: '请求体不是合法 JSON' }, 400);
  }
  const i = parseInt(body.i, 10);
  if (!Number.isInteger(i) || !body.date || !body.text) {
    return RESP({ error: '缺少 i / date / text 字段' }, 400);
  }
  let list;
  try {
    list = await readList(env, 'timeline', { strict: true });
  } catch (e) {
    return RESP({ error: e.message }, 500);
  }
  if (i < 0 || i >= list.length) return RESP({ error: '条目不存在，请刷新列表后重试' }, 404);
  list[i] = { date: body.date, text: body.text };
  list.sort(byDateDesc);
  await env.BLOG_KV.put('timeline', JSON.stringify(list));
  return RESP({ ok: true, total: list.length });
}

export async function onRequestDelete({ request, env }) {
  if (!(await authed(request, env))) return RESP({ error: 'X-Admin-Token 校验失败' }, 401);
  const i = parseInt(new URL(request.url).searchParams.get('i'), 10);
  let list;
  try {
    list = await readList(env, 'timeline', { strict: true });
  } catch (e) {
    return RESP({ error: e.message }, 500);
  }
  if (!Number.isInteger(i) || i < 0 || i >= list.length) {
    return RESP({ error: '条目不存在，请刷新列表后重试' }, 404);
  }
  list.splice(i, 1);
  await env.BLOG_KV.put('timeline', JSON.stringify(list));
  return RESP({ ok: true, total: list.length });
}
