/**
 * clone-db.js — one-command clone of a remote MongoDB into your local one.
 *
 * Usage:  npm run db:clone   (from the backend/ folder)
 *
 * Config comes from backend/.env.local (gitignored) so no secrets live in git:
 *   MONGO_SOURCE_URI   full URI of the DB to clone FROM (required)
 *   MONGO_TOOLS_BIN    folder containing mongodump/mongorestore (optional if on PATH)
 *   MONGO_TARGET_URI   where to restore TO      (default: mongodb://localhost:27017)
 *   MONGO_TARGET_DB    local DB name to create  (default: lunchbowl)
 *
 * It dumps the source DB to a temp folder, then restores it into the target DB
 * with --drop (existing target collections are replaced).
 */
require("dotenv").config();
require("dotenv").config({ path: `${__dirname}/../.env.local`, override: true });

const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const SRC = process.env.MONGO_SOURCE_URI;
const TARGET_URI = process.env.MONGO_TARGET_URI || "mongodb://localhost:27017";
const TARGET_DB = process.env.MONGO_TARGET_DB || "lunchbowl";
const BIN = process.env.MONGO_TOOLS_BIN || "";

if (!SRC) {
  console.error(
    "\n✖ MONGO_SOURCE_URI is not set. Add it to backend/.env.local, e.g.\n" +
      "  MONGO_SOURCE_URI=mongodb://user:pass@host:27017/dbname?authSource=admin\n"
  );
  process.exit(1);
}

// Derive the source DB name from the URI path (e.g. .../lunchbowl_live?authSource=admin)
const srcMatch = SRC.match(/\/([^/?]+)(?:\?|$)/);
const SRC_DB = srcMatch && srcMatch[1];
if (!SRC_DB) {
  console.error("✖ Could not read the source DB name from MONGO_SOURCE_URI.");
  process.exit(1);
}

const exe = (name) => {
  const file = process.platform === "win32" ? `${name}.exe` : name;
  return BIN ? path.join(BIN, file) : file; // full path avoids PowerShell's .\ requirement
};

const outDir = path.join(os.tmpdir(), "lunchbowl-db-clone");

try {
  console.log(`\n➊ Dumping "${SRC_DB}" from source …`);
  execFileSync(exe("mongodump"), [`--uri=${SRC}`, `--out=${outDir}`], {
    stdio: "inherit",
  });

  console.log(`\n➋ Restoring into "${TARGET_DB}" at ${TARGET_URI} (--drop) …`);
  execFileSync(
    exe("mongorestore"),
    [
      `--uri=${TARGET_URI}`,
      `--nsFrom=${SRC_DB}.*`,
      `--nsTo=${TARGET_DB}.*`,
      "--drop",
      outDir,
    ],
    { stdio: "inherit" }
  );

  console.log(`\n✔ Done. Cloned "${SRC_DB}" → "${TARGET_DB}".`);
} catch (err) {
  console.error(
    "\n✖ Clone failed. Check that MongoDB tools are installed (MONGO_TOOLS_BIN) " +
      "and the source/target are reachable.\n" +
      (err.message || err)
  );
  process.exit(1);
}
