/**
 * CoolDark — Host half.
 *
 * A theme is a pure browser-side extension: the Client module (./client.js)
 * owns everything, so the Host half stays empty on purpose. It exists because a
 * bundle row always has a Host plugin module; keeping it side-effect free means
 * the row shows up in Plugin Manager and can be toggled without touching the
 * Host process.
 *
 * Where to add Host-side behaviour later:
 *   - `export function apply(ctx, config)` with `export const Config = ...`
 *     (schemastery) if the theme ever needs a per-profile setting, e.g. a
 *     "force CoolDark" switch or per-variant palettes.
 *   - `ctx.effect(() => ..., 'cooldark: <what>')` for every resource so the row
 *     can be disabled without leaking listeners.
 */
export function apply() {}
