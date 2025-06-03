const express = require('express');
const bcrypt = require('bcrypt');
const { getUserConfig, Admin } = require('../utils');

const router = express.Router();

// API per il login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Verifica le credenziali
    const user = await Admin.findOne({ username });
    
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ success: false, message: 'Credenziali non valide' });
    }
    
    // Recupera le configurazioni dell'utente
    const userConfig = await getUserConfig(username);
    
    // Imposta la sessione
    req.session.isAuthenticated = true;
    req.session.user = {
      id: user._id,
      username: user.username,
      role: user.role || 'user' // Includi il ruolo nella sessione
    };
    
    // Memorizza le configurazioni nella sessione
    req.session.userConfig = userConfig;
    
    // Salva la sessione
    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Errore durante il login' });
      }
      
      res.status(200).json({ success: true, message: 'Login effettuato con successo' });
    });
  } catch (error) {
    console.error('Errore durante il login:', error);
    res.status(500).json({ success: false, message: 'Errore durante il login' });
  }
});

// API per il logout (POST)
router.post('/logout', (req, res) => {
  // Distrugge la sessione
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Errore durante il logout' });
    }
    
    // Pulisce il cookie di sessione
    res.clearCookie('connect.sid'); // Usa il nome del cookie di sessione corretto
    
    // Risponde con successo
    res.status(200).json({ success: true, message: 'Logout effettuato con successo' });
  });
});

// API per il logout (GET)
router.get('/logout', (req, res) => {
  // Distrugge la sessione
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Errore durante il logout' });
    }
    
    // Pulisce il cookie di sessione
    res.clearCookie('connect.sid'); // Usa il nome del cookie di sessione corretto
    
    // Risponde con successo
    res.status(200).json({ success: true, message: 'Logout effettuato con successo' });
  });
});

// API per verificare lo stato dell'autenticazione
router.get('/check-auth', (req, res) => {
  // Sempre rispondere con un JSON, mai reindirizzare
  res.json({ 
    authenticated: !!(req.session && req.session.isAuthenticated),
    user: req.session && req.session.user ? {
      username: req.session.user.username,
      role: req.session.user.role || 'user'
    } : null
  });
});

module.exports = router;