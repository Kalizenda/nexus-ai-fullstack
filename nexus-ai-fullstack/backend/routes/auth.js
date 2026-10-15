const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logActivity, notifyAdmin } = require('../utils/audit');
const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function signToken(payload) { return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h', issuer: 'nexus-ai' }); }
function publicUser(user) { return { id: String(user._id), name: user.name, email: user.email, status: user.status, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt }; }

router.post('/register', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'Enter a name between 2 and 80 characters.' });
    if (!emailPattern.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 12 || password.length > 128) return res.status(400).json({ error: 'Password must be 12-128 characters long.' });
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) return res.status(400).json({ error: 'Use at least one uppercase letter, one lowercase letter, and one number.' });
    if (await User.exists({ email })) { await logActivity(req, { type: 'registration', email, outcome: 'failed', details: 'Email already registered' }); return res.status(409).json({ error: 'An account with this email already exists.' }); }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });
    await logActivity(req, { type: 'registration', email, userId: user._id, outcome: 'success', details: 'Account created' });
    await notifyAdmin({ type: 'new_registration', title: 'New user registration', message: `${name} registered for a NEXUS AI account.`, email });
    return res.status(201).json({ message: 'Account created. You can now sign in.', user: publicUser(user) });
  } catch (err) { if (err.code === 11000) return res.status(409).json({ error: 'An account with this email already exists.' }); return next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      await logActivity(req, { type: 'user_login', email: email.slice(0, 254), outcome: 'failed', details: 'Invalid credentials' });
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    if (user.status !== 'active') {
      await logActivity(req, { type: 'user_login', email, userId: user._id, outcome: 'failed', details: 'Account suspended' });
      return res.status(403).json({ error: 'This account has been suspended. Contact support.' });
    }
    user.lastLoginAt = new Date(); await user.save();
    await logActivity(req, { type: 'user_login', email, userId: user._id, outcome: 'success', details: 'User signed in' });
    await notifyAdmin({ type: 'user_login', title: 'User signed in', message: `${user.name} signed in to NEXUS AI.`, email });
    return res.json({ token: signToken({ sub: String(user._id), role: 'user' }), user: publicUser(user) });
  } catch (err) { return next(err); }
});

router.post('/admin/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const configuredEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const configuredPassword = String(process.env.ADMIN_PASSWORD || '');
    if (!configuredEmail || !configuredPassword) return res.status(503).json({ error: 'Admin credentials are not configured on the server.' });
    // Timing-safe password comparison to reduce timing leakage.
    const crypto = require('crypto');
    const supplied = Buffer.from(password);
    const expected = Buffer.from(configuredPassword);
    const samePassword = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
    if (email !== configuredEmail || !samePassword) {
      await logActivity(req, { type: 'admin_login', email: email.slice(0, 254), outcome: 'failed', details: 'Invalid admin credentials' });
      return res.status(401).json({ error: 'Administrator email or password is incorrect.' });
    }
    await logActivity(req, { type: 'admin_login', email, outcome: 'success', details: 'Administrator signed in' });
    return res.json({ token: signToken({ sub: 'env-admin', role: 'admin', email }), admin: { email, role: 'admin' } });
  } catch (err) { return next(err); }
});

router.get('/me', require('../middleware/auth').authenticate, async (req, res, next) => {
  try {
    if (req.auth.role === 'admin') return res.json({ user: { email: req.auth.email, role: 'admin' } });
    const user = await User.findById(req.auth.sub);
    if (!user || user.status !== 'active') return res.status(401).json({ error: 'Account unavailable.' });
    return res.json({ user: publicUser(user) });
  } catch (err) { return next(err); }
});

router.post('/forgot-password', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (email && email.length <= 254) await logActivity(req, { type: 'password_reset_request', email, outcome: 'info', details: 'Password reset requested; email workflow not enabled' });
  // Always return the same response to avoid revealing whether an account exists.
  return res.json({ message: 'If an account exists for that email, password reset instructions can be sent once email-based password recovery is configured.' });
});
module.exports = router;
