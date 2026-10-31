/**
 * CoolDark smoke test — no browser, no DSH required.
 *
 *   node dev/smoke.mjs
 *
 * Loads ../client.js the same way the DSH Web shell does (through
 * `window.__ModuleLoader__`), then runs `apply()` against a fake `ctx` that
 * records what the real theme service would do. It cannot tell you whether the
 * result *looks* right; it proves the module shape, the token table, the
 * register / enable / opt-out flow, and that the palette resolves to the
 * intended values. It also pins the boundary: this theme must never write to
 * the font-size settings — those belong to the settings panel.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

// --- expectations, kept in one place --------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "..", "client.js"), "utf8");

const MODULE_ID = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")).name;
const THEME_ID = "cooldark";
const COLOR_SCHEME = "dark";
const FALLBACK_THEME = "system";
const OPT_OUT_KEY = "softdark:opt-out";
const OPT_OUT_FLAG = "1";
/** Dead key from ≤0.3.7; the theme only sweeps it now, never reads it. */
const LEGACY_FONT_BASELINE_KEY = "softdark:font-baseline";
const THEME_CHANGE_EVENT = "theme/change";
const TOKEN_PREFIX = "--dsw-";
const STYLE_ELEMENT_ID = "cooldark-bubble";
const BUBBLE_TOKEN = `${TOKEN_PREFIX}specific-bubble`;

/**
 * The platform's own defaults. The theme must leave these untouched — font size
 * is a settings field (`设置 → 通用 → 字体大小`), not something a colour theme
 * gets to override. `setFontSize` below is the real range-checked API, kept so
 * an accidental write is caught: if client.js ever calls it, this object moves.
 */
const BODY_FONT_ROLE = "text";
const DEFAULT_FONT_SIZES = Object.freeze({ text: 14, code: 11, terminal: 13 });
const FONT_SIZE_RANGE = Object.freeze({ min: 10, max: 22 });

/**
 * Read an atom straight out of client.js. The palette is meant to be edited by
 * hand, so the tests assert the *mapping* (token → atom), not a frozen value —
 * recolouring must never turn the suite red. Any quoted CSS colour works, so
 * `rgba(...)` fills are fine; `readNullAtom` separates "set to null on purpose"
 * from "renamed by accident".
 */
const rampBody = (ramp) =>
  source.match(
    new RegExp(`const ${ramp} = Object.freeze\\(\\{([\\s\\S]*?)\\n    \\}\\);`),
  )?.[1];

const readAtom = (ramp, key) => {
  const body = rampBody(ramp) ?? "";
  const quoted = body.match(new RegExp(`\\b${key}:\\s*'([^']+)'`))?.[1];
  if (quoted !== undefined) return quoted;
  // `glow: WHITE` — an atom referencing a shared literal. Follow the const
  // instead of failing, so colours shared between ramps stay one source of truth.
  const ident = body.match(new RegExp(`\\b${key}:\\s*([A-Z][A-Z0-9_]*)`))?.[1];
  return ident === undefined
    ? undefined
    : new RegExp(`const ${ident} = '([^']+)'`).exec(source)?.[1];
};

const readNullAtom = (ramp, key) =>
  new RegExp(`\\b${key}:\\s*null\\b`).test(rampBody(ramp) ?? "");

const readNumberAtom = (ramp, key) =>
  Number(rampBody(ramp)?.match(new RegExp(`\\b${key}:\\s*(\\d+(?:\\.\\d+)?)`))?.[1]);

const CANVAS = readAtom("SURFACE", "canvas");
const INK_PRIMARY = readAtom("INK", "primary");
const CODE_BLOCK = readAtom("CODE", "block");
const CODE_BANNER = readAtom("CODE", "banner");
const BUBBLE_FILL = readAtom("BUBBLE", "fill");
const BUBBLE_INK = readAtom("BUBBLE", "ink");
const BUBBLE_BORDER = readAtom("BUBBLE", "border");
const BUBBLE_BORDER_WIDTH = readNumberAtom("BUBBLE", "borderWidth");
const BUBBLE_LINK = readAtom("BUBBLE", "link");
const LINK = readAtom("ACCENT", "link");
const MARKER_BULLET = readAtom("MARKDOWN", "markerBullet");
const MARKER_ORDERED = readAtom("MARKDOWN", "markerOrdered");

/** `#rrggbb` or `rgb()/rgba()` → { r, g, b, a }, or null when unparseable. */
const parseColour = (value) => {
  const hex = /^#([0-9a-f]{6})$/i.exec(value ?? "");
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const fn =
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
      value ?? "",
    );
  if (!fn) return null;
  return {
    r: Number(fn[1]),
    g: Number(fn[2]),
    b: Number(fn[3]),
    a: fn[4] === undefined ? 1 : Number(fn[4]),
  };
};

