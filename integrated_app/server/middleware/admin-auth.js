function requireAdmin(req, res, next) {
  const token = req.header('X-Admin-Token') || req.header('x-admin-token');
  const expected = process.env.ADMIN_REGISTRATION_TOKEN;
  if (!expected) {
    return res.status(500).json({
      success: false,
      error: 'ADMIN_REGISTRATION_TOKEN is not set on the server. Cannot register organizations.'
    });
  }
  if (!token || token !== expected) {
    return res.status(401).json({ success: false, error: 'Invalid admin token.' });
  }
  next();
}

module.exports = { requireAdmin };
