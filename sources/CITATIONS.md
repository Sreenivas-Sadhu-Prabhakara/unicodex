# Sources & citations — unicodex flagged-character catalog

Every entry in `data/flagged.js` was verified on **2026-07-23** by downloading the
source documents below and string-matching the codepoint and its official name/mapping
against the staged file. Nothing in the catalog is from memory; nothing is fabricated.
All counts, bytes, cluster boundaries and normalization forms shown by the app come from
the **browser engine itself** (`Intl.Segmenter`, `TextEncoder`, `String.normalize`,
`\p{…}` regexes) — the catalog only supplies names, risk notes and citations for the
~70 flagged characters.

## Staged files

| File | What it is | Retrieved | Version |
|---|---|---|---|
| `UnicodeData.txt` | Unicode Character Database master file — official character names + general categories. <https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt> | 2026-07-23 | UCD "latest" (Unicode 17.0.0 line) |
| `unicodedata-flagged-rows.txt` | The exact 70 rows grepped from `UnicodeData.txt` for the catalog codepoints — the verbatim name source for every `name` field. | 2026-07-23 | derived from above |
| `confusablesSummary.txt` | UTS #39 confusables summary data. <https://www.unicode.org/Public/security/latest/confusablesSummary.txt> | 2026-07-23 | Version 17.0.0, dated 2025-07-22 |
| `confusables-verified-rows.txt` | Extraction log: for each of the 24 flagged confusable letters, the summary line proving it shares a confusability class with its ASCII target. | 2026-07-23 | derived from above |
| `tr9.html` | UAX #9, Unicode Bidirectional Algorithm — the 12 directional formatting characters (LRE/RLE/PDF/LRO/RLO, LRI/RLI/FSI/PDI, LRM/RLM/ALM). <https://www.unicode.org/reports/tr9/> | 2026-07-23 | Revision 51 |
| `tr15.html` | UAX #15, Unicode Normalization Forms — NFC/NFD/NFKC/NFKD definitions backing the normalization-diff panel. <https://www.unicode.org/reports/tr15/> | 2026-07-23 | Revision 57 |
| `tr29.html` | UAX #29, Unicode Text Segmentation — grapheme-cluster rules (incl. GB9a spacing marks, GB11 emoji ZWJ) that `Intl.Segmenter` implements. <https://www.unicode.org/reports/tr29/> | 2026-07-23 | Revision 47 |
| `tr39.html` | UTS #39, Unicode Security Mechanisms — confusable-detection framework cited by every confusable entry. <https://www.unicode.org/reports/tr39/> | 2026-07-23 | Revision 32 |
| `core-spec-ch23.html` | The Unicode Standard, Chapter 23 "Special Areas and Format Characters" (Layout Controls, ZWSP/ZWNJ/ZWJ/WJ, variation selectors, tag characters). <https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-23/> | 2026-07-23 | Unicode 17.0.0 |
| `trojan-source-arxiv.html` | Boucher & Anderson, "Trojan Source: Invisible Vulnerabilities" — the bidi source-code attack cited on the bidi category. <https://arxiv.org/abs/2111.00169> | 2026-07-23 | arXiv:2111.00169 |

## What was verified, exactly

- **Names (all 70 rows):** every `name` in `data/flagged.js` is transcribed verbatim
  from `UnicodeData.txt` (see `unicodedata-flagged-rows.txt`). Range entries
  (variation selectors FE00–FE0F, tag characters E0000–E007F) carry the block
  description with the first/last assigned names; note U+E0000 itself is unassigned —
  the first assigned tag character is U+E0001 LANGUAGE TAG.
- **Confusables (24):** each flagged letter was string-matched into a
  `confusablesSummary.txt` class whose primary is its single ASCII target
  (see `confusables-verified-rows.txt`). Two letters originally drafted
  (GREEK CHI, GREEK KAPPA) did **not** appear in the target classes and were
  **dropped, not shipped** — replaced by CYRILLIC IZHITSA (→v) and GREEK LUNATE
  SIGMA SYMBOL (→c), both verified.
- **Bidi (12):** all twelve codepoints appear in UAX #9's directional-formatting
  character tables (staged `tr9.html`).
- **Risk one-liners** are the app author's summaries, not quotes; the citation on each
  entry points at the document that motivates the flag.

## Honest gaps

- The Unicode "latest" UCD directory is not version-pinned by URL; the staged copies
  above are the exact bytes verified against, so the catalog is reproducible from this
  repo even if unicode.org moves.
- `confusablesSummary.txt` is data *for* UTS #39, not the prose spec; the prose
  (`tr39.html`) is staged alongside it.
