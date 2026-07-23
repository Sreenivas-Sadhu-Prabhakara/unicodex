/* ============================================================
   unicodex engine — every number the app shows comes from HERE,
   and everything here comes from the host engine itself:
   Intl.Segmenter, TextEncoder, String.normalize and \p{…} regexes.
   The flagged catalog (data/flagged.js) supplies only names, risk
   notes and citations. Dual-environment: browser global + Node.
   ============================================================ */
(function () {
  'use strict';

  const IS_NODE = typeof module !== 'undefined' && module.exports;
  const FLAGGED = IS_NODE ? require('./data/flagged.js').FLAGGED : globalThis.FLAGGED;

  const SEG = new Intl.Segmenter('en', { granularity: 'grapheme' });
  const ENC = new TextEncoder();

  /* ---------- catalog lookup (parsed once) ---------- */
  const RANGES = FLAGGED.map((e) => {
    const parts = e.cp.split('-');
    return { e, lo: parseInt(parts[0], 16), hi: parseInt(parts[1] || parts[0], 16) };
  });
  function findFlag(cp) {                       // flaggable entry for a codepoint (skips the ASCII reference row)
    for (const r of RANGES) if (cp >= r.lo && cp <= r.hi && !r.e.reference) return r.e;
    return null;
  }
  function catalogById(id) {
    for (const e of FLAGGED) if (e.id === id) return e;
    return null;
  }

  /* ---------- hex helpers ---------- */
  const hex2 = (b) => b.toString(16).toUpperCase().padStart(2, '0');
  const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');
  const cpHex = (cp) => cp.toString(16).toUpperCase().padStart(4, '0');

  /* ---------- segmentation + counts ---------- */
  function clustersOf(s) {
    const out = [];
    for (const part of SEG.segment(s)) out.push(part.segment);
    return out;
  }
  function countsOf(s) {
    return {
      graphemes: clustersOf(s).length,
      utf16: s.length,
      codepoints: [...s].length,
      utf8: ENC.encode(s).length,
    };
  }

  /* ---------- byte / unit views ---------- */
  function utf8Hex(s) {                          // 'E2 82 AC'
    return Array.from(ENC.encode(s), hex2).join(' ');
  }
  function utf8BytesOfCp(cp) {                   // ['F0','9F','98','80']
    return Array.from(ENC.encode(String.fromCodePoint(cp)), hex2);
  }
  function utf16UnitsOf(s) {                     // { units:['D83D','DE00'], surrogatePair:true }
    const units = [];
    let surrogatePair = false;
    for (let i = 0; i < s.length; i++) {
      const u = s.charCodeAt(i);
      if (u >= 0xd800 && u <= 0xdfff) surrogatePair = true;
      units.push(hex4(u));
    }
    return { units, surrogatePair };
  }

  /* ---------- engine-derived class chips (never a shipped table) ---------- */
  const CHIP_TESTS = [
    ['letter', /\p{L}/u],
    ['mark', /\p{M}/u],
    ['digit', /\p{Nd}/u],
    ['number', /\p{N}/u],
    ['punct', /\p{P}/u],
    ['symbol', /\p{S}/u],
    ['space', /\p{Z}/u],
    ['format', /\p{Cf}/u],
    ['control', /\p{Cc}/u],
    ['pictographic', /\p{Extended_Pictographic}/u],
  ];
  function classChipsOf(cp) {
    const ch = String.fromCodePoint(cp);
    const chips = [];
    for (const [label, re] of CHIP_TESTS) {
      if (re.test(ch)) {
        if (label === 'number' && chips.includes('digit')) continue; // digit implies number
        chips.push(label);
      }
    }
    return chips;
  }

  /* ---------- normalization ---------- */
  const FORMS = ['NFC', 'NFD', 'NFKC', 'NFKD'];
  function forms(s) {
    const out = {};
    for (const f of FORMS) out[f] = s.normalize(f);
    return out;
  }
  function diffForms(s) {
    const out = {};
    for (const f of FORMS) {
      const t = s.normalize(f);
      out[f] = { text: t, changed: t !== s };
    }
    return out;
  }

  /* ---------- full-text scan against the flagged catalog ---------- */
  function scan(s) {
    const hits = [];
    let clusterIndex = 0;
    for (const part of SEG.segment(s)) {
      for (const ch of part.segment) {
        const e = findFlag(ch.codePointAt(0));
        if (e) hits.push({ id: e.id, clusterIndex });
      }
      clusterIndex++;
    }
    return hits;
  }

  /* ---------- compare ---------- */
  const rawEqual = (a, b) => a === b;
  const nfcEqual = (a, b) => a.normalize('NFC') === b.normalize('NFC');
  function firstDivergence(a, b) {               // codepoint index of first difference, -1 if raw-equal
    const A = [...a], B = [...b];
    const n = Math.min(A.length, B.length);
    for (let i = 0; i < n; i++) if (A[i] !== B[i]) return i;
    return A.length === B.length ? -1 : n;
  }

  /* ---------- clean copy (mechanical, idempotent; never guesses intent) ----------
     Amendment-mandated exemptions in the DEFAULT zero-width strip:
       · ZWJ (U+200D) is KEPT when its nearest non-variation-selector neighbour on
         either side is Extended_Pictographic (emoji sequences stay whole);
       · ZWNJ (U+200C) is KEPT between letters/marks (orthographic in Hindi/Persian);
       · variation selectors FE00–FE0F are KEPT by default.
     opts.stripAllJoiners overrides all three exemptions ("strip all, including
     emoji/Indic joiners and variation selectors"). */
  const PICTO = /\p{Extended_Pictographic}/u;
  const LETTER_OR_MARK = /[\p{L}\p{M}]/u;
  const LETTER = /\p{L}/u;
  const isVS = (cp) => cp >= 0xfe00 && cp <= 0xfe0f;

  function clean(s, opts) {
    opts = opts || {};
    const cps = [...s];
    const neighbor = (i, dir) => {               // nearest non-VS neighbour codepoint's char, or ''
      let j = i + dir;
      while (j >= 0 && j < cps.length && isVS(cps[j].codePointAt(0))) j += dir;
      return j >= 0 && j < cps.length ? cps[j] : '';
    };
    const out = [];
    for (let i = 0; i < cps.length; i++) {
      const ch = cps[i];
      const cp = ch.codePointAt(0);
      const e = findFlag(cp);
      if (e) {
        if (e.category === 'zero-width' && opts.zeroWidth) {
          if (!opts.stripAllJoiners) {
            if (cp === 0x200d) {                  // ZWJ: keep inside emoji sequences
              const p = neighbor(i, -1), n = neighbor(i, +1);
              if ((p && PICTO.test(p)) || (n && PICTO.test(n))) { out.push(ch); continue; }
            } else if (cp === 0x200c) {           // ZWNJ: keep between letters/marks
              const p = neighbor(i, -1), n = neighbor(i, +1);
              if (p && LETTER_OR_MARK.test(p) && n && LETTER.test(n)) { out.push(ch); continue; }
            } else if (isVS(cp)) {                // variation selectors: keep by default
              out.push(ch); continue;
            }
          }
          continue;                               // strip
        }
        if (e.category === 'space' && opts.spaces && cp !== 0x20) { out.push(' '); continue; }
        if (e.category === 'bidi' && opts.bidi) continue;
        /* line-break + confusable entries are flagged, never auto-"fixed" */
      }
      out.push(ch);
    }
    let result = out.join('');
    if (opts.nfc) result = result.normalize('NFC');
    return result;
  }

  /* ---------- copy-as escapes ---------- */
  function escJs(cp) { return cp > 0xffff ? '\\u{' + cp.toString(16).toUpperCase() + '}' : '\\u' + hex4(cp); }
  function escJson(cp) {
    if (cp <= 0xffff) return '\\u' + hex4(cp);
    const v = cp - 0x10000;
    return '\\u' + hex4(0xd800 + (v >> 10)) + '\\u' + hex4(0xdc00 + (v & 0x3ff));
  }
  function escHtml(cp) { return '&#x' + cp.toString(16).toUpperCase() + ';'; }
  function escPy(cp) {
    return cp <= 0xffff ? '\\u' + hex4(cp) : '\\U' + cp.toString(16).toUpperCase().padStart(8, '0');
  }
  function escapeString(s, fn) { return [...s].map((c) => fn(c.codePointAt(0))).join(''); }

  /* ---------- sample gallery (10 demo strings) ---------- */
  const GALLERY = [
    { id: 'family', label: 'Family emoji 👨‍👩‍👧‍👦', text: '👨‍👩‍👧‍👦',
      teaches: 'One visible glyph = 7 codepoints = 11 UTF-16 units = 25 UTF-8 bytes. ZWJ glues four emoji into one cluster.' },
    { id: 'flag', label: 'Flag pair 🇮🇳', text: '🇮🇳',
      teaches: 'Flags are two Regional Indicator codepoints; .length says 4, you see 1.' },
    { id: 'cafe-nfd', label: 'café (decomposed)', text: 'café',
      teaches: 'This é is e + combining acute (NFD). It looks identical to precomposed café but has a different .length and fails ===.' },
    { id: 'kitab', label: 'किताब (Hindi)', text: 'किताब',
      teaches: '5 codepoints, but 3 grapheme clusters — the ि and ा matras join their consonants.' },
    { id: 'ligature', label: 'ﬁle ligature', text: 'ﬁle',
      teaches: 'U+FB01 LATIN SMALL LIGATURE FI only decomposes to "fi" under the compatibility forms NFKC/NFKD.' },
    { id: 'paypal', label: 'раypal spoof', text: 'раypal',
      teaches: 'The first two letters are Cyrillic er + a. Looks like "paypal", never equals it — a UTS #39 confusable spoof.' },
    { id: 'trojan', label: 'RLO filename trick', text: 'invoice_‮gnp.exe',
      teaches: 'RIGHT-TO-LEFT OVERRIDE makes "invoice_gnp.exe" display as "invoice_exe.png" — the Trojan Source class of attack.' },
    { id: 'bom-json', label: 'BOM + JSON', text: '﻿{"ok":true}',
      teaches: 'A leading byte-order mark is invisible but makes some parsers reject otherwise valid JSON.' },
    { id: 'js-breaker', label: 'U+2028 JS breaker', text: 'var s = "line break";',
      teaches: 'LINE SEPARATOR is legal in JSON but terminated pre-ES2019 JavaScript string literals — an invisible syntax error.' },
    { id: 'nbsp', label: 'NBSP sentence', text: 'Save ₹500 today',
      teaches: 'That gap after "Save" is NO-BREAK SPACE, not a space — word-split and exact match both fail.' },
  ];

  const api = {
    FLAGGED, findFlag, catalogById,
    cpHex, clustersOf, countsOf,
    utf8Hex, utf8BytesOfCp, utf16UnitsOf, classChipsOf,
    forms, diffForms, FORMS,
    scan, rawEqual, nfcEqual, firstDivergence,
    clean, escJs, escJson, escHtml, escPy, escapeString,
    GALLERY,
  };

  if (IS_NODE) module.exports = api;
  else globalThis.UnicodexEngine = api;
})();
