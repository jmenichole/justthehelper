import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { addReminder, listDueReminders, markReminder, REMINDERS_PATH } from "./store.js";

const tmp = path.resolve("data", "reminders.test.json");

describe("reminders store", () => {
  beforeEach(() => {
    process.env.REMINDERS_FILE = tmp;
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  });
  afterEach(() => {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    delete process.env.REMINDERS_FILE;
  });

  it("lists only pending reminders that are due", () => {
    addReminder({ id: "a", userId: "u1", dueAt: Date.now() - 1000, text: "past", status: "pending" });
    addReminder({ id: "b", userId: "u1", dueAt: Date.now() + 60_000, text: "future", status: "pending" });
    const due = listDueReminders(Date.now());
    assert.equal(due.length, 1);
    assert.equal(due[0].id, "a");
  });

  it("markReminder updates status", () => {
    addReminder({ id: "c", userId: "u1", dueAt: Date.now() - 1, text: "x", status: "pending" });
    markReminder("c", "sent");
    assert.equal(listDueReminders(Date.now()).length, 0);
  });
});
