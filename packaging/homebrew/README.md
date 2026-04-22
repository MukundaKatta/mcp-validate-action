# Homebrew tap template

`mcpcheck.rb` is a formula template that lets users `brew install` mcpcheck once the CLI is on npm.

## Publishing steps (one-time)

1. `npm publish --access public` from the repo root (see `CONTRIBUTING.md` for the 1Password / OTP flow).
2. `curl -sL https://registry.npmjs.org/mcpcheck/-/mcpcheck-<VERSION>.tgz | shasum -a 256` → note the digest.
3. Create a new GitHub repo under your account named `homebrew-mcpcheck`.
4. Copy `packaging/homebrew/mcpcheck.rb` into `Formula/mcpcheck.rb` of that repo.
5. Replace `<VERSION>` and `<SHA256>` with the values from steps 1 and 2.
6. Commit + push.

## Usage (for end users)

```bash
brew tap MukundaKatta/mcpcheck
brew install mcpcheck
```

## Subsequent releases

After each `npm publish`:

```bash
VERSION=X.Y.Z
SHA=$(curl -sL https://registry.npmjs.org/mcpcheck/-/mcpcheck-$VERSION.tgz | shasum -a 256 | awk '{print $1}')
sed -i.bak "s|mcpcheck-.*\.tgz|mcpcheck-$VERSION.tgz|; s|sha256 \".*\"|sha256 \"$SHA\"|" Formula/mcpcheck.rb
rm Formula/mcpcheck.rb.bak
git commit -am "mcpcheck $VERSION" && git push
```

## Alternatives

- **`npm install -g mcpcheck`** — the canonical path; Homebrew just wraps this.
- **`npx mcpcheck`** — one-off, no install.
- **`ghcr.io/mukundakatta/mcpcheck`** — Docker image, multi-arch.
