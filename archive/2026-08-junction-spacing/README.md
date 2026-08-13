# junction spacing: is deciding one boundary enough?

Copy in this repo is interpolated — a client-side string, a run that came from a
server, sometimes a third piece after it — and Chinese copy wants a space where
it meets a half-width run. The obvious reach is pangu.js, whose `spacingText()`
formats a whole string. But the dynamic run is not ours to edit: it has to come
out byte-identical, so the only question is **whether a space belongs at each
junction**.

Three things had to be answered: how much of pangu we would actually use,
whether a junction-only decision can be as good as a whole-string pass, and —
found last, after the first version shipped it wrong — **which locales want the
space typed at all**, since the answer is not "CJK".

## how much of pangu applies

pangu 9.1.0 is 63 ordered regexes over a whole string (`src/shared/index.ts`,
472 lines, one 200-line method). Sizes, bundled with esbuild for a browser
target:

| entry                                               | minified | gzip   | brotli |
| --------------------------------------------------- | -------- | ------ | ------ |
| `pangu/browser` — the only importable browser entry | 19.3 KB  | 6.5 KB | 5.8 KB |
| `dist/shared` — the text engine alone               | 9.9 KB   | 3.6 KB | 3.2 KB |

So about 45% of the shipped bytes are the DOM layer (walker, task scheduler,
visibility detector, MutationObserver), and none of it shakes out: the default
export is `new BrowserPangu()`, an instance, not a function. The 3.6 KB floor is
unreachable — `exports` exposes only `.` and `./browser`, and `.` pulls
`node:fs`, which fails a browser build outright (the `browser` field was removed
in 9.0.0).

`src/browser/boundary-spacing.ts` is the part that answers our question, and it
is not exported either. It takes **three** trailing characters, not one, and the
comment says why: `AN_COLON_CJK` only fires with the digit before the colon in
view.

## the two measurements

`probe.mjs` compares `@monorepo/utils`' `junction-spacing` against pangu on two
corpora. On the first — 25 × 24 × 16 interpolations of Chinese-plus-Latin copy —
pangu is the oracle wherever its whole-string pass only inserted junction
spaces:

```
scored against pangu   9278 combos, 18156 junction decisions
agreed                 17962 (98.93%)
pangu rewrote interior 322 combos  (out of scope: the dynamic run is not ours to edit)
disagreements by junction:
  x  32  o|“  ours flush, pangu space   e.g. "hello⟦“引用”"
  x  25  ”|f  ours flush, pangu space   e.g. "“引用”⟦files"
  x  20  %|f  ours flush, pangu space   e.g. "80%⟦files"
  x  20  )|f  ours flush, pangu space   e.g. "Math.floor(x)⟦files"
  …9 shapes in all
```

Every one of the 194 disagreements is a **half-width against half-width**
junction, which this implementation declines by design: a blanket rule there
would have to space `state-of-the-`⟦`art`, `GPT-`⟦`4o` and `src/`⟦`index.ts`
too, and pangu only avoids that with a compound-word placeholder pass and
per-line slash counting. Worth knowing that pangu's answer there is not local
either: `80%files` on its own is left alone, and only gets the space when a CJK
character appears elsewhere in the string, because `spacingText()` returns early
on `!ANY_CJK.test(text)`.

The second corpus has no oracle. Where the two differ, the reason is on the
left:

|                           | ours                  | pangu                  |
| ------------------------- | --------------------- | ---------------------- |
| `お近くの`⟦`Apple Store`⟧ | `お近くのApple Store` | `お近くの Apple Store` |
| ⟦`Mac`⟧`を詳しく見る`     | `Macを詳しく見る`     | `Mac を詳しく見る`     |
| `中文`⟦`Привет`⟧`世界`    | `中文 Привет 世界`    | `中文Привет世界`       |
| `中文`⟦`العربية`⟧`结束`   | `中文 العربية 结束`   | `中文العربية结束`      |
| `航班`⟦`✈`⟧`起飞`         | `航班✈起飞`           | `航班 ✈ 起飞`          |
| `中文`⟦`1️⃣`⟧`第一`        | `中文 1️⃣ 第一`        | `中文 1️⃣第一`          |
| `文件在`⟦`/foo/bar`⟧`里`  | `文件在 /foo/bar 里`  | `文件在/foo/bar 里`    |

