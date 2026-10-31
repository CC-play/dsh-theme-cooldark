/**
 * CoolDark — Client half.
 *
 * How theming works in DSH (verified against `@deepseek-ai/dsh-client-ui-theme`):
 *
 *   - `ctx.theme` is the theme service. It owns the light/dark/system preference
 *     and publishes an immutable `ThemeSnapshot`; `ctx.on('theme/change', fn)`
 *     receives one every time it changes.
 *   - `ctx.theme.register({ id, colorScheme, tokens })` adds a third-party theme.
 *     `colorScheme` picks which built-in palette the app keeps rendering with
 *     (`'dark'` here), and `tokens` is a flat map of `--dsw-alias-*` CSS custom
 *     properties → CSS values. The layout presenter writes them onto `<body>` as
 *     inline styles, so they win over the built-in `body[data-ds-dark-theme]`
 *     rule. Anything not overridden keeps its official value, which is why a
 *     partial map is legal — and why this file only carries colours.
 *   - `ctx.theme.setTheme(id)` switches to it. Third-party ids are in-process
 *     extensions: only `light`/`dark`/`system` are persisted by the settings
 *     scope, so a registered theme must re-apply itself on every boot. That is
 *     what AUTO_APPLY below does.
 *
 * File layout (edit top-down, nothing below CORE should need touching):
 *
 *   1. CONFIG      — theme id, scheme, persistence keys, behaviour switches
 *   2. COLOURS     — raw atoms: SURFACE / INK / ACCENT / STATE / CODE / BUBBLE /
 *                    MARKDOWN / FOCUS + VEIL
 *   3. PALETTE     — semantic roles, every value borrowed from (2). No literals.
 *   4. TOKENS      — PALETTE → `--dsw-alias-*`, one line per token
 *   4b. STYLES     — bubble outline, composer focus glow, heading/marker ink,
 *                    none of which the token layer can express
 *   5. PLUGIN      — register / auto-apply / opt-out memory / dev handle
 *
 * Scaffold status (v0.5.0): palette + registration + auto-apply + chat bubble
 * skin + composer focus glow + markdown ink + dev handle, plus the token
 * re-declaration fallback, the split title-bar colour and the content-area inset
 * shadow. Colours and decoration only — **font size is
 * out of scope on purpose**: it is a real settings field (设置 → 通用 → 字体大小),
 * so the theme leaves it alone instead of fighting the user's choice.
 * Not yet: a Settings row (the built-in Appearance row only knows the three
 * built-in cubes, so a registered theme has no picker entry yet). See README
 * §"已知限制" / `TODO` markers.
 */

