import fs from "fs";
import path from "path";

function filePath() {
  return process.env.REMINDERS_FILE || path.resolve("data", "reminders.json");
}

function loadAll() {
  const p = filePath();
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return [];
  }
}

function saveAll(rows) {
  const p = filePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(rows, null, 2));
}

export function addReminder(row) {
  const rows = loadAll();
  rows.push(row);
  saveAll(rows);
  return row;
}

export function listDueReminders(nowMs = Date.now()) {
  return loadAll().filter((r) => r.status === "pending" && r.dueAt <= nowMs);
}

export function markReminder(id, status) {
  const rows = loadAll();
  const i = rows.findIndex((r) => r.id === id);
  if (i === -1) return false;
  rows[i] = { ...rows[i], status };
  saveAll(rows);
  return true;
}

export { filePath as REMINDERS_PATH };
