import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findOpenTicketForUser } from "./threads.js";

describe("ticket open map", () => {
  it("finds existing open ticket for user", () => {
    const state = {
      counter: 2,
      open: {
        t1: { userId: "u1", createdAt: 1 },
        t2: { userId: "u2", createdAt: 2 },
      },
    };
    assert.equal(findOpenTicketForUser(state, "u1"), "t1");
    assert.equal(findOpenTicketForUser(state, "u3"), null);
  });
});