window.__ModuleLoader__.load({
  id: 'dsh-theme-cooldark',
  factory() {
    // =====================================================================
    // 1. CONFIG
    // =====================================================================

    /** Registered theme id. Must not collide with a built-in theme id. */
    const THEME_ID = 'cooldark';

    /** Which built-in palette this theme rides on top of. */
    const COLOR_SCHEME = 'dark';

    /** Built-in id used when the user opts out. Owned by the theme service. */
    const FALLBACK_THEME = 'system';

    /**
     * Apply the theme on activation. Turn it off (or call `__cooldark.enable()`
     * from devtools) if you'd rather have the theme registered but dormant.
     */
    const AUTO_APPLY = true;

    /**
     * Re-assert window and budget, in ms / attempts.
     *
     * Why this exists: the profile's `cordis.patch.yml` carries `preference: dark`
     * for the built-in ui-theme row, and toggling this plugin's row in Plugin
     * Manager re-composes the loader tree. Re-composition re-applies that config,
     * which publishes a `theme/change` with the *built-in* preference — right
     * after we switched to ours. To a naive listener that is indistinguishable
     * from "the user picked Dark in Settings", so the plugin used to surrender
     * for the rest of the session and the whole theme went quiet while the row
     * still read "enabled".
     *
     * So: a foreign flip inside this window is treated as a loader/settings
     * re-publish and re-asserts, but only `REASSERT_LIMIT` times. A genuine
     * switch-away (or a user who keeps fighting the theme) lands outside the
     * window or exhausts the budget and is then respected — no infinite tug-of-war.
     */
    const REASSERT_WINDOW = 5000;
    const REASSERT_LIMIT = 2;

    /**
     * The *other* clobber, the one a time window can never catch: settings
     * adoption.
     *
     * `ThemeRuntime` subscribes to its own settings namespace
     * (`ctx.effect(() => host.subscribe(() => this.adopt()))`) and `adopt()`
     * ends with `this.preference = section.preference` — the **durable** value.
     * A third-party id is never persisted (only `light`/`dark`/`system` are
     * written back), so the durable preference is still `dark`. Change the code
     * font size an hour after enabling the theme and the runtime quietly adopts
     * `dark` and republishes: settings unchanged by us, theme gone.
     *
     * The give-away is free: `fontSizes` / `fontFamilies` live in the same
     * namespace, so they can only change through a write there — and a genuine
     * theme pick never touches them. A foreign preference that arrives *with* a
     * font change is an adoption, not a decision, so it is re-asserted whenever
     * it happens: no window, no budget (re-asserting never writes, so it cannot
     * feed back into `adopt()` and loop).
     */
    const fontFingerprint = (snapshot) =>
      JSON.stringify([snapshot?.fontSizes ?? null, snapshot?.fontFamilies ?? null]);

    /**
     * LEGACY key, read by builds up to 0.3.1 and cleaned on every mount.
     *
     * "The user switched away" used to be persisted here, which was a bug: a
     * market disable/re-enable reloads this module but leaves localStorage
     * alone, so the flag outlived the re-enable and silently refused to apply
     * the theme — the plugin looked loaded and did nothing. Opt-out is now
     * in-memory only (see `PLUGIN`), because the loader row is the real on/off
     * switch: a disabled row unloads the plugin, a live row means "apply".
     */
    const LEGACY_OPT_OUT_KEY = 'softdark:opt-out';

    /**
     * LEGACY key, written by builds up to 0.3.7.
     *
     * It held the body size captured before the theme forced 20px, so `disable()`
     * could hand it back. The takeover is gone (font size belongs to the settings
     * panel), so the key is dead weight — swept on mount to leave no stray state
     * behind.
     */
    const LEGACY_FONT_BASELINE_KEY = 'softdark:font-baseline';

    /**
     * Typography is deliberately NOT handled here. Font size is a first-class
     * settings field (`设置 → 通用 → 字体大小`), persisted by the `ui-theme`
     * settings scope, so taking it over would only fight the user: an older
     * build of this plugin forced 20px on every enable, which meant a size
     * chosen in Settings silently snapped back after each restart. Colour and
     * decoration belong to the theme; scale belongs to the settings panel.
     *
     * (For the record, the ranges the settings panel enforces: text 10–22,
     * code 10–16, terminal 10–20.)
     */

    // =====================================================================
    // 2. COLOURS — raw atoms.
    //
    // Design intent: a neutral (no colour cast) dark canvas at #1f232a, body
    // text at #dcdcdc so long sessions stay comfortable, and a single muted
    // blue for chrome plus a saturated cobalt for links. Nothing below should
    // be a bare hex literal; every ramp entry is named so `PALETTE` reads as an
    // assignment of roles.
    // =====================================================================

    const WHITE = '#ffffff';
    const BLACK = '#000000'; // shadows only — veil(BLACK, α) darkens whatever it
    //                          lands on without dragging any hue along

    /**
     * Surface ramp. `raised1…8` go darkest → lightest, one step per elevation
     * level; pick the step, never the hex. `canvas` is the main content area and
     * every `raisedN` must be lighter than the one before it, or panels read as
     * recessed. `sunken` is the one deliberate exception: it is the bluish slab
     * the sidebar sits on, and it is *lighter* than the canvas by hand — so it
     * must not be reused for anything that has to look recessed.
     */
    const SURFACE = Object.freeze({
      sunken: '#2C303d', // bluish sidebar slab; lighter than canvas by design
      canvas: '#1f232a', // main content area
      raised1: '#2a2a2a', // cards
      raised2: '#303030', // popovers, floating buttons
      raised3: '#363636', // inline controls, tags, chips
      raised4: '#3d3d3d', // selected / hover-solid states
      raised5: '#454545', // toast, tooltip
      raised6: '#4d4d4d', // overlay, scrollbar track
      raised7: '#565656', // scrollbar thumb
      raised8: '#606060', // scrollbar thumb, hovered
      buttonElevated: '#454544', // elevated button fill — the sidebar "New session"
      //                       button. Hand-picked by the user (≈ raised5 #454545):
      //                       stands a clear step above raised2/raised3 chrome so
      //                       the primary action reads as lifted, and lives as its
      //                       own atom so every other raised3 consumer (inline
      //                       code, tags, placeholders) keeps the ramp untouched.
      sendFill: '#1e90ff', // composer send button (.…_primary). Hand-picked by
      //                       the user (dodger blue); own atom because ACCENT.base
      //                       also paints business-primary and caret colour, which
      //                       stay mist-blue. White glyph on it measures 3.24:1 —
      //                       under the 4.5 text gate but above the 3:1 gate for
      //                       non-text controls, and the glyph is an icon.
      sendHover: '#4a5fff', // one lift above sendFill — the app swaps to it on
      //                       :hover; white glyph still 4.8:1, above the 4.5 gate
      titlebar: '#181b21', // Windows title strip (the full-width bar at the very
      //                       top). A hair *darker* than canvas, same blue cast.
      //                       The app paints it with --dsw-specific-sidebar-fill
      //                       — the sidebar's own token — so splitting the two
      //                       colours is impossible at the token layer and is
      //                       done in TITLEBAR_CSS instead; see §4b.
    });

    /**
     * Code surface. Deliberately *not* an `SURFACE` step: the fenced code block
     * is a real well now — `#121212` against the `#1f232a` canvas is 1.19:1, so
     * it reads by *value* first and by its faint blue cast second. `sunken` is
     * the opposite case: a bluish slab *lighter* than the canvas (the sidebar).
     * The two point in opposite directions, so they must not share a step. There
     * is no border around the block — the depth alone separates it.
     *
     * `banner` is the language strip above a fenced block (the app calls it the
     * code-block *banner*: `_banner_7gxqk_24`, a sticky `_bannerWrap_` around
     * it). It keeps the blue-neutral family of the old well and lifts off the
     * dark block:
     *
     *     block  #121212  ── 1.44:1 ──  #2e3139  (banner)
     *
     * 1.44:1 is a visible seam that still cannot compete with the code itself.
     * That is the whole point: 0.4.4 set the banner to the *same* ink as the
     * well and the strip vanished (a 6/255 step looks like "the change did
     * nothing"), so `dev/smoke.mjs` now refuses a banner/block gap under 1.25:1.
     */
    const CODE = Object.freeze({
      block: '#121212', // fenced code block; a real well, 1.19:1 under canvas
      banner: '#2e3139', // language strip; lifted off the block, 1.44:1
    });

    /**
     * Text ramp, brightest → faintest. `primary` is body copy; the rest are
     * decreasing levels of emphasis.
     */
    const INK = Object.freeze({
      bright: '#ededed', // headings on hover, inverted button fill
      primary: '#dcdcdc', // body copy
      dimmed: '#c8c8c8', // secondary headings, icons
      secondary: '#a3a3a3', // labels, metadata
      tertiary: '#808080', // hints
      caption: '#666666', // captions, timestamps
      thumb: '#9e9e9e', // switch knob
      edge: '#6e6e6e', // outline of an engaged ghost button
      faint: '#414141', // disabled / decorative marks
    });

    /**
     * Emphasis colour: a desaturated "mist blue", plus its bright hover pair.
     * `link` is a deliberate exception — a saturated cobalt (#2288ee) so prose
     * links separate from accent chrome (buttons, focus rings) instead of
     * blending into it. At 4.4:1 on the canvas it sits a hair *under* AA's 4.5
     * for body text (the smoke test says so); #2590f2 clears at 4.8:1 if that
     * ever matters more than the exact hue. On a bubble fill it drops to 3.1:1,
     * which is why bubbles keep their own pale `BUBBLE.link`.
     */
    const ACCENT = Object.freeze({
      base: '#8fa8e8',
      bright: '#a6bbf0',
      link: '#2288ee', // cobalt; prose links only, not chrome
      deep: '#2a3350', // fill behind accent text
      shimmer: '#cfdcff', // animated highlight on "deep diving" labels
      selection: '#5c7fd0', // text selection wash; see VEIL.selection
    });

    /** Semantic feedback colours. */
    const STATE = Object.freeze({
      success: '#6fbf8e',
      successBright: '#86cda0',
      successDeep: '#23342a',
      warn: '#d9a65c',
      warnBright: '#e5b878',
      warnDeep: '#2b2a22',
      danger: '#e07a72',
      dangerMarker: '#e0716a',
      idle: '#555555',
    });

    /**
     * Chat bubble skin: a 25% DodgerBlue (#1E90FF) wash over the canvas, ringed
     * with a 40% white outline. Alphas let the canvas show through, so the fill
     * composites to a muted petrol blue (#1f3e5f on our #1f232a) and the outline
     * to a steel rim (#798b9f, 3.1:1 against the fill).
     *
     * On that composite the body ink (#dcdcdc) reaches 8.0:1, but `ink` is still
     * pinned to pure white for headroom (11.0:1), and `link` to a pale ice blue
     * (9.1:1): the theme-wide cobalt (ACCENT.link) only manages 3.1:1 there, and
     * the original mist accent 4.7:1 — both too faint for link text on blue.
     *
     * `codeFill` stays `null`: a fenced block inside a bubble inherits
     * CODE.block, which at `#121212` is a genuinely dark inset against the
     * petrol fill (1.71:1 — the well now reads by value, not only by hue), and
     * inline chips keep raised3. Give `codeFill` another hex only if that inset
     * ever looks like a hole punched in the bubble.
     */
    const BUBBLE = Object.freeze({
      fill: 'rgba(30, 144, 255, 0.25)', // #1E90FF at 25%; petrol blue over canvas
      border: 'rgba(255, 255, 255, 0.4)', // 40% white rim; steel edge over fill
      borderWidth: 1, // px
      ink: '#ffffff', // pinned: 11.0:1 vs #dcdcdc's 8.0:1 on the fill
      codeFill: null, // null → keep the theme's dark code surfaces
      link: '#d6ecff', // pale ice blue (9.1:1); mist accent only reaches 4.7:1
    });

    /**
     * Heading ink inside rendered markdown. The app paints every heading with
     * the shared `--dsw-alias-label-primary`, so a per-level colour can only be
     * added by injected CSS (see 4b). Levels 5 and 6 stay `null` on purpose:
     * they are meant to sit at body weight and keep the theme's own text colour.
     *
     * Contrast against the canvas: h1 3.2:1, h2 4.6:1, h3 6.8:1, h4 14.7:1.
     * All clear the 3:1 bar WCAG sets for large bold text.
     *
     * `markerBullet` / `markerOrdered` repaint the `::marker` glyphs — the only
     * part of a list that is a real element and can therefore be coloured
     * independently of the item text. Both clear 3:1 (3.6 and 4.3), the bar for
     * non-text graphics; set either to `null` to fall back to the app's
     * `--dsw-alias-label-secondary`.
     *
     * `strong` is body-size text, so it is held to 4.5:1 — bright olive (#93c430)
     * clears that on both surfaces (7.6:1 on the canvas, 5.3:1 on the bubble
     * fill). It
     * is the one markdown colour legible on a bubble, so it needs no override
     * there, unlike the headings. The hue is the user's pick (olive family);
     * the value was lifted from #6B8E23 until both gates passed, so the
     * emphasis stays warm-green rather than joining the cool chrome.
     */
    const MARKDOWN = Object.freeze({
      h1: '#DC143C', // crimson
      h2: '#FF4500', // orange red
      h3: '#FF8C00', // dark orange
      h4: '#FFFF00', // yellow
      h5: null, // null → inherit the theme's body ink
      h6: null,
      markerBullet: '#228B22', // forest green; `ul > li::marker`
      markerOrdered: '#FF1493', // deep pink; `ol > li::marker`
      strong: '#93c430', // bright olive; `strong` / `b` — inline emphasis
    });

    /** Diff markers need their own greens/reds to read on tinted gutters. */
    const DIFF = Object.freeze({
      addedBg: '#1c2620',
      addedGutter: '#161e18',
      addedMarker: '#57bc7f',
      deletedBg: '#2a1e1d',
      deletedGutter: '#221615',
      deletedMarker: STATE.dangerMarker,
    });

    /**
     * Opacity steps for translucent washes. `veil()` turns `WHITE + faint`
     * into `#ffffff12`, so no hand-written alpha suffixes anywhere.
     */
    const VEIL = Object.freeze({
      whisper: 0.06, // barely-there fills
      faint: 0.07, // hairlines, hover wash, skeleton
      hairline: 0.08, // inverted borders
      subtle: 0.12, // borders, active wash
      medium: 0.17, // prominent borders
      strong: 0.21, // focus rings
      accentHover: 0.18, // hover on accent fills
      dangerHover: 0.15, // hover on destructive controls
      selection: 0.3, // text selection
      opaque: 0.94, // menus that almost occlude what's behind
    });

    /** 0–1 opacity → two hex digits. */
    const alphaHex = (opacity) =>
      Math.round(opacity * 255)
        .toString(16)
        .padStart(2, '0');

    /** `#rrggbb` + opacity → `#rrggbbaa`. */
    const veil = (color, opacity) => `${color.toLowerCase()}${alphaHex(opacity)}`;

    /**
     * Focus glow for the composer card — the one "lift" the token layer cannot
     * express, because the card's own `box-shadow` is a single token
     * (`--dsw-elevation-soft`) and a glow has to be *added* to it, not swapped.
     *
     * Two layers, both white and both additive: a 1px ring that gives the card a
     * crisp lit edge, and a wide low-alpha halo that blooms into the canvas. The
     * existing elevation is kept as the first shadow in the list, so the card
     * still floats exactly as before — it just gains a rim and a bloom while
     * focused.
     *
     * The bloom is the dial that matters for *size*: `haloBlur` is the radius it
     * reaches (32px, i.e. roughly two card paddings of spill) and `haloAlpha` its
     * strength. It was 18px / 0.1 and read as a thin aura; 32 / 0.16 is clearly
     * larger without turning into fog, and still stays under `ringAlpha` so the
     * rim keeps its crisp edge. Raise the blur first if it needs to be bigger
     * still, alpha only after — past ~0.2 the card starts looking hazy.
     *
     * Everything is white on purpose: the card sits at `#262b33`-ish on a
     * `#1f232a` canvas, and a neutral glow reads as "lit" without dragging the
     * bubble's blue into the chrome. Set both alphas to `null` to drop the glow
     * and go back to the untouched elevation token.
     */
    const FOCUS = Object.freeze({
      glow: WHITE, // halo colour; neutral so it never fights the accent blue
      ringAlpha: 0.3, // 1px lit rim — the crisp part of the glow
      haloAlpha: 0.16, // outer bloom; keep <= ringAlpha or it fogs the card
      haloBlur: 32, // px, outer bloom radius
      transition: 140, // ms, so the rim fades in instead of snapping
    });

    /**
     * Inset shadow for the centre column (the whole content area — messages,
     * composer, everything between the sidebar and the right panel). The app
     * draws no shadow there, and a shadow is not a token, so this lives in the
     * injected sheet; each dial below is *also* published as a `--cooldark-inset-*`
     * custom property on `<body>`, so tuning in devtools is instant and a finding
     * worth keeping goes back here.
     *
     * Two rings, both black so they only deepen whatever they land on:
     * `edge*` is the all-round vignette that seats the column into the chrome;
     * `top*` is a slightly stronger band at the top edge, reading as the title
     * strip casting down. Raise `edgeBlur` first for a softer, deeper well;
     * alphas second — past ~0.35 the content starts looking dirty.
     * Set both alphas to `null` to drop the inset entirely.
     */
    const INSET = Object.freeze({
      color: '#4682B4',
      edgeAlpha: 0, // 四周暗角：颜色浓度
      edgeBlur: 20, // 四周暗角：模糊半径 px
      edgeSpread: 2, // 四周暗角：扩散半径 px（正值让暗角往内多吃一点）
      topAlpha: 0.1, // 顶部带：颜色浓度；keep around edgeAlpha, or it reads as a bar
      topBlur: 20, // 顶部带：模糊半径 px
      topOffset: -10, // 顶部带：下移量 px
      topSpread: 2, // 顶部带：扩散半径 px，负值让它贴边而不糊满整块
    });

    // =====================================================================
    // 3. PALETTE — semantic roles → raw atoms.
    //
    // This is the only block you need to edit to re-tint the theme. Keys are
    // grouped by what the token *does*, values are ramp lookups.
    // =====================================================================

    const PALETTE = Object.freeze({
      bg: {
        base: SURFACE.canvas,
        layer1: SURFACE.raised1,
        layer2: SURFACE.raised2,
        layer3: SURFACE.raised3,
        overlay: SURFACE.raised6,
        sidebar: SURFACE.sunken,
        skeleton: veil(WHITE, VEIL.faint),
        multiSelect: SURFACE.raised2,
        modulePlatform: SURFACE.raised3,
        documentPreview: SURFACE.canvas,
        documentSelection: veil(ACCENT.selection, VEIL.selection),
        titlebar: SURFACE.titlebar,
      },
      text: {
        primary: INK.primary,
        primaryDimmed: INK.dimmed,
        secondary: INK.secondary,
        tertiary: INK.tertiary,
        caption: INK.caption,
        dimmed: INK.faint,
        onAccent: SURFACE.canvas,
      },
      border: {
        l1: veil(WHITE, VEIL.faint),
        l2: veil(WHITE, VEIL.subtle),
        l3: veil(WHITE, VEIL.medium),
        l4: veil(WHITE, VEIL.strong),
        inverted: veil(WHITE, VEIL.whisper),
        inverted2: veil(WHITE, VEIL.hairline),
      },
      accent: {
        primary: ACCENT.base,
        hover: ACCENT.bright,
        link: ACCENT.link,
        deepest: ACCENT.deep,
        shimmer: ACCENT.shimmer,
      },
      state: {
        success: STATE.success,
        successSecondary: STATE.successBright,
        successTertiary: STATE.successDeep,
        warn: STATE.warn,
        warnSecondary: STATE.warnBright,
        warnTertiary: STATE.warnDeep,
        warnLabel: STATE.warn,
        error: STATE.danger,
        errorSecondary: STATE.danger,
        idle: STATE.idle,
      },
      interactive: {
        hover: veil(WHITE, VEIL.faint),
        active: veil(WHITE, VEIL.subtle),
        hoverAccent: veil(WHITE, VEIL.accentHover),
        hoverDanger: veil(STATE.danger, VEIL.dangerHover),
        hoverSolid: SURFACE.raised4,
      },
      button: {
        contrast: INK.primary,
        elevated: SURFACE.buttonElevated,
        floating: SURFACE.raised2,
        floatingHover: SURFACE.raised5, // hover must stay *brighter* than
        // elevated (SURFACE.buttonElevated), or hovering the New session button
        // reads as pressing in — check the two values whenever either changes
        ghostActiveFill: SURFACE.raised4,
        ghostActiveHover: SURFACE.raised6,
        ghostActiveBorder: INK.edge,
        primaryDimmed: SURFACE.raised3,
        primaryHover: INK.bright,
        info: SURFACE.sendFill, // composer send button, split from ACCENT.base so
        infoHover: SURFACE.sendHover, // links/business primary keep the mist-blue
      },
      markdown: {
        codeBlock: CODE.block,
        codeBlockBanner: CODE.banner,
        codeBlockBannerInk: INK.secondary,
        inlineCode: veil(WHITE, VEIL.subtle), // #ffffff1f = rgba(255,255,255,.12);
        //                       translucent wash so the chip follows whatever it
        //                       sits on — canvas, bubble fill, anything
        segmentSelected: SURFACE.raised4,
        segmentUnselected: SURFACE.sunken,
        citation: SURFACE.raised4,
        placeholder: SURFACE.raised3,
        tag: SURFACE.raised3,
      },
      menu: {
        groupHeader: veil(SURFACE.raised5, VEIL.opaque),
        icon: INK.dimmed,
      },
      overlay: {
        toastBg: SURFACE.raised5,
        toastLabel: INK.bright,
        tooltipBg: SURFACE.raised5,
        tooltipKeyBg: SURFACE.raised7,
        switchThumb: INK.thumb,
      },
      scrollbar: {
        bgL1: SURFACE.raised6,
        bgL2: SURFACE.raised7,
        hoverL1: SURFACE.raised7,
        hoverL2: SURFACE.raised8,
      },
      diff: {
        addedBg: DIFF.addedBg,
        addedGutter: DIFF.addedGutter,
        addedMarker: DIFF.addedMarker,
        deletedBg: DIFF.deletedBg,
        deletedGutter: DIFF.deletedGutter,
        deletedMarker: DIFF.deletedMarker,
      },
      bubble: {
        fill: BUBBLE.fill,
        border: BUBBLE.border,
        borderWidth: BUBBLE.borderWidth,
        ink: BUBBLE.ink,
        codeFill: BUBBLE.codeFill,
        link: BUBBLE.link,
      },
      /** Per-level heading ink for rendered markdown; `null` = inherit. */
      headings: {
        h1: MARKDOWN.h1,
        h2: MARKDOWN.h2,
        h3: MARKDOWN.h3,
        h4: MARKDOWN.h4,
        h5: MARKDOWN.h5,
        h6: MARKDOWN.h6,
      },
      /** List bullet ink; `null` = inherit the app's secondary label. */
      markers: {
        bullet: MARKDOWN.markerBullet,
        ordered: MARKDOWN.markerOrdered,
      },
      /** Inline emphasis; `null` = inherit the theme's body ink. */
      emphasis: {
        strong: MARKDOWN.strong,
      },
      /** Composer focus glow; `null` alphas = leave the plain elevation alone. */
      focus: {
        glow: FOCUS.glow,
        ringAlpha: FOCUS.ringAlpha,
        haloAlpha: FOCUS.haloAlpha,
        haloBlur: FOCUS.haloBlur,
        transition: FOCUS.transition,
      },
      /** Inset shadow on the centre column; `null` alphas = drop the inset. */
      inset: {
        color: INSET.color, // bare #rrggbb, mixed per-ring below
        edgeAlpha: INSET.edgeAlpha,
        edgeBlur: INSET.edgeBlur,
        edgeSpread: INSET.edgeSpread,
        topAlpha: INSET.topAlpha,
        topBlur: INSET.topBlur,
        topOffset: INSET.topOffset,
        topSpread: INSET.topSpread,
      },
    });

    // =====================================================================
    // 4. TOKENS — PALETTE → alias tokens.
    //
    // One line per token; every name must exist in the design system's alias
    // layer (`--dsw-alias-*`). See `docs/dark-tokens.md` for the full list.
    // =====================================================================

    function buildTokens(p) {
      return {
        // Surfaces
        '--dsw-alias-bg-base': p.bg.base,
        '--dsw-alias-bg-layer-1': p.bg.layer1,
        '--dsw-alias-bg-layer-2': p.bg.layer2,
        '--dsw-alias-bg-layer-3': p.bg.layer3,
        '--dsw-alias-bg-overlay': p.bg.overlay,
        '--dsw-alias-bg-skeleton': p.bg.skeleton,
        '--dsw-alias-bg-multi-select': p.bg.multiSelect,
        '--dsw-alias-bg-module-platform': p.bg.modulePlatform,
        '--dsw-alias-bg-document-preview': p.bg.documentPreview,
        '--dsw-alias-bg-document-selection': p.bg.documentSelection,
        '--dsw-specific-sidebar-fill': p.bg.sidebar,

        // Chat bubbles. `--dsw-specific-bubble` is what the user / steering /
        // `/goal` bubble rules paint with; the translucent rim is bolted on by
        // BUBBLE_CSS rather than a token (none exists).
        '--dsw-specific-bubble': p.bubble.fill,

        // Text
        '--dsw-alias-label-primary': p.text.primary,
        '--dsw-alias-label-primary-bluish': p.text.primary,
        '--dsw-alias-label-primary-dimmed': p.text.primaryDimmed,
        '--dsw-alias-label-primary-foreground': p.text.onAccent,
        '--dsw-alias-label-secondary': p.text.secondary,
        '--dsw-alias-label-tertiary': p.text.tertiary,
        '--dsw-alias-label-caption': p.text.caption,
        '--dsw-alias-label-dimmed': p.text.dimmed,
        '--dsw-alias-label-document-preview': p.text.secondary,
        '--dsw-alias-brand-text': p.text.primary,

        // Borders
        '--dsw-alias-border-l1': p.border.l1,
        '--dsw-alias-border-l2': p.border.l2,
        '--dsw-alias-border-l2-darkmode-thin': p.border.l1,
        '--dsw-alias-border-l3': p.border.l3,
        '--dsw-alias-border-l4': p.border.l4,
        '--dsw-alias-border-inverted': p.border.inverted,
        '--dsw-alias-border-inverted2': p.border.inverted2,

        // Brand / accent
        '--dsw-alias-brand-primary': p.text.primary,
        '--dsw-alias-brand-primary-invert': p.text.primary,
        '--dsw-alias-brand-primary-new-colorprimary-new-color': p.accent.primary,
        '--dsw-alias-link': p.accent.link,
        '--dsw-alias-state-business-primary': p.accent.primary,
        '--dsw-alias-state-business-tertiary': p.accent.deepest,
        '--dsw-alias-label-deep-diving': p.accent.hover,
        '--dsw-alias-label-deep-diving-shimmer': p.accent.shimmer,

        // States
        '--dsw-alias-state-success-primary': p.state.success,
        '--dsw-alias-state-success-secondary': p.state.successSecondary,
        '--dsw-alias-state-success-tertiary': p.state.successTertiary,
        '--dsw-alias-state-warn-primary': p.state.warn,
        '--dsw-alias-state-warn-secondary': p.state.warnSecondary,
        '--dsw-alias-state-warn-tertiary': p.state.warnTertiary,
        '--dsw-alias-state-warn-label': p.state.warnLabel,
        '--dsw-alias-state-error-primary': p.state.error,
        '--dsw-alias-state-error-secondary': p.state.errorSecondary,
        '--dsw-alias-state-idle-primary': p.state.idle,

        // Interactive
        '--dsw-alias-interactive-bg-hover': p.interactive.hover,
        '--dsw-alias-interactive-bg-active': p.interactive.active,
        '--dsw-alias-interactive-bg-hover-accent': p.interactive.hoverAccent,
        '--dsw-alias-interactive-bg-hover-danger': p.interactive.hoverDanger,
        '--dsw-alias-interactive-bg-hover-solid': p.interactive.hoverSolid,

        // Buttons
        '--dsw-alias-button-contrast-fill': p.button.contrast,
        '--dsw-alias-button-elevated-fill': p.button.elevated,
        '--dsw-alias-button-floating-fill': p.button.floating,
        '--dsw-alias-button-floating-hover': p.button.floatingHover,
        '--dsw-alias-button-ghost-active-fill': p.button.ghostActiveFill,
        '--dsw-alias-button-ghost-active-hover': p.button.ghostActiveHover,
        '--dsw-alias-button-ghost-active-border': p.button.ghostActiveBorder,
        '--dsw-alias-button-primary-dimmed': p.button.primaryDimmed,
        '--dsw-alias-button-primary-hover': p.button.primaryHover,
        '--dsw-alias-button-info-fill': p.button.info,
        '--dsw-alias-button-info-hover': p.button.infoHover,

        // Markdown / code
        '--dsw-alias-markdown-code-block': p.markdown.codeBlock,
        '--dsw-alias-markdown-code-block-banner': p.markdown.codeBlockBanner,
        '--dsw-alias-markdown-inline-code': p.markdown.inlineCode,
        '--dsw-alias-markdown-code-segment-selected': p.markdown.segmentSelected,
        '--dsw-alias-markdown-code-segment-unselected': p.markdown.segmentUnselected,
        '--dsw-alias-markdown-citation': p.markdown.citation,
        '--dsw-alias-markdown-placeholder': p.markdown.placeholder,
        '--dsw-alias-markdown-tag': p.markdown.tag,

        // Menus and overlays
        '--dsw-alias-menu-group-header-fill': p.menu.groupHeader,
        '--dsw-alias-menu-icon': p.menu.icon,
        '--dsw-alias-toast-bg': p.overlay.toastBg,
        '--dsw-alias-toast-label': p.overlay.toastLabel,
        '--dsw-alias-tooltip-bg': p.overlay.tooltipBg,
        '--dsw-alias-tooltip-key-bg': p.overlay.tooltipKeyBg,
        '--dsw-alias-switch-thumb': p.overlay.switchThumb,

        // Scrollbars
        '--dsw-alias-scrollbar-bg-l1': p.scrollbar.bgL1,
        '--dsw-alias-scrollbar-bg-l2': p.scrollbar.bgL2,
        '--dsw-alias-scrollbar-hover-l1': p.scrollbar.hoverL1,
        '--dsw-alias-scrollbar-hover-l2': p.scrollbar.hoverL2,

        // Diff
        '--dsw-alias-file-diff-added-bg': p.diff.addedBg,
        '--dsw-alias-file-diff-added-gutter': p.diff.addedGutter,
        '--dsw-alias-file-diff-added-marker': p.diff.addedMarker,
        '--dsw-alias-file-diff-deleted-bg': p.diff.deletedBg,
        '--dsw-alias-file-diff-deleted-gutter': p.diff.deletedGutter,
        '--dsw-alias-file-diff-deleted-marker': p.diff.deletedMarker,
      };
    }

    const TOKENS = Object.freeze(buildTokens(PALETTE));

    // =====================================================================
    // 4b. STYLES — the bits tokens cannot express.
    //
    // Five of them. The token re-declaration sheet first, because the layout layer
    // paints `snapshot.active.tokens` onto `<body>` only while the *preference*
    // actually resolves to this theme — and a third-party id can never be the
    // durable preference, so any `adopt()` retracts those 88 inline variables and
    // every surface drops back to the built-in `#151517`. Re-declaring the same map
    // under `html[data-cooldark] body` keeps the palette on screen whoever owns the
    // preference: (0,1,2) outranks the built-in `body[data-ds-dark-theme]`
    // (0,1,1), while a genuine inline write still outranks this sheet and carries
    // identical values, so the fallback can never disagree with the host. Then the
    // composer focus glow, because a glow has to be *added* to
    // the card's `--dsw-elevation-soft` shadow rather than replace it. The bubble
    // outline, because the bubble rule ships no `border` and no alias token
    // represents one. The markdown ink — headings, list markers and `strong`
    // all inherit or hardcode their colour in the app's own sheet. And the code
    // block's language strip, because the token that paints it sits *behind* a
    // canvas-painted sticky wrapper and can be beaten by a `background`
    // shorthand. Text colour is
    // handled by re-declaring alias tokens *locally on the bubble element*,
    // instead of overriding `color` and fighting specificity, so the app's own
    // rules resolve to the local values inside the bubble and nowhere else. Any
    // `BUBBLE` role left `null` is simply not emitted, i.e. the theme's own value
    // stays in force.
    //
    // Selector note: CSS-module classes are `<hash>_<local>`, so the three chat
    // bubble rules are `LOmM4q_bubble`, `BfLV8a_bubble`, `rhSLKq_bubble`. The
    // tooltip in the same design system is `_bubble_44yfq_1` — a numbered
    // suffix — which the `_bubble_` guard keeps out. Both suffix and infix
    // forms are matched so an extra class cannot hide a real bubble.
    //
    // The second half is markdown ink. Typography is fully tokenised
    // (`--dsw-font-markdown-h1…h4`, `-base`, `-code`), but *colour* is not: every
    // heading inherits `--dsw-alias-label-primary`, markers take
    // `--dsw-alias-label-secondary` and `strong` sets only a weight, so all of
    // those colours can only be declared here. Note what is deliberately absent —
    // `strong`'s `font-weight: 600`, heading margins and the inline-code
    // padding/border are hard-coded in the app's own sheet and are left alone.
    // =====================================================================

    const BUBBLE_SELECTOR =
      'body :is([class$="_bubble"], [class*="_bubble "]):not([class*="_bubble_"])';

    /**
     * Markdown root. The container's CSS-module class is `_markdown_1ypvv_5`,
     * but the hash changes with every build, so the prefix is matched instead.
     */
    const MARKDOWN_ROOT = 'body :is([class*="_markdown_"])';

    /**
     * Heading scope: a markdown root that actually contains a heading.
     *
     * `:has()` is not optional here: `.md` *file icons* also carry a
     * `_markdown_1wejo_28` class, and painting those is harmless but sloppy —
     * requiring a real heading child keeps the rule pinned to rendered prose.
     * List markers use the plain root instead: a heading-less document still
     * has lists, and no icon contains a `li`.
     */
    const MARKDOWN_SCOPE = `${MARKDOWN_ROOT}:has(:is(h1, h2, h3, h4, h5, h6))`;

    /** Heading levels, in cascade order. */
    const HEADING_LEVELS = Object.freeze(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

    /** `id` of the injected sheet, so a stale copy can be spotted and replaced. */
    const STYLE_ELEMENT_ID = 'cooldark-bubble';

    /**
     * Code-block banner ("language strip"). The app paints it through the alias
     * token `--dsw-alias-markdown-code-block-banner`, but the token is only one
     * hop in a chain:
     *
     *   ._block_7gxqk_4      --dsl-code-block-banner-background-color: var(--dsw-alias-…-banner)
     *   ._bannerWrap_…        background-color: var(--dsw-alias-bg-base)   ← the sticky mask
     *   ._banner_…            background: var(--dsl-code-block-banner-background-color)
     *
     * Two holes that a token alone cannot close: the sticky wrapper is painted
     * with the *canvas* colour (so any sliver it exposes is canvas, not banner),
     * and a `background` shorthand further down the cascade silently wins over
     * whatever the token says. `md-code-block` is a plain global class and
     * `data-code-block-banner` is the app's own attribute (the app's compact
     * variant selects on it too), so both are hash-proof hooks — paint them here
     * and the strip follows the atom no matter how the token is resolved.
     */
    const CODE_BLOCK_CLASS = '.md-code-block';
    const CODE_BANNER_ATTR = '[data-code-block-banner]';
    const CODE_BANNER_SELECTOR =
      `body ${CODE_BLOCK_CLASS} > :has(> ${CODE_BANNER_ATTR}), ` +
      `body ${CODE_BANNER_ATTR}`;

    /**
     * Composer card. `data-composer-card` is the app's own hook on the input
     * card (the element that carries `box-shadow: var(--dsw-elevation-soft)`),
     * so it survives CSS-module hash changes. `:focus-within` covers the whole
     * card — the contenteditable, the buttons, the toolbar — because the ring is
     * meant to say "this is the live input", not "this button is focused".
     */
    const COMPOSER_CARD = 'body [data-composer-card]';

    /**
     * Focus glow: the elevation the card already has, plus a white rim and
     * bloom. Kept additive — swapping the shadow instead would flatten the card
     * while you type.
     */
    function buildFocusCss(p) {
      const { glow, ringAlpha, haloAlpha, haloBlur, transition } = p.focus;
      if (ringAlpha == null && haloAlpha == null) return '';

      const shadows = ['var(--dsw-elevation-soft)'];
      if (ringAlpha != null) shadows.push(`0 0 0 1px ${veil(glow, ringAlpha)}`);
      if (haloAlpha != null) shadows.push(`0 0 ${haloBlur}px ${veil(glow, haloAlpha)}`);

      return [
        `${COMPOSER_CARD} { transition: box-shadow ${transition}ms ease; }`,
        `${COMPOSER_CARD}:focus-within { box-shadow: ${shadows.join(', ')}; }`,
        '',
      ].join('\n');
    }

    /** Bubble rules; purely a function of `PALETTE`. */
    function buildBubbleCss(p) {
      /** [property, value] pairs; `null` values mean "leave it to the theme". */
      const declarations = [
        ['--dsw-alias-label-primary', p.bubble.ink],
        ['--dsw-alias-label-primary-dimmed', p.bubble.ink],
        ['--dsw-alias-link', p.bubble.link],
        ['--dsw-alias-markdown-inline-code', p.bubble.codeFill],
        ['--dsw-alias-markdown-code-block', p.bubble.codeFill],
        ['border', `${p.bubble.borderWidth}px solid ${p.bubble.border}`],
      ].filter(([, value]) => value !== null && value !== undefined);

      return [
        `${BUBBLE_SELECTOR} {`,
        ...declarations.map(([property, value]) => `  ${property}: ${value};`),
        `}`,
        '',
      ].join('\n');
    }

    /**
     * Heading, list-marker and emphasis ink. The app's own rules carry no colour
     * at all: headings inherit `--dsw-alias-label-primary`, `li::marker` takes
     * `--dsw-alias-label-secondary`, and `strong` only sets a weight — so every
     * one of these can be repainted only with a real declaration here. Anything
     * left `null` is skipped, which is how h5/h6 keep the body ink.
     */
    function buildMarkdownCss(p) {
      const rules = HEADING_LEVELS.filter((level) => p.headings[level] != null).map(
        (level) => `${MARKDOWN_SCOPE} ${level} { color: ${p.headings[level]}; }`,
      );

      // `ul` and `ol` need separate rules: the two marker colours differ, and a
      // shared `li::marker` rule could not tell them apart. A nested list is
      // still its own element, so `<ol><li><ul>` gets green bullets inside the
      // numbered item, which is what the browser does anyway.
      const markerRules = [
        ['ul', p.markers.bullet],
        ['ol', p.markers.ordered],
      ]
        .filter(([, ink]) => ink != null)
        .map(([list, ink]) => `${MARKDOWN_ROOT} ${list} > li::marker { color: ${ink}; }`);

      rules.push(...markerRules);

      // Emphasis. The renderer emits `<strong>`, but `<b>` arrives through raw
      // HTML in a message often enough that both are covered by one rule.
      // Specificity (0,1,2) sits above the app's `.…_markdown_… strong`
      // (0,1,1), so no `!important` is needed. Unlike the heading colours this
      // one is legible on the bubble fill too (5.6:1), so it is deliberately
      // *not* in the bubble fallbacks below.
      if (p.emphasis.strong != null) {
        rules.push(`${MARKDOWN_ROOT} :is(strong, b) { color: ${p.emphasis.strong}; }`);
      }

      // Inside a bubble the ink is pinned light and the fill is a mid blue, so
      // a crimson heading lands at ~1.4:1 — invisible. Hand headings back to
      // the bubble's own ink rather than leaving them painted and unreadable.
      // Specificity here is (0,3,2), above the (0,1,3) the rules above carry.
      if (p.bubble.ink != null) {
        rules.push(
          `${BUBBLE_SELECTOR} :is(h1, h2, h3, h4) { color: var(--dsw-alias-label-primary); }`,
        );
      }

      // Same story for markers: forest green and deep pink sit at 2.6:1 and
      // 3.1:1 on the bubble fill, so the glyphs go back to the bubble ink.
      // Specificity (0,2,4) beats the (0,1,4) marker rules above.
      if (p.bubble.ink != null && markerRules.length) {
        rules.push(
          `${BUBBLE_SELECTOR} :is(ul, ol) > li::marker { color: var(--dsw-alias-label-primary); }`,
        );
      }

      return rules.length ? [...rules, ''].join('\n') : '';
    }

    /**
     * Language-strip paint, straight onto the two elements that make up the
     * strip. `background-color` (not the `background` shorthand) on purpose: the
     * wrapper also carries the sticky positioning and its corner radii, and a
     * shorthand would reset the `background-image` layers the app may add there.
     * `null` skips the rule and leaves the token in charge.
     *
     * Second rule, the label ink. The app paints the language name and the file
     * title with `--dsw-alias-label-tertiary` (`#808080`), which is only 3.3:1
     * on a strip this light — and both of those elements carry hashed class
     * names (`_language_1pq26_30`, `_title_1pq26_36`), so targeting them would
     * break on every rebuild. Re-declaring the *alias* on the banner element
     * instead is hash-proof and lands exactly where it is needed: the declaration
     * inherits down to both children, and nothing outside the strip sees it.
     */
    function buildBannerCss(p) {
      const ink = p.markdown.codeBlockBanner;
      if (ink == null) return '';
      const rules = [`${CODE_BANNER_SELECTOR} { background-color: ${ink}; }`];

      const label = p.markdown.codeBlockBannerInk;
      if (label != null) {
        rules.push(
          `body ${CODE_BANNER_ATTR} { --dsw-alias-label-tertiary: ${label}; }`,
        );
      }

      return [...rules, ''].join('\n');
    }

    /**
     * Windows title strip. The layout sheet paints it with
     * `--dsw-specific-sidebar-fill` — the sidebar's *own* token
     * (`[data-windows-titlebar] .mP3x-q_frame:before{background:…}`), so token
     * splitting cannot give the bar its own colour: whichever value is registered
     * lands on both. Splitting happens here instead: the strip is the frame's
     * `::before`, absolutely positioned across the top at titlebar height, and
     * the frame div is the only `*_frame`-classed grid directly under the app
     * root. `[class$="_frame"]` matches the CSS-module local name without
     * pinning the build hash (`mP3x-q_` today), the same hash-proof trick as the
     * bubble selector. `background-color` (not the shorthand) leaves any other
     * background layers the app adds alone. Specificity (0,3,4) beats the
     * host's (0,2,1). `null` skips the rule — the bar follows the sidebar again.
     */
    function buildTitlebarCss(p) {
      const ink = p.bg.titlebar;
      if (ink == null) return '';
      return [
        `html[data-cooldark][data-windows-titlebar] body [class$="_frame"]::before {`,
        `  background-color: ${ink};`,
        `}`,
        '',
      ].join('\n');
    }

    /**
     * Centre column — inset shadow. The column (the flex host that carries the
     * whole content area) ships no shadow, and a shadow is not a token, so it
     * can only live here. It cannot be painted *on* the column either: the
     * conversation root inside it paints itself with `--dsw-alias-bg-base`
     * opaquely and would bury an inset drawn on the parent. So the shadow rides
     * a `::after` overlay — absolute, full-size, `pointer-events: none`,
     * `z-index: 1` (above opaque children that carry no stacking of their own).
     * Every dial ships as a `--cooldark-inset-*` custom property on the overlay,
     * and the shadow reads them back — tuning means editing seven variables,
     * not rebuilding a magic `box-shadow` string, and devtools can drag the
     * values live. `null` in both alphas drops the whole block.
     * `[class$="_centerCol"]` matches the CSS-module local name
     * (`mP3x-q_centerCol` today) without pinning the hash; a full-package scan
     * found exactly one `*_centerCol` class.
     */
    function buildInsetCss(p) {
      const {
        color, edgeAlpha, edgeBlur, edgeSpread, topAlpha, topBlur, topOffset, topSpread,
      } = p.inset;
      if (edgeAlpha == null && topAlpha == null) return '';
      return [
        `html[data-cooldark] body [class$="_centerCol"] {`,
        `  position: relative;`,
        `}`,
        `html[data-cooldark] body [class$="_centerCol"]::after {`,
        `  content: "";`,
        `  position: absolute;`,
        `  inset: 0;`,
        `  z-index: 1;`,
        `  pointer-events: none;`,
        `  --cooldark-inset-color: ${color};`,
        `  --cooldark-inset-edge-alpha: ${edgeAlpha * 100}%;`,
        `  --cooldark-inset-edge-blur: ${edgeBlur}px;`,
        `  --cooldark-inset-edge-spread: ${edgeSpread}px;`,
        `  --cooldark-inset-top-alpha: ${topAlpha * 100}%;`,
        `  --cooldark-inset-top-blur: ${topBlur}px;`,
        `  --cooldark-inset-top-offset: ${topOffset}px;`,
        `  --cooldark-inset-top-spread: ${topSpread}px;`,
        `  box-shadow:`,
        `    inset 0 0 var(--cooldark-inset-edge-blur) var(--cooldark-inset-edge-spread) color-mix(in srgb, var(--cooldark-inset-color) var(--cooldark-inset-edge-alpha), transparent),`,
        `    inset 0 var(--cooldark-inset-top-offset) var(--cooldark-inset-top-blur) var(--cooldark-inset-top-spread) color-mix(in srgb, var(--cooldark-inset-color) var(--cooldark-inset-top-alpha), transparent);`,
        `}`,
        '',
      ].join('\n');
    }

    const BUBBLE_CSS = buildBubbleCss(PALETTE);
    const FOCUS_CSS = buildFocusCss(PALETTE);
    const MARKDOWN_CSS = buildMarkdownCss(PALETTE);
    const BANNER_CSS = buildBannerCss(PALETTE);
    const TITLEBAR_CSS = buildTitlebarCss(PALETTE);
    const INSET_CSS = buildInsetCss(PALETTE);

    /**
     * Token fallback sheet — the fifth injected block, and the one that keeps the
     * *backgrounds* alive.
     *
     * Contract as of desktop 0.2.0-rc.2 (`dsh-client-ui-layout` `apply()`):
     * the layout layer writes `snapshot.active.tokens` onto `<body>` inline, but
     * `snapshot.active` is resolved from `this.preference` — and a third-party id
     * is never durable (`isThemePreference(id)` gates the settings write), so any
     * `adopt()` snaps the preference back to `dark`, `active.tokens` becomes the
     * built-in empty map, and every inline `--dsw-alias-*` is retracted. That is
     * the whole "background colours don't stick" failure: registration succeeds,
     * `enable()` runs, the injected sheet paints, but nobody lays down the tokens.
     *
     * Fix: own the declarations. One rule, `html[data-cooldark] body`, value map
     * generated from TOKENS — never hand-copied, or the two paths drift. The
     * selector exists precisely because `markApplied()` already sets that dataset
     * on every enable and clears it on every disable, so the sheet and the theme
     * share one lifecycle. Specificity (0,1,2) beats the built-in
     * `body[data-ds-dark-theme]` (0,1,1); if the layout layer *does* paint inline,
     * inline still wins — and writes the same values, so both paths agree.
     */
    function buildTokenCss(tokens) {
      const declarations = Object.entries(tokens)
        .filter(([, value]) => typeof value === 'string' && value.trim() !== '')
        .map(([name, value]) => `  ${name}: ${value};`);
      if (declarations.length === 0) return '';
      return [`html[data-cooldark] body {`, ...declarations, `}`, ''].join('\n');
    }

    const TOKEN_CSS = buildTokenCss(TOKENS);

    /** Everything this theme injects, in one sheet. Tokens first — they own the surfaces. */
    const STYLESHEET =
      TOKEN_CSS + TITLEBAR_CSS + INSET_CSS + BUBBLE_CSS + FOCUS_CSS + MARKDOWN_CSS + BANNER_CSS;

    /** The definition handed to `ctx.theme.register`. */
    const DEFINITION = Object.freeze({
      id: THEME_ID,
      colorScheme: COLOR_SCHEME,
      tokens: TOKENS,
    });

    // =====================================================================
    // 5. PLUGIN
    // =====================================================================

    /**
     * Plugin-local memory — nothing but the cleanup of the legacy opt-out key.
     *
     * Nothing the theme *chooses* is persisted any more: the palette is declarative
     * and the font size (the only thing that used to be stored here) is now the
     * settings panel's business. "The user switched away" deliberately lives in
     * module scope instead — persisting it survives a re-enable and blocks
     * auto-apply, which is exactly the bug 0.3.2 fixes.
     */
    const memory = {
      read(key) {
        try {
          return window.localStorage.getItem(key);
        } catch {
          return null; // private mode / storage disabled
        }
      },
      write(key, value) {
        try {
          if (value === null) window.localStorage.removeItem(key);
          else window.localStorage.setItem(key, value);
        } catch {
          /* private mode / storage disabled: the theme simply re-applies */
        }
      },
      /** Drop the flag older builds persisted so it can never bite again. */
      forgetLegacyOptOut() {
        this.write(LEGACY_OPT_OUT_KEY, null);
      },
      /** Drop the font baseline older builds stored; sizes are the user's again. */
      forgetFontBaseline() {
        this.write(LEGACY_FONT_BASELINE_KEY, null);
      },
    };

    /**
     * Visible mount marker: `document.documentElement.dataset.cooldark = 'on'`
     * while the theme is on screen. It exists so "is the client half even
     * running?" is answerable from devtools in one look — `window.__cooldark`
     * covers the module, this covers the *applied* state, and a `#cooldark-bubble`
     * style tag covers the stylesheet. Best effort: never a failure path.
     */
    const markApplied = (applied) => {
      try {
        const root = document.documentElement;
        if (!root?.dataset) return;
        if (applied) root.dataset.cooldark = 'on';
        else delete root.dataset.cooldark;
      } catch {
        /* a missing documentElement is not worth a broken theme */
      }
    };

    /**
     * The bubble stylesheet lives outside React: mount it while the theme is
     * active, drop it on disable / switch-away / unload so a plain DSH boot
     * never inherits our outline. Idempotent, and tolerant of a missing
     * `document` (e.g. the smoke test).
     */
    const bubbleSheet = {
      element: null,
      mount() {
        if (this.element) return;
        if (typeof document === 'undefined' || !document.head) return;
        // A hot reload can orphan the previous sheet (our reference is gone),
        // so drop any element already carrying our id instead of stacking two.
        document.getElementById?.(STYLE_ELEMENT_ID)?.remove();
        const element = document.createElement('style');
        element.id = STYLE_ELEMENT_ID;
        element.textContent = STYLESHEET;
        document.head.appendChild(element);
        this.element = element;
      },
      unmount() {
        if (!this.element) return;
        this.element.remove();
        this.element = null;
      },
    };

    return {
      inject: ['theme'],

      apply(ctx) {
        try {
          return applyTheme(ctx);
        } catch (error) {
          // Silent death is the worst failure mode this plugin has had: the row
          // reads "enabled", nothing is painted, and there is nothing to read.
          // Make it noisy instead, then let the loader mark the row as failed.
          console.error('[cooldark] apply() failed — theme not applied:', error);
          throw error;
        }
      },
    };

    /** The real body; `apply` only adds the error trap above. */
    function applyTheme(ctx) {
        const theme = ctx.theme;
        /** True once this plugin itself switched the preference. */
        let autoApplied = false;

        /**
         * "The user switched away from CoolDark" — module scope on purpose.
         *
         * Persisting this was the 0.3.1 bug: the market disable/re-enable path
         * reloads this module but leaves localStorage alone, so a flag written
         * before the disable outlived the re-enable and made the plugin load
         * correctly and then do nothing. The loader row already *is* the on/off
         * switch — a disabled row unloads the plugin, a live row means the user
         * wants it — so the flag only needs to survive the current session
         * (i.e. until the module reloads).
         */
        let optedOut = false;

        /** When we last called `setTheme` ourselves, and how many re-asserts we spent. */
        let lastApplyAt = 0;
        let reasserts = 0;
        /** Why the last re-assert happened — `boot` or `settings`. Diagnosis only. */
        let lastReassert = null;
        /** Font sizes/families as of the last snapshot we saw. */
        let lastFonts = fontFingerprint(theme.getTheme());

        // Older builds left a durable flag behind; drop it so this install can
        // never be blocked by it again. Same for the font baseline: sizes are
        // the settings panel's again, so the stale value must not linger.
        memory.forgetLegacyOptOut();
        memory.forgetFontBaseline();

        // 1. Registration. `register` returns a disposer, which `ctx.effect`
        //    runs when the row is disabled or hot-reloaded.
        ctx.effect(
          () => theme.register(DEFINITION),
          'cooldark: theme registration',
        );

        /** Switch to CoolDark and clear any remembered opt-out. */
        const enable = () => {
          optedOut = false;
          autoApplied = true;
          lastApplyAt = Date.now();
          theme.setTheme(THEME_ID);
          bubbleSheet.mount();
          markApplied(true);
        };

        /** Switch back to the built-in default and remember the choice. */
        const disable = () => {
          optedOut = true;
          autoApplied = false;
          theme.setTheme(FALLBACK_THEME);
          bubbleSheet.unmount();
          markApplied(false);
        };

        // 2. Follow the preference: the bubble sheet only belongs on screen
        //    while this theme is the active one, no matter who switched. A
        //    deliberate switch away is remembered for THIS session only — see
        //    `optedOut`. Two kinds of flip are *not* deliberate and re-assert
        //    instead: the loader re-publishing its config right after our
        //    `setTheme` (REASSERT_WINDOW), and a settings write adopting the
        //    durable preference — font change included (fontFingerprint).
        ctx.on('theme/change', (snapshot) => {
          const fonts = fontFingerprint(snapshot);
          const fontsChanged = fonts !== lastFonts;
          lastFonts = fonts;

          const active = snapshot.preference === THEME_ID;
          if (active) {
            optedOut = false;
            bubbleSheet.mount();
            markApplied(true);
            return;
          }

          bubbleSheet.unmount();
          markApplied(false);

          if (!autoApplied) {
            // Somebody else's theme, and we are not the ones who set ours.
            optedOut = true;
            return;
          }

          const settingsAdoption = fontsChanged;
          const bootClobber =
            Date.now() - lastApplyAt < REASSERT_WINDOW &&
            reasserts < REASSERT_LIMIT;
          if (settingsAdoption || bootClobber) {
            lastReassert = settingsAdoption ? 'settings' : 'boot';
            reasserts += 1;
            enable();
            return;
          }

          autoApplied = false;
          optedOut = true;
        });

        // 3. First application. `optedOut` is false on a fresh mount, so a
        //    re-enabled plugin always applies — that is the whole point.
        if (AUTO_APPLY && !optedOut) enable();

        // 4. Drop the sheet when the row is disabled or hot-reloaded.
        ctx.effect(
          () => () => {
            bubbleSheet.unmount();
            markApplied(false);
          },
          'cooldark: bubble stylesheet',
        );

        // 5. Dev handle: `__cooldark.enable()`, `.disable()`, `.tokens`,
        //    `.palette`, `.css`. Removed when the plugin unloads.
        //    TODO(v0.4): replace with a Settings row once the picker accepts
        //    custom ids.
        ctx.effect(() => {
          const handle = {
            id: THEME_ID,
            enable,
            disable,
            palette: PALETTE,
            tokens: TOKENS,
            bubbleCss: BUBBLE_CSS,
            tokenCss: TOKEN_CSS,
            insetCss: INSET_CSS,
            markdownCss: MARKDOWN_CSS,
            bannerCss: BANNER_CSS,
            focusCss: FOCUS_CSS,
            css: STYLESHEET,
            get active() {
              return theme.getTheme().preference === THEME_ID;
            },
            get reasserts() {
              return reasserts;
            },
            get lastReassert() {
              return lastReassert;
            },
          };
          window.__cooldark = handle;
          return () => {
            if (window.__cooldark === handle) delete window.__cooldark;
          };
        }, 'cooldark: dev handle');
    }
  },
});
