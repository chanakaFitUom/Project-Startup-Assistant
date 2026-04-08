# Release Checklist

## 1) Prepare

- Update `package.json` version.
- Update `changelog.md` with release notes.
- Ensure `README.md` reflects current commands/settings.
- Ensure `.vscodeignore` excludes local/dev artifacts.

## 2) Verify

Run full verification locally:

```bash
npm install
npm run verify
```

`verify` runs compile, tests, and VSIX packaging.

## 3) Package

Artifact is generated as:

- `project-startup-assistant.vsix`

Install locally for smoke test:

```bash
code --install-extension project-startup-assistant.vsix
```

## 4) Publish (when publisher is configured)

```bash
npx vsce publish patch
```

If publishing is not configured yet, distribute the VSIX internally.

## 5) GitHub Release Flow

```bash
git add .
git commit -m "release: v0.0.3"
git push origin main
git tag v0.0.3
git push origin v0.0.3
```