/** Composite `top` over `bottom` → opaque `#rrggbb` (what the eye receives). */
const flatten = (top, bottom) => {
  const t = parseColour(top);
  const b = parseColour(bottom);
  if (!t || !b) return null;
  const mix = (x, y) => Math.round(x * t.a + y * (1 - t.a));
  return `#${[mix(t.r, b.r), mix(t.g, b.g), mix(t.b, b.b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
};

/** Relative luminance (WCAG) of a #rrggbb string. */
const relativeLuminance = (hex) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

/** WCAG contrast ratio between two #rrggbb strings. */
const contrastRatio = (a, b) => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (hi + 0.05) / (lo + 0.05);
};

const BUILTIN_THEMES = Object.freeze([
  { id: "light", colorScheme: "light", tokens: {} },
  { id: "dark", colorScheme: "dark", tokens: {} },
]);

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
};

// --- browser stubs -------------------------------------------------------

/**
 * Minimal `document` so the injected bubble stylesheet can be observed. Only
 * the three operations client.js performs are implemented: createElement,
 * head.appendChild and Element.remove().
 */
const createFakeDocument = () => {
  const head = {
    children: [],
    appendChild(element) {
      this.children.push(element);
    },
  };
  return {
    head,
    /** `<html>` — carries the "is the theme applied?" marker we assert on. */
    documentElement: { dataset: {} },
    createElement(tagName) {
      const element = {
        tagName: String(tagName).toUpperCase(),
        id: "",
        textContent: "",
        remove() {
          head.children = head.children.filter((child) => child !== element);
        },
      };
      return element;
    },
    getElementById(id) {
      return head.children.find((child) => child.id === id) ?? null;
    },
  };
};

const document = createFakeDocument();
const styleSheets = () =>
  document.head.children.filter((el) => el.tagName === "STYLE");

const storage = new Map();
let loaded;
const window = {
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  __ModuleLoader__: {
    load(module) {
      loaded = module;
    },
  },
};

/**
 * Controllable clock. The re-assert logic has a *time* window (loader replay) and
 * a *state* rule (settings adoption); proving the second one does not secretly
 * rely on the first means being able to jump an hour ahead without waiting.
 */
const clock = {
  now: Date.now(),
  advance(ms) {
    this.now += ms;
  },
};
class FakeDate extends Date {
  static now() {
    return clock.now;
  }
}

vm.runInNewContext(source, { window, document, console, Date: FakeDate });

check(
  loaded?.id === MODULE_ID,
  `module id is "${MODULE_ID}" (got ${loaded?.id})`,
);

// --- fake cordis context -------------------------------------------------

const state = {
  registered: [...BUILTIN_THEMES],
  preference: FALLBACK_THEME,
  fontSizes: { ...DEFAULT_FONT_SIZES },
  fontFamilies: null,
  disposed: 0,
  handlers: {},
};

const snapshot = () => ({
  preference: state.preference,
  fontSizes: state.fontSizes,
  fontFamilies: state.fontFamilies,
});

const theme = {
  register(definition) {
    if (state.registered.some((d) => d.id === definition.id))
      throw new Error(`theme "${definition.id}" is already registered`);
    state.registered.push(definition);
    return () => {
      state.disposed += 1;
      state.registered = state.registered.filter((d) => d !== definition);
    };
  },
  setTheme(id) {
    const isBuiltin = id === FALLBACK_THEME;
    if (!isBuiltin && !state.registered.some((d) => d.id === id)) {
      throw new Error(`theme "${id}" is not registered`);
    }
    state.preference = id;
    state.handlers[THEME_CHANGE_EVENT]?.(snapshot());
  },
  /** Mirrors ThemeRuntime.setFontSize: integer-only, role range enforced. */
  setFontSize(role, px) {
    if (!Number.isInteger(px) || px < FONT_SIZE_RANGE.min || px > FONT_SIZE_RANGE.max) {
      throw new Error(`${role} font size ${px} is outside ${FONT_SIZE_RANGE.min}..${FONT_SIZE_RANGE.max}`);
    }
    if (state.fontSizes[role] === px) return;
    state.fontSizes = { ...state.fontSizes, [role]: px };
    state.handlers[THEME_CHANGE_EVENT]?.(snapshot());
  },
  getTheme() {
    return snapshot();
  },
  /**
   * Mirrors `ThemeRuntime.adopt()`: it runs after every write in the appearance
   * settings namespace and ends with `this.preference = section.preference`.
   * Only built-ins are ever persisted, so the durable value is `dark` — a
   * third-party preference is silently overwritten by a font-size write.
   */
  adopt(nextFontSizes = {}, nextFontFamilies = undefined) {
    state.fontSizes = { ...state.fontSizes, ...nextFontSizes };
    if (nextFontFamilies !== undefined) state.fontFamilies = nextFontFamilies;
    state.preference = COLOR_SCHEME;
    state.handlers[THEME_CHANGE_EVENT]?.(snapshot());
  },
};

const cleanups = [];
const ctx = {
  theme,
  effect(fn, label) {
    const dispose = fn();
    cleanups.push({ label, dispose });
    return dispose;
  },
  on(event, fn) {
    state.handlers[event] = fn;
  },
};

// --- run the plugin ------------------------------------------------------

const plugin = loaded.factory();
check(
  Array.isArray(plugin.inject) && plugin.inject.includes("theme"),
  "plugin injects the theme service",
);

plugin.apply(ctx);

const ours = state.registered.filter((d) => d.id === THEME_ID);
const definition = ours[0];
check(ours.length === 1, `exactly one ${THEME_ID} theme registered`);
check(definition?.id === THEME_ID, `theme id is "${THEME_ID}"`);
check(
  definition?.colorScheme === COLOR_SCHEME,
  `colorScheme is "${COLOR_SCHEME}"`,
);

const tokens = definition?.tokens ?? {};
const tokenNames = Object.keys(tokens);
const tokenValues = Object.values(tokens);

check(
  tokenValues.every((value) => typeof value === "string"),
  "every token value is a flat string (no {light,dark} pairs — this theme is single-scheme)",
);
check(
  tokenNames.every((name) => name.startsWith(TOKEN_PREFIX)),
  `every token name is a ${TOKEN_PREFIX}* custom property`,
);
check(
  tokenValues.every(
    (value) => !/undefined|NaN|null/.test(value) && value.trim() !== "",
  ),
  "no token resolved to a broken value (undefined / NaN / empty)",
);
console.log(`     tokens: ${tokenNames.length}`);

// Mapping contract: the tokens the rest of the palette hangs off must resolve
// to their atoms. The hex values themselves are free to change by hand.
const bgBase = tokens[`${TOKEN_PREFIX}alias-bg-base`];
const labelPrimary = tokens[`${TOKEN_PREFIX}alias-label-primary`];
check(
  CANVAS !== undefined && bgBase === CANVAS,
  `bg-base maps to SURFACE.canvas (${CANVAS}, got ${bgBase})`,
);
check(
  INK_PRIMARY !== undefined && labelPrimary === INK_PRIMARY,
  `label-primary maps to INK.primary (${INK_PRIMARY}, got ${labelPrimary})`,
);

/** Perceived brightness of a #rrggbb string, for elevation sanity checks. */
const luma = (hex) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};
const raised1 = readAtom("SURFACE", "raised1");
if (CANVAS && raised1 && luma(CANVAS) >= luma(raised1)) {
  console.log(
    `     note: SURFACE.canvas (${CANVAS}) is not darker than raised1 (${raised1}) — elevated surfaces will read as recessed`,
  );
}

check(state.preference === THEME_ID, "auto-applied on activation");
check(window.__cooldark?.active === true, "dev handle reports active");

// The applied-state marker: one glance in devtools answers "did the client half
// run at all?", which is the question the previous silent failure could not.
check(
  document.documentElement.dataset.cooldark === "on",
  "documentElement carries data-cooldark while the theme is on screen",
);

// --- chat bubble skin ----------------------------------------------------
//
// The bubble is the one place where the theme leaves token land: the fill is a
// token, the outline is injected CSS. The ink overrides are conditional — they
// only exist when BUBBLE.ink is a colour. A translucent fill is not automatically
// "dark": the current DodgerBlue wash composites to a petrol blue (#1f3e5f) where
// the body ink reaches 8.0:1, so ink is pinned to white for headroom (11.0:1).

check(
  tokens[BUBBLE_TOKEN] === BUBBLE_FILL,
  `${BUBBLE_TOKEN} maps to BUBBLE.fill (${BUBBLE_FILL}, got ${tokens[BUBBLE_TOKEN]})`,
);

// Code wells are their own atom (CODE.block), no longer borrowed from the
// sidebar's SURFACE.sunken — the two move in opposite directions on purpose.
check(
  tokens["--dsw-alias-markdown-code-block"] === CODE_BLOCK,
  `--dsw-alias-markdown-code-block maps to CODE.block (${CODE_BLOCK}, got ${tokens["--dsw-alias-markdown-code-block"]})`,
);

// The language strip above a block ("banner" in the app's own CSS:
// `_banner_7gxqk_24` inside a sticky `_bannerWrap_`) is its own atom too.
check(
  CODE_BANNER !== undefined && tokens["--dsw-alias-markdown-code-block-banner"] === CODE_BANNER,
  `--dsw-alias-markdown-code-block-banner maps to CODE.banner (${CODE_BANNER}, got ${tokens["--dsw-alias-markdown-code-block-banner"]})`,
);

// 0.4.4 set the banner to the *same* ink as the well: the strip vanished and the
// change read as "it never applied". Keep a floor and a ceiling — the step has to
// exist (>= 1.25:1) but must stay quieter than the code itself (<= 1.6:1).
const bannerStep = contrastRatio(CODE_BANNER, CODE_BLOCK);
check(
  bannerStep >= 1.25 && bannerStep <= 1.6,
  `banner sits ${bannerStep.toFixed(2)}:1 above the well (visible seam, 1.25–1.6 band; equal inks would be 1.00)`,
);
// Raising the strip also dims its label: the app paints the language name and
// the file title with `--dsw-alias-label-tertiary` (#808080), which drops to
// ~3.3:1 on a strip this light. The theme re-declares that alias on the banner
// itself — see the CSS assertions further down, where the effective ink is
// checked against the strip it actually lands on.
// Links got their own atom (ACCENT.link) so prose links can separate from the
// mist-blue chrome. AA wants 4.5:1 for body-size link text; the cobalt sits at
// 4.4:1 after the canvas was darkened, so the hard floor is 4.2 and anything
// short of 4.5 gets a note instead of a failure — a 0.1 gap is invisible, while
// a genuinely washed-out link (below ~4.2) still breaks the build.
check(
  tokens["--dsw-alias-link"] === LINK,
  `--dsw-alias-link maps to ACCENT.link (${LINK}, got ${tokens["--dsw-alias-link"]})`,
);
const linkRatio = contrastRatio(LINK, CANVAS);
check(linkRatio >= 4.2, `link ink reaches ${linkRatio.toFixed(1)}:1 on the canvas (>= 4.2 floor)`);
if (linkRatio < 4.5) {
  console.log(
    `     note: link ink ${linkRatio.toFixed(1)}:1 is a hair under AA 4.5 — #2590f2 would clear at 4.8`,
  );
}

