const Form = require("../../models/Form");
const { recordAudit } = require("../../lib/audit");
const { notifyAdmin } = require("../../lib/notify");
const { isValidId, parentName, fail } = require("./helpers");

/** POST /wallet/:userId/adjust { change, reason, allowNegative } */
const adjustWallet = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!isValidId(userId)) return fail(res, 400, "Invalid userId");
    const { change, reason, allowNegative } = req.body || {};
    const delta = Number(change);
    if (!Number.isFinite(delta) || delta === 0) return fail(res, 400, "change must be a non-zero number");
    if (!reason || !String(reason).trim()) return fail(res, 400, "reason is required");

    const form = await Form.findOne({ user: userId });
    if (!form) return fail(res, 404, "Customer form not found");
    if (!form.wallet) form.wallet = { points: 0, history: [] };

    const before = form.wallet.points || 0;
    const after = before + delta;
    if (after < 0 && !allowNegative) return fail(res, 400, `Balance would go negative (${after}); pass allowNegative to force it`);

    form.wallet.points = after;
    const entry = { date: new Date(), change: delta, reason: String(reason).trim(), childName: "", mealName: "" };
    form.wallet.history.push(entry);
    await form.save();

    await recordAudit(req, {
      action: "wallet.adjust",
      targetType: "Form",
      targetId: form._id,
      before: { points: before },
      after: { points: after },
      reason: entry.reason,
    });
    notifyAdmin({
      type: "admin.override",
      title: "Wallet adjusted",
      message: `${parentName(form) || "Customer"}: wallet ${delta > 0 ? "+" : ""}${delta} (${before} → ${after}). ${entry.reason}`,
      userId,
      meta: { adminId: req.user && req.user._id, change: delta, before, after, reason: entry.reason },
    });
    return res.json({ success: true, data: { points: after, entry } });
  } catch (err) {
    console.error("adminOps.adjustWallet:", err);
    return fail(res, 500, err.message);
  }
};

module.exports = { adjustWallet };
