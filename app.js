const express = require('express');
const path = require('path');
const compression = require('compression');

// Importa configurazioni
const { 
  corsMiddleware,
  sessionMiddleware,
  connectDatabase 
} = require('./config');

// Importa middleware
const { 
  checkCookieConsent, 
  checkApiAuth, 
  facebookTrackingMiddleware 
} = require('./middleware');

// Importa tutte le route
const routes = require('./routes');

// Inizializza Express
const app = express();

// Connetti al database principale
connectDatabase();

// Aggiungi compressione per migliorare le prestazioni
app.use(compression({
  level: 6,
  threshold: 0,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Middleware base
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(require('cookie-parser')());

// Configurazione CORS
app.use(corsMiddleware);

// Configurazione sessione
app.use(sessionMiddleware);

// Middleware per proteggere le route CRM
app.use((req, res, next) => {
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
});

// Middleware per catturare fbclid e inviare PageView alla CAPI
app.use(facebookTrackingMiddleware);

// Applica i middleware
app.use(checkCookieConsent);
app.use(checkApiAuth);

// Serve file statici per il frontend principale
app.use(express.static(path.join(__dirname, 'www'), {
  extensions: ['html'],
  index: false
}));

// Serve file statici per il frontend dashboard
app.use('/dashboard/assets', express.static(path.join(__dirname, 'public/assets')));
app.use('/api/dashboard', express.static(path.join(__dirname, 'public/api')));

// Monta tutte le route
app.use('/', routes);

// Middleware per gestione errori
app.use((err, req, res, next) => {
  console.error('Errore non gestito:', err);
  
  if (req.path.startsWith('/api/')) {
    res.status(500).json({
      success: false,
      message: 'Errore interno del server',
      ...(process.env.NODE_ENV === 'development' && { error: err.message })
    });
  } else {
    res.status(500).send(`
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
              <a href="/" class="home-button">Torna alla Home</a>
          </div>
      </body>
      </html>
    `);
  }
});

module.exports = app;