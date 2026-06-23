# Capacitor Scaffold — Composer

- **Date:** 2026-06-22
- **Branch:** `adit/capacitor-scaffold` (off `adit/sandbox-testing`)
- **Intent:** scaffold Capacitor as a **remote-URL wrap** that loads the live
  Vercel deployment (`https://composer.onpalate.com`). NOT a Next.js static
  export — `next.config` and the build pipeline are unchanged. Native shell
  first; no feature plugins (camera, push, geolocation) yet.
- **Scope guard:** no `src/` edits, no `next.config*` edits, no commits. Step-
  by-step with checkpoints between each.

---

## Step 1 — Install Capacitor packages

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
```

**Result:** 76 packages added, 0 errors. All four landed under `dependencies`
at `^8.4.1`:

```
"@capacitor/android": "^8.4.1",
"@capacitor/cli":     "^8.4.1",
"@capacitor/core":    "^8.4.1",
"@capacitor/ios":     "^8.4.1",
```

**Flags (non-blocking):**
- `@capacitor/cli` landed in `dependencies` — Capacitor docs prefer it as a
  `devDependency` (it's build-time tooling). Hygiene-only; functional either
  way. Decide whether to move it before merge.
- `npm warn EBADENGINE` on `eslint-visitor-keys` because Node is 23.11.0 and
  the package wants 20.19 / 22.13 / ≥24. **Pre-existing; not caused by this
  install.**
- `npm audit` report shows 22 vulnerabilities (2 low, 15 moderate, 4 high, 1
  critical). **Pre-existing; not introduced by the four Capacitor packages.**
  Out of scope for the scaffold.

---

## Step 2 — `capacitor.config.ts` at the repo root

Path: [capacitor.config.ts](../capacitor.config.ts) (same level as
[package.json](../package.json)).

Verbatim content:

```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.onpalate.composer",
  appName: "Composer",
  webDir: "public",
  server: {
    url: "https://composer.onpalate.com",
    cleartext: false,
  },
};

export default config;
```

- `webDir: "public"` — unused for the remote-URL wrap (the runtime loads
  `server.url`), but Capacitor's schema requires the field, so we point it at
  an existing harmless folder.
- `server.cleartext: false` — HTTPS-only loads. The production URL is HTTPS,
  so this is the correct posture.
- No `server.androidScheme` set — defaults to `https`, which is what we want.
- No `server.allowNavigation` — added later only if other origins (e.g.
  Supabase callbacks, Resy deep links) need to remain in-webview.

---

## Step 3a — `npx cap add ios`

```
✔ Adding native Xcode project in ios in 27.10ms
✔ add in 27.60ms
✔ Copying web assets from public to ios/App/App/public in 6.45ms
✔ Creating capacitor.config.json in ios/App/App in 319.04μs
✔ copy ios in 33.75ms
✔ Updating iOS plugins in 7.26ms
[info] All Capacitor plugins have a Package.swift file and will be included in Package.swift
[info] Writing Package.swift
✔ update ios in 35.42ms
[success] ios platform added!
```

**Notable:** **no Podfile, no `Pods/` directory.** Capacitor 8 uses **Swift
Package Manager**, not CocoaPods. Step 7's gitignore mention of `ios/App/Pods/`
is therefore vestigial — keeping it defensively is still cheap insurance for
legacy-plugin migration paths.

**`ios/` structure created:**
- `ios/.gitignore` (template)
- `ios/App/App/` (Swift sources, `Info.plist`, `Assets.xcassets`, `Base.lproj`)
- `ios/App/App.xcodeproj/`
- `ios/App/CapApp-SPM/` (SPM wrapper, with its own `.gitignore`)
- `ios/capacitor-cordova-ios-plugins/`
- `ios/debug.xcconfig`

---

## Step 3b — `npx cap add android`

```
✔ Adding native android project in android in 46.71ms
✔ add in 47.49ms
✔ Copying web assets from public to android/app/src/main/assets/public in 6.03ms
✔ Creating capacitor.config.json in android/app/src/main/assets in 480.17μs
✔ copy android in 24.41ms
✔ Updating Android plugins in 4.78ms
✔ update android in 25.35ms
Error running gradle sync 
ERROR: JAVA_HOME is set to an invalid directory: /Library/Java/JavaVirtualMachines/temurin-25.jdk/Contents/Homeexport

Please set the JAVA_HOME variable in your environment to match the
location of your Java installation.


