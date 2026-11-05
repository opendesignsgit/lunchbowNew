/**
 * Customer data routes identify the customer by an id in the body/params/query
 * (userId, _id, user). Allow the request only when that id is the logged-in
 * customer's own id, or the caller is an admin. Must run after isAuth.
 */
const Admin = require("../models/Admin");

const ID_FIELDS = ["userId", "_id", "user", "id"];

const findRequestedId = (req) => {
  for (const source of [req.params, req.body, req.query]) {
    if (!source) continue;
    for (const f of ID_FIELDS) {
      if (source[f] != null && source[f] !== "") return String(source[f]);
    }
    // save-Menu-Calendar wraps everything in `data`
    if (source.data && typeof source.data === "object") {
      for (const f of ID_FIELDS) {
        if (source.data[f] != null && source.data[f] !== "") return String(source.data[f]);
      }
    }
  }
  return null;
};

const requireOwner = async (req, res, next) => {
  const callerId = req.user && req.user._id ? String(req.user._id) : null;
  if (!callerId) return res.status(401).send({ message: "Please log in again." });

  const requested = findRequestedId(req);
  if (!requested || requested === callerId) {
    req.isAdminCaller = false;
    return next();
  }
  try {
    const admin = await Admin.findById(callerId).select("_id").lean();
    if (admin) {
      req.isAdminCaller = true;
      return next();
    }
  } catch (err) {
    // fall through
  }
  return res.status(403).send({ message: "Not allowed" });
};

module.exports = requireOwner;
