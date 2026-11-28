// The tour in the site's language: ?lang=en, zh or mn in the tour's address (the apartment and podium pages pass
// theirs). The tours are built in Mongolian, with the colour panel and the top view in English. This swaps every
// text it knows (window.__TOUR_LANGUAGES__, from tour_languages.json) for the chosen language, in the page as
// built and in whatever the tour writes later (the room's name, the window badge, messages), as each appears: a
// mutation observer's callback runs before the browser paints, so the built language never shows. The tour's own
// code is left as it is. Without ?lang, or with a language it has no table for, the page stays as built.
// add_languages.py puts this file into every published tour.
(() => {
  const data = window.__TOUR_LANGUAGES__;
  const lang = new URLSearchParams(location.search).get('lang');
  if (!data || !lang || !data.langs[lang]) return;
  document.documentElement.lang = data.langs[lang];

  // Only the entries that have this language: a translation is never itself a key, so nothing is swapped twice.
  const exact = new Map();
  for (const [from, to] of Object.entries(data.exact)) if (to[lang]) exact.set(from, to[lang]);
  const patterns = data.patterns.filter((p) => p[lang]).map((p) => [new RegExp(p.re), p[lang]]);

  // The text in the chosen language, or null when there is nothing to change. Spaces round it are kept.
  const translate = (text) => {
    const core = text.trim();
    if (!core || core.length > 400) return null;
    let out = exact.get(core);
    if (out === undefined) {
      for (const [re, to] of patterns) {
        if (re.test(core)) {
          out = core.replace(re, to);
          break;
        }
      }
    }
    return out === undefined || out === core ? null : text.replace(core, () => out);
  };

  const ATTRIBUTES = ['title', 'aria-label', 'alt', 'placeholder'];
  const isCode = (el) => !!el && el.closest('script, style') !== null;
  const swapText = (node) => {
    const out = translate(node.nodeValue);
    if (out !== null) node.nodeValue = out;
  };
  const swapAttributes = (el) => {
    for (const name of ATTRIBUTES) {
      const value = el.getAttribute(name);
      const out = value && translate(value);
      if (out) el.setAttribute(name, out);
    }
  };
  const walk = (root) => {
    if (root.nodeType === Node.TEXT_NODE) {
      if (!isCode(root.parentElement)) swapText(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE || isCode(root)) return;
    swapAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE && n.matches('script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) swapText(n);
      else swapAttributes(n);
    }
  };

  walk(document.documentElement);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach(walk);
      else if (r.type === 'characterData') {
        if (!isCode(r.target.parentElement)) swapText(r.target);
      } else if (r.type === 'attributes') swapAttributes(r.target);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
})();
