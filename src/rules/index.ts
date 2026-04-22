import type { Rule } from "../types.js";
import { structureRules } from "./structure.js";
import { transportRules } from "./transport.js";
import { commandRules } from "./command.js";
import { envRules } from "./env.js";
import { urlRules } from "./url.js";
import { unknownFieldRule } from "./unknown-field.js";
import { unstableReferenceRule } from "./unstable-reference.js";
import { dangerousCommandRule } from "./dangerous-command.js";
import { httpWithoutAuthRule } from "./http-without-auth.js";
import { duplicateEnvKeyRule } from "./duplicate-env-key.js";
import { shellMetacharsRule } from "./shell-metachars.js";
import { typosquatRule } from "./typosquat.js";
import { emptyArgsRule } from "./empty-args.js";
import { placeholderValueRule } from "./placeholder-value.js";
import { plaintextHttpWithTokenRule } from "./plaintext-http-with-token.js";
import { invalidEnvVarNameRule } from "./invalid-env-var-name.js";
import { emptyEnvValueRule } from "./empty-env-value.js";
import { cwdNotAbsoluteRule } from "./cwd-not-absolute.js";
import { secretInArgsRule } from "./secret-in-args.js";
import { duplicateImageRule } from "./duplicate-image.js";
import { nonAsciiServerNameRule } from "./non-ascii-server-name.js";
import { urlEmbeddedCredsRule } from "./url-embedded-creds.js";
import { passwordFlagLiteralRule } from "./password-flag-literal.js";
import { missingDigestPinRule } from "./missing-digest-pin.js";
import { autoapproveWildcardRule } from "./autoapprove-wildcard.js";
import { argsWithNewlineRule } from "./args-with-newline.js";

export const BUILTIN_RULES: Rule[] = [
  structureRules,
  transportRules,
  commandRules,
  envRules,
  urlRules,
  unknownFieldRule,
  unstableReferenceRule,
  dangerousCommandRule,
  httpWithoutAuthRule,
  duplicateEnvKeyRule,
  shellMetacharsRule,
  typosquatRule,
  emptyArgsRule,
  placeholderValueRule,
  plaintextHttpWithTokenRule,
  invalidEnvVarNameRule,
  emptyEnvValueRule,
  cwdNotAbsoluteRule,
  secretInArgsRule,
  duplicateImageRule,
  nonAsciiServerNameRule,
  urlEmbeddedCredsRule,
  passwordFlagLiteralRule,
  missingDigestPinRule,
  autoapproveWildcardRule,
  argsWithNewlineRule,
];
