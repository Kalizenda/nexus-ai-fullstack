const jwt = require('jsonwebtoken');
const User = require('../models/User');
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
  try { req.auth = jwt.verify(token, process.env.JWT_SECRET); return next(); }
  catch { return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' }); }
}
function requireAdmin(req, res, next) {
  if (req.auth?.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' });
  return next();
}
async function requireActiveUser(req, res, next) {
  try {
    if (req.auth?.role !== 'user') return res.status(403).json({ error: 'User access required.' });
    const user = await User.findById(req.auth.sub).select('_id name email status');
    if (!user || user.status !== 'active') return res.status(403).json({ error: 'This account is unavailable.' });
    req.user = user; return next();
  } catch (err) { return next(err); }
}
module.exports = { authenticate, requireAdmin, requireActiveUser };
