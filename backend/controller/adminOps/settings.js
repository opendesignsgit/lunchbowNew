const settingsStore = require("../../lib/settingsStore");
const { getPricingConfig, getEnvPricingConfig } = require("../../lib/pricing");
const { validateSettingsPatch, SCHEMA } = require("../../lib/settingsSchema");
const { recordAudit } = require("../../lib/audit");
const { EVENTS, CHANNELS, SEVERITY_CHANNELS } = require("../../lib/notify/events");
const { fail } = require("./helpers");

const payload = () => ({
  effective: getPricingConfig(),
  overrides: settingsStore.getAll(),
  defaults: getEnvPricingConfig(),
  schema: Object.keys(SCHEMA),
  notificationEvents: Object.entries(EVENTS).map(([type, def]) => ({
    type,
    title: def.title,
    severity: def.severity,
    defaultChannels: SEVERITY_CHANNELS[def.severity],
  })),
  channels: CHANNELS,
  ...settingsStore.meta(),
});

const getSettings = async (req, res) => {
  try {
    await settingsStore.load();
    return res.json({ success: true, data: payload() });
  } catch (err) {
    console.error("adminOps.getSettings:", err);
    return fail(res, 500, err.message);
  }
};

const updateSettings = async (req, res) => {
  try {
    const { reason, ...patch } = req.body || {};
    const { ok, errors, flat } = validateSettingsPatch(patch);
    if (!ok) return fail(res, 400, "Invalid settings", { errors });

    const before = { ...settingsStore.getAll() };
    await settingsStore.save(flat, req.user && req.user._id);
    const after = settingsStore.getAll();

    await recordAudit(req, {
      action: "settings.update",
      targetType: "BusinessSetting",
      targetId: "business",
      before,
      after,
      reason: reason || "",
    });
    return res.json({ success: true, data: payload(), changed: Object.keys(flat) });
  } catch (err) {
    console.error("adminOps.updateSettings:", err);
    return fail(res, 500, err.message);
  }
};

module.exports = { getSettings, updateSettings };
