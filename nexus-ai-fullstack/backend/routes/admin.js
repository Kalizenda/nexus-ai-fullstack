const express = require('express');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Notification = require('../models/Notification');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate, requireAdmin);

router.get('/overview', async (req, res, next) => {
  try {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const [totalUsers, registrationsToday, successfulLogins, failedLogins, unreadNotifications, recentUsers, recentActivity] = await Promise.all([
      User.countDocuments(), User.countDocuments({ createdAt: { $gte: start } }),
      Activity.countDocuments({ type: 'user_login', outcome: 'success' }),
      Activity.countDocuments({ type: { $in: ['user_login', 'admin_login'] }, outcome: 'failed' }), Notification.countDocuments({ read: false }),
      User.find().select('name email status createdAt lastLoginAt').sort({ createdAt: -1 }).limit(5).lean(),
      Activity.find().sort({ createdAt: -1 }).limit(10).lean()
    ]);
    res.json({ stats: { totalUsers, registrationsToday, successfulLogins, failedLogins, unreadNotifications }, recentUsers, recentActivity });
  } catch (err) { next(err); }
});
router.get('/users', async (req, res, next) => {
  try {
    const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
    const limit = Math.max(1, Math.min(100, Number.parseInt(req.query.limit, 10) || 50));
    const search = String(req.query.search || '').trim().slice(0, 100);
    const filter = search ? { $or: [{ name: { $regex: escapeRegex(search), $options: 'i' } }, { email: { $regex: escapeRegex(search), $options: 'i' } }] } : {};
    const [users, total] = await Promise.all([User.find(filter).select('name email status createdAt lastLoginAt').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), User.countDocuments(filter)]);
    res.json({ users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});
router.patch('/users/:id/status', async (req, res, next) => {
  try {
    const status = req.body.status;
    if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'Status must be active or suspended.' });
    const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true }).select('name email status createdAt lastLoginAt');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: `User ${status}.`, user });
  } catch (err) { next(err); }
});
router.get('/activity', async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(200, Number.parseInt(req.query.limit, 10) || 100));
    const filter = {};
    if (req.query.type) filter.type = String(req.query.type).slice(0, 60);
    if (req.query.outcome && ['success', 'failed', 'info'].includes(req.query.outcome)) filter.outcome = req.query.outcome;
    const activity = await Activity.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ activity });
  } catch (err) { next(err); }
});
router.get('/notifications', async (req, res, next) => {
  try { const notifications = await Notification.find().sort({ createdAt: -1 }).limit(100).lean(); res.json({ notifications }); }
  catch (err) { next(err); }
});
router.patch('/notifications/:id/read', async (req, res, next) => {
  try { const notification = await Notification.findByIdAndUpdate(req.params.id, { read: true }, { new: true }); if (!notification) return res.status(404).json({ error: 'Notification not found.' }); res.json({ notification }); }
  catch (err) { next(err); }
});
router.get('/export/users', async (req, res, next) => {
  try { const users = await User.find().select('name email status createdAt lastLoginAt').sort({ createdAt: -1 }).lean(); res.setHeader('Content-Disposition', 'attachment; filename="nexus-users-export.json"'); res.json({ exportedAt: new Date().toISOString(), users }); }
  catch (err) { next(err); }
});
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
module.exports = router;
