(function () {
  'use strict';

  const ALLOWED_TAGS = new Set([
    'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'COL', 'COLGROUP', 'DEL', 'EM', 'FIGCAPTION', 'FIGURE',
    'H1', 'H2', 'H3', 'HR', 'I', 'IMG', 'LI', 'OL', 'P', 'PRE', 'S', 'SMALL',
    'SPAN', 'STRONG', 'SUB', 'SUP', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR',
    'U', 'UL'
  ]);
  const DROP_WITH_CONTENT = new Set([
    'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE',
    'NOSCRIPT'
  ]);
  const ATTRS = {
    A: new Set(['href', 'target', 'title']),
    IMG: new Set(['src', 'alt', 'title', 'loading', 'width', 'height']),
    PRE: new Set(['data-lang'])
  };

  function safeUrl(value, image) {
    const raw = String(value || '').trim();
    if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) return false;
    const scheme = raw.match(/^([a-z][a-z0-9+.-]*):/i);
    if (!scheme) return true; // 相对地址、站内路径及锚点
    const protocol = scheme[1].toLowerCase();
    return image
      ? protocol === 'http' || protocol === 'https'
      : protocol === 'http' || protocol === 'https' || protocol === 'mailto' || protocol === 'tel';
  }

  window.sanitizePostHtml = function (html) {
    const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const elements = Array.from(parsed.body.querySelectorAll('*'));

    for (const el of elements) {
      if (!el.parentNode) continue;
      if (DROP_WITH_CONTENT.has(el.tagName)) {
        el.remove();
        continue;
      }
      if (!ALLOWED_TAGS.has(el.tagName)) {
        el.replaceWith(...Array.from(el.childNodes));
        continue;
      }

      const allowed = ATTRS[el.tagName] || new Set();
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (!allowed.has(name)) {
          el.removeAttribute(attr.name);
          continue;
        }
        if ((name === 'href' || name === 'src') && !safeUrl(attr.value, el.tagName === 'IMG')) {
          el.removeAttribute(attr.name);
        }
      }

      if (el.tagName === 'A') {
        const target = (el.getAttribute('target') || '').toLowerCase();
        if (target !== '_blank' && target !== '_self') el.removeAttribute('target');
        if (target === '_blank') el.setAttribute('rel', 'noopener noreferrer');
      } else if (el.tagName === 'IMG') {
        const loading = (el.getAttribute('loading') || '').toLowerCase();
        if (loading !== 'lazy' && loading !== 'eager') el.removeAttribute('loading');
        for (const dimension of ['width', 'height']) {
          const value = el.getAttribute(dimension);
          if (value !== null && !/^\d{1,4}$/.test(value)) el.removeAttribute(dimension);
        }
      }
    }

    return parsed.body.innerHTML;
  };

  /* ============ 共享 HTML 工具（博客端 script.js 与后台 admin.js 共用） ============ */

  // HTML 转义：任何要拼进 innerHTML 模板的动态文本都必须先过这里
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 代码块按纯文本渲染：内容先反转义再统一转义，任意语言的 < > & 都能原样显示
  const unescapeEntities = s => String(s).replace(/&(?:amp|lt|gt|quot|#39);/gi, c => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[c.toLowerCase()]));
  const plainCodeBlocks = html => String(html).replace(/<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi, (m, attrs, inner) => {
    const cm = inner.match(/^\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*$/i);
    const lang = (attrs.match(/data-lang\s*=\s*"([^"]*)"/i) || [])[1] || 'text';
    return `<pre data-lang="${esc(lang)}"><code>${esc(unescapeEntities(cm ? cm[1] : inner))}</code></pre>`;
  });

  window.BlogHTML = { esc, unescapeEntities, plainCodeBlocks };
})();
