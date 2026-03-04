# Release

Bump version, update changelog, commit, build, publish, and push.

## Arguments
- $ARGUMENTS: version bump type — "patch" (default), "minor", or "major"

## Steps

1. **Read** `package.json` to get the current version.
2. **Bump version** based on the argument:
   - `patch`: 1.10.1 → 1.10.2
   - `minor`: 1.10.1 → 1.11.0
   - `major`: 1.10.1 → 2.0.0
   - If no argument is provided, default to `patch`.
3. **Ask the user** for a short release summary (1-3 bullet points) to put in the changelog.
4. **Update CHANGELOG.md** — add a new version entry at the top (below the header), with today's date and the summary from step 3.
5. **Update `package.json`** with the new version.
6. **Commit** the changes with message: `Bump version to v{new_version}`
7. **Build & publish** by running: `npm run publish`
8. **Create local tag** `v{new_version}` and **push** both the commit and tag to origin:
   ```
   git tag v{new_version}
   git push origin master
   git push origin v{new_version}
   ```
9. **Verify** the release is not in draft state:
   ```
   gh release view v{new_version} --json isDraft
   ```
   If it is still draft, publish it: `gh release edit v{new_version} --draft=false`
10. Report the GitHub Release URL to the user.
