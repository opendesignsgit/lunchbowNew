/**
 * Cache of the admin-editable business settings (models/BusinessSetting.js).
 *
 * getPricingConfig() must stay synchronous, so it reads this cache instead of the
 * database. The cache is filled once at startup (await settingsStore.load() after
 * connectDB), refreshed in the background every 60 s, and reloaded immediately
 * after the admin PUT writes a change.
 */
const mongoose = require("mongoose");
const BusinessSetting = require("../models/BusinessSetting");

const REFRESH_MS = 60 * 1000;
const KEY = "business";

const state = { values: {}, loadedAt: 0, updatedAt: null, updatedBy: null };
let inflight = null;

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);

/** Deep-merge `override` onto `base` (arrays and scalars replace, objects merge). */
const deepMerge = (base, override) => {
  if (!isPlainObject(override)) return override === undefined ? base : override;
  const out = isPlainObject(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(override)) {
    if (v === undefined || v === null) continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : isPlainObject(v) ? deepMerge({}, v) : v;
  }
  return out;
};

const connected = () => mongoose.connection && mongoose.connection.readyState === 1;

/** Read the document from Mongo into the cache. Safe to call repeatedly. */
const load = async () => {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const doc = await BusinessSetting.findOne({ key: KEY }).lean();
      state.values = (doc && isPlainObject(doc.values) && doc.values) || {};
      state.updatedAt = doc ? doc.updatedAt : null;
      state.updatedBy = doc ? doc.updatedBy : null;
      state.loadedAt = Date.now();
      return state.values;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
};

/** Synchronous: the cached override object (never null). Triggers a background refresh when stale. */
const getAll = () => {
  if (connected() && Date.now() - state.loadedAt > REFRESH_MS && !inflight) {
    load().catch((err) => console.error("[settingsStore] refresh failed:", err && err.message));
  }
  return state.values;
};

const get = (key, fallback) => {
  const v = getAll()[key];
  return v === undefined ? fallback : v;
};

/**
 * Persist a patch of dotted paths ({"planDurations.oneMonth": 20, "trialEnabled": true}).
 * A `null` value removes that override. Reloads the cache before returning.
 */
const save = async (flatPatch, updatedBy) => {
  const $set = { updatedBy: updatedBy || null };
  const $unset = {};
  for (const [path, value] of Object.entries(flatPatch || {})) {
    if (value === null) $unset[`values.${path}`] = "";
    else $set[`values.${path}`] = value;
  }
  const update = { $set, $setOnInsert: { key: KEY } };
  if (Object.keys($unset).length) update.$unset = $unset;
  await BusinessSetting.updateOne({ key: KEY }, update, { upsert: true });
  return load();
};

/** Test/ops helper: drop the cache so the next getAll() returns {} until load(). */
const reset = () => {
  state.values = {};
  state.loadedAt = 0;
  state.updatedAt = null;
  state.updatedBy = null;
};

const meta = () => ({ updatedAt: state.updatedAt, updatedBy: state.updatedBy, loadedAt: state.loadedAt });

module.exports = { load, getAll, get, save, reset, meta, deepMerge, REFRESH_MS };
