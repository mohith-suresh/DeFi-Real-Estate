const jwt = require('jsonwebtoken');
const { secretKey } = require('../config/config');

const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Missing or malformed Authorization header' });
  }

  try {
    const payload = jwt.verify(token, secretKey);
    req.user = payload.user || payload;
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  return next();
};

// Reply with 403 unless the request's authenticated user matches `ownerId`
// (or is an admin). Returns true on pass, false on denied (response already sent).
const ensureSelfOrAdmin = (req, res, ownerId) => {
  const isOwner = req.user && String(req.user._id) === String(ownerId);
  const isAdmin = Boolean(req.user && req.user.isAdmin);
  if (isOwner || isAdmin) return true;
  res.status(403).json({ message: 'Forbidden' });
  return false;
};

module.exports = { requireAuth, requireAdmin, ensureSelfOrAdmin };
