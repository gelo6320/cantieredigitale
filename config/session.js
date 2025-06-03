const session = require('express-session');
const MongoStore = require('connect-mongo');

// Configurazione sessione (condivisa tra tutte le parti dell'app)
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'neosmile-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60
  }),
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    domain: '.costruzionedigitale.com', // Aggiungi il punto davanti per includere tutti i sottodomini
    path: '/'
  }
};

module.exports = {
  sessionConfig,
  sessionMiddleware: session(sessionConfig)
};