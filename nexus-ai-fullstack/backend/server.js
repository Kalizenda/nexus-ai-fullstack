require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const { authenticate, requireActiveUser } = require('./middleware/auth');

const app = express();
const port = Number(process.env.PORT || 3000);
const robotTickets = new Map();
const robotSessions = new Map();
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('Startup blocked: set JWT_SECRET in .env to a random secret at least 32 characters long.'); process.exit(1);
}
if (!process.env.MONGODB_URI) { console.error('Startup blocked: set MONGODB_URI in .env.'); process.exit(1); }
app.disable('x-powered-by');
// Set TRUST_PROXY=1 only when running behind a trusted reverse proxy such as Nginx.
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: process.env.APP_ORIGIN ? process.env.APP_ORIGIN.split(',').map(s => s.trim()) : false, methods: ['GET','POST','PATCH'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many authentication attempts. Please wait and try again.' } });
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', adminRoutes);
app.post('/api/robot-frontend/session', authenticate, requireActiveUser, (req, res, next) => {
  const robotFile = path.join(__dirname, '..', 'robot', 'robot-frontend.html');
  fs.stat(robotFile, (err, stats) => {
    if (err) return next(err);
    if (!stats.isFile() || stats.size === 0) {
      return res.status(503).json({ error: 'Robot page is empty. Add your HTML and JavaScript to robot/robot-frontend.html, save the file, and reload the terminal.' });
    }
    const now = Date.now();
    for (const [ticket, expiresAt] of robotTickets) {
      if (expiresAt <= now) robotTickets.delete(ticket);
    }
    for (const [sessionId, expiresAt] of robotSessions) {
      if (expiresAt <= now) robotSessions.delete(sessionId);
    }
    const ticket = crypto.randomBytes(32).toString('hex');
    robotTickets.set(ticket, now + 60 * 1000);
    res.set('Cache-Control', 'no-store');
    return res.json({ ticket });
  });
});
app.post('/api/robot-frontend/logout', (req, res) => {
  const cookie = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('nexus_robot_session='));
  const sessionId = cookie ? cookie.slice('nexus_robot_session='.length) : '';
  if (sessionId) robotSessions.delete(sessionId);
  res.clearCookie('nexus_robot_session', { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/robot' });
  res.set('Cache-Control', 'no-store');
  return res.status(204).end();
});
function getRobotSession(req) {
  const cookie = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('nexus_robot_session='));
  const sessionId = cookie ? cookie.slice('nexus_robot_session='.length) : '';
  const expiresAt = sessionId ? robotSessions.get(sessionId) : undefined;
  if (expiresAt && expiresAt > Date.now()) return sessionId;
  if (sessionId) robotSessions.delete(sessionId);
  return null;
}
const robotDirectory = path.join(__dirname, '..', 'robot');
app.get('/robot/robot-frontend.html', (req, res, next) => {
  let sessionId = getRobotSession(req);
  const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : '';
  if (!sessionId && ticket) {
    const expiresAt = robotTickets.get(ticket);
    robotTickets.delete(ticket);
    if (expiresAt && expiresAt > Date.now()) {
      sessionId = crypto.randomBytes(32).toString('hex');
      robotSessions.set(sessionId, Date.now() + 30 * 60 * 1000);
      res.cookie('nexus_robot_session', sessionId, {
        httpOnly: true,
        sameSite: 'strict',
        secure: req.secure,
        maxAge: 30 * 60 * 1000,
        path: '/robot'
      });
    }
  }
  if (!sessionId) return res.status(401).type('text').send('Robot page access expired. Return to the terminal and reload it.');
  res.type('html');
  res.set('Cache-Control', 'no-store');
  fs.createReadStream(path.join(robotDirectory, 'robot-frontend.html')).on('error', next).pipe(res);
});
app.use('/robot', (req, res, next) => {
  if (!getRobotSession(req)) return res.status(401).type('text').send('Robot page access expired. Return to the terminal and reload it.');
  return next();
}, express.static(robotDirectory, {
  index: false,
  maxAge: 0,
  setHeaders: res => res.setHeader('Cache-Control', 'private, no-store')
}));
app.get('/api/health', (req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', time: new Date().toISOString() }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public.html')));
app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (process.env.NODE_ENV !== 'production') console.error(err);
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid resource ID.' });
  if (err.name === 'ValidationError') return res.status(400).json({ error: 'Submitted information is invalid.' });
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
});

mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
  .then(() => { app.listen(port, '0.0.0.0', () => console.log(`NEXUS AI backend listening on port ${port}`)); })
  .catch(err => { console.error('MongoDB connection failed:', err.message); process.exit(1); });
