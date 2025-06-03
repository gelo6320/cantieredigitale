const express = require('express');
const path = require('path');
const fs = require('fs');
const { isAuthenticated } = require('../middleware');

const router = express.Router();

// Pagina di login
router.get('/login', (req, res) => {
  // Se già autenticato, reindirizza al CRM
  if (req.session && req.session.isAuthenticated) {
    return res.redirect('/crm');
  }
  res.sendFile(path.join(__dirname, '../www', 'login.html'));
});

// Serve la dashboard
router.get('/dashboard', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

router.get('/dashboard/*', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Serve il CRM
router.get('/crm', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '../www', 'crm.html'));
});

// Route principale
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../www', 'index.html'));
});

// Gestione delle URL con estensione .html
router.get('*.html', (req, res) => {
  const urlWithoutExt = req.path.replace('.html', '');
  res.redirect(301, urlWithoutExt);
});

// Gestione delle route catch-all per il frontend
router.get('*', (req, res) => {
  // Ottieni il percorso richiesto
  let filePath = req.path;
  
  // Rimuovi la / iniziale e finale se presenti
  if (filePath.startsWith('/')) {
    filePath = filePath.substring(1);
  }
  if (filePath.endsWith('/')) {
    filePath = filePath.slice(0, -1);
  }
  
  // Se il percorso è vuoto, servi index.html
  if (filePath === '') {
    filePath = 'index.html';
  }
  
  // Percorso completo al file HTML (dando priorità)
  const htmlPath = path.join(__dirname, '../www', filePath + '.html');
  
  // Percorso completo al file senza estensione
  const fullPath = path.join(__dirname, '../www', filePath);
  
  // Prima controlla se esiste la versione .html
  if (fs.existsSync(htmlPath)) {
    return res.sendFile(htmlPath);
  }
  
  // Poi controlla se esiste il file richiesto
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    return res.sendFile(fullPath);
  }
  
  // Se è una directory, cerca index.html al suo interno
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    const indexPath = path.join(fullPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }
  
  // GESTIONE 404 SENZA FILE ESTERNO
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
                font-size: 8rem;
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
});

module.exports = router;