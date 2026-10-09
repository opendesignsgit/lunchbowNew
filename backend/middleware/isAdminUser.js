const Admin = require("../models/Admin");

/**
 * Allows the request only when the authenticated token belongs to an admin/staff
 * account. Must run after isAuth. (Customer and admin tokens share JWT_SECRET, so a
 * valid token alone is not enough to reach admin-only customer routes.)
 */
const isAdminUser = async (req, res, next) => {
  try {
    const admin = req.user && req.user._id ? await Admin.findById(req.user._id).select("_id").lean() : null;
    if (admin) return next();
  } catch (err) {
    // fall through to 403
  }
  return res.status(403).send({ message: "Not allowed" });
};

/** Admin, or the customer whose id is in req.params[param]. */
isAdminUser.orSelf = (param) => (req, res, next) => {
  if (req.user && String(req.user._id) === String(req.params[param])) return next();
  return isAdminUser(req, res, next);
};

module.exports = isAdminUser;
