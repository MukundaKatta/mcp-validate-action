/**
 * Shell completion scripts. Printed to stdout by
 * `mcpcheck completions <bash|zsh|fish>`; users pipe into their shell's
 * completion loader (instructions at the top of each script).
 *
 * The scripts are static — computed rule ids / client names are inlined at
 * generation time rather than invoking `mcpcheck --list-rules` at each tab
 * press, so completion stays fast even with a cold Node.
 */

import { listRuleIds } from "./rule-docs.js";
import { knownClients } from "./cli-metadata.js";

const SUBCOMMANDS = ["init", "diff", "stats", "doctor", "upgrade-pins", "completions"];
const FORMATS = ["text", "json", "sarif", "github", "markdown", "junit"];
const FAIL_ON = ["error", "warning", "info", "never"];
const SHELLS = ["bash", "zsh", "fish"] as const;
export type Shell = (typeof SHELLS)[number];

const FLAGS: string[] = [
  "--config",
  "--format",
  "--fix",
  "--fail-on",
  "--output",
  "--quiet",
  "--client",
  "--explain",
  "--list-rules",
  "--baseline",
  "--baseline-write",
  "--watch",
  "--version",
  "--help",
];

export function completionFor(shell: Shell): string {
  if (shell === "bash") return bashScript();
  if (shell === "zsh") return zshScript();
  return fishScript();
}

export function isKnownShell(s: string): s is Shell {
  return (SHELLS as readonly string[]).includes(s);
}

export function listShells(): readonly Shell[] {
  return SHELLS;
}

function bashScript(): string {
  const rules = listRuleIds().join(" ");
  const clients = knownClients().join(" ");
  return `# bash completion for mcpcheck.
# Install:
#   mcpcheck completions bash > ~/.local/share/bash-completion/completions/mcpcheck
# Or source directly in ~/.bashrc:
#   source <(mcpcheck completions bash)

_mcpcheck() {
  local cur prev words cword
  _init_completion || return
  local subcommands="${SUBCOMMANDS.join(" ")}"
  local flags="${FLAGS.join(" ")}"
  local formats="${FORMATS.join(" ")}"
  local fail_on="${FAIL_ON.join(" ")}"
  local rules="${rules}"
  local clients="${clients}"

  # Special-case the argument *after* a specific option.
  case "$prev" in
    --format|-f)    COMPREPLY=($(compgen -W "$formats" -- "$cur")); return ;;
    --fail-on)      COMPREPLY=($(compgen -W "$fail_on" -- "$cur")); return ;;
    --client)       COMPREPLY=($(compgen -W "$clients" -- "$cur")); return ;;
    --explain)      COMPREPLY=($(compgen -W "$rules all" -- "$cur")); return ;;
    --config|-c|--output|-o|--baseline|--baseline-write)
                    _filedir json; return ;;
  esac

  # First positional: suggest subcommands or dashed flags.
  if [[ "\${COMP_CWORD}" -eq 1 ]]; then
    COMPREPLY=($(compgen -W "$subcommands $flags" -- "$cur"))
    _filedir json
    return
  fi

  if [[ "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "$flags" -- "$cur"))
    return
  fi
  _filedir json
}
complete -F _mcpcheck mcpcheck
`;
}

function zshScript(): string {
  const rules = listRuleIds().join(" ");
  const clients = knownClients().join(" ");
  return `#compdef mcpcheck
# zsh completion for mcpcheck.
# Install:
#   mkdir -p ~/.zsh/completion && mcpcheck completions zsh > ~/.zsh/completion/_mcpcheck
#   then in ~/.zshrc:
#     fpath=(~/.zsh/completion $fpath)
#     autoload -Uz compinit && compinit

_mcpcheck() {
  local -a subcmds
  subcmds=(
${SUBCOMMANDS.map((s) => `    '${s}:mcpcheck subcommand'`).join("\n")}
  )
  _arguments -C \\
    '(-h --help)'{-h,--help}'[show help]' \\
    '(-v --version)'{-v,--version}'[show version]' \\
    '(-c --config)'{-c,--config}'[mcpcheck config file]:file:_files -g "*.json"' \\
    '(-f --format)'{-f,--format}'[output format]:format:(${FORMATS.join(" ")})' \\
    '--fail-on[exit threshold]:level:(${FAIL_ON.join(" ")})' \\
    '--client[single client path set]:client:(${clients})' \\
    '--explain[print rule docs]:rule:(${rules} all)' \\
    '--list-rules[print rule ids and exit]' \\
    '(-o --output)'{-o,--output}'[write output to file]:file:_files' \\
    '(-q --quiet)'{-q,--quiet}'[hide clean files]' \\
    '--fix[apply autofixes in place]' \\
    '--baseline[suppress baseline issues]:baseline file:_files -g "*.json"' \\
    '--baseline-write[write a baseline]:baseline file:_files -g "*.json"' \\
    '(-w --watch)'{-w,--watch}'[re-run on change]' \\
    '1: :->subcmd_or_file' \\
    '*: :_files -g "*.json"'
  case $state in
    subcmd_or_file)
      _describe 'subcommand' subcmds
      _files -g "*.json"
      ;;
  esac
}
compdef _mcpcheck mcpcheck
`;
}

function fishScript(): string {
  const rules = listRuleIds().join(" ");
  const clients = knownClients().join(" ");
  const subs = SUBCOMMANDS.join(" ");
  return `# fish completion for mcpcheck.
# Install:
#   mcpcheck completions fish > ~/.config/fish/completions/mcpcheck.fish

function __mcpcheck_no_subcmd
  set -l cmd (commandline -opc)
  if test (count $cmd) -le 1
    return 0
  end
  return 1
end

# Subcommands
${SUBCOMMANDS.map(
  (s) => `complete -c mcpcheck -n '__mcpcheck_no_subcmd' -f -a '${s}'`
).join("\n")}

# Flags with enum values
complete -c mcpcheck -l format -f -a '${FORMATS.join(" ")}' -d 'output format'
complete -c mcpcheck -s f -f -a '${FORMATS.join(" ")}' -d 'output format'
complete -c mcpcheck -l fail-on -f -a '${FAIL_ON.join(" ")}' -d 'exit threshold'
complete -c mcpcheck -l client -f -a '${clients}' -d 'single client paths'
complete -c mcpcheck -l explain -f -a '${rules} all' -d 'print rule docs'

# Flags without values
complete -c mcpcheck -l fix -d 'apply autofixes'
complete -c mcpcheck -l quiet -s q -d 'hide clean files'
complete -c mcpcheck -l watch -s w -d 're-run on change'
complete -c mcpcheck -l list-rules -d 'list rule ids'
complete -c mcpcheck -l version -s v -d 'show version'
complete -c mcpcheck -l help -s h -d 'show help'

# Flags taking a file
complete -c mcpcheck -l config -s c -F -d 'mcpcheck config file'
complete -c mcpcheck -l output -s o -F -d 'write output to file'
complete -c mcpcheck -l baseline -F -d 'suppress baseline issues'
complete -c mcpcheck -l baseline-write -F -d 'write a baseline'
# Intentional no-op referencing subs so dead-code tools don't strip it:
# __SUBS: ${subs}
`;
}