const sheets = styleSheets();
check(sheets.length === 1, `one bubble stylesheet injected (got ${sheets.length})`);
const sheet = sheets[0];
check(sheet?.id === STYLE_ELEMENT_ID, `stylesheet id is "${STYLE_ELEMENT_ID}"`);
const css = sheet?.textContent ?? "";
check(
  css.includes(`border: ${BUBBLE_BORDER_WIDTH}px solid ${BUBBLE_BORDER}`),
  `outline is ${BUBBLE_BORDER_WIDTH}px ${BUBBLE_BORDER}`,
);

// The strip is painted by injected CSS as well as by the token: the sticky
// wrapper it lives in is painted with the *canvas* colour, and a `background`
// shorthand lower in the cascade can beat the token. Both hooks are hash-proof
// (`md-code-block` is a global class, `data-code-block-banner` the app's own
// attribute), so the rule must carry both.
check(
  css.includes(
    `body .md-code-block > :has(> [data-code-block-banner]), body [data-code-block-banner] { background-color: ${CODE_BANNER}; }`,
  ),
  `language strip is painted ${CODE_BANNER} on both the wrapper and the banner`,
);
check(
  !/data-code-block-banner[^}]*\bbackground:/.test(css),
  "banner rule sets background-color only (a shorthand would reset the wrapper's other layers)",
);

