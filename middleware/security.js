// middleware/security.js - Middleware di sicurezza completi
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const MongoStore = require('rate-limit-mongo');

// 🔐 Rate limiting globale per API
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: process.env.API_RATE_LIMIT_MAX || 100,
  message: {
    success: false,
    message: 'Troppe richieste. Riprova più tardi.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting per health check
    return req.path === '/health' || req.path === '/api/health';
  }
});

// 🔐 Rate limiting per operazioni sensibili
const sensitiveOperationsLimiter = rateLimit({
  store: new MongoStore({
    uri: process.env.MONGODB_URI,
    collectionName: 'sensitiveOperations',
    expireTimeMs: 60 * 60 * 1000, // 1 ora
  }),
  windowMs: 60 * 60 * 1000, // 1 ora
  max: 10, // massimo 10 operazioni sensibili per ora
  message: {
    success: false,
    message: 'Troppe operazioni sensibili. Riprova più tardi.'
  }
});

// 🔐 Headers di sicurezza con Helmet
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", process.env.NEXT_PUBLIC_API_URL || "https://api.costruzionedigitale.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    },
  },
  hsts: {
    maxAge: 31536000, // 1 anno
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  frameguard: { action: 'deny' }
});

// 🔐 Middleware per audit logging avanzato
const auditLogger = (req, res, next) => {
  const startTime = Date.now();
  const originalSend = res.send;
  
  // Intercetta la risposta per logging
  res.send = function(data) {
    const duration = Date.now() - startTime;
    
    // Log solo eventi significativi
    const shouldLog = 
      req.originalUrl.includes('/login') ||
      req.originalUrl.includes('/logout') ||
      req.originalUrl.includes('/admin') ||
      res.statusCode >= 400 ||
      duration > 5000; // Richieste lente
    
    if (shouldLog) {
      const logData = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        user: req.session?.user?.username || 'anonymous',
        sessionId: req.sessionID,
        referer: req.get('Referer'),
        contentLength: res.get('Content-Length')
      };
      
      console.log('AUDIT:', JSON.stringify(logData));
      
      // In produzione, invia a servizio di monitoring
      if (process.env.NODE_ENV === 'production' && process.env.MONITORING_WEBHOOK_URL) {
        // Invia log al servizio di monitoring (async, non blocking)
        setImmediate(() => {
          require('axios').post(process.env.MONITORING_WEBHOOK_URL, logData)
            .catch(err => console.error('Monitoring webhook failed:', err.message));
        });
      }
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

// 🔐 Middleware per validazione IP trusted
const trustedIpCheck = (req, res, next) => {
  const trustedIPs = process.env.TRUSTED_IPS?.split(',').map(ip => ip.trim()) || [];
  const clientIP = req.ip || req.connection.remoteAddress;
  
  // Se ci sono IP trusted configurati E l'IP non è trusted
  if (trustedIPs.length > 0 && !trustedIPs.includes(clientIP)) {
    console.warn(`Access from untrusted IP: ${clientIP}`, {
      url: req.originalUrl,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    
    // Per admin routes, blocca IP non trusted
    if (req.originalUrl.includes('/admin')) {
      return res.status(403).json({
        success: false,
        message: 'Accesso negato da questo IP'
      });
    }
  }
  
  next();
};

// 🔐 Middleware CORS sicuro
const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://crm.costruzionedigitale.com',
    'https://www.costruzionedigitale.com',
    'https://costruzionedigitale.com',
    process.env.CORS_ORIGIN
  ].filter(Boolean);
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 ore
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
};

// 🔐 Middleware per sanitizzazione input
const inputSanitizer = (req, res, next) => {
  const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    for (let key in obj) {
      if (typeof obj[key] === 'string') {
        // Rimuovi caratteri potenzialmente pericolosi
        obj[key] = obj[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      } else if (typeof obj[key] === 'object') {
        sanitizeObject(obj[key]);
      }
    }
    return obj;
  };
  
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  next();
};

// 🔐 Middleware per prevenzione session fixation
const sessionSecurity = (req, res, next) => {
  // Se è una nuova sessione e non è il login, rigenera ID
  if (req.session && req.session.isNew && req.originalUrl !== '/api/login') {
    req.session.regenerate((err) => {
      if (err) console.error('Session regeneration error:', err);
      next();
    });
  } else {
    next();
  }
};

// 🔐 Middleware per controllo integrità sessione
const sessionIntegrityCheck = (req, res, next) => {
  if (req.session && req.session.isAuthenticated) {
    // Controlla se i dati della sessione sono integri
    if (!req.session.user || !req.session.user.username) {
      console.warn('Session integrity check failed - missing user data');
      req.session.destroy();
      return res.status(401).json({
        success: false,
        message: 'Sessione corrotta'
      });
    }
    
    // Controlla timestamp di login
    if (!req.session.loginTime) {
      console.warn('Session integrity check failed - missing login time');
      req.session.destroy();
      return res.status(401).json({
        success: false,
        message: 'Sessione non valida'
      });
    }
  }
  
  next();
};

// 🔐 Middleware per blocco attacchi brute force
const bruteForceProtection = (req, res, next) => {
  const suspiciousPatterns = [
    /\.\.\//g, // Directory traversal
    /<script/gi, // XSS
    /union\s+select/gi, // SQL Injection
    /exec\s*\(/gi, // Command injection
    /eval\s*\(/gi // Eval injection
  ];
  
  const requestData = JSON.stringify({
    url: req.originalUrl,
    body: req.body,
    query: req.query
  });
  
  for (let pattern of suspiciousPatterns) {
    if (pattern.test(requestData)) {
      console.warn('Suspicious request detected:', {
        ip: req.ip,
        url: req.originalUrl,
        pattern: pattern.source,
        timestamp: new Date().toISOString()
      });
      
      return res.status(400).json({
        success: false,
        message: 'Richiesta non valida'
      });
    }
  }
  
  next();
};

// 🔐 Health check endpoint sicuro
const healthCheck = (req, res) => {
  const healthToken = req.headers['x-health-token'] || req.query.token;
  
  if (process.env.HEALTH_CHECK_TOKEN && healthToken !== process.env.HEALTH_CHECK_TOKEN) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0'
  });
};

module.exports = {
  apiLimiter,
  sensitiveOperationsLimiter,
  securityHeaders,
  auditLogger,
  trustedIpCheck,
  corsMiddleware,
  inputSanitizer,
  sessionSecurity,
  sessionIntegrityCheck,
  bruteForceProtection,
  healthCheck
};