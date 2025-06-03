const { mongoose } = require('../config');
const { CookieConsentSchema } = require('../models');

// Crea il modello CookieConsent
const CookieConsent = mongoose.model('CookieConsent', CookieConsentSchema);

// Funzione per generare un ID utente casuale per cookie
function generateUserId() {
  return 'user_' + Math.random().toString(36).substring(2, 15) + 
          Math.random().toString(36).substring(2, 15);
}

// Middleware per verificare il consenso ai cookie
const checkCookieConsent = async (req, res, next) => {
  // I cookie essenziali sono sempre consentiti
  if (req.path === '/api/cookie-consent' || req.path.startsWith('/admin')) {
    return next();
  }
  
  const userId = req.cookies.userId || generateUserId();
  
  // Se l'utente non ha un ID cookie, impostalo e consideralo come nuova sessione
  if (!req.cookies.userId) {
    res.cookie('userId', userId, { 
      httpOnly: true,
      sameSite: 'strict'
    });
    
    // Resetta le preferenze nel DB se esiste un consenso precedente
    await CookieConsent.findOneAndUpdate(
      { userId },
      { 
        essential: true,
        analytics: false,
        marketing: false,
        configured: false,
        updatedAt: new Date()
      },
      { upsert: true }
    );
    
    // Imposta le preferenze base per questa nuova sessione
    req.cookieConsent = {
      essential: true,
      analytics: false,
      marketing: false,
      configured: false
    };
    
    return next();
  }
  
  try {
    // Cerca il consenso cookie per questo utente
    let consent = await CookieConsent.findOne({ userId });
    
    // Se non esiste ancora un consenso, crea uno con solo cookie essenziali
    if (!consent) {
      consent = await CookieConsent.create({
        userId,
        essential: true,
        analytics: false,
        marketing: false,
        configured: false
      });
    }
    
    // Aggiungi le preferenze cookie all'oggetto req per l'uso nei controller
    req.cookieConsent = {
      essential: consent.essential,
      analytics: consent.analytics,
      marketing: consent.marketing,
      configured: consent.configured || false
    };
    
    next();
  } catch (error) {
    console.error('Errore durante la verifica del consenso cookie:', error);
    // In caso di errore, procedi comunque ma senza cookie non essenziali
    req.cookieConsent = {
      essential: true,
      analytics: false,
      marketing: false,
      configured: false
    };
    next();
  }
};

module.exports = {
  checkCookieConsent,
  generateUserId
};