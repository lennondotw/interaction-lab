/*
 * The corpus the board renders. Every case is copy that a real interpolation
 * could produce, and every group isolates one thing that decides a junction — so
 * where a row looks identical to another row, the two differ in where the space
 * came from rather than in what it looks like.
 *
 * archive/2026-08-junction-spacing has the measurements these came out of,
 * including which of them pangu.js answers differently, and why.
 */

export interface SpacingPart {
  readonly role: 'client' | 'dynamic';
  readonly text: string;
}

export interface SpacingCase {
  /** What the row is here to show. Without it, several read as duplicates. */
  readonly label: string;
  readonly parts: readonly SpacingPart[];
  /** Right-to-left copy, so the card is laid out the way its reader sees it. */
  readonly rtl?: boolean;
}

export interface SpacingGroup {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
  readonly cases: readonly SpacingCase[];
}

const client = (text: string): SpacingPart => ({ role: 'client', text });
const dynamic = (text: string): SpacingPart => ({ role: 'dynamic', text });

/*
 * Code points a reader cannot see, and sequences nobody can tell apart from
 * their composed or unmodified form, spelled as escapes so the source says which
 * one it is. Several of these cases are only interesting because of a character
 * that renders as nothing at all.
 */
const COMBINING_ACUTE = '\u0301';
const ZERO_WIDTH_JOINER = '\u200d';
const VARIATION_SELECTOR_16 = '\ufe0f';
const COMBINING_ENCLOSING_KEYCAP = '\u20e3';
const HEART = '\u2764';
const AIRPLANE = '\u2708';
const PARTY_POPPER = '\u{1f389}';
const THUMBS_UP = '\u{1f44d}';
const SKIN_TONE_FOUR = '\u{1f3fd}';
const REGIONAL_INDICATOR_J = '\u{1f1ef}';
const REGIONAL_INDICATOR_P = '\u{1f1f5}';

const CAFE_NFD = `Cafe${COMBINING_ACUTE}`;
const KEYCAP_ONE = `1${VARIATION_SELECTOR_16}${COMBINING_ENCLOSING_KEYCAP}`;
const FAMILY_HEAD = `\u{1f468}${ZERO_WIDTH_JOINER}`;
const FAMILY_TAIL = `\u{1f469}${ZERO_WIDTH_JOINER}\u{1f467}`;
const RED_HAIRED_WOMAN = `\u{1f469}${SKIN_TONE_FOUR}${ZERO_WIDTH_JOINER}\u{1f9b0}`;