Unable to infer default Android SDK settings. This is fine, just run npx cap open android and import and sync gradle manually
✔ Syncing Gradle in 325.90ms
[success] android platform added!
```

**Two non-fatal warnings:**

1. **Broken `JAVA_HOME` value** — `/Library/Java/JavaVirtualMachines/temurin-25.jdk/Contents/Homeexport`. Trailing `export` is a shell-rc concatenation bug (likely a missing newline between an assignment line and the next `export` in `.zshrc` / `.zprofile`). The intended value is presumably the same string minus the `export` suffix. Fix on the developer side, not in code.
2. **Android SDK location unknown** — Capacitor wrote `android/local.properties` but couldn't infer the SDK path. CLI's own guidance: open in Android Studio and let it resolve the SDK on first import. No code action.

The platform-add still finished `[success]`. Native shell is in place. Gradle won't actually build a usable APK until JAVA_HOME is fixed AND Android Studio resolves the SDK path.

**`android/` structure created:**
- `android/.gitignore` (full Android template + Capacitor-specific tail)
- `android/app/` (the module, with its own nested `.gitignore`)
- `android/build.gradle`, `android/settings.gradle`, `android/variables.gradle`, `android/capacitor.settings.gradle`
- `android/gradle/`, `android/gradlew`, `android/gradlew.bat`, `android/gradle.properties`
- `android/capacitor-cordova-android-plugins/`
- `android/local.properties` (gitignored)

---

## Step 4 — `npx cap sync`

```
✔ Copying web assets from public to android/app/src/main/assets/public in 10.11ms
✔ Creating capacitor.config.json in android/app/src/main/assets in 450.33μs
✔ copy android in 28.56ms
✔ Updating Android plugins in 5.18ms
✔ update android in 35.62ms
✔ Copying web assets from public to ios/App/App/public in 5.49ms
✔ Creating capacitor.config.json in ios/App/App in 446.13μs
✔ copy ios in 28.85ms
✔ Updating iOS plugins in 5.61ms
[info] All Capacitor plugins have a Package.swift file and will be included in Package.swift
[info] Writing Package.swift
✔ update ios in 32.66ms
✔ copy web in 10.18ms
✔ update web in 7.25ms
[info] Sync finished in 0.206s
```

**Both platforms synced.** No plugin list was printed because zero plugins are
installed (Step 5 says shell-first). The earlier JAVA_HOME warning did NOT
recur — `cap sync` is file-copy + plugin-config rewrites only, no Gradle
invocation.

---

## Step 5 — No plugins yet (intentional)

Shell-first. Capacitor feature plugins (camera, push, geolocation, browser,
filesystem, etc.) are deliberately deferred. When/if needed:
- `@capacitor/browser` is the first likely candidate — it's the canonical fix
  for F14 (external links opening in-webview without a back path) flagged in
  the mobile-readiness audit.
- `@capacitor/app` for the Android hardware back button (B4 in pass 1).
- `@capacitor/status-bar` for status-bar styling under Capacitor (B4).

---

## Step 7 — Gitignore audit

### Files inspected

- **Root** [.gitignore](../.gitignore) — Next.js + node defaults; nothing
  Capacitor-specific.
- **`ios/.gitignore`** — `App/build`, `App/Pods`, `App/output`, `App/App/public`, `DerivedData`, `xcuserdata`, `capacitor-cordova-ios-plugins`, `App/App/capacitor.config.json`, `App/App/config.xml`.
- **`android/.gitignore`** — GitHub Android template (APK/AAB, classes, `.gradle/`, `build/`, `local.properties`, IDE state) + Capacitor tail: `capacitor-cordova-android-plugins`, `app/src/main/assets/public`, `app/src/main/assets/capacitor.config.json`, `app/src/main/assets/capacitor.plugins.json`, `app/src/main/res/xml/config.xml`.
- **`android/app/.gitignore`** — `/build/*` with `!/build/.npmkeep`.
- **`ios/App/CapApp-SPM/.gitignore`** — `.DS_Store`, `/.build`, `/Packages`, `/*.xcodeproj`, `xcuserdata/`, `DerivedData/`, `.swiftpm/config/registries.json`, `.swiftpm/xcode/package.xcworkspace/contents.xcworkspacedata`, `.netrc`.

### `git add -A --dry-run`

**75 lines, all legitimate.** Targeted grep across the dry-run output for
`public/`, `DerivedData`, `/build/`, `.gradle/`, `local.properties`,
`xcuserdata`, `node_modules`, `capacitor.config.json`:

> **(none of the watched dangerous paths appear in dry-run)**

| Watched path | Status | Excluded by |
|---|---|---|
| `ios/App/App/public/` (184K, regenerated by cap sync) | not staged ✓ | `ios/.gitignore: App/App/public` |
| `android/app/src/main/assets/public/` (184K) | not staged ✓ | `android/.gitignore: app/src/main/assets/public` |
| `ios/App/App/capacitor.config.json` (regenerated) | not staged ✓ | `ios/.gitignore` |
| `android/app/src/main/assets/capacitor.config.json` | not staged ✓ | `android/.gitignore` |
| `DerivedData/` | not on disk yet | `ios/.gitignore` |
| `ios/App/build/`, `ios/App/Pods/`, `ios/App/output/` | not on disk yet | `ios/.gitignore` |
| `android/.gradle/`, `android/build/`, `android/app/build/` | not on disk yet | `android/.gitignore` |
| `android/local.properties` (637 bytes, on disk now) | not staged ✓ | `android/.gitignore: local.properties` |
| `xcuserdata/` anywhere | not on disk yet | `ios/.gitignore` |
| `node_modules` | not staged ✓ | root `.gitignore: /node_modules` |

`local.properties` on disk contains the Android Studio template header
(`This file should *NOT* be checked into Version Control Systems`) — verified
not staged.

### Recommendation — defense-in-depth additions to ROOT `.gitignore`

The per-platform `.gitignore` files do their job today. They live INSIDE
`ios/` and `android/`, so a sloppy `git rm -r --cached ios/` (or accidental
deletion of a nested `.gitignore`) would re-expose the artifacts. Belt-and-
suspenders block at the root is cheap insurance. **Not yet applied — pending
your go-ahead.** Exact lines to add to [.gitignore](../.gitignore):

```
# capacitor — regenerable artifacts and per-user IDE state
# (mirrors the per-platform .gitignores; defense-in-depth)
/ios/App/App/public/
/ios/App/build/
/ios/App/output/
/ios/App/Pods/
/ios/App/App/capacitor.config.json
/ios/App/App/config.xml
/ios/DerivedData/
/ios/capacitor-cordova-ios-plugins/

/android/.gradle/
/android/build/
/android/app/build/
/android/local.properties
/android/app/src/main/assets/public/
/android/app/src/main/assets/capacitor.config.json
/android/app/src/main/assets/capacitor.plugins.json
/android/app/src/main/res/xml/config.xml
/android/capacitor-cordova-android-plugins/

**/xcuserdata/
**/.idea/
```

Two intentional omissions:
- **Not** ignoring `ios/App/CapApp-SPM/Package.resolved`. It isn't present
  yet (no plugins installed). Convention is to commit it once it appears so
  SPM resolutions are reproducible.
- **Not** ignoring `*.jks` / `*.keystore`. Release-signing is a deliberate
  later decision; the Android template has those entries commented out with a
  note.

---

## Outstanding items (not in this scaffold pass)

1. **Fix `JAVA_HOME`** in `.zshrc` / `.zprofile` — trailing `export` is the
   smoking gun. Sanity check after fix: `echo $JAVA_HOME && ls $JAVA_HOME/bin/java`.
2. **First open in Android Studio** — let it resolve the SDK path into
   `local.properties` (which stays gitignored).
3. **Decide on `@capacitor/cli` placement** — move to `devDependencies`
   (recommended by Capacitor) or leave in `dependencies`.
4. **Apply the recommended root `.gitignore` additions** if defense-in-depth
   is desired.
5. **Final four gates** (`tsc`, `eslint`, `vitest`, `build`) — pending the
   step-by-step go-ahead. Expected to pass unchanged since no `src/` code
   moved.
6. **Capacitor feature plugins** — deferred until specific needs land
   (external-link routing, status bar, Android back button).
7. **Capacitor-specific mobile audit followups** — three items from
   [docs/design/mobile-audit-cc-findings.md](design/mobile-audit-cc-findings.md)
   become actionable once the wrap exists: F5 (Supabase `redirectTo` against
   `capacitor://` origin), F14 (external links via `@capacitor/browser`), B4
   (status bar + Android back button).

---

## Working-tree state at end of scaffold

```
 M package-lock.json
 M package.json
?? android/
?? capacitor.config.ts
?? ios/
```

Plus the earlier untracked `docs/design/mobile-audit-cc-findings.md` and this
file. No `src/` mutations, no `next.config*` mutations, no commits.
