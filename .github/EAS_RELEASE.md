# iOS auto-release via EAS

Push a commit to `main` whose message contains a release marker and the
[`EAS iOS Release`](./workflows/eas-ios-release.yml) workflow bumps the version
and builds an iOS IPA on EAS.

## Release markers

Put one of these anywhere in the commit message:

| Marker             | Effect                          | Example version |
| ------------------ | ------------------------------- | --------------- |
| `[release:patch]`  | x.y.**z**+1                     | 0.1.0 → 0.1.1   |
| `[release:minor]`  | x.**y**+1.0                     | 0.1.0 → 0.2.0   |
| `[release:major]`  | **x**+1.0.0                     | 0.1.0 → 1.0.0   |

Example:

```
git commit -m "feat: shared budgets [release:minor]"
```

What happens:
1. `scripts/bump-version.cjs` bumps `expo.version` in `app.json`.
2. The bump is committed back to `main` as `chore(release): vX.Y.Z [skip ci]`
   (the `[skip ci]` prevents a release loop).
3. `eas build --platform ios --profile production --non-interactive --no-wait`
   queues the IPA build on EAS. The iOS `buildNumber` auto-increments on EAS
   (`autoIncrement` in `eas.json`, `appVersionSource: remote`).

Commits without a marker do nothing. The build is **queued** (`--no-wait`), so
the runner finishes fast and you watch progress / download the IPA at
<https://expo.dev>.

## Required GitHub secret

Add under **Settings → Secrets and variables → Actions**:

| Secret        | Where to get it                                                    |
| ------------- | ------------------------------------------------------------------ |
| `EXPO_TOKEN`  | <https://expo.dev/accounts/[account]/settings/access-tokens> → "Create token" |

That is the only secret the workflow needs. Free Expo plan works (EAS Build has
a free tier; iOS builds run on EAS's macOS workers and queue when busy).

## One-time setup (run locally, signed into your Expo account)

These can't run in CI because they need interactive auth / Apple credentials:

```bash
npm i -g eas-cli
eas login                       # your free Expo account
eas init                        # links the repo, writes extra.eas.projectId into app.json
eas build --platform ios --profile production   # first run: lets EAS manage Apple credentials
```

- `eas init` adds `extra.eas.projectId` (and `owner`) to `app.json` — commit that.
- The first interactive iOS build sets up **Apple signing credentials** on EAS
  (needs a paid Apple Developer account — required for any real IPA). After that
  the CI build runs non-interactively with just `EXPO_TOKEN`.

## Optional: auto-submit to TestFlight

Not enabled by default. To also upload to App Store Connect, add
`--auto-submit` to the build step and configure the `submit.production` profile
in `eas.json` with an App Store Connect API key
(<https://docs.expo.dev/submit/ios/>). That needs extra secrets
(`EXPO_APPLE_APP_SPECIFIC_PASSWORD` or an ASC API key) — skip unless you want it.

## Notes

- Pushing the version bump back to `main` needs the workflow's
  `contents: write` permission (already set). If `main` is a protected branch,
  allow the `github-actions[bot]` to push, or the bump step will fail.
- The bump commit will also trigger the existing Vercel deploy workflow; that is
  harmless.