export const SPACING_GROUPS: readonly SpacingGroup[] = [
  {
    blurb: 'One wide side and one half-width side is the whole of the common case.',
    cases: [
      { label: 'CJK, Latin, CJK — a space at each junction', parts: [client('和'), dynamic('Lime'), client('聊聊')] },
      { label: 'Latin, CJK, Latin', parts: [client('Chat'), dynamic('小明'), client('Today')] },
      { label: 'Digits count as half-width', parts: [client('第'), dynamic('2026'), client('年')] },
      { label: 'Both junctions, both directions', parts: [client('共有'), dynamic('42'), client('个项目')] },
      {
        label: 'A percentage is half-width on both edges',
        parts: [client('已完成'), dynamic('80%'), client('的任务')],
      },
      {
        label: 'Half-width against half-width: nothing to do',
        parts: [client('Chat'), dynamic('WithLime'), client('Today')],
      },
      { label: 'Wide against wide: nothing to do either', parts: [client('和'), dynamic('小明'), client('聊聊')] },
      {
        label: 'An empty dynamic run leaves the copy meeting itself',
        parts: [client('和'), dynamic(''), client('聊聊')],
      },
      {
        label: 'Same, where that junction does want a space',
        parts: [client('共有'), dynamic(''), client('42 个项目')],
      },
      { label: 'Nothing before the dynamic run', parts: [client(''), dynamic('Lime'), client('聊聊')] },
      { label: 'The client run ends half-width itself', parts: [client('和小明'), dynamic('Lime'), client('聊聊')] },
      {
        label: 'Two dynamic runs back to back',
        parts: [client('和'), dynamic('Lime'), dynamic('小明'), client('聊聊')],
      },
    ],
    id: 'basics',
    title: 'Basics',
  },
  {
    blurb:
      'A space already at a boundary settles it. These rows look alike on purpose: what differs is which side the space was written on, and whether anything was inserted at all.',
    cases: [
      {
        label: 'The copy wrote both spaces — nothing inserted',
        parts: [client('和 '), dynamic('Lime'), client(' 聊聊')],
      },
      { label: 'The dynamic run carries its own spaces', parts: [client('和'), dynamic(' Lime '), client('聊聊')] },
      {
        label: 'Client space on the left, inserted on the right',
        parts: [client('和 '), dynamic('Lime'), client('聊聊')],
      },
      {
        label: 'Inserted on the left, dynamic space on the right',
        parts: [client('和'), dynamic('Lime '), client('聊聊')],
      },
      { label: 'A newline is a boundary too', parts: [client('第一行\n'), dynamic('Lime'), client('聊聊')] },
      { label: 'A no-break space is already a space', parts: [client('和\u00a0'), dynamic('Lime'), client('聊聊')] },
    ],
    id: 'boundary-spaces',
    title: 'Spaces the copy already has',
  },
  {
    blurb:
      'Script is decided by Script_Extensions, so Han qualifies wherever it lives — not only inside the nine Unicode blocks pangu.js hardcodes, which stop below U+FFFF.',
    cases: [
      { label: 'Traditional — same script, same answer', parts: [client('與'), dynamic('Lime'), client('聊聊')] },
      {
        label: 'Bopomofo travels with Han: it annotates Chinese',
        parts: [client('ㄅㄆ'), dynamic('abc'), client('ㄇㄈ')],
      },
      {
        label: 'Han above U+FFFF — surrogate pairs',
        parts: [client('\u{20000}\u{20001}'), dynamic('word'), client('字')],
      },
      {
        label: 'Fullwidth letters carry their own sidebearing',
        parts: [client('世界'), dynamic('ＡＢＣ'), client('中文')],
      },
      { label: 'Fullwidth digits, same reason', parts: [client('第'), dynamic('１２３'), client('号')] },
      { label: 'CJK punctuation is not a wide letter', parts: [client('「引用」'), dynamic('quote'), client('')] },
    ],
    id: 'wide-scripts',
    title: 'Han, wherever it lives',
  },
  {
    /*
     * The group that exists because the first version of this board got it
     * wrong: it spaced Japanese and Korean too, on the grounds that kana and
     * Hangul are wide. Typing the space is the Chinese convention, and the other
     * two have their own answers.
     */
    blurb:
      'Typing the space is a Chinese convention, not a CJK one. Japanese wants the same gap from the composition engine rather than from a character — JLReq’s 和欧文間, a quarter em in JIS X 4051, which CSS text-autospace now provides — and Korean attaches particles to whatever precedes them, so a space there is a grammatical error rather than a preference. Measured on one publisher: apple.com.cn types the space in 123 text nodes against 2, apple.com/jp is 133 flush against 10, and apple.com/kr never spaces before a particle.',
    cases: [
      {
        label: 'Japanese: as apple.com/jp ships it, flush',
        parts: [client('お近くの'), dynamic('Apple Store'), client('')],
      },
      {
        label: 'A Japanese particle attaches to the Latin word',
        parts: [client(''), dynamic('Mac'), client('を詳しく見る')],
      },
      { label: 'And so does the next one', parts: [client('今日は'), dynamic('Lime'), client('と話す')] },
      {
        label: 'Hiragana against Latin: no character inserted',
        parts: [client('ひらがな'), dynamic('ABC'), client('です')],
      },
      { label: 'Halfwidth katakana is narrow, and still kana', parts: [client('ﾊﾝｶｸ'), dynamic('abc'), client('ｶﾅ')] },
      {
        label: 'Korean: the word boundary space is already in the copy, the particle takes none',
        parts: [client('오늘은 '), dynamic('Lime'), client('와 대화')],
      },
      {
        label: 'Korean: 으로 is a particle — apple.com/kr writes PC에서 Mac으로 갈아타기',
        parts: [client('PC에서 '), dynamic('Mac'), client('으로 갈아타기')],
      },
      { label: 'Korean: 이 is a particle too', parts: [client(''), dynamic('Apple'), client('이 만든 앱')] },
      {
        label: 'Hangul written decomposed, still Hangul, still flush',
        parts: [client('오늘은 '.normalize('NFD')), dynamic('Lime'), client('와 대화')],
      },
    ],
    id: 'locale-policy',
    title: 'Which locales take the space',
  },
  {
    blurb:
      'Halfwidth punctuation binds to the run on its left, so its space goes on the far side. Brackets and quotes take theirs outside the pair.',
    cases: [
      {
        label: 'The digit before the colon decides it, not the colon',
        parts: [client('版本 v1.2:'), dynamic('中文说明'), client('')],
      },
      {
        label: 'A comma after wide copy takes its space after itself',
        parts: [client('他说,'), dynamic('hello'), client('')],
      },
      {
        label: 'Never before itself — that space is inside the next run',
        parts: [client('中文'), dynamic(',请稍候'), client('')],
      },
      {
        label: 'A period split across parts stays a decimal point',
        parts: [client('版本 1.'), dynamic('2'), client('')],
      },
      { label: 'Straight quotes', parts: [client('和'), dynamic('"Lime"'), client('聊聊')] },
      { label: 'Curly quotes', parts: [client('和'), dynamic('“Lime”'), client('聊聊')] },
      { label: 'Brackets', parts: [client('中文'), dynamic('(hello)'), client('很好')] },
      {
        label: 'A hyphen inside a name is not an operator',
        parts: [client('使用'), dynamic('GPT-4o'), client('模型')],
      },
      { label: 'A trailing plus belongs to its own run', parts: [client('查看'), dynamic('Disney+'), client('会员')] },
      {
        label: 'A path, whatever its first segment is called',
        parts: [client('文件在'), dynamic('/foo/bar'), client('里')],
      },
      { label: 'A hashtag', parts: [client('标签'), dynamic('#lime'), client('很热')] },
      { label: 'A possessive stays flush', parts: [client('李明'), dynamic("'s profile"), client('')] },
      {
        label: 'Fullwidth punctuation already carries the space',
        parts: [client('他说：'), dynamic('hello'), client('')],
      },
    ],
    id: 'punctuation',
    title: 'Punctuation and pairs',
  },
  {
    blurb:
      'A junction inside one grapheme cluster is vetoed: a space there strands a modifier and destroys the glyph. Classifying by the NFC form of the cluster is what makes decomposed text and modified emoji read as their base character.',
    cases: [
      { label: 'Composed é', parts: [client('和'), dynamic('Café'), client('聊聊')] },
      {
        label: 'The same word decomposed — e plus a combining acute',
        parts: [client('和'), dynamic(CAFE_NFD), client('聊聊')],
      },
      {
        label: 'Vetoed: the combining mark would be stranded',
        parts: [client('咖啡e'), dynamic(`${COMBINING_ACUTE}很香`), client('')],
      },
      {
        label: 'Vetoed: a skin tone modifier',
        parts: [client(`点赞${THUMBS_UP}`), dynamic(`${SKIN_TONE_FOUR}了`), client('')],
      },
      {
        label: 'Vetoed: a variation selector',
        parts: [client(`喜欢${HEART}`), dynamic(`${VARIATION_SELECTOR_16}的`), client('')],
      },
      {
        label: 'Vetoed: a regional indicator pair',
        parts: [client(`来自${REGIONAL_INDICATOR_J}`), dynamic(`${REGIONAL_INDICATOR_P}的用户`), client('')],
      },
      { label: 'Vetoed: a ZWJ sequence', parts: [client(`一家${FAMILY_HEAD}`), dynamic(FAMILY_TAIL), client('')] },
      { label: 'A pictograph is neutral on both sides', parts: [client('庆祝'), dynamic(PARTY_POPPER), client('吧')] },
      {
        label: 'Neutral in the dingbats block too — pangu spaces this one',
        parts: [client('航班'), dynamic(AIRPLANE), client('起飞')],
      },
      {
        label: 'A keycap reads as its digit, on both sides',
        parts: [client('中文'), dynamic(KEYCAP_ONE), client('第一')],
      },
      { label: 'A whole emoji run is one cluster', parts: [client('你好'), dynamic(RED_HAIRED_WOMAN), client('世界')] },
    ],
    id: 'graphemes',
    title: 'Combining marks and emoji',
  },
  {
    blurb:
      'Every other half-width script gets what Latin gets. Bidi is the renderer’s half of the job: this decides adjacency in logical order, and for an RTL run the logically-last character is the visually-leftmost one — so isolate the run, or the space lands where the reader is not looking.',
    cases: [
      { label: 'Cyrillic', parts: [client('中文'), dynamic('Привет'), client('世界')] },
      { label: 'Greek', parts: [client('中文'), dynamic('λόγος'), client('结束')] },
      { label: 'Thai', parts: [client('中文'), dynamic('ไทย'), client('结束')] },
      { label: 'Devanagari', parts: [client('中文'), dynamic('हिन्दी'), client('结束')] },
      {
        label:
          'Arabic against Latin is half-width on both sides, so nothing is inserted — these gaps are the copy’s own',
        parts: [client('تحدث مع '), dynamic('Lime'), client(' اليوم')],
        rtl: true,
      },
      { label: 'Hebrew, the same', parts: [client('דבר עם '), dynamic('Lime'), client(' היום')], rtl: true },
      {
        label: 'Arabic against digits, the same again',
        parts: [client('عدد '), dynamic('42'), client(' مشروع')],
        rtl: true,
      },
      {
        label: 'A CJK run inside RTL copy — two inserted spaces, in an RTL paragraph',
        parts: [client('اليوم'), dynamic('中文'), client('مع')],
        rtl: true,
      },
      { label: 'An Arabic run inside CJK copy', parts: [client('中文'), dynamic('العربية'), client('结束')] },
      { label: 'A Hebrew run inside CJK copy', parts: [client('中文'), dynamic('שלום'), client('结束')] },
      {
        label: 'An RTL run whose own edges are punctuation',
        parts: [client('他说'), dynamic('«سلام»'), client('结束')],
      },
    ],
    id: 'scripts-and-bidi',
    title: 'Other scripts, and bidi',
  },
];