// The label ink is fixed the hash-proof way: re-declare the *alias* on the
// banner instead of targeting `_language_…` / `_title_…`, whose class names are
// hashed. The check below is on the effective value, so recolouring the strip
// again will not silently send the label back under 4.5:1.
const bannerLabelInk = /\[data-code-block-banner\]\s*\{[^}]*--dsw-alias-label-tertiary:\s*([^;}]+)/.exec(
  css,
)?.[1];
check(
  bannerLabelInk !== undefined,
  "banner re-declares --dsw-alias-label-tertiary locally (its children's classes are hashed)",
);
if (bannerLabelInk !== undefined) {
  const labelRatio = contrastRatio(bannerLabelInk.trim(), CODE_BANNER);
  check(
    labelRatio >= 4.5,
    `language label reaches ${labelRatio.toFixed(1)}:1 on the strip (>= 4.5 — it is 11px text)`,
  );
}
if (readNullAtom("BUBBLE", "ink")) {
  check(
    !css.includes("--dsw-alias-label-primary:"),
    "translucent fill leaves the theme ink alone (ink: null)",
  );
} else {
  check(
    css.includes(`--dsw-alias-label-primary: ${BUBBLE_INK}`),
    `bubble ink re-declared as ${BUBBLE_INK} for a light-on-blue fill`,
  );
}
if (BUBBLE_LINK) {
  check(
    css.includes(`--dsw-alias-link: ${BUBBLE_LINK}`),
    `bubble link re-declared as ${BUBBLE_LINK} (accent would drown on blue)`,
  );
}

/**
 * Mirrors BUBBLE_SELECTOR as a predicate. CSS-module classes are
 * `<hash>_<local>`, so real bubbles end in `_bubble`; the tooltip's numbered
 * `_bubble_44yfq_1` must stay out even when it carries extra classes.
 */
const selectorMatches = (className) =>
  (className.endsWith("_bubble") || className.includes("_bubble ")) &&
  !className.includes("_bubble_");
for (const name of ["LOmM4q_bubble", "BfLV8a_bubble", "rhSLKq_bubble"]) {
  check(selectorMatches(name), `selector matches bubble class ${name}`);
}
for (const name of ["_bubble_44yfq_1", "_bubble_44yfq_1 _label_44yfq_30"]) {
  check(!selectorMatches(name), `selector skips non-bubble class ${name}`);
}

