const express = require('express');
const { getUserConnection } = require('../utils');
const { SiteSchema } = require('../models');
const { getPageSpeedMetrics } = require('../services/pagespeed');
const { getScreenshot } = require('../services/screenshot');

const router = express.Router();

// API per ottenere tutti i siti dell'utente
router.get('/', async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Registra il modello Site se non esiste
    if (!connection.models['Site']) {
      connection.model('Site', SiteSchema);
    }
    
    const Site = connection.model('Site');
    const sites = await Site.find({ userId }).sort({ createdAt: -1 });
    
    res.json(sites);
  } catch (error) {
    console.error('Errore nel recupero dei siti:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero dei siti', 
      error: error.message 
    });
  }
});

// API per aggiungere un nuovo sito
router.post('/', async (req, res) => {
  try {
    const { url } = req.body;
    const userId = req.session.user.id;
    
    if (!url) {
      return res.status(400).json({ success: false, message: 'URL richiesto' });
    }
    
    // Verifica formato URL
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({ success: false, message: 'URL non valido' });
    }
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Registra il modello Site se non esiste
    if (!connection.models['Site']) {
      connection.model('Site', SiteSchema);
    }
    
    const Site = connection.model('Site');
    
    // Controlla se il sito esiste già
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const path = urlObj.pathname;
    const existingSite = await Site.findOne({ userId, domain, path });
    
    if (existingSite) {
      return res.status(409).json({ success: false, message: 'Sito già esistente' });
    }
    
    // Ottieni screenshot e metriche in parallelo
    const [screenshotUrl, metrics] = await Promise.all([
      getScreenshot(url),
      getPageSpeedMetrics(url)
    ]);
    
    // Crea il nuovo sito
    const site = new Site({
      url,
      domain,
      path,
      screenshotUrl,
      metrics,
      lastScan: new Date(),
      userId
    });
    
    await site.save();
    
    res.status(201).json(site);
  } catch (error) {
    console.error('Errore nell\'aggiunta del sito:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nell\'aggiunta del sito', 
      error: error.message 
    });
  }
});

// API per aggiornare le metriche di un sito
router.post('/:id/refresh', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Registra il modello Site se non esiste
    if (!connection.models['Site']) {
      connection.model('Site', SiteSchema);
    }
    
    const Site = connection.model('Site');
    
    // Trova il sito
    const site = await Site.findOne({ _id: id, userId });
    
    if (!site) {
      return res.status(404).json({ success: false, message: 'Sito non trovato' });
    }
    
    // Ottieni nuove metriche e screenshot in parallelo
    const [screenshotUrl, metrics] = await Promise.all([
      getScreenshot(site.url),
      getPageSpeedMetrics(site.url)
    ]);
    
    // Aggiorna il sito
    site.screenshotUrl = screenshotUrl || site.screenshotUrl;
    site.metrics = metrics;
    site.lastScan = new Date();
    site.updatedAt = new Date();
    
    await site.save();
    
    res.json(site);
  } catch (error) {
    console.error('Errore nell\'aggiornamento delle metriche:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nell\'aggiornamento delle metriche', 
      error: error.message 
    });
  }
});

// API per eliminare un sito
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Registra il modello Site se non esiste
    if (!connection.models['Site']) {
      connection.model('Site', SiteSchema);
    }
    
    const Site = connection.model('Site');
    
    // Trova ed elimina il sito
    const result = await Site.deleteOne({ _id: id, userId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Sito non trovato' });
    }
    
    res.json({ success: true, message: 'Sito eliminato con successo' });
  } catch (error) {
    console.error('Errore nell\'eliminazione del sito:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nell\'eliminazione del sito', 
      error: error.message 
    });
  }
});

module.exports = router;