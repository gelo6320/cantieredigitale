// app.js - Versione sicura compatibile con struttura esistente
const express = require('express');
const path = require('path');
const compression = require('compression');
const session = require('express-session');
const MongoStore = require('connect-mongo');

// 🔐 Import middleware di sicurezza
const {
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
} = require('./middleware/security');

// 🔐 Import middleware di autenticazione aggiornati
const {
  isAuthenticated,
  protectCrmRoutes,
  checkApiAuth,
  requireAdmin,
  logUserActivity,
  cleanupExpiredSessions
} = require('./middleware/auth');

// Import configurazioni esistenti (mantenute per compatibilità)
const { 
  connectDatabase 
} = require('./config');

// Import middleware esistenti
const { 
  checkCookieConsent, 
  facebookTrackingMiddleware 
} = require('./middleware');

// Import tutte le route esistenti
const routes = require('./routes');

// Inizializza Express
const app = express();

// 🔐 Trust proxy se dietro reverse proxy (Nginx, CloudFlare, etc.)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Connetti al database principale
connectDatabase();

// 🔐 Middleware di sicurezza globali (ordine critico!)
app.use(corsMiddleware); // CORS sicuro (sostituisce il tuo corsMiddleware)
app.use(securityHeaders); // Headers di sicurezza (Helmet)
app.use(auditLogger); // Logging delle richieste
app.use(trustedIpCheck); // Controllo IP trusted
app.use(bruteForceProtection); // Protezione brute force
app.use(inputSanitizer); // Sanitizzazione input
app.use(sessionSecurity); // Sicurezza sessioni
app.use(sessionIntegrityCheck); // Controllo integrità sessioni

// 🔐 Compressione con sicurezza
app.use(compression({
  level: 6,
  threshold: 1024, // Solo file > 1KB
  filter: (req, res) => {
    // Non comprimere se richiesto dal client
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Non comprimere file già compressi
    const contentType = res.getHeader('Content-Type');
    if (contentType && (
      contentType.includes('image/') ||
      contentType.includes('video/') ||
      contentType.includes('audio/') ||
      contentType.includes('application/zip') ||
      contentType.includes('application/gzip')
    )) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// 🔐 Parser JSON/URL con limiti di sicurezza
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    if (buf.length > 10 * 1024 * 1024) { // 10MB
      throw new Error('Payload troppo grande');
    }
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 1000 // Limita numero parametri
}));

app.use(require('cookie-parser')());

// 🔐 Configurazione sessioni sicure (sostituisce sessionMiddleware)
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'CHANGE-THIS-SECRET-IN-PRODUCTION',
  name: process.env.SESSION_COOKIE_NAME || 'crm_session',
  resave: false,
  saveUninitialized: false,
  rolling: true, // Rinnova cookie ad ogni richiesta
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in produzione
    httpOnly: true, // Previeni accesso da JavaScript
    maxAge: parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000, // 24 ore
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax' // CSRF protection
  },
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    dbName: process.env.DB_NAME || 'crm_sessions',
    collectionName: 'sessions',
    ttl: parseInt(process.env.SESSION_MAX_AGE) / 1000 || 24 * 60 * 60, // TTL in secondi
    autoRemove: 'native',
    touchAfter: 24 * 3600 // lazy session update
  })
};

app.use(session(sessionConfig));

// 🔐 Health check endpoints (prima del rate limiting)
app.get('/health', healthCheck);
app.get('/api/health', healthCheck);

// 🔐 Rate limiting per API
app.use('/api/', apiLimiter);

// 🔐 Rate limiting per operazioni sensibili
app.use('/api/admin/', sensitiveOperationsLimiter);
app.use('/api/users/', sensitiveOperationsLimiter);
app.use('/api/settings/', sensitiveOperationsLimiter);

// 🔐 Middleware per log attività utente
app.use(logUserActivity);

// 🔐 Cleanup sessioni scadute
app.use(cleanupExpiredSessions);

// 🔐 Middleware per protezione route CRM migliorato
app.use(protectCrmRoutes);

// Middleware Facebook tracking (mantenuto)
app.use(facebookTrackingMiddleware);

// Middleware cookie consent (mantenuto)
app.use(checkCookieConsent);

// 🔐 Middleware per protezione API (sostituisce checkApiAuth base)
app.use('/api', checkApiAuth);

// 🔐 Serve file statici con sicurezza
app.use(express.static(path.join(__dirname, 'www'), {
  extensions: ['html'],
  index: false,
  maxAge: '1d',
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    // 🔐 Previeni cache per file sensibili
    if (path.includes('admin') || path.includes('config') || path.includes('login')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    
    // 🔐 Headers di sicurezza per file statici
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // 🔐 CSP per HTML files
    if (path.endsWith('.html')) {
      res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://connect.facebook.net; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self' " + (process.env.NEXT_PUBLIC_API_URL || 'https://api.costruzionedigitale.com') + ";"
      );
    }
  }
}));

// Serve file statici per dashboard con protezione
app.use('/dashboard/assets', isAuthenticated, express.static(path.join(__dirname, 'public/assets'), {
  maxAge: '7d',
  etag: true
}));

app.use('/api/dashboard', isAuthenticated, express.static(path.join(__dirname, 'public/api')));

// 🔐 Route specifiche protette
app.get('/crm', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'crm.html'));
});

app.get('/', (req, res, next) => {
  // Se autenticato, serve il CRM, altrimenti la homepage normale
  if (req.session && req.session.isAuthenticated) {
    return res.sendFile(path.join(__dirname, 'public', 'crm.html'));
  }
  next(); // Continua con le route normali
});

// 🔐 Route admin protette
app.use('/admin', requireAdmin);

