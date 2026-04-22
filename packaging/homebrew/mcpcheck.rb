# Homebrew formula template for mcpcheck.
#
# To publish a tap:
#   1. Create a repo named `homebrew-mcpcheck` under your GitHub account.
#   2. Run `mcpcheck` once on npm so the tarball URL below resolves.
#   3. Replace <VERSION> + <SHA256> below (use `curl -sL <url> | shasum -a 256`).
#   4. Commit this file to `homebrew-mcpcheck/Formula/mcpcheck.rb`.
#   5. Users install with:
#        brew tap MukundaKatta/mcpcheck
#        brew install mcpcheck
#
# This formula uses Homebrew's npm install path — we let npm do the heavy
# lifting rather than shipping a binary directly. Works on macOS and Linux.

class Mcpcheck < Formula
  desc "Linter for MCP (Model Context Protocol) config files"
  homepage "https://github.com/MukundaKatta/mcpcheck"
  url "https://registry.npmjs.org/mcpcheck/-/mcpcheck-<VERSION>.tgz"
  sha256 "<SHA256>"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "mcpcheck", shell_output("#{bin}/mcpcheck --version")
    assert_match "hardcoded-secret", shell_output("#{bin}/mcpcheck --list-rules")
  end
end
