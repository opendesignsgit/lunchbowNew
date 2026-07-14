/**
 * fix-wallet-meal-deletion.js
 * ------------------------------------------------------------------
 * SCOPED back-fill for meals deleted after the price rose to 225 but
 * while the code still credited only 200 (short by 25 each).
 *
 * IMPORTANT: the listed dates are the MEAL's scheduled dates (mealDate),
 * not the click-delete timestamps. The wallet history does NOT store the
 * meal date, so we identify the deletions from the `usermeals` collection
 * (which stores mealDate + deleted flag) and then credit the wallet.
 *
 * Per target user:
 *   1. count deleted meals in usermeals whose mealDate is on a listed day
 *   2. add  count * 25  to wallet.points
 *   3. append ONE audit entry recording the correction
 * Idempotent: a user who already has the correction audit entry is skipped.
 *
 * Dates are calendar days (YYYY-MM-DD), matched against mealDate.
 *
 * USAGE (from the backend/ folder):
 *   node script/fix-wallet-meal-deletion.js            # DRY RUN (no writes)
 *   node script/fix-wallet-meal-deletion.js --apply    # write changes
 * ------------------------------------------------------------------
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Form = require("../models/Form");
const Child = require("../models/childModel");
const UserMeal = require("../models/UserMeal");

const DELTA = 25; // 225 - 200
const CORRECTION_REASON = "Wallet correction: meal deletion price 200->225 backfill";
const APPLY = process.argv.includes("--apply");

// ---- Targets: parent mobile + the MEAL dates (scheduled), expected count ----
const TARGETS = [
  { mobile: "9020070101", label: "Vyaan Vyas",  dates: ["2026-06-22", "2026-07-03", "2026-07-06", "2026-07-07"] },
  { mobile: "9840938177", label: "Nitin S",     dates: ["2026-06-29"] },
  { mobile: "9962599795", label: "Lithika",     dates: ["2026-06-22", "2026-06-25"] },
  { mobile: "9884075757", label: "Saatvika",    dates: ["2026-06-15", "2026-06-19", "2026-06-22"] },
  { mobile: "7738053031", label: "Sai Samrudh", dates: ["2026-06-19"] },
  { mobile: "7702522115", label: "shanelle + Ariana", dates: ["2026-06-15"] },
];
// -----------------------------------------------------------------------------

// mealDate -> "YYYY-MM-DD". Match on both UTC and IST day to be timezone-safe.
function dayKeysUTCandIST(d) {
  const t = new Date(d).getTime();
  const utc = new Date(t).toISOString().slice(0, 10);
  const ist = new Date(t + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  return new Set([utc, ist]);
}

(async () => {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set. Run from backend/ with your .env present.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log(`\nMode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}`);
  console.log("=".repeat(80));

  let grandCount = 0;
  let grandDelta = 0;

  for (const target of TARGETS) {
    const form = await Form.findOne({ "parentDetails.mobile": target.mobile });
    if (!form) { console.log(`!! ${target.mobile}  ${target.label}  -> FORM NOT FOUND`); continue; }

    const name = form.parentDetails
      ? `${form.parentDetails.fatherFirstName} ${form.parentDetails.fatherLastName}`
      : target.label;

    // already corrected?
    const already = (form.wallet?.history || []).some((h) => h.reason === CORRECTION_REASON);

    const userMeal = await UserMeal.findOne({ userId: form.user });
    const wanted = new Set(target.dates);

    // Collect deleted meals whose mealDate lands on a listed day
    const hits = [];
    for (const plan of userMeal?.plans || []) {
      for (const childEntry of plan.children || []) {
        for (const meal of childEntry.meals || []) {
          if (!meal.deleted) continue;
          const keys = dayKeysUTCandIST(meal.mealDate);
          if ([...keys].some((k) => wanted.has(k))) {
            hits.push({ childId: childEntry.childId, mealName: meal.mealName, mealDate: meal.mealDate });
          }
        }
      }
    }

    // Resolve child names for display
    const childIds = [...new Set(hits.map((h) => String(h.childId)))];
    const kids = await Child.find({ _id: { $in: childIds } });
    const nameOf = (id) => {
      const c = kids.find((x) => String(x._id) === String(id));
      return c ? `${c.childFirstName} ${c.childLastName}` : String(id);
    };

    const delta = hits.length * DELTA;
    console.log(
      `${target.mobile.padEnd(12)} ${name.padEnd(26)} deletedMeals=${hits.length}  ` +
      `points ${form.wallet?.points ?? 0} -> ${(form.wallet?.points ?? 0) + (already ? 0 : delta)}  (+${already ? 0 : delta})`
    );
    hits.forEach((h) => {
      const d = new Date(h.mealDate).toISOString().slice(0, 10);
      console.log(`      - meal ${d}  ${nameOf(h.childId)}  ${h.mealName}`);
    });
    if (hits.length !== target.dates.length) {
      console.log(`      NOTE: expected ~${target.dates.length} from your list, found ${hits.length}. Verify.`);
    }
    if (already) { console.log(`      SKIP: already corrected earlier.`); continue; }

    grandCount += hits.length;
    grandDelta += delta;

    if (APPLY && hits.length) {
      form.wallet.points = (form.wallet.points || 0) + delta;
      form.wallet.history.push({
        date: new Date(),
        change: delta,
        reason: CORRECTION_REASON,
        childName: "",
        mealName: `Backfill for ${hits.length} meal deletion(s) @ +${DELTA}`,
      });
      await form.save();
    }
  }

  console.log("=".repeat(80));
  console.log(`Deletions corrected: ${grandCount}`);
  console.log(`Total added:         +${grandDelta}`);
  console.log(APPLY ? "\nDONE - changes written." : "\nDRY RUN only - re-run with --apply to write.");

  await mongoose.disconnect();
  process.exit(0);
})().catch(async (err) => {
  console.error("Error:", err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
