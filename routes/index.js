const express = require('express');

// Importa tutti i router
const authRouter = require('./auth');
const calendarRouter = require('./calendar');
const chatRouter = require('./chat');
const dashboardRouter = require('./dashboard');
const leadsRouter = require('./leads');
const marketingRouter = require('./marketing');
const projectsRouter = require('./projects');
const salesFunnelRouter = require('./salesFunnel');
const sitesRouter = require('./sites');
const trackingRouter = require('./tracking');
const usersRouter = require('./users');
const whatsappRouter = require('./whatsapp');
const bankDataRouter = require('./bankData');
const searchRouter = require('./search');
const frontendRouter = require('./frontend');
const analyticsRouter = require('./analytics');

const router = express.Router();

// Monta tutti i router API
router.use('/api', authRouter);
router.use('/api/calendar', calendarRouter);
router.use('/api/chat', chatRouter);
router.use('/api/dashboard', dashboardRouter);
router.use('/api/leads', leadsRouter);
router.use('/api/marketing', marketingRouter);
router.use('/api/projects', projectsRouter);
router.use('/api/sales-funnel', salesFunnelRouter);
router.use('/api/sites', sitesRouter);
router.use('/api/tracciamento', trackingRouter);
router.use('/api', usersRouter);
router.use('/api/whatsapp', whatsappRouter);
router.use('/api/banca-dati', bankDataRouter);
router.use('/api', searchRouter);
router.use('/api/analytics', analyticsRouter);

// API per la gestione dell'invio del form (mantenuto qui per compatibilità)
router.post('/api/submit-form', async (req, res) => {
  try {
    const { FormData } = require('../models');
    
    // Genera un ID evento univoco per la deduplicazione
    const eventId = 'event_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    
    // Aggiungi fbclid al formData se presente nella sessione
    const formDataWithFbclid = { ...req.body };
    if (req.session && req.session.fbclid) {
      formDataWithFbclid.fbclid = req.session.fbclid;
      formDataWithFbclid.fbclidTimestamp = req.session.fbclidTimestamp || Date.now();
    }
    
    // Salva i dati nel database
    const formData = new FormData(formDataWithFbclid);
    await formData.save();
    
    // Invia evento alla Facebook Conversion API
    try {
      const { sendFacebookConversionEvent } = require('../services');
      
      const userData = {
        email: req.body.email,
        phone: req.body.phone,
        name: req.body.name
      };
      
      const eventData = {
        sourceUrl: req.headers.referer || 'https://costruzionedigitale.com',
        customData: {
          form_type: req.body.source || 'contact_form',
          content_name: 'Richiesta di contatto'
        }
      };
      
      // Invia l'evento come Lead
      await sendFacebookConversionEvent('Lead', userData, eventData, req);
    } catch (conversionError) {
      console.error('Errore nell\'invio dell\'evento alla CAPI:', conversionError);
    }
    
    // Restituisci l'eventId per la deduplicazione lato client
    res.status(200).json({ success: true, eventId });
  } catch (error) {
    console.error('Errore nel salvataggio dei dati:', error);
    res.status(500).json({ success: false, error: 'Errore nel salvataggio dei dati' });
  }
});

// API per ottenere gli eventi
router.get('/api/events', async (req, res) => {
  try {
    const { getUserConnection } = require('../utils');
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    // Se non c'è connessione, restituisci un array vuoto
    if (connection === null) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          page,
          limit,
          pages: 0
        }
      });
    }
    
    // Usa il modello dalla connessione
    const UserFacebookEvent = connection.model('FacebookEvent');
    
    // Filtraggio
    let filter = {};
    if (req.query.leadId) filter.leadId = req.query.leadId;
    if (req.query.eventName) filter.eventName = req.query.eventName;
    if (req.query.success === 'true') filter.success = true;
    if (req.query.success === 'false') filter.success = false;
    
    // Conta totale documenti e ottieni i dati
    const total = await UserFacebookEvent.countDocuments(filter);
    const events = await UserFacebookEvent.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({
      success: true,
      data: events,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Errore nel recupero degli eventi:', error);
    res.status(500).json({ success: false, message: 'Errore nel recupero degli eventi', error: error.message });
  }
});

// Monta il router frontend per ultimo (catch-all)
router.use('/', frontendRouter);

module.exports = router;