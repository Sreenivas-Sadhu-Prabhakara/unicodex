/* ============================================================
   unicodex — UI wiring. All logic lives in engine.js; all facts
   about flagged characters live in data/flagged.js. No inline
   handlers (CSP), no network (CSP connect-src 'none').
   ============================================================ */
(function () {
  'use strict';

  const E = globalThis.UnicodexEngine;
  const FLAGGED = globalThis.FLAGGED;

  const LS = {
    input: 'unicodex.input',
    autosave: 'unicodex.autosave',
    theme: 'unicodex.theme',
    clean: 'unicodex.clean',
  };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage may be blocked */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    paste: $('paste'), samples: $('samples'), teaches: $('sample-teaches'),
    autosave: $('autosave'), clearSaved: $('clear-saved'),
    countG: $('count-graphemes'), count16: $('count-utf16'),
    countCp: $('count-codepoints'), count8: $('count-utf8'),
    clusters: $('clusters'), capped: $('clusters-capped'),
    detail: $('detail'), detailBody: $('detail-body'),
    warnings: $('warnings'), catalogSize: $('catalog-size'),
    norm: $('norm'),
    cmpA: $('cmp-a'), cmpB: $('cmp-b'), cmpVerdicts: $('cmp-verdicts'),
    optZw: $('opt-zw'), optAll: $('opt-alljoiners'), optSp: $('opt-sp'),
    optBidi: $('opt-bidi'), optNfc: $('opt-nfc'),
    cleanStats: $('clean-stats'), cleanOut: $('clean-out'),
    copyClean: $('copy-clean'), copyStatus: $('copy-status'),
    themeToggle: $('theme-toggle'),
  };

  const MAX_RENDER = 400;
  const INVISIBLE_CATS = new Set(['zero-width', 'bidi', 'line-break', 'space']);
  let selectedCluster = -1;

  const esc = (s) => s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uplus = (cp) => 'U+' + E.cpHex(cp);
  const fmt = (n) => n.toLocaleString('en-IN');

  /* ---------- safe rendering of a string: invisibles become reveal boxes ---------- */
  function renderTextHtml(s) {
    let html = '';
    for (const ch of s) {
      const cp = ch.codePointAt(0);
      const e = E.findFlag(cp);
      if (e && INVISIBLE_CATS.has(e.category)) {
        html += '<span class="reveal" title="' + esc(e.name) + '">' + esc(e.abbrev) + '</span>';
      } else if (cp === 0x20) {
        html += ' ';
      } else if (cp === 0x0a) {
        html += '<br>';
      } else {
        html += esc(ch);
      }
    }
    return html;
  }

  /* ---------- theme ---------- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    els.themeToggle.textContent = t === 'light' ? 'Dark theme' : 'Light theme';
    els.themeToggle.setAttribute('aria-pressed', t === 'light' ? 'true' : 'false');
  }
  els.themeToggle.addEventListener('click', () => {
    const t = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    store.set(LS.theme, t);
    applyTheme(t);
  });
  applyTheme(store.get(LS.theme) === 'light' ? 'light' : 'dark');

  /* ---------- samples ---------- */
  for (const g of E.GALLERY) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = g.label;
    b.addEventListener('click', () => {
      els.paste.value = g.text;
      els.teaches.textContent = g.label + ' — ' + g.teaches;
      onInput();
    });
    els.samples.appendChild(b);
  }
  els.catalogSize.textContent = String(FLAGGED.length);

  /* ---------- counts ---------- */
  function renderCounts(s) {
    const c = E.countsOf(s);
    els.countG.textContent = fmt(c.graphemes);
    els.count16.textContent = fmt(c.utf16);
    els.countCp.textContent = fmt(c.codepoints);
    els.count8.textContent = fmt(c.utf8);
    return c;
  }

  /* ---------- cluster cards ---------- */
  function clusterFlagIds(cluster) {
    const ids = [];
    for (const ch of cluster) {
      const e = E.findFlag(ch.codePointAt(0));
      if (e) ids.push(e);
    }
    return ids;
  }

  function renderClusters(s) {
    const clusters = E.clustersOf(s);
    els.clusters.innerHTML = '';
    if (clusters.length === 0) {
      els.clusters.innerHTML = '<p class="clusters-empty">Nothing to inspect yet — paste text above or tap a sample.</p>';
      els.capped.hidden = true;
      hideDetail();
      return clusters;
    }
    const n = Math.min(clusters.length, MAX_RENDER);
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const cl = clusters[i];
      const flags = clusterFlagIds(cl);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'cluster' + (flags.length ? ' cluster--flagged' : '');
      card.id = 'cluster-' + i;
      card.setAttribute('aria-pressed', i === selectedCluster ? 'true' : 'false');

      const cps = [...cl].map((c) => c.codePointAt(0));
      const glyph = document.createElement('span');
      glyph.className = 'cluster__glyph';
      glyph.innerHTML = cps.length === 1 && cps[0] === 0x20 ? '&#x2423;' : renderTextHtml(cl);
      card.appendChild(glyph);

      const hexes = cps.map((cp) => uplus(cp));
      const label = document.createElement('span');
      label.className = 'cluster__cps';
      label.textContent = hexes.length > 3 ? hexes.slice(0, 3).join(' ') + ' +' + (hexes.length - 3) : hexes.join(' ');
      card.appendChild(label);

      if (flags.length) {
        const f = document.createElement('span');
        f.className = 'cluster__flag';
        f.textContent = flags[0].category === 'confusable' ? flags[0].abbrev : 'flagged';
        card.appendChild(f);
      }
      card.setAttribute('aria-label',
        'Cluster ' + (i + 1) + ': ' + hexes.join(' ') + (flags.length ? ' — flagged: ' + flags.map((x) => x.abbrev).join(', ') : ''));
      card.addEventListener('click', () => selectCluster(i, clusters));
      frag.appendChild(card);
    }
    els.clusters.appendChild(frag);
    if (clusters.length > MAX_RENDER) {
      els.capped.hidden = false;
      els.capped.textContent = 'Showing the first ' + fmt(MAX_RENDER) + ' of ' + fmt(clusters.length) +
        ' clusters. Counts, warnings, normalization and clean-copy still cover the full text.';
    } else {
      els.capped.hidden = true;
    }
    if (selectedCluster >= 0 && selectedCluster < clusters.length) renderDetail(clusters);
    else hideDetail();
    return clusters;
  }

  function hideDetail() {
    selectedCluster = -1;
    els.detail.hidden = true;
  }

  function selectCluster(i, clusters) {
    selectedCluster = selectedCluster === i ? -1 : i;
    for (const card of els.clusters.querySelectorAll('.cluster')) {
      card.setAttribute('aria-pressed', card.id === 'cluster-' + selectedCluster ? 'true' : 'false');
    }
    if (selectedCluster < 0) { hideDetail(); return; }
    renderDetail(clusters);
  }

  function renderDetail(clusters) {
    const cl = clusters[selectedCluster];
    if (cl === undefined) { hideDetail(); return; }
    els.detail.hidden = false;
    const rows = [];
    for (const ch of cl) {
      const cp = ch.codePointAt(0);
      const entry = E.findFlag(cp);
      const chips = E.classChipsOf(cp).map((c) => '<span class="klass">' + esc(c) + '</span>').join('');
      const u8 = E.utf8BytesOfCp(cp).map((b, j) =>
        '<span class="' + (j === 0 ? 'byte--lead' : 'byte--cont') + '">' + b + '</span>').join(' ');
      const u16r = E.utf16UnitsOf(ch);
      const u16 = u16r.surrogatePair
        ? '<span class="surr">&#x27E8;</span>' + u16r.units.join(' ') + '<span class="surr">&#x27E9;</span>'
        : u16r.units.join(' ');
      rows.push('<tr><td>' + uplus(cp) + '</td>' +
        '<td class="t-sans">' + (entry
          ? esc(entry.name) + ' <span class="reveal">' + esc(entry.abbrev) + '</span>'
          : renderTextHtml(ch) + ' <span class="warn-item__cp">(no name database — see honest limits)</span>') + '</td>' +
        '<td class="t-sans"><span class="chips-row">' + chips + '</span></td>' +
        '<td>' + u8 + '</td><td>' + u16 + '</td></tr>');
    }
    const escRows = [
      ['JS', E.escapeString(cl, E.escJs)],
      ['JSON', E.escapeString(cl, E.escJson)],
      ['HTML', E.escapeString(cl, E.escHtml)],
      ['Python', E.escapeString(cl, E.escPy)],
    ].map(([lang, text]) =>
      '<div class="escape-row"><span class="escape-row__lang">' + lang + '</span>' +
      '<code>' + esc(text) + '</code>' +
      '<button type="button" class="btn btn--ghost btn--small" data-copy="' + esc(text) + '">Copy</button></div>').join('');

    els.detailBody.innerHTML =
      '<table><thead><tr><th scope="col">Codepoint</th><th scope="col">Name / reveal</th>' +
      '<th scope="col">Class chips (engine-derived)</th><th scope="col">UTF-8 bytes</th><th scope="col">UTF-16 units</th></tr></thead>' +
      '<tbody>' + rows.join('') + '</tbody></table>' +
      '<div class="escapes"><h3>Copy as escapes — whole cluster</h3>' + escRows + '</div>';
    $('detail-title').textContent = 'Cluster ' + (selectedCluster + 1) + ' — ' + [...cl].length +
      ' codepoint' + ([...cl].length === 1 ? '' : 's');
  }

  /* ---------- warnings ---------- */
  const CAT_TITLES = {
    'zero-width': 'Zero-width & format characters',
    'bidi': 'Bidi controls (Trojan Source class)',
    'space': 'Look-alike spaces',
    'line-break': 'Line & paragraph separators',
    'confusable': 'Look-alike letters (confusables)',
  };

  function renderWarnings(s) {
    const hits = E.scan(s);
    if (!s) { els.warnings.innerHTML = '<p class="warn-none">Paste text above to scan it.</p>'; return; }
    if (hits.length === 0) {
      els.warnings.innerHTML = '<p class="warn-none">No cataloged characters found in this text. ' +
        'Remember: this is not a "safe" verdict — the catalog is a curated subset (' + FLAGGED.length + ' entries).</p>';
      return;
    }
    const byId = new Map();
    for (const h of hits) {
      if (!byId.has(h.id)) byId.set(h.id, { entry: E.catalogById(h.id), clusters: [] });
      byId.get(h.id).clusters.push(h.clusterIndex);
    }
    const byCat = new Map();
    for (const rec of byId.values()) {
      if (!byCat.has(rec.entry.category)) byCat.set(rec.entry.category, []);
      byCat.get(rec.entry.category).push(rec);
    }
    let html = '';
    for (const cat of ['zero-width', 'bidi', 'space', 'line-break', 'confusable']) {
      const recs = byCat.get(cat);
      if (!recs) continue;
      html += '<div class="warn-group"><h3 class="warn-group__title">' + esc(CAT_TITLES[cat]) + '</h3>';
      for (const { entry, clusters } of recs) {
        const first = clusters[0];
        html += '<div class="warn-item">' +
          '<div class="warn-item__head">' +
          '<span class="reveal">' + esc(entry.abbrev) + '</span>' +
          '<span class="warn-item__name">' + esc(entry.name) + '</span>' +
          '<span class="warn-item__cp">U+' + esc(entry.cp) + '</span>' +
          '<span class="warn-item__count">&times;' + clusters.length + '</span>' +
          (first < MAX_RENDER
            ? '<button type="button" class="btn btn--ghost btn--small" data-jump="' + first + '">Jump to cluster ' + (first + 1) + '</button>'
            : '') +
          '</div>' +
          '<p class="warn-item__risk">' + esc(entry.risk) + '</p>' +
          '<p class="warn-item__cite">Cited: <a href="' + esc(entry.source.url) + '">' + esc(entry.source.doc) + '</a>, ' +
          esc(entry.source.section) + ' &middot; verified ' + esc(entry.verified_on) + '</p>' +
          '</div>';
      }
      html += '</div>';
    }
    els.warnings.innerHTML = html;
  }

  els.warnings.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-jump]');
    if (!b) return;
    const i = parseInt(b.getAttribute('data-jump'), 10);
    const clusters = E.clustersOf(els.paste.value);
    selectedCluster = -1;         // force select (not toggle-off)
    selectCluster(i, clusters);
    const card = $('cluster-' + i);
    if (card) { card.scrollIntoView({ block: 'center' }); card.focus(); }
  });

  /* ---------- normalization ---------- */
  function renderNorm(s) {
    if (!s) { els.norm.innerHTML = '<p class="warn-none">Paste text above to diff its forms.</p>'; return; }
    const d = E.diffForms(s);
    const origClusters = E.clustersOf(s);
    let html = '';
    for (const f of E.FORMS) {
      const { text, changed } = d[f];
      let body;
      if (!changed) {
        body = renderTextHtml(text.length > 400 ? text.slice(0, 400) + '…' : text);
      } else {
        // highlight original clusters that are unstable under this form
        const parts = [];
        for (const cl of origClusters.slice(0, 400)) {
          const t = cl.normalize(f);
          parts.push(t !== cl
            ? '<span class="u-chg">' + renderTextHtml(t) + '</span>'
            : renderTextHtml(cl));
        }
        body = parts.join('') + (origClusters.length > 400 ? '…' : '');
      }
      const c = E.countsOf(text);
      html += '<div class="norm-row">' +
        '<span class="norm-row__form">' + f + '</span>' +
        '<span class="badge ' + (changed ? 'badge--changed' : 'badge--same') + '">' + (changed ? 'changed' : 'unchanged') + '</span>' +
        '<span class="norm-row__text">' + body + '</span>' +
        '<span class="norm-row__meta">' + fmt(c.codepoints) + ' cp / ' + fmt(c.utf8) + ' B ' +
        '<button type="button" class="btn btn--ghost btn--small" data-copyform="' + f + '">Copy</button></span>' +
        '</div>';
    }
    els.norm.innerHTML = html;
  }

  els.norm.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-copyform]');
    if (!b) return;
    copyText(els.paste.value.normalize(b.getAttribute('data-copyform')), b);
  });

  /* ---------- compare ---------- */
  function renderCompare() {
    const a = els.cmpA.value, b = els.cmpB.value;
    if (!a && !b) { els.cmpVerdicts.innerHTML = ''; return; }
    const raw = E.rawEqual(a, b);
    const nfc = E.nfcEqual(a, b);
    const div = E.firstDivergence(a, b);
    const v = [];
    v.push(verdictRow(raw, 'Raw equal (===): ' + (raw ? 'yes' : 'no')));
    v.push(verdictRow(nfc, 'NFC-equal: ' + (nfc ? 'yes — these are the same text in different normalization forms' : 'no')));
    if (div >= 0) {
      const A = [...a], B = [...b];
      const ca = A[div], cb = B[div];
      const da = ca === undefined ? '(end of A)' : uplus(ca.codePointAt(0)) + nameSuffix(ca);
      const db = cb === undefined ? '(end of B)' : uplus(cb.codePointAt(0)) + nameSuffix(cb);
      v.push('<div class="verdict"><span class="verdict__mark verdict__mark--no">&#8800;</span>' +
        '<span>First divergent codepoint at index ' + div + ': <code>' + esc(da) + '</code> vs <code>' + esc(db) + '</code></span></div>');
    }
    const explain = new Map();
    for (const s of [a, b]) for (const h of E.scan(s)) explain.set(h.id, E.catalogById(h.id));
    if (!raw && explain.size) {
      const list = [...explain.values()].map((e) =>
        '<span class="reveal">' + esc(e.abbrev) + '</span> ' + esc(e.name)).join(' &middot; ');
      v.push('<div class="verdict"><span class="verdict__mark">flag</span><span>Cataloged characters present that can make a visual match lie: ' + list + '</span></div>');
    }
    els.cmpVerdicts.innerHTML = v.join('');
  }
  function nameSuffix(ch) {
    const e = E.findFlag(ch.codePointAt(0));
    return e ? ' (' + e.name + ')' : ' "' + ch + '"';
  }
  function verdictRow(yes, text) {
    return '<div class="verdict"><span class="verdict__mark ' + (yes ? 'verdict__mark--yes' : 'verdict__mark--no') + '">' +
      (yes ? 'YES' : 'NO') + '</span><span>' + esc(text) + '</span></div>';
  }

  /* ---------- clean ---------- */
  function cleanOpts() {
    return {
      zeroWidth: els.optZw.checked,
      stripAllJoiners: els.optAll.checked,
      spaces: els.optSp.checked,
      bidi: els.optBidi.checked,
      nfc: els.optNfc.checked,
    };
  }
  function renderClean(s) {
    const opts = cleanOpts();
    store.set(LS.clean, JSON.stringify(opts));
    const out = E.clean(s, opts);
    els.cleanOut.value = out;
    if (!s) { els.cleanStats.textContent = ''; return; }
    const before = E.countsOf(s), after = E.countsOf(out);
    const flaggedBefore = E.scan(s).length, flaggedAfter = E.scan(out).length;
    els.cleanStats.textContent =
      'codepoints ' + fmt(before.codepoints) + ' → ' + fmt(after.codepoints) +
      ' · flagged occurrences ' + fmt(flaggedBefore) + ' → ' + fmt(flaggedAfter) +
      (out === s ? ' · nothing to change' : '');
  }

  /* ---------- copy ---------- */
  function copyText(text, btnForStatus) {
    const done = (ok) => {
      els.copyStatus.textContent = ok ? 'Copied.' : 'Copy failed — select and copy manually.';
      setTimeout(() => { els.copyStatus.textContent = ''; }, 2500);
      if (btnForStatus && ok) {
        const old = btnForStatus.textContent;
        btnForStatus.textContent = 'Copied';
        setTimeout(() => { btnForStatus.textContent = old; }, 1500);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
    } else done(false);
  }
  els.copyClean.addEventListener('click', () => copyText(els.cleanOut.value));
  els.detailBody.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-copy]');
    if (b) copyText(b.getAttribute('data-copy'), b);
  });

  /* ---------- autosave ---------- */
  els.autosave.checked = store.get(LS.autosave) !== '0';
  els.autosave.addEventListener('change', () => {
    store.set(LS.autosave, els.autosave.checked ? '1' : '0');
    if (!els.autosave.checked) store.del(LS.input);
    else store.set(LS.input, els.paste.value);
  });
  els.clearSaved.addEventListener('click', () => {
    store.del(LS.input);
    els.copyStatus.textContent = 'Saved input cleared from localStorage.';
    setTimeout(() => { els.copyStatus.textContent = ''; }, 2500);
  });

  /* ---------- main render ---------- */
  let pending = 0;
  function onInput() {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      const s = els.paste.value;
      if (els.autosave.checked) store.set(LS.input, s);
      renderCounts(s);
      renderClusters(s);
      renderWarnings(s);
      renderNorm(s);
      renderClean(s);
    });
  }
  els.paste.addEventListener('input', () => { els.teaches.textContent = ''; onInput(); });
  for (const el of [els.optZw, els.optAll, els.optSp, els.optBidi, els.optNfc]) {
    el.addEventListener('change', () => renderClean(els.paste.value));
  }
  els.cmpA.addEventListener('input', renderCompare);
  els.cmpB.addEventListener('input', renderCompare);

  /* ---------- boot ---------- */
  try {
    const savedClean = JSON.parse(store.get(LS.clean) || 'null');
    if (savedClean) {
      els.optZw.checked = !!savedClean.zeroWidth;
      els.optAll.checked = !!savedClean.stripAllJoiners;
      els.optSp.checked = !!savedClean.spaces;
      els.optBidi.checked = !!savedClean.bidi;
      els.optNfc.checked = !!savedClean.nfc;
    }
  } catch (e) { /* corrupt settings: fall back to defaults */ }
  const saved = store.get(LS.input);
  if (saved && els.autosave.checked) els.paste.value = saved;
  onInput();
  renderCompare();
})();
