/* ============================================================
   admin.js —— 发布后台逻辑（依赖 sanitize.js 提供的 BlogHTML 工具）
   ============================================================ */
(function () {
  'use strict';
  const { esc, plainCodeBlocks } = window.BlogHTML;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const today = () => new Date().toISOString().slice(0, 10);

  // 分类单点维护：改这里即可，下拉选项会自动填充
  const CATS = ['前端', '生活', 'game'];


  const root = document.documentElement;
  root.dataset.theme = localStorage.getItem('hy-blog-theme') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  function syncTheme() {
    $('#themeBtn .msr').textContent = root.dataset.theme === 'dark' ? 'light_mode' : 'dark_mode';
  }
  $('#themeBtn').addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('hy-blog-theme', root.dataset.theme);
    syncTheme();
  });
  syncTheme();


  const LS = { base: 'hy-admin-base', token: 'hy-admin-token', remember: 'hy-admin-remember' };
  const apiBaseEl = $('#apiBase'), tokenEl = $('#token'), rememberEl = $('#remember');


  // 已保存的地址优先；为空时才自动填当前站点
  apiBaseEl.value = localStorage.getItem(LS.base) ||
    (location.protocol.startsWith('http') ? location.origin : '');
  rememberEl.checked = localStorage.getItem(LS.remember) !== '0';
  if (rememberEl.checked) tokenEl.value = localStorage.getItem(LS.token) || '';

  apiBaseEl.addEventListener('input', () => localStorage.setItem(LS.base, apiBaseEl.value.trim()));
  tokenEl.addEventListener('input', () => { if (rememberEl.checked) localStorage.setItem(LS.token, tokenEl.value); });
  rememberEl.addEventListener('change', () => {
    localStorage.setItem(LS.remember, rememberEl.checked ? '1' : '0');
    if (!rememberEl.checked) localStorage.removeItem(LS.token);
    else localStorage.setItem(LS.token, tokenEl.value);
  });

  const base = () => (apiBaseEl.value || '').trim().replace(/\/+$/, '');
  const token = () => tokenEl.value.trim();


  const msgEl = $('#msg'); let msgTimer;
  // 文本在内部统一转义，调用点直接传原始文字即可
  function msg(type, text, icon) {
    msgEl.className = 'msg show ' + type;
    msgEl.innerHTML = `<span class="msr">${icon || (type === 'err' ? 'error' : type === 'ok' ? 'check_circle' : 'info')}</span><span>${esc(text)}</span>`;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => msgEl.classList.remove('show'), 5000);
  }
  function conn(text, icon, state) {
    const el = $('#connStatus');
    el.className = 'conn-status' + (state ? ' ' + state : '');
    el.innerHTML = `<span class="msr">${icon}</span>${text}`;
  }


  async function fetchJSON(url, opts) {
    const r = await fetch(url, opts);
    let data = {};
    try { data = await r.json(); } catch (e) { }
    if (!r.ok) throw Object.assign(new Error(data.error || ('HTTP ' + r.status)), { status: r.status });
    return data;
  }
  const fetchPosts = () => fetchJSON(base() + '/api/admin/posts?t=' + Date.now(), { headers: { 'X-Admin-Token': token() } });


  let posts = [];
  async function testAndLoad(silent) {
    if (!base()) { conn('请填写 API 地址', 'cloud_off', 'err'); return false; }
    if (!token()) { conn('请填写发布密码', 'key', 'err'); return false; }
    try {
      posts = await fetchPosts();
      conn(`已连接 · 云端 ${posts.length} 篇文章`, 'cloud_done', 'ok');
      renderCloud();
      loadImages();
      return true;
    } catch (e) {
      conn('连接失败', 'cloud_off', 'err');
      if (!silent) msg('err', '连接失败：' + (e.status ? '接口返回 ' + e.status + '，请确认api' : '网络错误，请检查 API 地址是否正确'), 'cloud_off');
      return false;
    }
  }
  $('#testBtn').addEventListener('click', () => testAndLoad(false));
  $('#refreshBtn').addEventListener('click', () => testAndLoad(true));

  function renderCloud() {
    const box = $('#cloudList');
    if (!posts.length) { box.innerHTML = '<p class="placeholder">KV 里还没有文章，发布第一篇吧！</p>'; return; }
    const editingId = $('#pId').value.trim();
    box.innerHTML = posts.map(p => `
      <div class="cloud-item" data-id="${esc(p.id)}" tabindex="0" role="group" aria-label="文章：${esc(p.title)}">
        <div class="ci-main">
          <b>${p.featured ? '<span class="msr star" title="置顶">star</span>' : ''}${esc(p.title)}</b>
          <span>${esc(p.date)} · ${esc(p.category)}${p.publishAt && Date.parse(p.publishAt) > Date.now() ? ' · <i class="editing-flag">定时至 ' + esc(new Date(p.publishAt).toLocaleString()) + '</i>' : ''}${p.id === editingId ? ' · <i class="editing-flag">编辑中</i>' : ''}</span>
        </div>
        <div class="ci-actions">
          <button class="icon-btn sm" data-act="edit" title="载入编辑"><span class="msr">edit</span></button>
          <button class="icon-btn sm" data-act="del" title="删除"><span class="msr">delete</span></button>
        </div>
      </div>`).join('');
  }
  $('#cloudList').addEventListener('click', e => {
    const item = e.target.closest('.cloud-item');
    if (!item) return;
    const p = posts.find(x => x.id === item.dataset.id);
    if (!p) return;
    const act = e.target.closest('[data-act]');
    if (!act || act.dataset.act === 'edit') fillForm(p);
    else if (act.dataset.act === 'del') delPost(p);
  });
  $('#cloudList').addEventListener('keydown', e => {
    if ((e.key !== 'Enter' && e.key !== ' ') || e.target.closest('button')) return;
    const item = e.target.closest('.cloud-item');
    const p = item && posts.find(x => x.id === item.dataset.id);
    if (p) { e.preventDefault(); fillForm(p); }
  });


  const contentEl = $('#content');
  const LOCAL_DRAFTS_KEY = 'hy-blog-local-drafts-v1';
  let currentDraftId = null;
  let draftSaveTimer = null;

  function readLocalDrafts() {
    try {
      const data = JSON.parse(localStorage.getItem(LOCAL_DRAFTS_KEY) || '[]');
      return Array.isArray(data) ? data.filter(d => d && typeof d.draftId === 'string' && d.post && typeof d.post === 'object') : [];
    } catch (e) { return []; }
  }
  function renderLocalDrafts() {
    const box = $('#localDraftList');
    const drafts = readLocalDrafts();
    if (!drafts.length) {
      box.innerHTML = '<p class="placeholder">还没有本地草稿</p>';
      return;
    }
    box.innerHTML = drafts.map(d => `
      <div class="cloud-item" data-draft-id="${esc(d.draftId)}" tabindex="0" role="group" aria-label="本地草稿：${esc(d.post.title || d.post.id || '未命名草稿')}">
        <div class="ci-main">
          <b>${esc(d.post.title || d.post.id || '未命名草稿')}</b>
          <span>保存于 ${esc(new Date(d.updatedAt || Date.now()).toLocaleString())}${d.draftId === currentDraftId ? ' · <i class="editing-flag">编辑中</i>' : ''}</span>
        </div>
        <div class="ci-actions">
          <button class="icon-btn sm" data-draft-act="edit" title="载入编辑"><span class="msr">edit</span></button>
          <button class="icon-btn sm" data-draft-act="delete" title="删除草稿"><span class="msr">delete</span></button>
        </div>
      </div>`).join('');
  }
  function draftSnapshot() {
    const post = {
      id: $('#pId').value.trim(),
      title: $('#pTitle').value.trim(),
      category: $('#pCat').value,
      date: $('#pDate').value || today(),
      excerpt: $('#pExcerpt').value.trim(),
      tags: $('#pTags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean),
      heat: +$('#pHeat').value || 20,
      featured: $('#featured').checked,
      seed: $('#pSeed').value.trim(),
      content: contentEl.value,
      publishAtLocal: $('#pPublishAt').value,
      cover: $('#pCover').value.trim()
    };
    return post;
  }
  function saveLocalDraft(silent) {
    const post = draftSnapshot();
    if (!post.id && !post.title && !post.content.trim()) {
      if (!silent) msg('err', '先填写文章 ID、标题或正文，再保存草稿', 'edit');
      return false;
    }
    const drafts = readLocalDrafts();
    const draftId = currentDraftId || (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
    const record = { draftId, updatedAt: new Date().toISOString(), post };
    const index = drafts.findIndex(d => d.draftId === draftId);
    if (index >= 0) drafts[index] = record; else drafts.unshift(record);
    try {
      localStorage.setItem(LOCAL_DRAFTS_KEY, JSON.stringify(drafts));
      currentDraftId = draftId;
      renderLocalDrafts();
      $('#draftSaveStatus').textContent = '已保存到此浏览器 ' + new Date().toLocaleTimeString();
      if (!silent) msg('ok', '草稿已保存到此浏览器', 'save');
      return true;
    } catch (e) {
      $('#draftSaveStatus').textContent = '本地自动保存失败，请检查浏览器存储空间';
      if (!silent) msg('err', '本地草稿保存失败：浏览器存储空间可能不足', 'error');
      return false;
    }
  }
  function removeCurrentDraft() {
    if (!currentDraftId) return;
    const drafts = readLocalDrafts().filter(d => d.draftId !== currentDraftId);
    try { localStorage.setItem(LOCAL_DRAFTS_KEY, JSON.stringify(drafts)); } catch (e) { }
    currentDraftId = null;
    renderLocalDrafts();
  }
  function queueDraftSave() {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => saveLocalDraft(true), 900);
  }
  $('#saveDraftBtn').addEventListener('click', () => saveLocalDraft(false));
  $('#localDraftList').addEventListener('click', e => {
    const row = e.target.closest('[data-draft-id]');
    const action = e.target.closest('[data-draft-act]');
    if (!row) return;
    const draft = readLocalDrafts().find(d => d.draftId === row.dataset.draftId);
    if (!draft) return;
    if (!action || action.dataset.draftAct === 'edit') {
      fillForm(draft.post, draft.draftId);
      msg('info', '已载入本地草稿；编辑内容会继续保存在此浏览器', 'edit');
    } else if (action.dataset.draftAct === 'delete') {
      if (!confirm(`删除本地草稿《${draft.post.title || draft.post.id || '未命名草稿'}》？`)) return;
      const remaining = readLocalDrafts().filter(d => d.draftId !== draft.draftId);
      localStorage.setItem(LOCAL_DRAFTS_KEY, JSON.stringify(remaining));
      if (currentDraftId === draft.draftId) { currentDraftId = null; clearForm(); }
      renderLocalDrafts();
      msg('ok', '本地草稿已删除', 'delete');
    }
  });
  $('#localDraftList').addEventListener('keydown', e => {
    if ((e.key !== 'Enter' && e.key !== ' ') || e.target.closest('button')) return;
    const row = e.target.closest('[data-draft-id]');
    const draft = row && readLocalDrafts().find(d => d.draftId === row.dataset.draftId);
    if (draft) {
      e.preventDefault();
      fillForm(draft.post, draft.draftId);
      msg('info', '已载入本地草稿；编辑内容会继续保存在此浏览器', 'edit');
    }
  });
  $('.editor-card').addEventListener('input', queueDraftSave);
  $('.editor-card').addEventListener('change', queueDraftSave);

  function toDatetimeLocal(iso) {
    const date = new Date(iso);
    return Number.isFinite(date.getTime())
      ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      : '';
  }

  function badge(id) {
    const el = $('#editingBadge');
    if (id) { el.hidden = false; el.textContent = '正在编辑：' + id + '（发布将覆盖）'; }
    else el.hidden = true;
  }
  function fillForm(p, localDraftId = null) {
    if (draftSaveTimer) { clearTimeout(draftSaveTimer); saveLocalDraft(true); }
    $('#pId').value = p.id || '';
    $('#pTitle').value = p.title || '';
    $('#pCat').value = CATS.includes(p.category) ? p.category : CATS[0];
    $('#pDate').value = String(p.date || '').slice(0, 10) || today();
    $('#pPublishAt').value = p.publishAtLocal || (Date.parse(p.publishAt) > Date.now() ? toDatetimeLocal(p.publishAt) : '');
    $('#pExcerpt').value = p.excerpt || '';
    $('#pTags').value = (p.tags || []).join(', ');
    $('#pHeat').value = p.heat != null ? p.heat : 20;
    $('#pSeed').value = p.seed || '';
    $('#pCover').value = p.cover || '';
    updateCoverPreview();
    $('#featured').checked = !!p.featured;
    contentEl.value = p.content || '';
    currentDraftId = localDraftId;
    $('#draftSaveStatus').textContent = localDraftId ? '正在编辑本地草稿' : '';
    badge(p.id);
    renderLocalDrafts(); renderCloud();
    updateStats(); renderPreview(); clearInvalid();
    msg('info', `已载入《${p.title}》，点“发布文章”即可覆盖更新`, 'edit');
    $('.editor-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function clearForm() {
    clearTimeout(draftSaveTimer);
    ['pId', 'pTitle', 'pExcerpt', 'pTags', 'pSeed', 'pCover'].forEach(id => $('#' + id).value = '');
    updateCoverPreview();
    $('#pCat').value = CATS[0];
    $('#pDate').value = today();
    $('#pPublishAt').value = '';
    $('#draftSaveStatus').textContent = '';
    currentDraftId = null;
    $('#pHeat').value = 20;
    $('#featured').checked = false;
    contentEl.value = '';
    badge(null); clearInvalid(); updateStats(); renderPreview();
    renderLocalDrafts(); renderCloud();
  }
  function clearInvalid() { $$('.invalid').forEach(el => el.classList.remove('invalid')); }

  $('#newBtn').addEventListener('click', () => {
    if (draftSaveTimer) { clearTimeout(draftSaveTimer); saveLocalDraft(true); }
    clearForm();
    msg('info', '已清空，开始写新文章吧', 'add');
    $('#pId').focus();
  });


  function collectPost() {
    clearInvalid();
    const id = $('#pId').value.trim();
    const title = $('#pTitle').value.trim();
    const content = contentEl.value.trim();
    const missing = [];
    if (!id) missing.push('#pId');
    if (!title) missing.push('#pTitle');
    if (!content) missing.push('#content');
    if (missing.length) {
      missing.forEach(s => $(s).classList.add('invalid'));
      msg('err', '文章 ID、标题、正文为必填项（红框处）', 'error');
      return null;
    }
    const tags = $('#pTags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    const autoExcerpt = content.replace(/<[^>]+>/g, '').replace(/\s/g, '').slice(0, 60);
    const post = {
      id, title, content,
      category: $('#pCat').value,
      date: $('#pDate').value || today(),
      excerpt: $('#pExcerpt').value.trim() || autoExcerpt,
      tags: tags.length ? tags : ['未分类'],
      heat: +$('#pHeat').value || 20,
      featured: $('#featured').checked,
      seed: $('#pSeed').value.trim() || id
    };
    const publishAtValue = $('#pPublishAt').value;
    if (publishAtValue) {
      const publishAt = new Date(publishAtValue);
      if (!Number.isFinite(publishAt.getTime()) || publishAt.getTime() <= Date.now()) {
        $('#pPublishAt').classList.add('invalid');
        msg('err', '发布时间必须晚于当前时间；留空即可立即发布', 'schedule');
        return null;
      }
      post.publishAt = publishAt.toISOString();
    }
    const cover = $('#pCover').value.trim();
    if (cover) post.cover = cover;
    return post;
  }


  $('#publishBtn').addEventListener('click', async () => {
    clearTimeout(draftSaveTimer);
    const post = collectPost();
    if (!post) { saveLocalDraft(true); return; }
    saveLocalDraft(true);
    if (!token()) return msg('err', '请先填写发布密码（ADMIN_TOKEN）', 'key');
    const btn = $('#publishBtn');
    btn.disabled = true;
    try {
      const data = await fetchJSON(base() + '/api/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token() },
        body: JSON.stringify(post)
      });
      removeCurrentDraft();
      const scheduled = post.publishAt && Date.parse(post.publishAt) > Date.now();
      msg('ok', scheduled ? `已保存定时文章《${post.title}》，将在 ${new Date(post.publishAt).toLocaleString()} 公开` : `发布成功：${data.action === 'updated' ? '已覆盖更新' : '新建'}《${post.title}》，云端共 ${data.total} 篇。刷新博客即可看到`, scheduled ? 'schedule' : 'cloud_done');
      await testAndLoad(true);
    } catch (e) {
      msg('err', e.status === 401 ? '密码不对：请核对ADMIN_TOKEN' : '发布失败：' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });


  async function delPost(p) {
    if (!confirm(`确定删除《${p.title}》？此操作不可恢复。`)) return;
    try {
      await fetchJSON(base() + '/api/post?id=' + encodeURIComponent(p.id), {
        method: 'DELETE',
        headers: { 'X-Admin-Token': token() }
      });
      msg('ok', '已删除《' + p.title + '》', 'delete');
      if ($('#pId').value.trim() === p.id) badge(null);
      await testAndLoad(true);
    } catch (e) {
      if (e.status === 405) msg('err', '当前后端还不支持删除', 'help');
      else if (e.status === 401) msg('err', '密码不对，无法删除', 'key');
      else msg('err', '删除失败：' + e.message, 'error');
    }
  }


  const SNIPPETS = {
    h2: s => `<h2>${s || '小标题'}</h2>\n`,
    h3: s => `<h3>${s || '三级标题'}</h3>\n`,
    p: s => `<p>${s || '段落文字'}</p>\n`,
    b: s => `<strong>${s || '加粗文字'}</strong>`,
    code: s => `<code>${s || '行内代码'}</code>`,
    pre: s => `<pre><code>${s || '# 代码'}</code></pre>\n`,
    quote: s => `<blockquote>${s || '引用的文字'}</blockquote>\n`,
    ul: s => `<ul>\n  <li>${s || '条目一'}</li>\n  <li>条目二</li>\n</ul>\n`,
    img: s => `<figure><img src="https://loremflickr.com/900/600/landscape?lock=1" alt="${s || '图片说明'}" loading="lazy"><figcaption>${s || '图片说明'}</figcaption></figure>\n`,
    link: s => `<a href="https://" target="_blank" rel="noopener">${s || '链接文字'}</a>`
  };
  $$('.insert-bar .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const start = contentEl.selectionStart, end = contentEl.selectionEnd;
      const sel = contentEl.value.slice(start, end);
      const out = (SNIPPETS[chip.dataset.ins] || (s => s))(sel);
      contentEl.setRangeText(out, start, end, 'end');
      queueDraftSave();
      contentEl.focus();
      updateStats(); renderPreview();
    });
  });


  function updateStats() {
    const n = contentEl.value.replace(/<[^>]+>/g, '').replace(/\s/g, '').length;
    $('#stats').textContent = `共 ${n} 字 · 约 ${Math.max(1, Math.round(n / 400))} 分钟`;
  }
  contentEl.addEventListener('input', () => { updateStats(); renderPreview(); });
  contentEl.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $('#publishBtn').click(); }
  });

  let previewOn = false;
  function renderPreview() {
    if (!previewOn) return;
    $('#preview').innerHTML = contentEl.value ? window.sanitizePostHtml(plainCodeBlocks(contentEl.value)) : '<p class="placeholder">正文为空</p>';
  }
  $('#previewBtn').addEventListener('click', () => {
    previewOn = !previewOn;
    $('#previewBox').hidden = !previewOn;
    $('#previewBtn .msr').textContent = previewOn ? 'visibility_off' : 'visibility';
    renderPreview();
  });


  async function loadTimeline() {
    try {
      const list = await fetchJSON(base() + '/api/timeline?t=' + Date.now());
      renderTimeline(Array.isArray(list) ? list : []);
    } catch (e) { /* 未连接时静默 */ }
  }
  let tlCache = [], tlEditing = -1;
  function renderTimeline(list) {
    tlCache = list;
    $('#tlList').innerHTML = list.length
      ? list.map((item, i) => `
        <div class="tl-row${i === tlEditing ? ' editing' : ''}" data-i="${i}">
          <div class="tl-top">
            <div class="tl-main">
              <b>${esc(item.date)}${i === tlEditing ? ' · <i class="editing-flag">编辑中</i>' : ''}</b>
              <p>${esc(item.text)}</p>
            </div>
            <div class="ci-actions">
              <button class="icon-btn sm" data-act="edit" title="编辑这条"><span class="msr">edit</span></button>
              <button class="icon-btn sm" data-act="del" title="删除这条"><span class="msr">delete</span></button>
            </div>
          </div>
        </div>`).join('')
      : '<p class="placeholder">还没有时间线条目</p>';
  }
  $('#tlList').addEventListener('click', e => {
    const row = e.target.closest('.tl-row');
    if (!row) return;
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const i = +row.dataset.i;
    if (act.dataset.act === 'edit') startTlEdit(i);
    else delTimeline(i);
  });
  function startTlEdit(i) {
    if (i === tlEditing) { resetTlForm(); renderTimeline(tlCache); return; }
    const item = tlCache[i];
    if (!item) return;
    tlEditing = i;
    $('#tDate').value = item.date;
    $('#tText').value = item.text;
    $('#tlAddBtn').innerHTML = '<span class="msr">save</span>保存修改';
    renderTimeline(tlCache);
    $('#tText').focus();
    msg('info', '正在编辑这条时间线，再点一次“编辑”可取消，改完点“保存修改”', 'edit');
  }
  function resetTlForm() {
    tlEditing = -1;
    $('#tlAddBtn').innerHTML = '<span class="msr">add</span>追加';
    $('#tDate').value = today();
    $('#tText').value = '';
  }
  async function addTimeline() {
    const date = $('#tDate').value.trim();
    const text = $('#tText').value.trim();
    if (!date || !text) return msg('err', '时间线的日期和内容都要填', 'error');
    if (!token()) return msg('err', '请先填写发布密码', 'key');
    const editing = tlEditing >= 0;
    const btn = $('#tlAddBtn');
    btn.disabled = true;
    try {
      await fetchJSON(base() + '/api/timeline', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token() },
        body: JSON.stringify(editing ? { i: tlEditing, date, text } : { date, text })
      });
      resetTlForm();
      msg('ok', editing ? '时间线已更新（关于页可见）' : '时间线已追加（关于页可见）', 'check_circle');
      loadTimeline();
    } catch (e) {
      msg('err', e.status === 401 ? '密码不对' : (editing ? '更新失败：' : '追加失败：') + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }
  async function delTimeline(i) {
    const item = tlCache[i];
    if (!item) return;
    if (!confirm(`删除这条时间线？\n${item.date} ${item.text}\n此操作不可恢复。`)) return;
    if (!token()) return msg('err', '请先填写发布密码', 'key');
    try {
      await fetchJSON(base() + '/api/timeline?i=' + i, {
        method: 'DELETE',
        headers: { 'X-Admin-Token': token() }
      });
      if (tlEditing === i) resetTlForm();
      else if (tlEditing > i) tlEditing--;
      msg('ok', '已删除这条时间线', 'delete');
      loadTimeline();
    } catch (e) {
      if (e.status === 401) msg('err', '密码不对，无法删除', 'key');
      else if (e.status === 404) msg('err', '条目不存在，请刷新列表后重试', 'refresh');
      else msg('err', '删除失败：' + e.message, 'error');
    }
  }
  $('#tlAddBtn').addEventListener('click', addTimeline);
  // isComposing：中文输入法回车确认候选词时不要误提交
  $('#tText').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) addTimeline(); });


  // ============ 图床（R2） ============
  const dropZone = $('#dropZone'), imgInput = $('#imgInput'), imgGrid = $('#imgGrid');
  let images = [], imgBusy = false, imgCursor = null; // imgCursor：下一页游标，null = 已全部加载

  function updateEps() {
    $$('.js-ep').forEach(el => { el.textContent = (base() || location.origin) + '/api/upload'; });
  }
  apiBaseEl.addEventListener('input', updateEps);
  updateEps();

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    }
  }
  async function copyAndMsg(t, okText) {
    const ok = await copyText(t);
    msg(ok ? 'ok' : 'err', ok ? okText : '复制失败', 'content_copy');
  }

  async function loadImages() {
    if (!base() || !token()) return;
    try {
      const data = await fetchJSON(base() + '/api/images?t=' + Date.now(), { headers: { 'X-Admin-Token': token() } });
      images = Array.isArray(data.images) ? data.images : [];
      imgCursor = data.cursor || null;
      renderImages();
    } catch (e) { /* 图床接口不存在（旧后端）时静默 */ }
  }

  // 带游标取下一页（R2 单次 list 上限 1000，分页直至枚举完）
  async function loadMoreImages() {
    if (!imgCursor || imgBusy) return;
    imgBusy = true;
    const btn = imgGrid.querySelector('[data-more]');
    if (btn) btn.disabled = true;
    try {
      const data = await fetchJSON(base() + '/api/images?cursor=' + encodeURIComponent(imgCursor), { headers: { 'X-Admin-Token': token() } });
      images = images.concat(Array.isArray(data.images) ? data.images : []);
      imgCursor = data.cursor || null;
      renderImages();
    } catch (e) {
      msg('err', '加载更多失败：' + e.message, 'error');
      if (btn) btn.disabled = false;
      imgBusy = false;
      return;
    }
    imgBusy = false;
  }

  function renderImages() {
    if (!images.length) { imgGrid.innerHTML = '<p class="placeholder">还没有图片，上传第一张吧</p>'; return; }
    imgGrid.innerHTML = images.map(im => `
      <div class="img-cell" data-key="${esc(im.key)}" data-url="${esc(im.url)}">
        <img src="${esc(im.url)}" alt="" loading="lazy">
        <div class="img-ops">
          <button class="icon-btn" data-act="copy" title="复制链接"><span class="msr">link</span></button>
          <button class="icon-btn" data-act="md" title="复制 Markdown"><span class="msr">markdown</span></button>
          <button class="icon-btn" data-act="insert" title="插入到正文"><span class="msr">edit_note</span></button>
          <button class="icon-btn" data-act="del" title="删除"><span class="msr">delete</span></button>
        </div>
      </div>`).join('') + (imgCursor ? `
      <button class="img-more" data-more="1" type="button"><span class="msr">expand_more</span>加载更多（已显示 ${images.length} 张）</button>` : '');
  }


  async function uploadFiles(files) {
    if (!base()) { msg('err', '请先填写 API 地址', 'cloud_off'); return []; }
    if (!token()) { msg('err', '请先填写发布密码（ADMIN_TOKEN）', 'key'); return []; }
    const list = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!list.length) { msg('err', '只支持上传图片文件', 'error'); return []; }
    if (imgBusy) { msg('info', '还有图片正在上传，稍等一下', 'hourglass_top'); return []; }
    imgBusy = true;
    const urls = [];
    for (const f of list) {
      const fd = new FormData();
      fd.append('file', f, f.name);
      try {
        const data = await fetchJSON(base() + '/api/upload', {
          method: 'POST', headers: { 'X-Admin-Token': token() }, body: fd
        });
        images.unshift({ key: data.key, url: data.url, size: data.size });
        urls.push(data.url);
        msg('ok', `上传成功（${list.length > 1 ? urls.length + '/' + list.length + ' ' : ''}${f.name}）`, 'check_circle');
      } catch (e) {
        msg('err', '上传失败：' + (e.status === 401 ? '密码不对' : e.status === 500 && /IMG_R2/.test(e.message) ? '后端未绑定 R2 桶（IMG_R2）' : e.message), 'error');
      }
    }
    imgBusy = false;
    renderImages();
    return urls;
  }

  function insertToEditor(url, name) {
    const snip = `<figure><img src="${url}" alt="${name || '图片'}" loading="lazy"><figcaption>图片说明</figcaption></figure>\n`;
    const pos = contentEl.selectionStart ?? contentEl.value.length;
    contentEl.setRangeText(snip, pos, pos, 'end');
    queueDraftSave();
    contentEl.focus();
    updateStats(); renderPreview();
    msg('ok', '已插入到正文', 'check_circle');
  }

  async function delImage(key) {
    if (!confirm('确定从图床删除这张图片？已发布文章里引用它的地方会失效。')) return;
    try {
      await fetchJSON(base() + '/api/upload?key=' + encodeURIComponent(key), {
        method: 'DELETE', headers: { 'X-Admin-Token': token() }
      });
      images = images.filter(x => x.key !== key);
      renderImages();
      msg('ok', '已删除', 'delete');
    } catch (e) {
      msg('err', e.status === 401 ? '密码不对，无法删除' : '删除失败：' + e.message, 'error');
    }
  }

  dropZone.addEventListener('click', () => imgInput.click());
  imgInput.addEventListener('change', () => { uploadFiles(imgInput.files); imgInput.value = ''; });
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('over');
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  });


  document.addEventListener('paste', async e => {
    const files = Array.from((e.clipboardData && e.clipboardData.files) || []).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    const intoEditor = document.activeElement === contentEl;
    const urls = await uploadFiles(files);
    if (intoEditor) urls.forEach(u => insertToEditor(u, '粘贴图片'));
  });

  imgGrid.addEventListener('click', e => {
    if (e.target.closest('[data-more]')) { loadMoreImages(); return; }
    const cell = e.target.closest('.img-cell');
    if (!cell) return;
    const act = e.target.closest('[data-act]');
    const { key, url } = cell.dataset;

    if (coverPicking) {
      if (!act) {
        coverEl.value = url;
        queueDraftSave();
        updateCoverPreview();
        stopCoverPicking();
        msg('ok', '已设为封面，发布文章时生效', 'check_circle');
        $('.editor-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    if (!act) return;
    if (act.dataset.act === 'copy') copyAndMsg(url, '外链已复制');
    else if (act.dataset.act === 'md') copyAndMsg(`![${key.split('/').pop()}](${url})`, 'Markdown 已复制');
    else if (act.dataset.act === 'insert') insertToEditor(url, key.split('/').pop());
    else if (act.dataset.act === 'del') delImage(key);
  });
  $('#imgRefreshBtn').addEventListener('click', () => {
    if (!base() || !token()) return msg('err', '请先填写 API 地址与发布密码', 'key');
    loadImages();
  });

  // ============ 封面图片（自建图床 / 外链，留空回落 loremflickr） ============
  const coverEl = $('#pCover'), coverPreview = $('#coverPreview');
  let coverPicking = false;

  function updateCoverPreview() {
    const v = coverEl.value.trim();
    if (v) { coverPreview.src = v; coverPreview.hidden = false; }
    else { coverPreview.hidden = true; coverPreview.removeAttribute('src'); }
  }
  function stopCoverPicking() { coverPicking = false; imgGrid.classList.remove('picking'); }


  coverEl.addEventListener('input', updateCoverPreview);
  coverPreview.addEventListener('error', () => { coverPreview.hidden = true; }); // 链接无效时不显示裂图

  $('#coverClearBtn').addEventListener('click', () => {
    coverEl.value = '';
    queueDraftSave();
    updateCoverPreview();
    msg('info', '已清除自定义封面：发布后按分类用 loremflickr 自动生成', 'restart_alt');
  });


  const coverInput = document.createElement('input');
  coverInput.type = 'file'; coverInput.accept = 'image/*'; coverInput.hidden = true;
  document.body.appendChild(coverInput);
  $('#coverUploadBtn').addEventListener('click', () => coverInput.click());
  coverInput.addEventListener('change', async () => {
    const f = coverInput.files && coverInput.files[0];
    coverInput.value = '';
    if (!f) return;
    const urls = await uploadFiles([f]);
    if (urls[0]) { coverEl.value = urls[0]; queueDraftSave(); updateCoverPreview(); }
  });


  $('#coverPickBtn').addEventListener('click', () => {
    if (coverPicking) { stopCoverPicking(); msg('info', '已取消选择封面', 'cancel'); return; }
    if (!images.length) { msg('err', '图床还没有图片：先在“图床（R2）”卡片上传，或直接用“上传”按钮', 'image_not_supported'); return; }
    coverPicking = true;
    imgGrid.classList.add('picking');
    msg('info', '请在图床网格里点选一张作为封面（再点“图库”可取消）', 'touch_app');
    imgGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });


  $('#backupBtn').addEventListener('click', async () => {
    try {
      msg('info', '正在导出…', 'download');
      const [ps, tl] = await Promise.all([
        fetchPosts(),
        fetchJSON(base() + '/api/timeline?t=' + Date.now())
      ]);
      if (!Array.isArray(ps) || !Array.isArray(tl)) throw new Error('服务器返回的备份数据格式不正确');
      const data = { exportedAt: new Date().toISOString(), posts: ps, timeline: tl };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'hongyun-blog-backup-' + today() + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
      msg('ok', `备份已下载（${ps.length} 篇文章 + 时间线）`, 'check_circle');
    } catch (e) {
      msg('err', '导出失败：' + e.message, 'error');
    }
  });


  const restoreInput = $('#restoreInput');
  const restoreStatus = $('#restoreStatus');
  let restoreBackup = null;
  $('#restorePickBtn').addEventListener('click', () => {
    if (!base() || !token()) return msg('err', '请先填写 API 地址与发布密码', 'key');
    restoreInput.click();
  });
  restoreInput.addEventListener('change', async () => {
    const file = restoreInput.files && restoreInput.files[0];
    restoreInput.value = '';
    restoreBackup = null;
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.posts) || !Array.isArray(data.timeline)) {
        throw new Error('备份必须包含 posts 和 timeline 数组');
      }
      const ids = new Set();
      for (const post of data.posts) {
        if (!post || typeof post.id !== 'string' || !post.id.trim() || typeof post.title !== 'string' ||
          typeof post.date !== 'string' || typeof post.content !== 'string') {
          throw new Error('文章条目缺少有效的 id、title、date 或 content');
        }
        if (post.publishAt != null && post.publishAt !== '' &&
          (typeof post.publishAt !== 'string' || !Number.isFinite(Date.parse(post.publishAt)))) {
          throw new Error('文章 publishAt 必须是有效的日期时间字符串');
        }
        if (ids.has(post.id)) throw new Error('备份中有重复的文章 ID：' + post.id);
        ids.add(post.id);
      }
      for (const item of data.timeline) {
        if (!item || typeof item.date !== 'string' || typeof item.text !== 'string') {
          throw new Error('时间线条目缺少有效的 date 或 text');
        }
      }
      restoreBackup = data;
      restoreStatus.textContent = `已读取 ${file.name}：${data.posts.length} 篇文章、${data.timeline.length} 条时间线。请使用下方确认按钮执行替换。`;
      let btn = $('#restoreApplyBtn');
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'restoreApplyBtn';
        btn.className = 'btn btn-filled';
        btn.innerHTML = '<span class="msr">restore</span>确认替换云端数据';
        restoreStatus.insertAdjacentElement('afterend', btn);
        btn.addEventListener('click', applyRestore);
      }
      btn.hidden = false;
      msg('info', '备份文件已校验；恢复会替换云端全部文章与时间线。', 'warning');
    } catch (e) {
      restoreBackup = null;
      restoreStatus.textContent = '';
      const btn = $('#restoreApplyBtn');
      if (btn) btn.hidden = true;
      msg('err', '无法读取备份：' + e.message, 'error');
    }
  });

  async function applyRestore() {
    if (!restoreBackup) return msg('err', '请先选择有效的备份文件', 'error');
    const count = restoreBackup.posts.length;
    const timelineCount = restoreBackup.timeline.length;
    if (!confirm(`确定用此备份替换云端全部数据吗？\n\n将写入 ${count} 篇文章和 ${timelineCount} 条时间线。\n云端不在备份中的文章和时间线将被删除，此操作不可撤销。`)) return;
    const btn = $('#restoreApplyBtn');
    btn.disabled = true;
    try {
      await fetchJSON(base() + '/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token() },
        body: JSON.stringify(restoreBackup)
      });
      restoreBackup = null;
      restoreStatus.textContent = '恢复完成。';
      btn.hidden = true;
      await Promise.all([testAndLoad(true), loadTimeline()]);
      msg('ok', `恢复完成：${count} 篇文章、${timelineCount} 条时间线`, 'check_circle');
    } catch (e) {
      msg('err', e.status === 401 ? '密码不对，无法恢复' : '恢复失败：' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  // 分类下拉从 CATS 单点填充
  const pCatEl = $('#pCat');
  pCatEl.innerHTML = CATS.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

  $('#pDate').value = today();
  $('#tDate').value = today();
  renderLocalDrafts();
  updateStats();
  if (base()) testAndLoad(true).then(ok => { if (ok) loadTimeline(); });
})();
