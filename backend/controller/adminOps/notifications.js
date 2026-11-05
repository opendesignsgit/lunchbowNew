const AdminNotification = require("../../models/AdminNotification");
const AdminDevice = require("../../models/AdminDevice");
const { isValidId, parsePage, fail } = require("./helpers");

const listNotifications = async (req, res) => {
  try {
    const { page, limit, skip } = parsePage(req.query, 20, 100);
    const adminId = req.user._id;
    const filter = {};
    if (req.query.type) filter.type = String(req.query.type);
    if (req.query.severity) filter.severity = String(req.query.severity);
    if (req.query.userId && isValidId(req.query.userId)) filter.userId = req.query.userId;
    if (req.query.unread === "1" || req.query.unread === "true") filter.readBy = { $ne: adminId };

    const [rows, total] = await Promise.all([
      AdminNotification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AdminNotification.countDocuments(filter),
    ]);
    const data = rows.map((n) => ({
      ...n,
      read: (n.readBy || []).some((id) => String(id) === String(adminId)),
    }));
    return res.json({ success: true, data, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("adminOps.listNotifications:", err);
    return fail(res, 500, err.message);
  }
};

const unreadCount = async (req, res) => {
  try {
    const count = await AdminNotification.countDocuments({ readBy: { $ne: req.user._id } });
    return res.json({ success: true, count });
  } catch (err) {
    return fail(res, 500, err.message);
  }
};

const markRead = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return fail(res, 400, "Invalid notification id");
    const doc = await AdminNotification.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { readBy: req.user._id }, $set: { readAt: new Date() } },
      { new: true }
    ).lean();
    if (!doc) return fail(res, 404, "Notification not found");
    return res.json({ success: true, data: { ...doc, read: true } });
  } catch (err) {
    return fail(res, 500, err.message);
  }
};

const markAllRead = async (req, res) => {
  try {
    const filter = { readBy: { $ne: req.user._id } };
    if (req.body && req.body.type) filter.type = String(req.body.type);
    const result = await AdminNotification.updateMany(filter, {
      $addToSet: { readBy: req.user._id },
      $set: { readAt: new Date() },
    });
    return res.json({ success: true, updated: result.nModified != null ? result.nModified : result.modifiedCount || 0 });
  } catch (err) {
    return fail(res, 500, err.message);
  }
};

const registerDevice = async (req, res) => {
  try {
    const { token, platform } = req.body || {};
    if (!token || typeof token !== "string" || token.length < 10) return fail(res, 400, "token is required");
    const doc = await AdminDevice.findOneAndUpdate(
      { token },
      { $set: { adminId: req.user._id, platform: platform ? String(platform) : "unknown", lastSeenAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    return res.json({ success: true, data: doc });
  } catch (err) {
    return fail(res, 500, err.message);
  }
};

const removeDevice = async (req, res) => {
  try {
    const result = await AdminDevice.deleteOne({ token: req.params.token });
    return res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (err) {
    return fail(res, 500, err.message);
  }
};

module.exports = { listNotifications, unreadCount, markRead, markAllRead, registerDevice, removeDevice };
