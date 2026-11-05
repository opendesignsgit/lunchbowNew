const SchoolRequest = require("../../models/SchoolRequest");
const Enquiry = require("../../models/Enquiry");
const SmsLog = require("../../models/SmsLog");
const { recordAudit } = require("../../lib/audit");
const { isValidId, parsePage, fail } = require("./helpers");

const SCHOOL_STATUSES = ["pending", "approved", "rejected"];
const ENQUIRY_STATUSES = ["new", "contacted", "closed"];

const listSchoolRequests = async (req, res) => {
  try {
    const { page, limit, skip } = parsePage(req.query, 20, 100);
    const filter = {};
    if (req.query.status) filter.status = String(req.query.status);
    const [rows, total] = await Promise.all([
      SchoolRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      SchoolRequest.countDocuments(filter),
    ]);
    return res.json({ success: true, data: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    return fail(res, 500, err.message);
  }
};

const updateSchoolRequest = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return fail(res, 400, "Invalid id");
    const { status, note } = req.body || {};
    if (status !== undefined && !SCHOOL_STATUSES.includes(status)) return fail(res, 400, `status must be one of ${SCHOOL_STATUSES.join(", ")}`);
    const doc = await SchoolRequest.findById(req.params.id);
    if (!doc) return fail(res, 404, "School request not found");
    const before = doc.toObject();
    if (status !== undefined) doc.status = status;
    if (note !== undefined) doc.set("note", String(note), { strict: false });
    await doc.save();
    await recordAudit(req, { action: "schoolRequest.update", targetType: "SchoolRequest", targetId: doc._id, before, after: doc.toObject(), reason: note || "" });
    return res.json({ success: true, data: doc.toObject() });
  } catch (err) {
    return fail(res, 500, err.message);
  }
};

const listEnquiries = async (req, res) => {
  try {
    const { page, limit, skip } = parsePage(req.query, 20, 100);
    const filter = {};
    if (req.query.kind) filter.kind = String(req.query.kind);
    if (req.query.status) filter.status = String(req.query.status);
    const [rows, total] = await Promise.all([
      Enquiry.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Enquiry.countDocuments(filter),
    ]);
    return res.json({ success: true, data: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    return fail(res, 500, err.message);
  }
};

const updateEnquiry = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return fail(res, 400, "Invalid id");
    const { status, note } = req.body || {};
    if (status !== undefined && !ENQUIRY_STATUSES.includes(status)) return fail(res, 400, `status must be one of ${ENQUIRY_STATUSES.join(", ")}`);
    const doc = await Enquiry.findById(req.params.id);
    if (!doc) return fail(res, 404, "Enquiry not found");
    const before = doc.toObject();
    if (status !== undefined) doc.status = status;
    if (note !== undefined) doc.note = String(note);
    await doc.save();
    await recordAudit(req, { action: "enquiry.update", targetType: "Enquiry", targetId: doc._id, before, after: doc.toObject(), reason: note || "" });
    return res.json({ success: true, data: doc.toObject() });
  } catch (err) {
    return fail(res, 500, err.message);
  }
};

const listSmsLogs = async (req, res) => {
  try {
    const { page, limit, skip } = parsePage(req.query, 20, 100);
    const filter = {};
    if (req.query.customerId) {
      if (!isValidId(req.query.customerId)) return fail(res, 400, "Invalid customerId");
      filter.customerId = req.query.customerId;
    }
    if (req.query.mobile) filter.mobile = String(req.query.mobile);
    if (req.query.messageType) filter.messageType = String(req.query.messageType);
    if (req.query.status) filter.status = String(req.query.status);
    const [rows, total] = await Promise.all([
      SmsLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("customerId", "name phone email").lean(),
      SmsLog.countDocuments(filter),
    ]);
    return res.json({ success: true, data: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    return fail(res, 500, err.message);
  }
};

module.exports = { listSchoolRequests, updateSchoolRequest, listEnquiries, updateEnquiry, listSmsLogs };
