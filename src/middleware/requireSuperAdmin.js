// src/middleware/requireSuperAdmin.js
/**
 * Use after your normal `authenticate` middleware.
 * Allows only roles in the allow-list.
 */
module.exports = function requireSuperAdmin(req, res, next) {
  const role = req.user?.role || req.user?.roles?.[0];
  const allowed = ['super_admin','admin', 'SUPER_ADMIN', 'CEO', 'ceo', 'management'];
  if (!allowed.includes(role)) {
    return res.status(403).json({
      success: false,
      message: 'Only Super Admin (Management / CEO) can change numbering settings.',
    });
  }
  next();
};