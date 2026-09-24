(function () {
  'use strict';

  const ALLOWED_TAGS = new Set([
    'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DEL', 'EM', 'FIGCAPTION', 'FIGURE',
    'H1', 'H2', 'H3', 'HR', 'I', 'IMG', 'LI', 'OL', 'P', 'PRE', 'S', 'SMALL',
    'SPAN', 'STRONG', 'SUB', 'SUP', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR',
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
})();
