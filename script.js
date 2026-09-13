(function () {
    'use strict';

    /* ============================================================
     * 红云的博客 · sunset_red的web_log!!!
     * ============================================================ */
    const API_BASE = '';

    const SITE_TITLE = 'sunset_red的web_log!!!';
    const SITE_START = new Date('2026-08-16'); // 建站日期 2026.8.16

    
    const POSTS = [
        {
            id: 'hello', title: 'hello',
            excerpt: '你看到这个时kv容器已经死了',
            category: '前端', tags: ['Workers', 'KV', '前端'], date: '2026-08-20', seed: 'kvblog', heat: 51, featured: true,
            content: `<h1>hello</h1>`
        }
    ];

    const CATEGORY_ICON = { '全部': 'apps', '前端': 'code', '生活': 'restaurant', 'game': 'sports_esports' };

    
    const $  = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const fmtDate = iso => {
        const m = String(iso || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        return m ? `${m[1]} 年 ${+m[2]} 月 ${+m[3]} 日` : String(iso || '');
    };
    const plainText = html => String(html || '').replace(/<[^>]+>/g, '');
    // 代码块按纯文本渲染：内容先反转义再统一转义，任意语言的 < > & 都能原样显示
    const unescapeEntities = s => String(s).replace(/&(?:amp|lt|gt|quot|#39);/gi, c => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[c.toLowerCase()]));
    const plainCodeBlocks = html => String(html).replace(/<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi, (m, attrs, inner) => {
        const cm = inner.match(/^\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*$/i);
        const lang = (attrs.match(/data-lang\s*=\s*"([^"]*)"/i) || [])[1] || 'text';
        return `<pre data-lang="${esc(lang)}"><code>${esc(unescapeEntities(cm ? cm[1] : inner))}</code></pre>`;
    });
    const countChars = p => plainText(p.content).replace(/\s/g, '').length;
    const readMin = p => Math.max(1, Math.round(countChars(p) / 400));
    const fmtWords = n => n >= 10000 ? (n / 10000).toFixed(1) + ' 万' : String(n);
    const loadJSON = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch (e) { return f; } };

    
    const on = (sel, evt, fn) => {
        const el = document.querySelector(sel);
        if (el) el.addEventListener(evt, fn);
        else console.warn('[红云的博客] 元素不存在，已跳过绑定：' + sel);
    };
    const safe = fn => { try { fn(); } catch (e) { console.error('渲染出错：', e); } };

    
    const FLICKR = 'https://loremflickr.com';
    const CAT_IMG = {
        '前端': 'computer,keyboard',
        '生活': 'city,nature',
        'game': 'game,military'
    };
    function seedNum(s) {
        const str = String(s || 'img');
        let h = 0;
        for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
        return h % 1000000;
    }
    function coverUrl(p, w, h) {
        if (p.cover) return esc(p.cover); 
        const kw = CAT_IMG[p.category] || 'landscape';
        return FLICKR + '/' + w + '/' + h + '/' + kw + '?lock=' + seedNum(p.seed || p.id);
    }

    
    const root = document.documentElement;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.dataset.theme = localStorage.getItem('hy-blog-theme') ||
        (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

    function syncThemeBtn() {
        const btn = document.getElementById('themeBtn');
        if (!btn) return;
        const dark = root.dataset.theme === 'dark';
        const icon = btn.querySelector('.msr');
        if (icon) icon.textContent = dark ? 'light_mode' : 'dark_mode';
        btn.setAttribute('aria-label', dark ? '切换到亮色主题' : '切换到暗色主题');
    }
    function handleThemeToggle(e) {
        const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
        const x = e.clientX || innerWidth - 40, y = e.clientY || 40;
        const doSwitch = () => {
            root.dataset.theme = next;
            localStorage.setItem('hy-blog-theme', next);
            syncThemeBtn();
        };
        if (!document.startViewTransition || reducedMotion) { doSwitch(); return; }
        const vt = document.startViewTransition(doSwitch);
        vt.ready.then(() => {
            const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
            root.animate(
                { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
                { duration: 650, easing: 'cubic-bezier(.2, 0, 0, 1)', pseudoElement: '::view-transition-new(root)' }
            );
        }).catch(() => {});
    }

    
    let activeCat = '全部';
    let query = '';
    let currentRoute = 'home';
    let currentPost = null;
    let spyHeadings = [];
    let featuredPost = null;
    let pendingPostId = null;
    const likes = loadJSON('hy-likes', {});
    const marks = loadJSON('hy-marks', {});
    const viewIds = { home: 'view-home', archive: 'view-archive', about: 'view-about', post: 'view-post' };

    
    let snackTimer;
    function showSnack(msg, icon = 'check_circle', action) {
        const snack = document.getElementById('snackbar');
        if (!snack) return;
        const msgEl = document.getElementById('snackMsg');
        const iconEl = document.getElementById('snackIcon');
        const ab = document.getElementById('snackAction');
        if (msgEl) msgEl.textContent = msg;
        if (iconEl) iconEl.textContent = icon;
        if (ab) {
            if (action) { ab.hidden = false; ab.textContent = action.label; ab.onclick = () => { action.fn(); hideSnack(); }; }
            else { ab.hidden = true; ab.onclick = null; }
        }
        snack.classList.add('show');
        clearTimeout(snackTimer);
        snackTimer = setTimeout(hideSnack, 3400);
    }
    function hideSnack() {
        const snack = document.getElementById('snackbar');
        if (snack) snack.classList.remove('show');
    }

    
    function buildChips() {
        const chipRow = document.getElementById('chipRow');
        if (!chipRow) return;
        const cats = ['全部', ...new Set(POSTS.map(p => p.category))];
        if (!cats.includes(activeCat)) activeCat = '全部';
        chipRow.innerHTML = cats.map(c => `
            <button class="chip ${c === activeCat ? 'selected' : ''}" data-cat="${esc(c)}" role="checkbox" aria-checked="${c === activeCat}">
                <span class="msr ${c === activeCat ? 'filled' : ''}">${c === activeCat ? 'check' : (CATEGORY_ICON[c] || 'label')}</span>${esc(c)}
            </button>`).join('');
    }

    
    function highlight(text, q) {
        const safeText = esc(text);
        if (!q) return safeText;
        const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        return safeText.replace(re, '<mark>$1</mark>');
    }
    function getFiltered() {
        const q = query.trim().toLowerCase();
        return POSTS.filter(p =>
            (activeCat === '全部' || p.category === activeCat) &&
            (!q || ((p.title || '') + ' ' + (p.excerpt || '') + ' ' + (p.tags || []).join(' ')).toLowerCase().includes(q))
        );
    }
    function renderList() {
        const postList = document.getElementById('postList');
        const emptyState = document.getElementById('emptyState');
        const feedCount = document.getElementById('feedCount');
        if (!postList) return;
        const q = query.trim();
        const list = getFiltered();
        if (feedCount) feedCount.textContent = '共 ' + list.length + ' 篇';
        postList.innerHTML = list.map((p, i) => `
            <article class="post-item" data-id="${esc(p.id)}" style="animation-delay:${Math.min(i * 45, 320)}ms">
                <div class="pi-media"><img loading="lazy" src="${coverUrl(p, 240, 180)}" alt="${esc(p.title)} 的封面"></div>
                <div class="pi-body">
                    <div class="pi-meta">
                        <span class="assist-chip">${esc(p.category)}</span>
                        <time>${fmtDate(p.date)}</time><span class="dot">·</span><span>${readMin(p)} 分钟</span>
                    </div>
                    <h3 class="pi-title">${highlight(p.title, q)}</h3>
                    <p class="pi-excerpt">${highlight(p.excerpt, q)}</p>
                </div>
                <span class="msr pi-arrow">arrow_forward</span>
            </article>`).join('');
        if (emptyState) emptyState.hidden = list.length !== 0;
    }

    
    function renderFeatured() {
        const slot = document.getElementById('featuredSlot');
        if (!slot) return;
        featuredPost = POSTS.find(p => p.featured) || POSTS[0];
        if (!featuredPost) { slot.innerHTML = ''; return; }
        const p = featuredPost;
        slot.innerHTML = `
            <article class="featured" data-id="${esc(p.id)}">
                <div class="featured-media"><img src="${coverUrl(p, 960, 720)}" alt="${esc(p.title)} 的封面"></div>
                <div class="featured-body">
                    <span class="featured-tag"><span class="msr">auto_awesome</span>${p.featured ? '置顶推荐' : '最新一篇'}</span>
                    <h2>${esc(p.title)}</h2>
                    <p>${esc(p.excerpt)}</p>
                    <div class="featured-meta">
                        <span class="assist-chip">${esc(p.category)}</span>
                        <span>${fmtDate(p.date)}</span><span class="dot">·</span><span>${readMin(p)} 分钟</span>
                    </div>
                    <span class="featured-read">阅读全文<span class="msr">arrow_forward</span></span>
                </div>
            </article>`;
    }

    
    function renderPopular() {
        const box = document.getElementById('popularList');
        if (!box) return;
        const popular = [...POSTS].sort((a, b) => (b.heat || 0) - (a.heat || 0)).slice(0, 4);
        box.innerHTML = popular.map((p, i) => `
            <a class="pop-item" href="#/post/${esc(p.id)}">
                <span class="pop-rank">${String(i + 1).padStart(2, '0')}</span>
                <span class="pop-title">${esc(p.title)}</span>
            </a>`).join('');
    }
    function renderTagCloud() {
        const box = document.getElementById('tagCloud');
        if (!box) return;
        box.innerHTML = [...new Set(POSTS.flatMap(p => p.tags || []))]
            .map(t => `<button class="chip chip-tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('');
    }

    
    function renderStats() {
        const el = id => document.getElementById(id);
        if (el('statPosts')) el('statPosts').textContent = POSTS.length;
        if (el('statWords')) el('statWords').textContent = fmtWords(POSTS.reduce((s, p) => s + countChars(p), 0));
        const latest = POSTS[0];
        if (latest && el('statUpdated')) {
            const dAgo = Math.max(0, Math.round((Date.now() - new Date(latest.date)) / 864e5));
            el('statUpdated').textContent = (dAgo >= 1 && dAgo < 30) ? dAgo + ' 天前' : fmtDate(latest.date);
        }
    }

    
    function renderArchive() {
        const box = document.getElementById('archiveList');
        if (!box) return;
        const byYear = {};
        POSTS.forEach(p => { const y = String(p.date || '').slice(0, 4) || '未知'; (byYear[y] ||= []).push(p); });
        box.innerHTML = Object.keys(byYear).sort((a, b) => b - a).map(y => `
            <section class="arch-year">
                <h2 class="arch-year-num">${esc(y)}</h2>
                <div class="arch-rows">${byYear[y].map(p => `
                    <a class="arch-item" href="#/post/${esc(p.id)}">
                        <time>${esc(String(p.date || '').slice(5).replace('-', '.'))}</time>
                        <h3>${esc(p.title)}</h3>
                        <span class="assist-chip">${esc(p.category)}</span>
                    </a>`).join('')}</div>
            </section>`).join('');
        const c = document.getElementById('archCount');
        if (c) c.textContent = POSTS.length;
    }

    
    function renderTimeline(items) {
        const box = document.getElementById('timelineList');
        if (!box) return;
        box.innerHTML = (Array.isArray(items) && items.length)
            ? items.map(i => `<div class="tl-item"><b>${esc(i.date)}</b><p>${esc(i.text)}</p></div>`).join('')
            : '<p class="tl-empty">时间线内容保存在 Workers KV 的 timeline 键中，暂时还没有条目。</p>';
    }

    
    const likeBase = p => Math.max(8, Math.round((p.heat || 40) / 5));

    function renderPost(p) {
        document.title = p.title + ' · ' + SITE_TITLE;
        spyHeadings = [];

        const head = document.getElementById('postHead');
        if (head) head.innerHTML = `
            <div class="post-meta-line">
                <button class="assist-chip assist-chip-btn" data-cat="${esc(p.category)}" title="查看该分类">${esc(p.category)}</button>
                <time>${fmtDate(p.date)}</time><span class="dot">·</span>
                <span>${readMin(p)} 分钟 · 约 ${fmtWords(countChars(p))} 字</span>
            </div>
            <h1 class="post-title">${esc(p.title)}</h1>
            <p class="post-lead">${esc(p.excerpt)}</p>`;

        const cover = document.getElementById('postCover');
        if (cover) cover.innerHTML = `<img src="${coverUrl(p, 1280, 640)}" alt="${esc(p.title)} 的封面">`;

        const body = document.getElementById('postBody');
        if (body) {
            body.innerHTML = plainCodeBlocks(p.content || '');

            
            const hs = $$('h2, h3', body);
            const toc = document.getElementById('toc');
            if (toc) {
                toc.innerHTML = hs.length
                    ? '<p class="toc-title">目录</p>' + hs.map((h, i) => {
                        h.id = 'sec-' + i;
                        return `<button class="toc-link ${h.tagName === 'H3' ? 'lv3' : ''}" data-target="sec-${i}">${esc(h.textContent)}</button>`;
                    }).join('')
                    : '';
            }
            spyHeadings = hs;

            
            $$('pre', body).forEach(pre => {
                const wrap = document.createElement('div');
                wrap.className = 'code-card';
                pre.parentNode.insertBefore(wrap, pre);
                wrap.innerHTML = `<div class="code-head"><span>${esc(pre.dataset.lang || 'text')}</span>
                    <button class="code-copy" type="button"><span class="msr">content_copy</span>复制</button></div>`;
                wrap.appendChild(pre);
            });
        }

        
        const idx = POSTS.indexOf(p);
        const prev = POSTS[idx + 1], next = POSTS[idx - 1];
        const nav = document.getElementById('postNav');
        if (nav) {
            nav.innerHTML = [
                prev ? navCard(prev, '上一篇', 'prev') : '<span></span>',
                next ? navCard(next, '下一篇', 'next') : '<span></span>'
            ].join('');
        }

        syncLikeBtn();
        syncMarkBtn();
    }
    function navCard(p, label, dir) {
        return `<a class="pn-card ${dir}" href="#/post/${esc(p.id)}">
            <span class="pn-label">${label}</span>
            <span class="pn-title">${esc(p.title)}</span>
            <span class="msr" style="font-size:18px;color:var(--md-primary)">${dir === 'prev' ? 'arrow_back' : 'arrow_forward'}</span>
        </a>`;
    }

    
    function syncLikeBtn() {
        const btn = document.getElementById('likeBtn');
        if (!btn) return;
        const liked = !!(currentPost && likes[currentPost.id]);
        btn.classList.toggle('liked', liked);
        btn.setAttribute('aria-pressed', liked);
        const n = document.getElementById('likeCount');
        if (n && currentPost) n.textContent = likeBase(currentPost) + (liked ? 1 : 0);
    }
    function syncMarkBtn() {
        const btn = document.getElementById('markBtn');
        if (!btn) return;
        const marked = !!(currentPost && marks[currentPost.id]);
        btn.classList.toggle('marked', marked);
        const icon = btn.querySelector('.msr');
        if (icon) icon.classList.toggle('filled', marked);
        btn.setAttribute('aria-label', marked ? '取消收藏' : '收藏');
    }
    function burst(btn) {
        for (let i = 0; i < 8; i++) {
            const s = document.createElement('span');
            s.className = 'burst-dot';
            const a = Math.random() * Math.PI * 2, d = 26 + Math.random() * 30;
            s.style.setProperty('--bx', Math.cos(a) * d + 'px');
            s.style.setProperty('--by', Math.sin(a) * d + 'px');
            s.style.background = i % 2 ? 'var(--md-tertiary)' : 'var(--md-primary)';
            btn.appendChild(s);
            s.addEventListener('animationend', () => s.remove());
        }
    }
    function handleLike() {
        if (!currentPost) return;
        const id = currentPost.id;
        if (likes[id]) delete likes[id]; else likes[id] = true;
        localStorage.setItem('hy-likes', JSON.stringify(likes));
        const nowLiked = !!likes[id];
        syncLikeBtn();
        if (nowLiked) { burst(document.getElementById('likeBtn')); showSnack('感谢喜欢，已记下这一票', 'favorite'); }
    }
    function handleMark() {
        if (!currentPost) return;
        const id = currentPost.id;
        if (marks[id]) delete marks[id]; else marks[id] = true;
        localStorage.setItem('hy-marks', JSON.stringify(marks));
        syncMarkBtn();
        showSnack(marks[id] ? '已加入书签' : '已移出书签', 'bookmark');
    }
    function handleShare() {
        const done = () => showSnack('链接已复制到剪贴板', 'link');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(location.href).then(done, done);
        } else done();
    }

    
    function handleBodyClick(e) {
        const btn = e.target.closest('.code-copy');
        if (!btn) return;
        const card = btn.closest('.code-card');
        const code = card && card.querySelector('code');
        if (code && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code.innerText).then(() => showSnack('代码已复制', 'content_copy'));
        }
    }
    function handleHeadCatClick(e) {
        const c = e.target.closest('.assist-chip-btn');
        if (!c) return;
        activeCat = c.dataset.cat;
        query = '';
        const si = document.getElementById('searchInput');
        if (si) si.value = '';
        buildChips(); renderList();
        go('#/');
        setTimeout(() => {
            const anchor = document.getElementById('feedAnchor');
            if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });
        }, 80);
    }
    function handleTocClick(e) {
        const b = e.target.closest('.toc-link');
        if (!b) return;
        const t = document.getElementById(b.dataset.target);
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    
    function showView(name) {
        if (!viewIds[name]) name = 'home';
        Object.keys(viewIds).forEach(k => {
            const el = document.getElementById(viewIds[k]);
            if (el) el.classList.remove('active');
        });
        const target = document.getElementById(viewIds[name]);
        if (target) target.classList.add('active');
        currentRoute = name;

        const navName = name === 'post' ? 'home' : name;
        $$('[data-nav]').forEach(el => el.classList.toggle('active', el.dataset.nav === navName));

        try { window.scrollTo(0, 0); } catch (e) {}
        onScroll();
    }

    function route() {
        const h = location.hash.replace(/^#\/?/, '');
        const parts = h.split('/');
        const seg = parts[0] || '';
        const id = parts[1] || '';

        let name = 'home';
        let post = null;

        if (seg === 'archive') name = 'archive';
        else if (seg === 'about') name = 'about';
        else if (seg === 'post') {
            post = POSTS.find(p => p.id === id) || null;
            if (post) name = 'post';
            else pendingPostId = id;
        }

        if (name === 'post' && post) {
            currentPost = post;
            safe(() => renderPost(post));
        } else {
            currentPost = null;
            document.title = SITE_TITLE;
            if (seg !== '' && seg !== 'home' && seg !== 'post') {
                try { history.replaceState(null, '', location.pathname + location.search + '#/'); } catch (e) {}
            }
        }

        showView(name);
    }

    
    function go(hash) {
        if (location.hash === hash) {
            route();
        } else {
            location.hash = hash;
        }
    }

    
    function interceptNavLinks() {
        document.addEventListener('click', e => {
            if (e.defaultPrevented) return;
            if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            const a = e.target.closest('a');
            if (!a) return;
            const href = a.getAttribute('href');
            if (!href || !href.startsWith('#/')) return;
            e.preventDefault();
            go(href);
        });
    }

    
    function spyToc() {
        if (!spyHeadings.length) return;
        let cur = 0;
        spyHeadings.forEach((h, i) => {
            if (h.isConnected && h.getBoundingClientRect().top < 150) cur = i;
        });
        $$('.toc-link').forEach((a, i) => a.classList.toggle('active', i === cur));
    }
    function onScroll() {
        const y = window.scrollY || 0;
        const appBar = document.getElementById('appBar');
        const fab = document.getElementById('backTop');
        const fill = document.getElementById('progressFill');
        if (appBar) appBar.classList.toggle('scrolled', y > 4);
        if (fab) fab.classList.toggle('show', y > 640);
        if (currentRoute === 'post' && currentPost) {
            const el = document.getElementById('view-post');
            if (fill) {
                const total = el ? Math.max(1, el.offsetHeight - window.innerHeight + 80) : 1;
                fill.style.transform = 'scaleX(' + Math.min(1, Math.max(0, y / total)) + ')';
            }
            spyToc();
        } else if (fill) {
            fill.style.transform = 'scaleX(0)';
        }
    }

    
    function setSearch(q) {
        query = q;
        const si = document.getElementById('searchInput');
        if (si) si.value = q;
        renderList();
        if (currentRoute !== 'home') go('#/');
        setTimeout(() => {
            const anchor = document.getElementById('feedAnchor');
            if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });
        }, 80);
    }
    function handleSearchInput() {
        const si = document.getElementById('searchInput');
        if (!si) return;
        query = si.value;
        renderList();
    }
    function handleSearchKey(e) {
        if (e.key === 'Escape') {
            const si = e.target;
            si.value = ''; query = ''; renderList(); si.blur();
        }
    }

    /* ==================== Workers KV 加载 ==================== */
    async function loadFromKV() {
        if (location.protocol === 'file:') return;
        const base = (API_BASE || '').trim().replace(/\/+$/, '');

        
        try {
            const r = await fetch(base + '/api/posts?t=' + Date.now(), { headers: { Accept: 'application/json' } });
            if (r.ok) {
                const posts = await r.json();
                if (Array.isArray(posts) && posts.length) {
                    POSTS.length = 0;
                    POSTS.push(...posts);
                    renderAll();

                    if (currentRoute === 'post' && currentPost) {
                        const fresh = POSTS.find(p => p.id === currentPost.id);
                        if (fresh) { currentPost = fresh; safe(() => renderPost(fresh)); }
                    }
                    if (pendingPostId) {
                        const found = POSTS.find(p => p.id === pendingPostId);
                        if (found) {
                            pendingPostId = null;
                            go('#/post/' + found.id);
                        }
                    }
                    console.info(' 已从 KV 加载 ' + posts.length + ' 篇文章。');
                }
            }
        } catch (e) {
            console.warn(' KV 文章读取失败，使用内置演示数据：', e && e.message);
        }

        
        try {
            const tr = await fetch(base + '/api/timeline?t=' + Date.now());
            if (tr.ok) {
                const items = await tr.json();
                if (Array.isArray(items)) renderTimeline(items);
            }
        } catch (e) { /* 静默 */ }
    }

    
    function renderAll() {
        POSTS.sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1));
        safe(buildChips);
        safe(renderList);
        safe(renderFeatured);
        safe(renderPopular);
        safe(renderTagCloud);
        safe(renderStats);
        safe(renderArchive);
        safe(renderAboutStats);
    }
    function renderAboutStats() {
        const p = document.getElementById('asPosts');
        const d = document.getElementById('asDays');
        if (p) p.textContent = POSTS.length;
        if (d) d.textContent = Math.max(0, Math.floor((Date.now() - SITE_START) / 864e5));
    }

    
    function bindEvents() {
        on('#themeBtn', 'click', handleThemeToggle);

        
        interceptNavLinks();

        on('#chipRow', 'click', e => {
            const chip = e.target.closest('.chip');
            if (!chip) return;
            activeCat = chip.dataset.cat;
            buildChips(); renderList();
        });
        on('#postList', 'click', e => {
            const it = e.target.closest('.post-item');
            if (it) go('#/post/' + it.dataset.id);
        });
        on('#featuredSlot', 'click', e => {
            if (featuredPost && e.target.closest('.featured')) go('#/post/' + featuredPost.id);
        });
        on('#heroRead', 'click', () => {
            if (featuredPost) go('#/post/' + featuredPost.id);
        });
        on('#tagCloud', 'click', e => {
            const b = e.target.closest('.chip-tag');
            if (b) setSearch(b.dataset.tag);
        });
        on('#likeBtn', 'click', handleLike);
        on('#markBtn', 'click', handleMark);
        on('#shareBtn', 'click', handleShare);
        on('#postBody', 'click', handleBodyClick);
        on('#postHead', 'click', handleHeadCatClick);
        on('#toc', 'click', handleTocClick);

        const toTop = () => { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); } };
        on('#backTop', 'click', toTop);
        on('#footerTop', 'click', toTop);

        on('#searchInput', 'input', handleSearchInput);
        on('#searchInput', 'keydown', handleSearchKey);
        on('#searchClear', 'click', () => {
            const si = document.getElementById('searchInput');
            if (si) { si.value = ''; query = ''; renderList(); si.focus(); }
        });
        on('#appSearchBtn', 'click', () => {
            if (currentRoute !== 'home') go('#/');
            setTimeout(() => {
                const si = document.getElementById('searchInput');
                if (si) si.focus();
            }, 100);
        });
        on('#emptyClear', 'click', () => {
            activeCat = '全部'; query = '';
            const si = document.getElementById('searchInput');
            if (si) si.value = '';
            buildChips(); renderList();
        });

        document.addEventListener('keydown', e => {
            if (e.key === '/' && !/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || '')) {
                e.preventDefault();
                const btn = document.getElementById('appSearchBtn');
                if (btn) btn.click();
            }
        });

        window.addEventListener('hashchange', route);

        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => { onScroll(); ticking = false; });
                ticking = true;
            }
        }, { passive: true });

        
        const hero = document.querySelector('.hero');
        if (hero && !reducedMotion) {
            const pars = $$('.par', hero);
            hero.addEventListener('pointermove', e => {
                const r = hero.getBoundingClientRect();
                const dx = (e.clientX - r.left) / r.width - .5;
                const dy = (e.clientY - r.top) / r.height - .5;
                pars.forEach(p => {
                    const depth = +p.dataset.depth || 1;
                    p.style.transform = `translate(${(-dx * depth * 18).toFixed(1)}px, ${(-dy * depth * 14).toFixed(1)}px)`;
                });
            });
            hero.addEventListener('pointerleave', () => pars.forEach(p => { p.style.transform = ''; }));
        }
    }

   
    function forceHome() {
        const home = document.getElementById('view-home');
        if (home) home.classList.add('active');
    }

    function init() {
        try {
            if (!location.hash || location.hash === '#') {
                try { history.replaceState(null, '', location.pathname + location.search + '#/'); } catch (e) {}
            }
            bindEvents();
            syncThemeBtn();
            renderAll();
            renderTimeline([]);
            route();
            loadFromKV();
        } catch (e) {
            console.error(' 初始化出错：', e);
            forceHome();
        }
        
        setTimeout(() => {
            if (!document.querySelector('.view.active')) {
                console.warn('检测到无激活视图，已强制显示首页。');
                forceHome();
            }
        }, 400);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
