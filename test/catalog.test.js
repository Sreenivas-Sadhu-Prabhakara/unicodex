'use strict';
/* unicodex — flagged-catalog integrity tests. The per-class totals are the
   CORRECTED enumeration from the adversarial review (zero-width 13, bidi 12,
   space 17 incl. the ASCII reference row, line-break 2, confusable 24 = 68),
   derived from the enumerated corpus spec — not round numbers. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { FLAGGED, FLAGGED_CLASS_COUNTS } = require('../data/flagged.js');
const E = require('../engine.js');

const CP_RE = /^[0-9A-F]{4,6}(-[0-9A-F]{4,6})?$/;

test('catalog size: 60 ≤ entries ≤ 80, exactly 68 per the corrected enumeration', () => {
  assert.ok(FLAGGED.length >= 60 && FLAGGED.length <= 80);
  assert.equal(FLAGGED.length, 68);
});

test('per-class counts match the corrected enumeration (13/12/17/2/24)', () => {
  const counts = {};
  for (const e of FLAGGED) counts[e.category] = (counts[e.category] || 0) + 1;
  assert.deepEqual(counts, FLAGGED_CLASS_COUNTS);
  assert.deepEqual(FLAGGED_CLASS_COUNTS,
    { 'zero-width': 13, 'bidi': 12, 'space': 17, 'line-break': 2, 'confusable': 24 });
  assert.equal(Object.values(FLAGGED_CLASS_COUNTS).reduce((a, b) => a + b, 0), FLAGGED.length);
});

test('ids and cp values are unique; cp matches the hex/range grammar; ranges are ordered', () => {
  const ids = new Set(), cps = new Set();
  for (const e of FLAGGED) {
    assert.ok(!ids.has(e.id), `dup id ${e.id}`); ids.add(e.id);
    assert.ok(!cps.has(e.cp), `dup cp ${e.cp}`); cps.add(e.cp);
    assert.match(e.cp, CP_RE);
    const [lo, hi] = e.cp.split('-');
    if (hi) assert.ok(parseInt(lo, 16) < parseInt(hi, 16), `range order ${e.cp}`);
  }
});

test('every entry carries abbrev, name, risk, citation and an ISO verified_on date', () => {
  for (const e of FLAGGED) {
    assert.ok(e.abbrev && e.abbrev.length > 0, e.id);
    assert.ok(e.name && e.name.length > 0, e.id);
    assert.ok(e.risk && e.risk.length > 10, e.id);
    assert.ok(e.source && e.source.doc && e.source.section, e.id);
    assert.ok(e.source.url && e.source.url.startsWith('https://'), e.id);
    assert.match(e.verified_on, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(e.verified_on)), e.id);
  }
});

test('every confusable has a single lowercase-ASCII target; no other category does', () => {
  for (const e of FLAGGED) {
    if (e.category === 'confusable') assert.match(e.target, /^[a-z]$/, e.id);
    else assert.equal(e.target, undefined, e.id);
  }
});

test('exactly one reference row (ASCII space) and scan never flags it', () => {
  const refs = FLAGGED.filter((e) => e.reference);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].cp, '0020');
  assert.deepEqual(E.scan('plain ascii text'), []);
});

test('scan resolves every non-reference single-codepoint entry to itself', () => {
  for (const e of FLAGGED) {
    if (e.reference || e.cp.includes('-')) continue;
    const cp = parseInt(e.cp, 16);
    const found = E.findFlag(cp);
    assert.ok(found, e.id);
    assert.equal(found.id, e.id);
  }
  // range entries: spot-check bounds
  assert.equal(E.findFlag(0xFE00).id, 'vs');
  assert.equal(E.findFlag(0xFE0F).id, 'vs');
  assert.equal(E.findFlag(0xE0001).id, 'tags');
  assert.equal(E.findFlag(0xE007F).id, 'tags');
  assert.equal(E.findFlag(0x41), null);       // 'A' is never flagged
  assert.equal(E.findFlag(0x20), null);       // reference row is never flagged
});

test('categories are only the five documented ones', () => {
  const allowed = new Set(['zero-width', 'bidi', 'space', 'line-break', 'confusable']);
  for (const e of FLAGGED) assert.ok(allowed.has(e.category), e.category);
});

test('flagged zero-width/format and bidi entries really are invisible-class to the engine', () => {
  // engine-derived: every single-cp zero-width or bidi entry matches \p{Cf}
  const cf = /\p{Cf}/u;
  for (const e of FLAGGED) {
    if (e.cp.includes('-') || e.reference) continue;
    if (e.category === 'zero-width' || e.category === 'bidi') {
      const ch = String.fromCodePoint(parseInt(e.cp, 16));
      if (e.id === 'cgj') { assert.match(ch, /\p{M}/u); continue; } // CGJ is a combining mark
      assert.match(ch, cf, `${e.id} should be format-class`);
    }
    if (e.category === 'space') {
      assert.match(String.fromCodePoint(parseInt(e.cp, 16)), /\p{Zs}/u, e.id);
    }
    if (e.category === 'line-break') {
      assert.match(String.fromCodePoint(parseInt(e.cp, 16)), /[\p{Zl}\p{Zp}]/u, e.id);
    }
    if (e.category === 'confusable') {
      assert.match(String.fromCodePoint(parseInt(e.cp, 16)), /\p{L}/u, e.id);
    }
  }
});

test('confusables never equal their ASCII targets, raw or NFC (that is the whole point)', () => {
  for (const e of FLAGGED) {
    if (e.category !== 'confusable') continue;
    const ch = String.fromCodePoint(parseInt(e.cp, 16));
    assert.notEqual(ch, e.target, e.id);
    assert.equal(E.nfcEqual(ch, e.target), false, e.id);
  }
});