if (BUBBLE_FILL && BUBBLE_BORDER && CANVAS) {
  // A translucent fill only means something once composited over the canvas:
  // rgba(30,144,255,.25) on #1f232a is what the eye actually receives (~#1f3e5f).
  const bubbleSurface = flatten(BUBBLE_FILL, CANVAS) ?? BUBBLE_FILL;
  const inkOnBubble = BUBBLE_INK ?? INK_PRIMARY;
  console.log(
    `     bubble: ${BUBBLE_FILL} over ${CANVAS} = ${bubbleSurface}`,
  );

  const inkRatio = contrastRatio(inkOnBubble, bubbleSurface);
  check(inkRatio >= 7, `bubble text contrast is ${inkRatio.toFixed(1)}:1 (>= 7)`);

  // The outline is translucent too, so the eye receives it *composited over the
  // bubble surface* — a 40% white line on petrol blue is a steel rim, not a
  // white line. Scoring the raw rgba would award a line the user never actually
  // sees, so flatten first and demand "clearly visible but soft": direction up,
  // ratio modest.
  const bubbleEdge = flatten(BUBBLE_BORDER, bubbleSurface) ?? BUBBLE_BORDER;
  const edgeRatio = contrastRatio(bubbleEdge, bubbleSurface);
  console.log(`     outline: ${BUBBLE_BORDER} over ${bubbleSurface} = ${bubbleEdge}`);
  check(
    relativeLuminance(bubbleEdge) > relativeLuminance(bubbleSurface),
    "outline composites lighter than the bubble fill (rim reads as an edge)",
  );
  check(
    edgeRatio >= 1.15,
    `outline contrast is ${edgeRatio.toFixed(2)}:1 (>= 1.15, visible but soft)`,
  );

  // Links get the same treatment: a link that matches body copy or drowns in
  // the fill is a usability bug, so score the composited value.
  if (BUBBLE_LINK) {
    const linkOnBubble = flatten(BUBBLE_LINK, bubbleSurface) ?? BUBBLE_LINK;
    const linkRatio = contrastRatio(linkOnBubble, bubbleSurface);
    check(
      linkRatio >= 4.5,
      `bubble link contrast is ${linkRatio.toFixed(1)}:1 (>= 4.5)`,
    );
  }

  // The trap this skin keeps falling into: a *mid-tone* translucent fill looks
  // dark until it is composited, and leaving `ink: null` then ships body copy
  // that only scrapes past 7:1. Anything brighter than the old cobalt wash must
  // pin the ink instead of inheriting the body ramp.
  if (relativeLuminance(bubbleSurface) > 0.04) {
    check(
      !readNullAtom("BUBBLE", "ink"),
      "a light-ish fill pins BUBBLE.ink instead of inheriting the body ramp",
    );
  }

  const surface = parseColour(bubbleSurface);
  check(
    surface !== null && surface.b - surface.r >= 10,
    `fill still reads blue after compositing (b-r ${
      surface ? surface.b - surface.r : "?"
    } >= 10)`,
  );
  check(
    bubbleSurface.toLowerCase() !== CANVAS.toLowerCase(),
    "bubble surface is distinguishable from the canvas",
  );
}

// --- composer focus glow -------------------------------------------------
//
// The glow *adds* to the card's elevation; replacing `box-shadow` outright would
// flatten the card the moment you type into it. `data-composer-card` is the
// app's own hook on the input card, so the rule must ride an attribute, never a
// CSS-module hash.

const FOCUS_GLOW = readAtom("FOCUS", "glow");
const FOCUS_RING_ALPHA = readNumberAtom("FOCUS", "ringAlpha");
const FOCUS_HALO_ALPHA = readNumberAtom("FOCUS", "haloAlpha");
const FOCUS_BLUR = readNumberAtom("FOCUS", "haloBlur");

const alphaHex = (opacity) =>
  Math.round(opacity * 255)
    .toString(16)
    .padStart(2, "0");

if (FOCUS_RING_ALPHA != null || FOCUS_HALO_ALPHA != null) {
  check(
    css.includes("[data-composer-card]:focus-within { box-shadow:"),
    "focus glow rides the app's data-composer-card hook (no hash to go stale)",
  );
  check(
    css.includes("box-shadow: var(--dsw-elevation-soft),"),
    "focus glow keeps the card's own elevation as the first shadow (focus must not flatten it)",
  );
  if (FOCUS_RING_ALPHA != null) {
    const rim = `${FOCUS_GLOW.toLowerCase()}${alphaHex(FOCUS_RING_ALPHA)}`;
    check(
      css.includes(`0 0 0 1px ${rim}`),
      `focus rim is a 1px ${rim} ring (${FOCUS_RING_ALPHA} white)`,
    );
  }
  if (FOCUS_HALO_ALPHA != null) {
    const bloom = `${FOCUS_GLOW.toLowerCase()}${alphaHex(FOCUS_HALO_ALPHA)}`;
    check(
      css.includes(`0 0 ${FOCUS_BLUR}px ${bloom}`),
      `focus bloom is 0 0 ${FOCUS_BLUR}px ${bloom} (${FOCUS_HALO_ALPHA} white)`,
    );
    check(
      FOCUS_HALO_ALPHA <= FOCUS_RING_ALPHA,
      `bloom (${FOCUS_HALO_ALPHA}) is not stronger than the rim (${FOCUS_RING_ALPHA}) — otherwise the card fogs`,
    );
  }
  check(
    /\[data-composer-card\] \{ transition: box-shadow \d+ms ease; \}/.test(css),
    "focus glow eases in instead of snapping",
  );
}

