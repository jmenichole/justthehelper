import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWelcomePayload, VERIFY_BUTTON_ID } from "./handler.js";

describe("buildWelcomePayload", () => {
  it("returns embed and Verify button with customId jth_verify", () => {
    const payload = buildWelcomePayload({});
    assert.equal(payload.embeds.length, 1);
    assert.equal(payload.embeds[0].data.title, "Welcome");
    assert.equal(payload.components.length, 1);
    const button = payload.components[0].components[0];
    assert.equal(button.data.custom_id, VERIFY_BUTTON_ID);
    assert.equal(button.data.label, "Verify");
  });

  it("uses welcomeEmbedText when set", () => {
    const payload = buildWelcomePayload({ welcomeEmbedText: "Hello world" });
    assert.equal(payload.embeds[0].data.description, "Hello world");
  });
});
