/**
 * recent-meal-deletions.js
 * ------------------------------------------------------------------
 * READ-ONLY report of recent meal deletions.
 *
 * Every meal deletion writes a wallet history entry
 *   { change:+225, reason:"Meal deleted", childName, mealName, date }
 * on the parent's Form (see deleteMeal in customerController.js).
 * This script scans those entries, joins the parent/customer details,
 * and prints them newest-first. Nothing is written.
 *
 * USAGE (from backend/, with .env / .env.local pointing at target DB):
 *   node script/recent-meal-deletions.js                 # last 50
 *   node script/recent-meal-deletions.js --limit 100     # last 100
 *   node script/recent-meal-deletions.js --days 7        # last 7 days
 *   node script/recent-meal-deletions.js --csv out.csv   # also write CSV
 * ------------------------------------------------------------------
 */
require("dotenv").config();
require("dotenv").config({ path: `${__dirname}/../.env.local`, override: true });
const fs = require("fs");
const mongoose = require("mongoose");
const Form = require("../models/Form");
const Customer = require("../models/Customer");

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const LIMIT = parseInt(arg("--limit", "50"), 10);
const DAYS = arg("--days", null) ? parseInt(arg("--days", "0"), 10) : null;
const CSV = arg("--csv", null);

const fmt = (d) =>
  new Date(d).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

(async () => {
  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.DB_URI ||
    process.env.MONGO_URL;
  if (!uri) {
    console.error("No Mongo connection string found in env (MONGO_URI etc.).");
    process.exit(1);
  }
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  const cutoff = DAYS ? new Date(Date.now() - DAYS * 86400000) : null;

  // Only pull forms that actually have a deletion entry.
  const forms = await Form.find({ "wallet.history.reason": /meal deleted/i })
    .select("user parentDetails wallet")
    .lean();

  const rows = [];
  for (const form of forms) {
    const p = form.parentDetails || {};
    const parentName = `${p.fatherFirstName || ""} ${p.fatherLastName || ""}`.trim();
    for (const h of form.wallet?.history || []) {
      if (!/meal deleted/i.test(h.reason || "")) continue;
      if (cutoff && new Date(h.date) < cutoff) continue;
      rows.push({
        date: h.date,
        parentName: parentName || "-",
        mobile: p.mobile || "-",
        email: p.email || "(none)",
        childName: h.childName || "-",
        mealName: h.mealName || "-",
        credited: h.change,
      });
    }
  }

  rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  const shown = rows.slice(0, LIMIT);

  console.log(
    `\nRecent meal deletions${DAYS ? ` (last ${DAYS} days)` : ""} — ` +
      `${rows.length} total, showing ${shown.length}\n` +
      "".padEnd(110, "=")
  );
  console.log(
    ["When", "Parent", "Mobile", "Child", "Meal", "Wallet+"].join(" | ")
  );
  console.log("".padEnd(110, "-"));
  for (const r of shown) {
    console.log(
      [
        fmt(r.date),
        r.parentName,
        r.mobile,
        r.childName,
        r.mealName,
        `+${r.credited}`,
      ].join(" | ")
    );
  }
  console.log("".padEnd(110, "=") + "\n");

  if (CSV) {
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const header = [
      "When",
      "Parent",
      "Mobile",
      "Email",
      "Child",
      "Meal",
      "WalletCredited",
    ];
    const lines = [header.join(",")].concat(
      shown.map((r) =>
        [
          fmt(r.date),
          r.parentName,
          r.mobile,
          r.email,
          r.childName,
          r.mealName,
          r.credited,
        ]
          .map(esc)
          .join(",")
      )
    );
    fs.writeFileSync(CSV, "﻿" + lines.join("\n"));
    console.log(`CSV written to ${CSV}`);
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