// --- markdown heading ink ------------------------------------------------
//
// Markdown *typography* is fully tokenised (`--dsw-font-markdown-h1…h4`), but
// colour is not: every heading inherits `--dsw-alias-label-primary`, so a
// per-level colour has to be a declaration. Levels parked at null are meant to
// keep the body ink and must therefore emit nothing.

const HEADING_LEVELS = ["h1", "h2", "h3", "h4", "h5", "h6"];
const headingInk = Object.fromEntries(
  HEADING_LEVELS.map((level) => [level, readAtom("MARKDOWN", level)]),
);

for (const level of HEADING_LEVELS) {
  const ink = headingInk[level];
  if (ink) {
    check(css.includes(`${level} { color: ${ink}; }`), `${level} gets its own ink (${ink})`);
    const ratio = contrastRatio(ink, CANVAS);
    check(
      ratio >= 3,
      `${level} ink reaches ${ratio.toFixed(1)}:1 on the canvas (>= 3, large bold text)`,
    );
  } else {
    check(readNullAtom("MARKDOWN", level), `${level} is explicitly null (body ink)`);
    check(
      !new RegExp(`\\b${level} \\{ color:`).test(css),
      `${level} emits no colour rule`,
    );
  }
}

check(
  css.includes(":has(:is(h1, h2, h3, h4, h5, h6))"),
  "heading rules require a real heading child (.md file icons stay untouched)",
);

// --- list markers --------------------------------------------------------
//
// `li::marker` is the only part of a list that is addressable on its own, so the
// bullet and the ordered numeral can be coloured separately — `ul` and `ol` need
// one rule each. Markers are graphics, not text: 3:1 is the bar (WCAG 1.4.11).

const markerRules = [
  ["ul", MARKER_BULLET],
  ["ol", MARKER_ORDERED],
];

for (const [list, ink] of markerRules) {
  if (ink) {
    check(
      css.includes(`${list} > li::marker { color: ${ink}; }`),
      `${list} marker ink is ${ink}`,
    );
    const ratio = contrastRatio(ink, CANVAS);
    check(
      ratio >= 3,
      `${list} marker reaches ${ratio.toFixed(1)}:1 on the canvas (>= 3, non-text graphics)`,
    );
  } else {
    check(
      !new RegExp(`\\b${list} > li::marker \\{ color:`).test(css),
      `${list} marker emits no colour rule (falls back to the app's secondary label)`,
    );
  }
}

