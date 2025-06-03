// Middleware per verificare autenticazione
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.isAuthenticated) {
      return next();
    }
    
    if (req.session) {
      req.session.returnTo = req.originalUrl;
    }
    
    return res.redirect('/login');
  };
  
  // Middleware per proteggere le route CRM
  const protectCrmRoutes = (req, res, next) => {
    if (req.path === '/crm' || req.path.startsWith('/crm/')) {
      if (!(req.session && req.session.isAuthenticated)) {
        return res.redirect('/login');
      }
    }
    
    // Proteggi l'accesso diretto al file crm.html
    if (req.path.includes('/crm.html')) {
      return res.redirect('/login');
    }
    
    next();
  };
  
  // Middleware per API (restituisce JSON con stato autenticazione, non reindirizza)
  const checkApiAuth = async (req, res, next) => {
    // Se il percorso è un'API di autenticazione o cookie-consent, salta la verifica
    if (req.path === '/api/login' || req.path === '/api/logout' || 
        req.path === '/api/check-auth' || req.path === '/api/cookie-consent') {
      return next();
    }
    
    // Se autenticato, continua normalmente
    if (req.session && req.session.isAuthenticated) {
      return next();
    }
    
    // Per tutte le API, restituisci dati vuoti o stato 401 con messaggio JSON
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({
        success: false,
        authenticated: false,
        message: 'Sessione non autenticata',
        data: [],
        pagination: {
          total: 0,
          page: req.query.page || 1,
          limit: req.query.limit || 20,
          pages: 0
        }
      });
    }
    
    // Se non è un'API, passa al prossimo middleware
    next();
  };
  
  module.exports = {
    isAuthenticated,
    protectCrmRoutes,
    checkApiAuth
  };