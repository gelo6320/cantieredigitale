// routes/auth.js - Versione completa con sicurezza avanzata
const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const MongoStore = require('rate-limit-mongo');
const { getUserConfig, Admin } = require('../utils');

const router = express.Router();

// 🔐 Rate limiting specifico per login
const loginLimiter = rateLimit({
  store: new MongoStore({
    uri: process.env.MONGODB_URI,
    collectionName: 'loginAttempts',
    expireTimeMs: 15 * 60 * 1000, // 15 minuti
  }),
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 5, // massimo 5 tentativi per IP
  message: {
    success: false,
    message: 'Troppi tentativi di login. Riprova tra 15 minuti.',
    retryAfter: 15 * 60 // secondi
  },
  standardHeaders: true,
  legacyHeaders: false,
  // 🔐 Personalizza la key per includere anche username
  keyGenerator: (req) => {
    return `${req.ip}-${req.body.username || 'unknown'}`;
  }
});

// 🔐 Rate limiting per check-auth
const authCheckLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 30, // massimo 30 check auth per minuto
  message: {
    authenticated: false,
    message: 'Troppe verifiche di autenticazione. Riprova più tardi.'
  }
});

// 🔐 Helper functions
const handleError = (res, error, defaultMessage = 'Errore interno del server', statusCode = 500) => {
  console.error('Auth error:', {
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    timestamp: new Date().toISOString()
  });
  
  return res.status(statusCode).json({ 
    success: false, 
    message: defaultMessage 
  });
};

const validateLoginInput = (username, password) => {
  if (!username || !password) {
    return 'Username e password sono obbligatori';
  }
  if (typeof username !== 'string' || typeof password !== 'string') {
    return 'Formato dati non valido';
  }
  if (username.length < 3 || username.length > 50) {
    return 'Username deve essere tra 3 e 50 caratteri';
  }
  if (password.length < 6 || password.length > 128) {
    return 'Password deve essere tra 6 e 128 caratteri';
  }
  // 🔐 Controlla caratteri non ammessi nell'username
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return 'Username contiene caratteri non ammessi';
  }
  return null;
};

// 🔐 Sanitizza input per prevenire injection
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.trim().toLowerCase();
};

// 🔐 Audit logging
const auditLog = (event, details, req) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    details,
    sessionId: req.sessionID
  };
  
  console.log('AUDIT:', JSON.stringify(logEntry));
  
  // In produzione, salva nel database o servizio di logging
  if (process.env.NODE_ENV === 'production') {
    // TODO: Implementare salvataggio persistente dei log
  }
};

// 🔐 API per il login con sicurezza avanzata
router.post('/login', loginLimiter, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { username: rawUsername, password } = req.body;
    
    // 🔐 Sanitizza input
    const username = sanitizeInput(rawUsername);
    
    // 🔐 Validazione input
    const validationError = validateLoginInput(username, password);
    if (validationError) {
      auditLog('LOGIN_VALIDATION_FAILED', { username, error: validationError }, req);
      return res.status(400).json({ 
        success: false, 
        message: validationError 
      });
    }
    
    // 🔐 Verifica le credenziali
    const user = await Admin.findOne({ 
      username: username,
      active: { $ne: false } // Solo utenti attivi
    });
    
    if (!user) {
      auditLog('LOGIN_USER_NOT_FOUND', { username }, req);
      // 🔐 Ritarda la risposta per prevenire timing attacks
      await new Promise(resolve => setTimeout(resolve, 1000));
      return res.status(401).json({ 
        success: false, 
        message: 'Credenziali non valide' 
      });
    }

    // 🔐 Verifica password con timing costante
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      auditLog('LOGIN_INVALID_PASSWORD', { username }, req);
      // 🔐 Incrementa counter tentativi falliti (se implementato nel DB)
      await Admin.updateOne(
        { _id: user._id }, 
        { 
          $inc: { failedLoginAttempts: 1 },
          $set: { lastFailedLogin: new Date() }
        }
      );
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      return res.status(401).json({ 
        success: false, 
        message: 'Credenziali non valide' 
      });
    }
    
    // 🔐 Controlla se account è bloccato (se implementato)
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      auditLog('LOGIN_ACCOUNT_LOCKED', { username }, req);
      return res.status(423).json({
        success: false,
        message: 'Account temporaneamente bloccato'
      });
    }
    
    // 🔐 Login riuscito - reset contatori
    await Admin.updateOne(
      { _id: user._id }, 
      { 
        $unset: { failedLoginAttempts: 1, lockedUntil: 1 },
        $set: { lastLogin: new Date() }
      }
    );
    
    // Recupera le configurazioni dell'utente
    const userConfig = await getUserConfig(username);
    
    // 🔐 Dati utente sicuri (no password hash)
    const userData = {
      id: user._id.toString(),
      username: user.username,
      name: user.name || user.username,
      role: user.role || 'user',
      lastLogin: new Date().toISOString()
    };
    
    // 🔐 Rigenera session ID per prevenire session fixation
    req.session.regenerate((err) => {
      if (err) {
        auditLog('LOGIN_SESSION_ERROR', { username, error: err.message }, req);
        return handleError(res, err, 'Errore durante il login');
      }
      
      // Imposta la sessione
      req.session.isAuthenticated = true;
      req.session.user = userData;
      req.session.userConfig = userConfig;
      req.session.loginTime = Date.now();
      
      // Salva la sessione
      req.session.save((err) => {
        if (err) {
          auditLog('LOGIN_SESSION_SAVE_ERROR', { username, error: err.message }, req);
          return handleError(res, err, 'Errore durante il login');
        }
        
        const duration = Date.now() - startTime;
        auditLog('LOGIN_SUCCESS', { username, duration: `${duration}ms` }, req);
        
        res.status(200).json({ 
          success: true, 
          message: 'Login effettuato con successo',
          user: userData
        });
      });
    });
    
  } catch (error) {
    auditLog('LOGIN_SYSTEM_ERROR', { error: error.message }, req);
    handleError(res, error, 'Errore durante il login');
  }
});

