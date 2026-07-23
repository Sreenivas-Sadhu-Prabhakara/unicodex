'use strict';
/* unicodex — engine self-tests. Every fixture below is hand-computed in the
   brief and re-derived here against the real host engine (Intl.Segmenter,
   TextEncoder, String.normalize). Run: node --test */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');

const NFC_CAFE = 'café';          // precomposed é
const NFD_CAFE = 'café';         // e + COMBINING ACUTE ACCENT
const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}';
const FLAG_IN = '\u{1F1EE}\u{1F1F3}';
const KITAB = 'किताब'; // किताब

test('counts: café NFC = 4/4/4/5 and café NFD = 4/5/5/6', () => {
  assert.deepEqual(E.countsOf(NFC_CAFE), { graphemes: 4, utf16: 4, codepoints: 4, utf8: 5 });
  // NFD é is e + U+0301 (UTF-8: CC 81, 2 bytes)
  assert.deepEqual(E.countsOf(NFD_CAFE), { graphemes: 4, utf16: 5, codepoints: 5, utf8: 6 });
  assert.equal(E.utf8Hex('́'), 'CC 81');
});

test('counts: family-emoji ZWJ sequence = 1/11/7/25', () => {
  // 4 emoji ×(2 UTF-16 units / 4 UTF-8 bytes) + 3 ZWJ ×(1 unit / 3 bytes)
  assert.deepEqual(E.countsOf(FAMILY), { graphemes: 1, utf16: 11, codepoints: 7, utf8: 25 });
});

test('counts: flag pair 🇮🇳 = 1/4/2/8', () => {
  assert.deepEqual(E.countsOf(FLAG_IN), { graphemes: 1, utf16: 4, codepoints: 2, utf8: 8 });
});

test('counts + clusters: किताब = 3/5/5/15, clusters [कि, ता, ब] (version-stable GB9a)', () => {
  assert.deepEqual(E.countsOf(KITAB), { graphemes: 3, utf16: 5, codepoints: 5, utf8: 15 });
  assert.deepEqual(E.clustersOf(KITAB), ['कि', 'ता', 'ब']);
});

test('utf8Hex fixtures: €, अ, 😀', () => {
  assert.equal(E.utf8Hex('€'), 'E2 82 AC');
  assert.equal(E.utf8Hex('अ'), 'E0 A4 85');
  assert.equal(E.utf8Hex('\u{1F600}'), 'F0 9F 98 80');
});

test('utf16 surrogate pair for 😀 is D83D DE00 (hand-derived)', () => {
  // 0x1F600 − 0x10000 = 0xF600; high = D800 + (0xF600 >> 10) = D800 + 0x3D = D83D;
  // low = DC00 + (0xF600 & 0x3FF) = DC00 + 0x200 = DE00.
  const r = E.utf16UnitsOf('\u{1F600}');
  assert.deepEqual(r.units, ['D83D', 'DE00']);
  assert.equal(r.surrogatePair, true);
  assert.equal(E.utf16UnitsOf('a').surrogatePair, false);
});

test('normalization: NFC/NFD/NFKC/NFKD behave per UAX #15', () => {
  assert.equal(NFD_CAFE.charAt(3) === 'e' && NFC_CAFE.normalize('NFD'), NFD_CAFE);
  assert.equal(E.forms(NFD_CAFE).NFC, NFC_CAFE);           // nfc('é' NFD) === 'é'
  assert.equal(E.forms(NFC_CAFE).NFD, NFD_CAFE);           // nfd('é') === 'e◌́'
  assert.equal(E.forms('ﬁ').NFKC, 'fi');              // nfkc('ﬁ') === 'fi'
  assert.equal(E.forms('ﬁ').NFD, 'ﬁ');           // compat-only decomposition: NFD leaves ﬁ alone
  assert.equal(E.forms('²').NFKC, '2');               // nfkc('²') === '2'
});

test('diffForms(café NFC): NFD/NFKD changed, NFC/NFKC unchanged', () => {
  const d = E.diffForms(NFC_CAFE);
  assert.equal(d.NFC.changed, false);
  assert.equal(d.NFKC.changed, false);
  assert.equal(d.NFD.changed, true);
  assert.equal(d.NFKD.changed, true);
  assert.equal(d.NFD.text, NFD_CAFE);
});

