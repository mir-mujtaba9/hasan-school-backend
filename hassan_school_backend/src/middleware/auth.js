const jwt = require('jsonwebtoken');

const requireAuth = (req, res, next) => {
  const authHeader = String(req.headers.authorization || '').trim();
  // Accept common variants like: "Bearer <token>", "bearer   <token>".
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({
      error: "Missing or invalid Authorization header. Expected: 'Authorization: Bearer <token>'",
    });
  }

  const token = match[1].trim();
  if (!token) {
    return res.status(401).json({
      error: "Missing or invalid Authorization header. Expected: 'Authorization: Bearer <token>'",
    });
  }
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return res.status(500).json({ error: 'JWT secret is not configured' });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const requireRole = (roles) => (req, res, next) => {
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!req.user || !allowed.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
};

module.exports = {
  requireAuth,
  requireRole,
};