// 🔐 API per il logout
router.post('/logout', async (req, res) => {
  try {
    const username = req.session?.user?.username;
    
    if (username) {
      auditLog('LOGOUT_REQUEST', { username }, req);
    }
    
    // 🔐 Distrugge la sessione in modo sicuro
    await new Promise((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // 🔐 Pulisce il cookie
    const cookieName = process.env.SESSION_COOKIE_NAME || 'connect.sid';
    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    
    if (username) {
      auditLog('LOGOUT_SUCCESS', { username }, req);
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Logout effettuato con successo' 
    });
    
  } catch (error) {
    auditLog('LOGOUT_ERROR', { error: error.message }, req);
    handleError(res, error, 'Errore durante il logout');
  }
});

// 🔐 API per verificare lo stato dell'autenticazione
router.get('/check-auth', authCheckLimiter, (req, res) => {
  try {
    const isAuthenticated = !!(req.session && req.session.isAuthenticated);
    
    // 🔐 Controlla scadenza sessione
    if (isAuthenticated && req.session.loginTime) {
      const sessionAge = Date.now() - req.session.loginTime;
      const maxAge = parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000; // 24 ore default
      
      if (sessionAge > maxAge) {
        req.session.destroy();
        return res.json({ 
          authenticated: false, 
          user: null,
          reason: 'Session expired'
        });
      }
    }
    
    const response = {
      authenticated: isAuthenticated,
      user: null,
      timestamp: new Date().toISOString()
    };
    
    if (isAuthenticated && req.session.user) {
      response.user = {
        id: req.session.user.id,
        username: req.session.user.username,
        name: req.session.user.name,
        role: req.session.user.role || 'user',
        lastLogin: req.session.user.lastLogin
      };
    }
    
    // 🔐 Sempre JSON, mai redirect
    res.json(response);
    
  } catch (error) {
    console.error('Check auth error:', error);
    res.json({ 
      authenticated: false, 
      user: null,
      error: 'Errore nella verifica dell\'autenticazione'
    });
  }
});

// 🔐 API per refresh del token di sessione
router.post('/refresh-session', (req, res) => {
  try {
    if (req.session && req.session.isAuthenticated) {
      // 🔐 Aggiorna timestamp di accesso
      req.session.touch();
      req.session.lastActivity = Date.now();
      
      res.json({ 
        success: true, 
        message: 'Sessione aggiornata',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(401).json({ 
        success: false, 
        message: 'Sessione non valida' 
      });
    }
  } catch (error) {
    handleError(res, error, 'Errore nell\'aggiornamento della sessione');
  }
});

// 🔐 API per ottenere informazioni sulla sessione (debug/admin)
router.get('/session-info', (req, res) => {
  if (!req.session?.isAuthenticated || req.session.user?.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Accesso negato' 
    });
  }
  
  try {
    const sessionInfo = {
      sessionId: req.sessionID,
      loginTime: req.session.loginTime,
      lastActivity: req.session.lastActivity,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      user: req.session.user
    };
    
    res.json({ 
      success: true, 
      data: sessionInfo 
    });
  } catch (error) {
    handleError(res, error, 'Errore nel recupero informazioni sessione');
  }
});

module.exports = router;