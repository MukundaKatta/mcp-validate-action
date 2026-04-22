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
];
