// routes/users.js - Aggiornato per includere nome e logo
const express = require('express');
const { getUserConfig, Admin } = require('../utils');

const router = express.Router();

// API per ottenere le configurazioni utente (inclusi nome e logo)
router.get('/user/config', async (req, res) => {
  try {
    // Verifica autenticazione
    if (!req.session || !req.session.isAuthenticated) {
      return res.status(401).json({ 
        success: false, 
        message: 'Non autorizzato' 
      });
    }
    
    const username = req.session.user.username;
    
    // Busca el usuario en la base de datos
    const user = await Admin.findOne({ username });
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }
    
    // Prepara el objeto de respuesta con todos los valores incluyendo datos personali
    res.json({
      success: true,
      config: {
        username: user.username,
        name: user.name || user.username || 'Utente',
        company: user.company || '',
        companyLogo: user.companyLogo || '',
        mongodb_uri: user.config?.mongodb_uri || "",
        access_token: user.config?.access_token || "",
        meta_pixel_id: user.config?.meta_pixel_id || "",
        fb_account_id: user.config?.fb_account_id || "",
        marketing_api_token: user.config?.marketing_api_token || "",
        whatsapp_access_token: user.config?.whatsapp_access_token || "",
        whatsapp_phone_number_id: user.config?.whatsapp_phone_number_id || "",
        whatsapp_webhook_token: user.config?.whatsapp_webhook_token || "",
        whatsapp_verify_token: user.config?.whatsapp_verify_token || ""
      }
    });
  } catch (error) {
    console.error('Error al recuperar la configuración:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al recuperar la configuración' 
    });
  }
});

// Configurazione utente API (aggiornata per includere nome e logo)
router.post('/user/config', async (req, res) => {
  try {
    const { 
      name,
      company,
      companyLogo,
      mongodb_uri, 
      access_token, 
      meta_pixel_id, 
      fb_account_id,
      marketing_api_token,
      whatsapp_access_token,
      whatsapp_phone_number_id,
      whatsapp_webhook_token,
      whatsapp_verify_token
    } = req.body;
    
    const username = req.session.user.username;
    
    // Verifica che l'utente esista
    const user = await Admin.findOne({ username });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utente non trovato' });
    }
    
    // Inizializza l'oggetto config se non esiste
    if (!user.config) {
      user.config = {};
    }
    
    // Aggiorna i campi personali dell'utente
    if (name !== undefined) user.name = name;
    if (company !== undefined) user.company = company;
    if (companyLogo !== undefined) user.companyLogo = companyLogo;
    
    // Aggiorna solo i campi di configurazione forniti
    if (mongodb_uri !== undefined) user.config.mongodb_uri = mongodb_uri;
    if (access_token !== undefined) user.config.access_token = access_token;
    if (meta_pixel_id !== undefined) user.config.meta_pixel_id = meta_pixel_id;
    if (fb_account_id !== undefined) user.config.fb_account_id = fb_account_id;
    if (marketing_api_token !== undefined) user.config.marketing_api_token = marketing_api_token;
    if (whatsapp_access_token !== undefined) user.config.whatsapp_access_token = whatsapp_access_token;
    if (whatsapp_phone_number_id !== undefined) user.config.whatsapp_phone_number_id = whatsapp_phone_number_id;
    if (whatsapp_webhook_token !== undefined) user.config.whatsapp_webhook_token = whatsapp_webhook_token;
    if (whatsapp_verify_token !== undefined) user.config.whatsapp_verify_token = whatsapp_verify_token;
    
    // Salva le modifiche
    await user.save();
    
    // Aggiorna le configurazioni in sessione
    req.session.userConfig = await getUserConfig(username);
    
    // CORREZIONE: Includi TUTTI i campi nella risposta, inclusi quelli personali
    res.status(200).json({ 
      success: true, 
      message: 'Configurazioni aggiornate con successo',
      config: {
        // CAMPI PERSONALI - AGGIUNTI NELLA RISPOSTA
        name: user.name || '(non configurato)',
        company: user.company || '(non configurato)', 
        companyLogo: user.companyLogo ? '(configurato)' : '(non configurato)',
        
        // CAMPI TECNICI
        mongodb_uri: user.config.mongodb_uri ? '(configurato)' : '(non configurato)',
        access_token: user.config.access_token ? '(configurato)' : '(non configurato)',
        meta_pixel_id: user.config.meta_pixel_id || '(non configurato)',
        fb_account_id: user.config.fb_account_id ? '(configurato)' : '(non configurato)',
        marketing_api_token: user.config.marketing_api_token ? '(configurato)' : '(non configurato)',
        whatsapp_access_token: user.config.whatsapp_access_token ? '(configurato)' : '(non configurato)',
        whatsapp_phone_number_id: user.config.whatsapp_phone_number_id ? '(configurato)' : '(non configurato)',
        whatsapp_webhook_token: user.config.whatsapp_webhook_token ? '(configurato)' : '(non configurato)',
        whatsapp_verify_token: user.config.whatsapp_verify_token ? '(configurato)' : '(non configurato)'
      }
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento delle configurazioni:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'aggiornamento delle configurazioni' });
  }
});

