/**
 * /api/jobs — run a background job from an external scheduler (Vercel cron, cron-job.org…).
 * Guarded by the header  x-jobs-secret: <JOBS_SECRET>.  Mounted in api/index.js.
 */
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const scheduler = require("../jobs/scheduler");

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

const requireJobsSecret = (req, res, next) => {
  const secret = process.env.JOBS_SECRET;
  if (!secret) return res.status(503).json({ success: false, message: "JOBS_SECRET is not configured" });
  const given = req.headers["x-jobs-secret"];
  if (!given || !safeEqual(given, secret)) return res.status(401).json({ success: false, message: "Invalid jobs secret" });
  return next();
};

router.get("/", requireJobsSecret, (req, res) => res.json({ success: true, data: scheduler.listJobs() }));

router.post("/:name", requireJobsSecret, async (req, res) => {
  const result = await scheduler.runJob(req.params.name, { trigger: "http" });
  if (!result.ok && /Unknown job/.test(result.error || "")) return res.status(404).json({ success: false, ...result });
  return res.status(result.ok ? 200 : 500).json({ success: result.ok, ...result });
});

module.exports = router;