test('scan: ZWSP flagged with cluster index; BOM; clean café scans empty', () => {
  assert.deepEqual(E.scan('a​b'), [{ id: 'zwsp', clusterIndex: 1 }]);
  assert.equal(E.scan('﻿x')[0].id, 'bom');
  assert.deepEqual(E.scan(NFC_CAFE), []);
  assert.deepEqual(E.scan(NFD_CAFE), []);   // combining accent is NOT flagged
});

test('scan: раypal flags exactly two confusables (U+0440→p, U+0430→a)', () => {
  const hits = E.scan('раypal');
  assert.equal(hits.length, 2);
  const entries = hits.map((h) => E.catalogById(h.id));
  assert.deepEqual(entries.map((e) => e.cp), ['0440', '0430']);
  assert.deepEqual(entries.map((e) => e.target), ['p', 'a']);
  assert.deepEqual(hits.map((h) => h.clusterIndex), [0, 1]);
});

test('compare: paypal vs раypal diverges at codepoint 0 and is not NFC-equal', () => {
  assert.equal(E.firstDivergence('paypal', 'раypal'), 0);
  assert.equal(E.nfcEqual('paypal', 'раypal'), false);
  assert.equal(E.rawEqual('paypal', 'раypal'), false);
});

test('compare: café NFC vs NFD — rawEqual false, nfcEqual true (the headline answer)', () => {
  assert.equal(E.rawEqual(NFC_CAFE, NFD_CAFE), false);
  assert.equal(E.nfcEqual(NFC_CAFE, NFD_CAFE), true);
  assert.equal(E.firstDivergence(NFC_CAFE, NFD_CAFE), 3);
});

test('clean: strip zero-widths + odd spaces, strip bidi', () => {
  assert.equal(E.clean('a​b c', { zeroWidth: true, spaces: true }), 'ab c');
  assert.equal(E.clean('‮evil', { bidi: true }), 'evil');
  assert.equal(E.clean('x⁠y﻿', { zeroWidth: true }), 'xy');
  assert.equal(E.clean(NFD_CAFE, { nfc: true }), NFC_CAFE);
});

test('AMENDMENT: default zero-width strip EXEMPTS ZWJ inside emoji sequences', () => {
  assert.equal(E.clean(FAMILY, { zeroWidth: true }), FAMILY);                // family survives
  // a ZWJ between plain letters is NOT exempt
  assert.equal(E.clean('a‍b', { zeroWidth: true }), 'ab');
});

test('AMENDMENT: default zero-width strip EXEMPTS ZWNJ between letters (Hindi/Persian)', () => {
  const hindi = 'क्‌ष';    // क् + ZWNJ + ष (virama context: prev is a mark)
  const persian = 'می‌خ';  // می + ZWNJ + خ
  assert.equal(E.clean(hindi, { zeroWidth: true }), hindi);
  assert.equal(E.clean(persian, { zeroWidth: true }), persian);
  // ZWNJ not between letters is stripped
  assert.equal(E.clean('a‌ ', { zeroWidth: true }), 'a ');
});

test('AMENDMENT: stripAllJoiners override strips ZWJ and ZWNJ everywhere', () => {
  assert.equal(E.clean(FAMILY, { zeroWidth: true, stripAllJoiners: true }),
    '\u{1F468}\u{1F469}\u{1F467}\u{1F466}');   // family decomposes
  assert.equal(E.clean('क्‌ष', { zeroWidth: true, stripAllJoiners: true }),
    'क्ष');
  // variation selectors: kept by default, stripped under the override
  assert.equal(E.clean('❤️', { zeroWidth: true }), '❤️');
  assert.equal(E.clean('❤️', { zeroWidth: true, stripAllJoiners: true }), '❤');
  // ZWJ after an emoji+VS16 pair is still recognized as an emoji joiner (VS-skipping neighbour walk)
  const heartFire = '❤️‍\u{1F525}';
  assert.equal(E.clean(heartFire, { zeroWidth: true }), heartFire);
});

test('clean is idempotent over all 10 gallery samples (every option combination that ships)', () => {
  const optSets = [
    { zeroWidth: true }, { spaces: true }, { bidi: true }, { nfc: true },
    { zeroWidth: true, spaces: true, bidi: true, nfc: true },
    { zeroWidth: true, spaces: true, bidi: true, nfc: true, stripAllJoiners: true },
  ];
  for (const g of E.GALLERY) {
    for (const opts of optSets) {
      const once = E.clean(g.text, opts);
      assert.equal(E.clean(once, opts), once, `idempotence: ${g.id} ${JSON.stringify(opts)}`);
    }
  }
});