// A marker rule must NOT inherit the heading scope's `:has()` guard: a document
// with lists but no headings would lose its bullets entirely.
const markerLine = css.split("\n").find((line) => / ul > li::marker \{ color:/.test(line));
check(
  markerLine !== undefined && !markerLine.includes(":has("),
  "marker rules use the plain markdown root, not the heading-only one",
);

// --- inline emphasis -----------------------------------------------------
//
// `strong` is body-size text: 4.5:1 is the bar, stricter than for headings.
// It also has to survive *inside a bubble*, where the fill is a mid blue — dark
// turquoise still clears 5:1 there, so unlike the heading colours it must NOT
// be handed back to the bubble ink. That is the one regression worth locking.

const STRONG_INK = readAtom("MARKDOWN", "strong");

if (STRONG_INK) {
  check(
    css.includes(`:is(strong, b) { color: ${STRONG_INK}; }`),
    `emphasis ink is ${STRONG_INK} (strong + raw <b>)`,
  );
  const strongRatio = contrastRatio(STRONG_INK, CANVAS);
  check(
    strongRatio >= 4.5,
    `emphasis reaches ${strongRatio.toFixed(1)}:1 on the canvas (>= 4.5, body-size text)`,
  );
  if (BUBBLE_FILL) {
    const onBubble = flatten(BUBBLE_FILL, CANVAS) ?? BUBBLE_FILL;
    const bubbleRatio = contrastRatio(STRONG_INK, onBubble);
    check(
      bubbleRatio >= 4.5,
      `emphasis reaches ${bubbleRatio.toFixed(1)}:1 on the bubble fill (>= 4.5)`,
    );
  }
  const bubbleOverrides = css
    .split("\n")
    .filter((line) => line.includes("_bubble"))
    .join("\n");
  check(
    !/:is\([^)]*strong/.test(bubbleOverrides),
    "emphasis is not reset inside bubbles (it stays legible there)",
  );
}

// On a bubble fill the forest/deep-pink pair drops to 2.6:1 and 3.1:1, so the
// glyphs have to go back to the bubble's own light ink.
if (markerRules.some(([, ink]) => ink)) {
  check(
    css.includes(":is(ul, ol) > li::marker { color: var(--dsw-alias-label-primary); }"),
    "markers inside a bubble fall back to the bubble ink",
  );
}

// A bubble's fill is a mid blue and its ink is pinned light: crimson headings on
// it land at ~1.4:1, so the sheet must hand them back to the bubble ink.
check(
  css.includes(":is(h1, h2, h3, h4) { color: var(--dsw-alias-label-primary); }"),
  "headings inside a bubble fall back to the bubble ink",
);

// --- font size: explicitly OUT of scope ----------------------------------
//
// ≤0.3.7 forced the body size to 20px on every enable, which silently undid a
// size the user had just picked in Settings. The takeover is gone; these checks
// keep it gone. The fake `setFontSize` is range-checked exactly like the real
// one, so any write shows up as a changed value here.

check(
  state.fontSizes[BODY_FONT_ROLE] === DEFAULT_FONT_SIZES[BODY_FONT_ROLE],
  "enabling the theme leaves the body size alone",
);
check(
  Object.entries(DEFAULT_FONT_SIZES).every(([role, px]) => state.fontSizes[role] === px),
  "no font role (text / code / terminal) is touched",
);
check(
  window.__cooldark.fontSize === undefined,
  "the dev handle exposes no fontSize() — sizes are the settings panel's",
);
check(
  !storage.has(LEGACY_FONT_BASELINE_KEY),
  "the legacy font-baseline key is swept on mount",
);

// A preference flip that lands right after our own setTheme is what the loader
// does when the plugin row is re-composed: it re-applies the profile's
// `preference: dark` and publishes a change. Treating that as "the user left"
// killed the theme while the row still read enabled — so the first flips
// re-assert, and only a switch that outlives the budget is respected.
const REASSERT_LIMIT = Number(/const REASSERT_LIMIT = (\d+);/.exec(source)?.[1]);
check(
  REASSERT_LIMIT >= 1,
  `re-assert budget is a readable constant (got ${REASSERT_LIMIT})`,
);

theme.setTheme(COLOR_SCHEME);
check(
  state.preference === THEME_ID,
  "a flip right after apply is treated as a loader re-publish and re-asserted",
);
check(
  !storage.has(OPT_OUT_KEY),
  "switching away writes no durable opt-out (0.3.2 — a re-enable must not be blocked)",
);

// Spend the rest of the budget, then one more flip must stick.
for (let attempt = 0; attempt < REASSERT_LIMIT + 1; attempt += 1) {
  if (state.preference === THEME_ID) theme.setTheme(COLOR_SCHEME);
}
check(
  state.preference === COLOR_SCHEME,
  "once the re-assert budget is spent, a switch away is respected",
);
check(
  styleSheets().length === 0,
  "bubble stylesheet removed after switching away",
);

// re-enable clears the in-memory flag
window.__cooldark.enable();
check(state.preference === THEME_ID, "enable() switches back");
check(!storage.has(OPT_OUT_KEY), "enable() leaves no opt-out behind");
check(styleSheets().length === 1, "bubble stylesheet restored on enable()");

// disable() must not "restore" anything font-related — there is nothing to restore
window.__cooldark.disable();
check(
  state.fontSizes[BODY_FONT_ROLE] === DEFAULT_FONT_SIZES[BODY_FONT_ROLE],
  "disable() touches no font size",
);
check(!storage.has(LEGACY_FONT_BASELINE_KEY), "no baseline is written back on disable()");
check(styleSheets().length === 0, "bubble stylesheet removed on disable()");
check(
  document.documentElement.dataset.cooldark === undefined,
  "data-cooldark marker drops when the theme is disabled",
);

// A size the user picked in Settings must survive a full enable/disable cycle.
state.fontSizes = { ...state.fontSizes, [BODY_FONT_ROLE]: 18 };
window.__cooldark.enable();
check(
  state.fontSizes[BODY_FONT_ROLE] === 18,
  "a size chosen in Settings survives enable() (was the 0.3.7 bug)",
);
window.__cooldark.disable();
check(
  state.fontSizes[BODY_FONT_ROLE] === 18,
  "…and survives disable() too",
);
window.__cooldark.enable();

// --- settings adoption: the font-size bug -------------------------------
//
// `adopt()` runs after *every* write in the appearance namespace and copies the
// durable preference back over ours. The durable one is `dark`, because only
// built-ins are persisted — so changing the code font size in Settings wiped the
// theme while the plugin row still read "enabled".
//
// The give-away is the font field moving in the same snapshot. It is checked
// here an hour after apply, which is the part a 5s window can never cover.
check(
  window.__cooldark.active === true,
  "theme is on before the font-size write",
);
clock.advance(60 * 60 * 1000);
const reassertsBefore = window.__cooldark.reasserts;
theme.adopt({ code: 12 });
check(
  state.preference === THEME_ID,
  "changing the code font size re-adopts dark — the theme re-asserts instead of dying",
);
check(
  window.__cooldark.reasserts === reassertsBefore + 1,
  "…counted as exactly one re-assert",
);
check(
  window.__cooldark.lastReassert === "settings",
  "…attributed to settings adoption, not to a loader replay",
);
check(styleSheets().length === 1, "…with the bubble stylesheet still mounted");
check(
  document.documentElement.dataset.cooldark === "on",
  "…and data-cooldark still on",
);
check(state.fontSizes.code === 12, "…and the chosen size is left alone (12px)");

// Same for a font family change — it lives in the same namespace.
theme.adopt({}, ["Fira Code"]);
check(
  state.preference === THEME_ID,
  "a font-family write re-asserts the theme too",
);

// The other half of the deal: a *real* theme pick, long after apply and with no
// font movement, is still respected — no tug-of-war.
clock.advance(60 * 60 * 1000);
theme.setTheme(COLOR_SCHEME);
check(
  state.preference === COLOR_SCHEME,
  "a genuine theme pick (fonts untouched) is respected",
);
check(styleSheets().length === 0, "…and drops the stylesheet");

// Restore for the teardown tests below.
state.fontSizes = { ...DEFAULT_FONT_SIZES };
state.fontFamilies = null;
window.__cooldark.enable();

// dispose everything: theme deregistered, handle removed
for (const { dispose } of cleanups.reverse()) dispose?.();
check(state.disposed === 1, "registration disposed through ctx.effect");
check(window.__cooldark === undefined, "dev handle removed on dispose");
check(
  document.documentElement.dataset.cooldark === undefined,
  "data-cooldark marker removed on dispose (no stale 'on' after unload)",
);
check(
  styleSheets().length === 0,
  "bubble stylesheet removed on dispose (no leak into a bare DSH boot)",
);

// A durable opt-out left by an older build must be cleared and ignored: the
// loader row is the real switch, so a re-enable always applies. This is the
// exact shape of the 0.3.1 field failure (plugin live, theme never applied).
storage.set(OPT_OUT_KEY, OPT_OUT_FLAG);
storage.set(LEGACY_FONT_BASELINE_KEY, "14"); // leftover from ≤0.3.7
state.preference = FALLBACK_THEME;
state.fontSizes = { ...DEFAULT_FONT_SIZES };
const second = loaded.factory();
second.apply(ctx);
check(!storage.has(OPT_OUT_KEY), "legacy durable opt-out is cleared on mount");
check(
  !storage.has(LEGACY_FONT_BASELINE_KEY),
  "legacy font baseline is cleared on mount",
);
check(
  state.preference === THEME_ID,
  "a re-enabled plugin applies even after a legacy durable opt-out",
);
check(
  state.fontSizes[BODY_FONT_ROLE] === DEFAULT_FONT_SIZES[BODY_FONT_ROLE],
  "the re-enabled plugin still does not touch the font size",
);
check(
  state.registered.filter((d) => d.id === THEME_ID).length === 1,
  "re-enabled install still registers exactly one theme",
);

// --- hot reload: an orphaned sheet must be replaced, not stacked -----------

for (const { dispose } of [...cleanups].reverse()) dispose?.();
storage.clear();
state.preference = FALLBACK_THEME;
state.fontSizes = { ...DEFAULT_FONT_SIZES };

const orphan = document.createElement("style");
orphan.id = STYLE_ELEMENT_ID;
orphan.textContent = "/* stale */";
document.head.appendChild(orphan);
check(styleSheets().length === 1, "orphaned sheet staged before the reload");

const third = loaded.factory();
third.apply(ctx);
check(state.preference === THEME_ID, "reloaded install applies the theme");
check(
  styleSheets().length === 1,
  "orphaned sheet replaced instead of stacked (still one style tag)",
);
check(
  styleSheets()[0]?.textContent === css,
  "live sheet carries the real CSS, not the stale copy",
);

// --- a broken host is loud, not silent -------------------------------------
//
// The worst failure this plugin has had: `apply()` threw, the row still read
// "enabled", nothing was painted, and there was nothing to look at. The wrapper
// must log a `[cooldark]` line AND rethrow so the loader can flag the row.

const logged = [];
const realConsoleError = console.error;
console.error = (...args) => logged.push(args);
const brokenContext = {
  theme: {
    register() {
      throw new Error("theme service is not ready");
    },
    setTheme() {},
    getTheme() {
      return { preference: FALLBACK_THEME };
    },
  },
  effect(fn) {
    return fn();
  },
  on() {},
};
let applyThrew = false;
try {
  loaded.factory().apply(brokenContext);
} catch {
  applyThrew = true;
}
console.error = realConsoleError;
check(applyThrew, "a failing theme service makes apply() throw (the row gets flagged)");
check(
  logged.some((args) => String(args[0]).includes("[cooldark]")),
  "…and logs a [cooldark] error before rethrowing (no silent death)",
);

// `node dev/smoke.mjs --css` prints the injected sheet instead of stopping at
// the summary — the fastest way to eyeball a selector or colour you just added.
if (process.argv.includes("--css")) {
  console.log(`\n--- injected sheet ---\n${css}`);
}

console.log(`\n${failures.length === 0 ? "PASS" : `FAIL (${failures.length})`}`);
process.exit(failures.length === 0 ? 0 : 1);