- Han above U+FFFF: pangu's CJK class is nine hardcoded blocks, and
  `\p{scx=Han|Hira|Kana|Hang|Bopo}` covers **87371 more code points** than it
  over U+0000–U+3FFFF (28827 in both, 116 in pangu's ranges only — those are
  unassigned code points in the radicals blocks). Hangul syllables are the bulk
  of that difference, so the K in its CJK is decorative — but see the locale
  section below: Hangul is not something to space at all, and pangu is
  accidentally right there.
- Kana is where pangu is wrong rather than merely incomplete. Hiragana and
  Katakana are in its CJK class, so it produces `Mac を詳しく見る` and
  `お近くの Apple Store`, and neither is what Japanese ships.
- Cyrillic, Arabic, Hebrew, Thai, Devanagari: pangu's half-width class is
  `A-Za-z`, Greek, Latin-1, digits and a few symbols, so every other script gets
  nothing.
- `✈ ❤ ➡ ✂` (U+2700–27BF) sit inside that class, so pangu spaces them while
  leaving `😀 🔥 ⭐` flush — same visual category, opposite answer, decided by
  code point block. `❤️` with a variation selector then differs from `❤` without
  one, and only on one side.
- The path rule keys on a hardcoded directory list (`home|root|usr|etc|…`), so
  `文件在/usr/bin` gets the space and `文件在/foo/bar` does not.
- **`\p{scx=Han}` cannot be used on its own**: Script_Extensions includes CJK
  punctuation, so a first attempt produced `world 。`. It has to be intersected
  with `\p{L}\p{N}` and have the fullwidth forms removed.

## which locales take the space

The first version of this treated `wide` as one category, which quietly applied a
Chinese convention to Japanese and Korean. It is not one convention.

What the standards ask for is a **typographic gap of about a quarter em, from the
composition engine, belonging to no character**:

