// middleware/auth.js - Middleware di autenticazione aggiornato e sicuro
const rateLimit = require('express-rate-limit');

// 🔐 Rate limiting per verifiche di autenticazione
const authCheckLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 30, // max 30 verifiche per minuto per IP
  message: {
    authenticated: false,
    message: 'Troppe verifiche di autenticazione. Riprova più tardi.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 🔐 Middleware per verificare autenticazione (per pagine HTML)
const isAuthenticated = (req, res, next) => {
  // Controlla se la sessione è valida e autenticata
  if (req.session && req.session.isAuthenticated && req.session.user) {
    // 🔐 Controlla scadenza sessione
    if (req.session.loginTime) {
      const sessionAge = Date.now() - req.session.loginTime;
      const maxAge = parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000; // 24 ore default
      
      if (sessionAge > maxAge) {
        console.log('Session expired for user:', req.session.user.username);
        req.session.destroy();
        return res.redirect('/login');
      }
    }
    
    // 🔐 Aggiorna timestamp ultima attività
    req.session.lastActivity = Date.now();
    return next();
  }
  
  // 🔐 Salva URL di destinazione per redirect post-login
  if (req.session) {
    req.session.returnTo = req.originalUrl;
  }
  
  console.log('Authentication required, redirecting to login');
  return res.redirect('/login');
};

// 🔐 Middleware per proteggere le route CRM
const protectCrmRoutes = (req, res, next) => {
  const protectedPaths = ['/', '/crm', '/events', '/calendar', '/sales-funnel', '/settings'];
  const currentPath = req.path;
  
  // Controlla se il path corrente è protetto
  const isProtectedPath = protectedPaths.some(path => 
    currentPath === path || currentPath.startsWith(`${path}/`)
  );
  
  if (isProtectedPath) {
    // 🔐 Verifica autenticazione per path protetti
    if (!(req.session && req.session.isAuthenticated && req.session.user)) {
      console.log('Protected route access denied:', currentPath);
      return res.redirect('/login');
    }
    
    // 🔐 Controlla scadenza sessione
    if (req.session.loginTime) {
      const sessionAge = Date.now() - req.session.loginTime;
      const maxAge = parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000;
      
      if (sessionAge > maxAge) {
        console.log('Session expired on protected route for user:', req.session.user.username);
        req.session.destroy();
        return res.redirect('/login');
      }
    }
  }
  
  // 🔐 Proteggi accesso diretto a file sensibili
  if (req.path.includes('/crm.html') || req.path.includes('/admin.html')) {
    if (!(req.session && req.session.isAuthenticated)) {
      return res.redirect('/login');
    }
  }
  
  next();
};

// 🔐 Middleware per API (restituisce JSON, non reindirizza)
const checkApiAuth = async (req, res, next) => {
  // 🔐 Paths di API che non richiedono autenticazione
  const publicApiPaths = [
    '/api/login',
    '/api/logout', 
    '/api/check-auth',
    '/api/health',
    '/api/config'
  ];
  
  // Se è un path pubblico, continua
  if (publicApiPaths.includes(req.path)) {
    return next();
  }
  
  // 🔐 Verifica autenticazione per API protette
  if (req.session && req.session.isAuthenticated && req.session.user) {
    // Controlla scadenza sessione
    if (req.session.loginTime) {
      const sessionAge = Date.now() - req.session.loginTime;
      const maxAge = parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000;
      
      if (sessionAge > maxAge) {
        console.log('API session expired for user:', req.session.user.username);
        req.session.destroy();
        return res.status(401).json({
          success: false,
          authenticated: false,
          message: 'Sessione scaduta',
          code: 'SESSION_EXPIRED'
        });
      }
    }
    
    // 🔐 Aggiorna ultima attività
    req.session.lastActivity = Date.now();
    return next();
  }
  
  // 🔐 Per API non autenticate, restituisci 401 con dati vuoti
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({
      success: false,
      authenticated: false,
      message: 'Sessione non autenticata',
      code: 'NOT_AUTHENTICATED',
      data: [],
      pagination: {
        total: 0,
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        pages: 0
      }
    });
  }
  
  // Se non è un'API, passa al prossimo middleware
  next();
};

// 🔐 Middleware per verificare ruoli specifici
const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.session || !req.session.isAuthenticated || !req.session.user) {
      return res.status(401).json({
        success: false,
        message: 'Autenticazione richiesta'
      });
    }
    
    const userRole = req.session.user.role || 'user';
    
    if (userRole !== requiredRole) {
      console.log(`Role check failed: required ${requiredRole}, user has ${userRole}`);
      return res.status(403).json({
        success: false,
        message: 'Permessi insufficienti',
        required: requiredRole,
        current: userRole
      });
    }
    
    next();
  };
};

// 🔐 Middleware per verificare se è admin
const requireAdmin = requireRole('admin');

// 🔐 Middleware per log delle attività utente
const logUserActivity = (req, res, next) => {
  if (req.session && req.session.user) {
    // Log solo per azioni significative
    const significantActions = ['POST', 'PUT', 'DELETE'];
    const isSignificant = significantActions.includes(req.method) || 
                         req.path.includes('/admin') ||
                         req.path.includes('/settings');
    
    if (isSignificant) {
      console.log('User Activity:', {
        user: req.session.user.username,
        action: `${req.method} ${req.path}`,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });
    }
  }
  
  next();
};

// 🔐 Middleware per controllare sessioni multiple (se necessario)
const checkConcurrentSessions = (req, res, next) => {
  // Implementazione opzionale per limitare sessioni concurrent
  // Può essere implementato con Redis o database per tracciare sessioni attive
  
  if (req.session && req.session.user && process.env.MAX_CONCURRENT_SESSIONS) {
    const maxSessions = parseInt(process.env.MAX_CONCURRENT_SESSIONS);
    
    // TODO: Implementare controllo sessioni concurrent
    // Per ora, passa semplicemente al prossimo middleware
  }
  
  next();
};

// 🔐 Middleware per cleanup sessioni scadute
const cleanupExpiredSessions = (req, res, next) => {
  // Esegui cleanup solo occasionalmente (1% delle richieste)
  if (Math.random() < 0.01) {
    // Cleanup asincrono, non blocking
    setImmediate(() => {
      try {
        // TODO: Implementare cleanup delle sessioni scadute nel database
        console.log('Session cleanup triggered');
      } catch (error) {
        console.error('Session cleanup error:', error);
      }
    });
  }
  
  next();
};

module.exports = {
  isAuthenticated,
  protectCrmRoutes,
  checkApiAuth,
  requireRole,
  requireAdmin,
  logUserActivity,
  checkConcurrentSessions,
  cleanupExpiredSessions,
  authCheckLimiter
};