test('engine cross-check on all 10 gallery samples: byte sums and codepoint counts', () => {
  assert.equal(E.GALLERY.length, 10);
  const enc = new TextEncoder();
  for (const g of E.GALLERY) {
    const perCpBytes = [...g.text]
      .map((c) => E.utf8BytesOfCp(c.codePointAt(0)).length)
      .reduce((a, b) => a + b, 0);
    assert.equal(perCpBytes, enc.encode(g.text).length, `utf8 sum: ${g.id}`);
    assert.equal(E.countsOf(g.text).codepoints, [...g.text].length, `cp count: ${g.id}`);
  }
});

test('gallery teaches what it claims: trojan has RLO, bom-json has BOM, js-breaker has LS, nbsp has NBSP', () => {
  const byId = Object.fromEntries(E.GALLERY.map((g) => [g.id, g.text]));
  assert.ok(byId['trojan'].includes('‮'));
  assert.ok(byId['bom-json'].startsWith('﻿'));
  assert.ok(byId['js-breaker'].includes(' '));
  assert.ok(byId['nbsp'].includes(' '));
  assert.equal(byId['cafe-nfd'], NFD_CAFE);
  assert.equal(byId['paypal'], 'раypal');
});

test('escapes: JS, JSON surrogate pairs, HTML, Python', () => {
  assert.equal(E.escJs(0x1F600), '\\u{1F600}');
  assert.equal(E.escJs(0xE9), '\\u00E9');
  assert.equal(E.escJson(0x1F600), '\\uD83D\\uDE00');
  assert.equal(E.escJson(0x200B), '\\u200B');
  assert.equal(E.escHtml(0x1F600), '&#x1F600;');
  assert.equal(E.escPy(0xE9), '\\u00E9');
  assert.equal(E.escPy(0x1F600), '\\U0001F600');
});

test('property: JSON escape of a whole string round-trips through JSON.parse', () => {
  for (const g of E.GALLERY) {
    const escaped = E.escapeString(g.text, E.escJson);
    assert.equal(JSON.parse('"' + escaped + '"'), g.text, `json roundtrip: ${g.id}`);
  }
});

/* ---------- seeded property/fuzz test ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('property: 2000 seeded random strings satisfy the count/scan/clean invariants', () => {
  const rnd = mulberry32(0x5EED);
  const pool = [
    'a', 'Z', '9', ' ', '.', 'क', 'ि', '́', 'é',
    '\u{1F600}', '\u{1F468}', '‍', '‌', '​', ' ',
    '‮', '⁦', '﻿', ' ', '　', 'а', 'ο', '₹',
  ];
  const enc = new TextEncoder();
  for (let iter = 0; iter < 2000; iter++) {
    const len = 1 + Math.floor(rnd() * 12);
    let s = '';
    for (let i = 0; i < len; i++) s += pool[Math.floor(rnd() * pool.length)];

    // (1) per-codepoint UTF-8 byte sums equal the encoder's total
    const sum = [...s].map((c) => E.utf8BytesOfCp(c.codePointAt(0)).length).reduce((a, b) => a + b, 0);
    assert.equal(sum, enc.encode(s).length);

    // (2) cluster partition covers the string exactly
    assert.equal(E.clustersOf(s).join(''), s);

    // (3) every scan hit points at a real cluster and a real catalog entry
    const clusters = E.clustersOf(s);
    for (const h of E.scan(s)) {
      assert.ok(h.clusterIndex >= 0 && h.clusterIndex < clusters.length);
      assert.ok(E.catalogById(h.id));
    }

    // (4) full clean is idempotent and never contains strippable bidi/zero-width leftovers
    const opts = { zeroWidth: true, spaces: true, bidi: true, nfc: true, stripAllJoiners: true };
    const once = E.clean(s, opts);
    assert.equal(E.clean(once, opts), once);
    for (const h of E.scan(once)) {
      const cat = E.catalogById(h.id).category;
      assert.ok(cat !== 'bidi' && cat !== 'zero-width', `leftover ${h.id} in ${JSON.stringify(once)}`);
    }

    // (5) determinism: same input, same outputs
    assert.deepEqual(E.countsOf(s), E.countsOf(s));
    assert.deepEqual(E.scan(s), E.scan(s));
  }
});