// API per ottenere tutti gli utenti (solo admin)
router.get('/admin/users', async (req, res) => {
  try {
    // Verifica che l'utente sia admin
    if (!req.session?.user?.role || req.session.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Accesso negato - Solo amministratori' 
      });
    }

    const users = await Admin.find({}, 'username name company role createdAt').sort({ username: 1 });
    
    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Errore nel recupero degli utenti:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero degli utenti' 
    });
  }
});

// API per switch utente (solo admin)
router.post('/admin/switch-user', async (req, res) => {
  try {
    const { targetUsername } = req.body;
    
    // Verifica che l'utente corrente sia admin
    if (!req.session?.user?.role || req.session.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Accesso negato - Solo amministratori' 
      });
    }

    // Se non c'è originalAdmin, salva l'admin corrente
    if (!req.session.originalAdmin) {
      req.session.originalAdmin = {
        id: req.session.user.id,
        username: req.session.user.username,
        role: req.session.user.role
      };
    }

    // Trova l'utente target
    const targetUser = await Admin.findOne({ username: targetUsername });
    if (!targetUser) {
      return res.status(404).json({ 
        success: false, 
        message: 'Utente non trovato' 
      });
    }

    // Recupera le configurazioni del target user
    const targetUserConfig = await getUserConfig(targetUsername);

    // Aggiorna la sessione
    req.session.user = {
      id: targetUser._id,
      username: targetUser.username,
      role: targetUser.role || 'user'
    };
    req.session.userConfig = targetUserConfig;
    req.session.isImpersonating = true;

    res.json({
      success: true,
      message: `Ora stai operando come ${targetUsername}`,
      user: req.session.user,
      originalAdmin: req.session.originalAdmin
    });
  } catch (error) {
    console.error('Errore nel cambio utente:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel cambio utente' 
    });
  }
});

// API per tornare all'admin originale
router.post('/admin/restore-admin', async (req, res) => {
  try {
    if (!req.session?.originalAdmin) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nessun admin originale salvato' 
      });
    }

    // Recupera le configurazioni dell'admin originale
    const originalAdminConfig = await getUserConfig(req.session.originalAdmin.username);

    // Ripristina la sessione dell'admin originale
    req.session.user = req.session.originalAdmin;
    req.session.userConfig = originalAdminConfig;
    req.session.isImpersonating = false;
    delete req.session.originalAdmin;

    res.json({
      success: true,
      message: 'Ripristinato profilo amministratore',
      user: req.session.user
    });
  } catch (error) {
    console.error('Errore nel ripristino admin:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel ripristino admin' 
    });
  }
});

module.exports = router;