- W3C [CLReq](https://www.w3.org/TR/clreq/), Mixed Text Composition — spacing
  between Han and Western text in Chinese.
- W3C [JLReq](https://www.w3.org/TR/jlreq/) — 和欧文間の空き, the same gap in
  Japanese, which JIS X 4051 fixes at 四分アキ, a quarter em.
- W3C [KLReq](https://www.w3.org/TR/klreq/) for Korean, which already spaces
  words and so has no such rule to make.
- [CSS Text 4](https://www.w3.org/TR/css-text-4/#text-autospace-property)'s
  `text-autospace` is that gap handed to a stylesheet.

Typing a U+0020 is the Chinese _web_ convention on top of that — pangu.js is its
implementation — and nobody else's. Measured in Chrome 153 at 16px:

|                                | gap    |                                                                        |
| ------------------------------ | ------ | ---------------------------------------------------------------------- |
| `text-autospace: normal`       | 2.00px | ≈ 1/8 em                                                               |
| `text-autospace: no-autospace` | 0      | the **initial value**, so autospace is opt-in                          |
| typed U+0020                   | 4.19px | ≈ 1/4 em, and it suppresses the autospace rather than stacking with it |

So inserting a character where CSS would do is not neutral: it is 2.09× the gap
the engine would have drawn, and it is a real character — copied, searched,
line-breakable, stretched by `justify`.

Who does what: `locale-probe.mjs` walks the text nodes of one publisher's three
CJK localisations and counts the ones carrying a typed space at a CJK/Latin
boundary against the ones left flush. One publisher rather than a survey, so the
locale is the only thing varying — a house style compared against itself.

|                       | typed space | flush   | samples                                                                                                                                                     |
| --------------------- | ----------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| apple.com.cn, `zh-CN` | **115**     | 2       | spaced `探索 Mac`, `Mac 机型比较`; the two exceptions are filing numbers (`京ICP备10214630号`), where a space would be wrong                                |
| apple.com/jp, `ja-JP` | 10          | **127** | flush `お近くのApple Store`, `Macを詳しく見る`; the 10 spaced are a carousel's `項目 1 -` labels, not prose                                                 |
| apple.com/kr, `ko-KR` | **101**     | 15      | spaced `Mac 살펴보기`, `PC에서 Mac으로 갈아타기` — word boundaries; flush `Apple이 만든 앱`, `iPhone으로 탁월하게`, `Mac과 비즈니스` — every one a particle |

Korean's two columns are the whole answer in one row: the spaces are at word
boundaries, where Korean orthography has always put them and where the copy
already contains them, and the flush cases are particles. Counts drift by a few
between loads because the pages are dynamic; the direction does not.

Korean is the case that settles it. A particle (조사) attaches to whatever
precedes it, Latin words included, so `Apple 이 만든 앱` is a grammatical error
rather than a typographic preference — and no window of characters distinguishes
`Lime와` (particle, flush) from `Lime 와` (a word, which the copy would already
have spaced). Japanese と/は/を/が have the same shape. Hence: **Hangul never,
kana off by default, Han only.**

Han cannot be narrowed further by inspection, because a Japanese document is full
of it and Script_Extensions cannot tell `ja` from `zh`. Only the caller knows its
locale, so the policy is a parameter (`scripts`, defaulting to `['han']`), and a
Japanese host passes `scripts: []`.

## what a character-level probe gets wrong

The naive version of this — take one character from each side and ask
`spacingText(a + b) === a + ' ' + b` — was measured at **95.84%** against the
same oracle, all of the loss being missed spaces. Widening the window to three
characters each side reaches 99.10%, six reaches 99.55%, and it is **not
monotonic**: an early 6-character version scored below the 3-character one,
because the window cut `Math.floor(` off from its dot and the probe then edited
inside its own window. Three separate corrections were needed on top of a bigger
window, and they are the reason this implementation is not simply a wrapper:

1. **The equality test is wrong.** A space can land inside the window rather than
   at the junction (`蒸馏/` + `训` reads `蒸馏 / 训`), so the verdict has to be
   "was a space inserted at this offset", not "does the result equal `a b`".
2. **The gate is not local.** `spacingText()` returns early unless the string
   contains CJK, so whether `%`, brackets and possessives fire depends on
   characters nowhere near the junction. A window probe has to gate on the full
   string and decide on the window.
3. **Graphemes, not characters.** These five junctions each sit _inside_ one
   grapheme cluster, and inserting a space destroys the glyph:
   `点赞👍`⟦`🏽了`, `喜欢❤`⟦`️的` (variation selector), `来自🇯`⟦`🇵的用户`
   (regional indicator pair), `一家👨‍`⟦`👩‍👧` (ZWJ), `咖啡e`⟦`́很香` (NFD).
   `Intl.Segmenter` vetoes all five. pangu's own DOM path has no such guard.
   Decomposed text also classifies wrong without normalisation — `café` in NFD
   ends in a combining acute, which is in no character class — so the _probe_
   is NFC-normalised while the text is not.

A layered design that did all of this and still deferred to pangu for the
punctuation corner cases scored 9278/9278 on the first corpus. It was not kept:
once the window, the grapheme veto, the normalisation and the script classes are
in place, pangu is only answering for half-width-only junctions that we
deliberately decline anyway. `packages/utils/src/junction-spacing.ts` is the
same decision written as a class matrix: 2.0 KB minified, 958 bytes gzipped, no
dependency, against pangu's 6.5 KB gzipped.

## cost

```
needsSpaceBetween, plain junction:        7.5us/call
needsSpaceBetween, grapheme veto:         2.5us/call
needsSpaceBetween, 800-char left run:    14.9us/call
pangu.spacingText, same 800-char string: 38.5us/call
```

Bounded by the 32-code-point window rather than by the length of the runs, which
is the only reason the long-run row is not proportional to the string. Two
junctions per interpolation, so a label costs about 15–30µs uncached.

## what is still out of reach

A grapheme cluster that straddles the junction moves whole to one side, and the
spacing decision it creates on its _other_ edge is inside a run: `咖啡e` +
`́很香` composes to `咖啡é很香`, where the space belongs between `啡` and `é` —
a position interior to the first part. pangu, seeing the whole string, inserts
it. A junction-only tool cannot, and should not start editing runs to try.

Bidi is not answered here at all. This decides adjacency in logical order, and
for an RTL run the logically-last character is the visually-leftmost one, so
`dir="auto"` plus `unicode-bidi: isolate` on the dynamic run is the renderer's
half of the job — it has to be verified in a browser, not in this probe.

## running it

```bash
npm install --prefix archive/2026-08-junction-spacing
node archive/2026-08-junction-spacing/probe.mjs

pnpm exec playwright install chromium
node archive/2026-08-junction-spacing/locale-probe.mjs
```

pangu 9.1.0 is pinned in this directory's `package.json`, installed with npm
because `probe.mjs` is deliberately outside the pnpm workspace. Node runs its
TypeScript import by stripping types, so it needs Node >= 23.6; this repo is on
26.6.

`locale-probe.mjs` is the browser-and-network one: it loads three live pages, so
it is the one probe here whose numbers can move under it, and it prints its
samples alongside its counts for exactly that reason.
