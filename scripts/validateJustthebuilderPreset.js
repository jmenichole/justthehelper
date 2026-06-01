#!/usr/bin/env node
import { validateBlueprint, formatValidationErrors } from "../src/utils/ai/schemas.js";
import { loadJustTheBuilderBlueprint } from "../src/utils/presets/justthebuilder.js";

const blueprint = loadJustTheBuilderBlueprint({ name: "Test Guild" });
const { valid, errors } = validateBlueprint(blueprint);

if (!valid) {
  console.error("Preset blueprint FAILED validation:");
  console.error(formatValidationErrors(errors));
  process.exit(1);
}

console.log("Preset blueprint OK (schema-valid before lastPreset)");
process.exit(0);
