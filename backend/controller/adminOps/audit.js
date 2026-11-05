const AuditLog = require("../../models/AuditLog");
const { parsePage, fail } = require("./helpers");

const listAudit = async (req, res) => {
  try {
    const { page, limit, skip } = parsePage(req.query, 20, 100);
    const filter = {};
    if (req.query.targetType) filter.targetType = String(req.query.targetType);
    if (req.query.targetId) filter.targetId = String(req.query.targetId);
    if (req.query.action) filter.action = String(req.query.action);
    if (req.query.adminId) filter.adminId = req.query.adminId;
    const [rows, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("adminId", "name email").lean(),
      AuditLog.countDocuments(filter),
    ]);
    return res.json({ success: true, data: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    return fail(res, 500, err.message);
  }
};

module.exports = { listAudit };
