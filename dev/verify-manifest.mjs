/**
 * CoolDark manifest check — catches the silent failure modes that make DSH
 * ignore a bundle without printing anything.
 *
 *   node dev/verify-manifest.mjs
 *
 * Why this exists: `exports` in package.json is an *encapsulation boundary*.
 * Once it exists, any subpath not listed resolves to
 * ERR_PACKAGE_PATH_NOT_EXPORTED — including `./cordis.patch.yml`. DSH reads the
 * bundle patch through module resolution, so a missing entry means the patch is
 * silently skipped, no Loader row appears, the client-module scanner finds no
 * row to walk, and the theme never registers. Nothing errors. It just does
 * nothing. This script fails loudly instead.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const req = createRequire(import.meta.url);

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`);
};

// --- 1. the exports holes that break bundle loading ----------------------

/** Subpaths DSH or the plugin UI must be able to resolve. */
const REQUIRED_EXPORTS = [
  [".", "the Host entry (index.js)"],
  ["./client", "the browser artifact the client scanner collects"],
  ["./cordis.patch.yml", "the bundle patch — without it the Loader row never appears"],
  ["./package.json", "display metadata and the dsh.* declarations"],
  ["./icon", "the Plugin Manager icon"],
];

const exported = manifest.exports ?? {};
for (const [subpath, why] of REQUIRED_EXPORTS) {
  check(subpath in exported, `exports declares "${subpath}" (${why})`);
}

// --- 2. every declared target actually exists ----------------------------

for (const [subpath, target] of Object.entries(exported)) {
  if (subpath.includes("*")) continue; // pattern export, resolved per-file
  const rel = typeof target === "string" ? target : target?.default;
  if (typeof rel !== "string") {
    check(false, `exports["${subpath}"] has no string target`);
    continue;
  }
  check(existsSync(join(root, rel)), `exports["${subpath}"] -> ${rel} exists`);
}

// --- 3. self-reference resolution, exactly as DSH would resolve it ------

for (const [subpath] of REQUIRED_EXPORTS) {
  const specifier = subpath === "." ? manifest.name : `${manifest.name}/${subpath.slice(2)}`;
  try {
    req.resolve(specifier);
  } catch (error) {
    check(false, `resolve("${specifier}") -> ${error.code ?? error.message}`);
    continue;
  }
  check(true, `resolve("${specifier}") succeeds`);
}

// --- 4. bundle patch shape ----------------------------------------------

const patchRel = manifest.dsh?.bundle?.patch;
check(typeof patchRel === "string", "dsh.bundle.patch is declared");
if (typeof patchRel === "string") {
  const patchPath = join(root, patchRel);
  check(existsSync(patchPath), `patch file ${patchRel} exists`);
  const patch = existsSync(patchPath) ? readFileSync(patchPath, "utf8") : "";
  check(
    /^\s*-\s*insert:/m.test(patch),
    "patch uses the `- insert:` form (a bare `- id:` only overrides, it never adds a row)",
  );
  check(
    patch.includes(`name: '${manifest.name}'`) ||
      patch.includes(`name: "${manifest.name}"`),
    `patch row name equals the package name (${manifest.name})`,
  );
  check(
    !/\t/.test(patch),
    "patch uses spaces, not tabs (YAML rejects tabs)",
  );
}

// --- 5. client half ------------------------------------------------------

const client = manifest.dsh?.client;
check(client !== undefined, "dsh.client is declared");
check(client?.platform === "web", 'dsh.client.platform is "web"');
check(Array.isArray(client?.inject), "dsh.client.inject is an array");

if (existsSync(join(root, "client.js"))) {
  const source = readFileSync(join(root, "client.js"), "utf8");
  check(
    source.includes(`id: '${manifest.name}'`) ||
      source.includes(`id: "${manifest.name}"`),
    `client.js registers its factory under the package name (${manifest.name})`,
  );
  check(
    source.includes("__ModuleLoader__"),
    "client.js goes through window.__ModuleLoader__",
  );
}

console.log(`\n${failures.length === 0 ? "PASS" : `FAIL (${failures.length})`}`);
process.exit(failures.length === 0 ? 0 : 1);