// 🔐 Route per configurazioni pubbliche (non sensibili)
app.get('/api/config', (req, res) => {
  res.json({
    version: process.env.npm_package_version || '2.0.0',
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    features: {
      rateLimit: true,
      auditLog: process.env.AUDIT_LOG_ENABLED === 'true',
      secureHeaders: true,
      bruteForceProtection: true
    },
    security: {
      sessionTimeout: parseInt(process.env.SESSION_MAX_AGE) / 1000 / 60, // in minuti
      rateLimitWindow: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS) / 1000 / 60 // in minuti
    }
  });
});

// Monta tutte le route esistenti
app.use('/', routes);

// 🔐 404 Handler sicuro
app.use('*', (req, res) => {
  // 🔐 Log 404s per possibili scan di vulnerabilità
  console.warn('404 - Page not found:', {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    referer: req.get('Referer'),
    timestamp: new Date().toISOString()
  });
  
  if (req.path.startsWith('/api/')) {
    res.status(404).json({
      success: false,
      message: 'Endpoint non trovato',
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(404).send(`
      <!DOCTYPE html>
      <html lang="it">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>404 - Pagina Non Trovata</title>
          <style>
              body {
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  margin: 0;
                  padding: 0;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  min-height: 100vh;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  text-align: center;
              }
              .container {
                  padding: 2rem;
                  max-width: 600px;
              }
              .error-code {
                  font-size: 6rem;
                  font-weight: bold;
                  margin: 0;
                  opacity: 0.8;
              }
              .error-message {
                  font-size: 1.5rem;
                  margin: 1rem 0 2rem 0;
              }
              .home-button {
                  display: inline-block;
                  padding: 12px 30px;
                  background: rgba(255,255,255,0.2);
                  color: white;
                  text-decoration: none;
                  border-radius: 50px;
                  font-weight: 500;
                  transition: all 0.3s ease;
                  border: 2px solid rgba(255,255,255,0.3);
              }
              .home-button:hover {
                  background: rgba(255,255,255,0.3);
                  transform: translateY(-2px);
              }
          </style>
      </head>
      <body>
          <div class="container">
              <h1 class="error-code">404</h1>
              <h2 class="error-message">Pagina Non Trovata</h2>
              <p>La pagina che stai cercando non esiste.</p>
              <a href="/" class="home-button">Torna alla Home</a>
          </div>
      </body>
      </html>
    `);
  }
});

// 🔐 Error handler globale migliorato
app.use((err, req, res, next) => {
  // 🔐 Log errori con dettagli di sicurezza
  console.error('Global error handler:', {
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    user: req.session?.user?.username || 'anonymous',
    timestamp: new Date().toISOString()
  });
  
  // 🔐 Non esporre informazioni sensibili in produzione
  const message = process.env.NODE_ENV === 'production' 
    ? 'Errore interno del server' 
    : err.message;
  
  if (req.path.startsWith('/api/')) {
    res.status(err.status || 500).json({
      success: false,
      message: message,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development' && { 
        stack: err.stack,
        details: err.details 
      })
    });
  } else {
    res.status(err.status || 500).send(`
      <!DOCTYPE html>
      <html lang="it">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>500 - Errore Interno</title>
          <style>
              body {
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  margin: 0;
                  padding: 0;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  min-height: 100vh;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  text-align: center;
              }
              .container {
                  padding: 2rem;
                  max-width: 600px;
              }
              .error-code {
                  font-size: 6rem;
                  font-weight: bold;
                  margin: 0;
                  opacity: 0.8;
              }
              .error-message {
                  font-size: 1.5rem;
                  margin: 1rem 0 2rem 0;
              }
              .home-button {
                  display: inline-block;
                  padding: 12px 30px;
                  background: rgba(255,255,255,0.2);
                  color: white;
                  text-decoration: none;
                  border-radius: 50px;
                  font-weight: 500;
                  transition: all 0.3s ease;
                  border: 2px solid rgba(255,255,255,0.3);
              }
              .home-button:hover {
                  background: rgba(255,255,255,0.3);
                  transform: translateY(-2px);
              }
          </style>
      </head>
      <body>
          <div class="container">
              <h1 class="error-code">500</h1>
              <h2 class="error-message">Errore Interno del Server</h2>
              <p>Si è verificato un errore. Riprova più tardi.</p>
              ${process.env.NODE_ENV === 'development' ? `<p style="font-size: 0.9em; opacity: 0.8;">Debug: ${err.message}</p>` : ''}
              <a href="/" class="home-button">Torna alla Home</a>
          </div>
      </body>
      </html>
    `);
  }
});

// 🔐 Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔐 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔐 SIGINT received, shutting down gracefully');
  process.exit(0);
});

// 🔐 Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('🔐 Uncaught Exception:', error);
  // In produzione, invia notifica di allerta
  if (process.env.NODE_ENV === 'production' && process.env.MONITORING_WEBHOOK_URL) {
    require('axios').post(process.env.MONITORING_WEBHOOK_URL, {
      type: 'uncaught_exception',
      error: error.message,
      timestamp: new Date().toISOString()
    }).catch(() => {}); // Ignore webhook errors
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔐 Unhandled Rejection at:', promise, 'reason:', reason);
  // In produzione, invia notifica di allerta
  if (process.env.NODE_ENV === 'production' && process.env.MONITORING_WEBHOOK_URL) {
    require('axios').post(process.env.MONITORING_WEBHOOK_URL, {
      type: 'unhandled_rejection',
      reason: reason,
      timestamp: new Date().toISOString()
    }).catch(() => {}); // Ignore webhook errors
  }
  process.exit(1);
});

module.exports = app;