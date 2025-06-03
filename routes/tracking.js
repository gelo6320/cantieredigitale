const express = require('express');
const { getUserConnection, getEventCategory } = require('../utils');
const mongoose = require('mongoose');

const router = express.Router();

// Aggiungi questo nuovo endpoint a server.js
router.get('/landing-pages-stats', async (req, res) => {
  try {
    const { timeRange = '7d', search } = req.query;
    
    console.log(`\n===== INIZIO RECUPERO LANDING PAGES DA STATISTICS =====`);
    console.log(`Intervallo temporale: ${timeRange}`);
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Determina quale modello di statistiche utilizzare in base al timeRange
    let StatModel;
    let query = {};
    
    switch(timeRange) {
      case '24h':
        StatModel = connection.model('DailyStatistics');
        
        // Imposta la query per l'ultimo giorno
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        query = { date: { $gte: yesterday } };
        break;
        
      case '7d':
        StatModel = connection.model('WeeklyStatistics');
        
        // CORREZIONE: Ottieni tutte le settimane disponibili invece di cercare una sola
        // Questo evita i problemi di calcolo delle settimane
        query = {};
        console.log("Cerco tutte le statistiche settimanali disponibili");
        break;
        
      case '30d':
        StatModel = connection.model('MonthlyStatistics');
        
        // Calcola la chiave del mese corrente
        const monthDate = new Date();
        const monthKey = `${monthDate.getFullYear()}-${(monthDate.getMonth() + 1).toString().padStart(2, '0')}`;
        
        query = { monthKey };
        break;
        
      case 'all':
        StatModel = connection.model('TotalStatistics');
        // Cerchiamo tutti i record, poi filtreremo per 'total'
        query = {};
        console.log("Cerco tutte le statistiche totali disponibili");
        break;
        
      default:
        // Default per opzioni non previste
        StatModel = connection.model('DailyStatistics');
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() - 7);
        query = { date: { $gte: defaultDate } };
    }
    
    console.log(`Modello statistico utilizzato: ${StatModel.modelName}`);
    console.log(`Query: ${JSON.stringify(query)}`);
    
    // Trova le statistiche nel periodo selezionato
    const statistics = await StatModel.find(query).sort({ 
      // Ordinamento appropriato in base al tipo di statistica
      ...(StatModel.modelName === 'DailyStatistics' ? { date: -1 } : {}),
      ...(StatModel.modelName === 'WeeklyStatistics' ? { weekKey: -1 } : {}),
      ...(StatModel.modelName === 'MonthlyStatistics' ? { monthKey: -1 } : {}),
      ...(StatModel.modelName === 'TotalStatistics' ? { lastUpdated: -1 } : {})
    });
    
    if (!statistics || statistics.length === 0) {
      console.log('Nessuna statistica trovata per il periodo selezionato');
      return res.status(200).json([]);
    }
    
    console.log(`Trovate ${statistics.length} statistiche`);
    
    // Selezione delle statistiche rilevanti
    let relevantStats = statistics;
    
    // Per le statistiche settimanali, prendi solo la settimana più recente
    if (timeRange === '7d' && statistics.length > 0) {
      // La statistica più recente è già la prima grazie all'ordinamento
      relevantStats = [statistics[0]];
      console.log(`Settimana selezionata: ${relevantStats[0].weekKey || 'N/A'}`);
    }
    
    // Per le statistiche totali, cerca il record con key='total'
    if (timeRange === 'all' && statistics.length > 0) {
      const totalStat = statistics.find(stat => stat.key === 'total');
      if (totalStat) {
        relevantStats = [totalStat];
        console.log('Trovato record con key=total');
      } else {
        console.log('Nessun record con key=total trovato, usando il primo record');
        relevantStats = [statistics[0]];
      }
    }
    
    // Raccogli i dati delle URL da visitsByUrl e uniqueVisitorsByUrl
    const landingPages = [];
    let lastUpdated = new Date();
    
    for (const stat of relevantStats) {
      // Verifica che visitsByUrl esista e sia un oggetto
      if (stat.visitsByUrl && Array.isArray(stat.visitsByUrl)) {
        console.log(`Elaborazione statistiche con ${stat.visitsByUrl.length} URL`);
        for (const visitData of stat.visitsByUrl) {
          const url = visitData.url;
          const visits = visitData.count || 0;
          
          // Ottieni i visitatori unici dalla nuova struttura array
          const uniqueVisitorsData = stat.uniqueVisitorsByUrl && Array.isArray(stat.uniqueVisitorsByUrl) 
            ? stat.uniqueVisitorsByUrl.find(item => item.url === url)
            : null;
          const uniqueVisitors = uniqueVisitorsData ? uniqueVisitorsData.count : 0;
          
          // Ottieni le conversioni dalla nuova struttura array
          const conversionsData = stat.conversions && stat.conversions.byUrl && Array.isArray(stat.conversions.byUrl)
            ? stat.conversions.byUrl.find(item => item.url === url)
            : null;
          const conversions = conversionsData ? conversionsData.count : 0;
          
          // Calcola il tasso di conversione
          const conversionRate = uniqueVisitors > 0 ? (conversions / uniqueVisitors) * 100 : 0;
          
          landingPages.push({
            url,
            title: url, // Potremmo migliorare questo in futuro recuperando i titoli effettivi
            totalVisits: Number(visits),
            uniqueUsers: Number(uniqueVisitors),
            conversionRate: Number(conversionRate.toFixed(2)), // Arrotonda a 2 decimali
            lastAccess: stat.lastUpdated || stat.date || new Date()
          });
        }
      } else {
        console.log('Attenzione: visitsByUrl non trovato o non valido');
      }
    }
    
    // Filtra i risultati se è presente una query di ricerca
    let filteredLandingPages = landingPages;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredLandingPages = landingPages.filter(page => 
        page.url.toLowerCase().includes(searchLower) ||
        page.title.toLowerCase().includes(searchLower)
      );
    }
    
    // Ordina per numero di visite (decrescente)
    filteredLandingPages = filteredLandingPages.sort((a, b) => b.totalVisits - a.totalVisits);
    
    console.log(`Landing pages filtrate: ${filteredLandingPages.length}`);
    console.log(`===== FINE RECUPERO LANDING PAGES =====\n`);
    
    res.status(200).json(filteredLandingPages);
  } catch (error) {
    console.error('Errore nel recupero delle landing page da statistics:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Errore nel recupero delle landing page',
      details: error.message
    });
  }
});

// 2. Endpoint per ottenere gli utenti di una landing page con deduplicazione eventId
router.get('/users/:landingPageId', async (req, res) => {
  try {
    const { landingPageId } = req.params;
    const { timeRange = '7d', search } = req.query;
    
    console.log(`\n===== INIZIO RECUPERO UTENTI =====`);
    console.log(`ID landing page: ${landingPageId}`);
    console.log(`Intervallo temporale: ${timeRange}`);
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Decodifica l'ID (che è l'URL codificato in base64 della landing page)
    let pageUrl;
    try {
      pageUrl = Buffer.from(landingPageId, 'base64').toString('utf-8');
      console.log(`URL decodificato: ${pageUrl}`);
    } catch (e) {
      // Se non si riesce a decodificare, assumiamo che sia l'URL codificato in URI
      try {
        pageUrl = decodeURIComponent(landingPageId);
        console.log(`URL decodificato da URI: ${pageUrl}`);
      } catch (e2) {
        console.error('Errore nella decodifica dell\'ID landing page:', e2);
        pageUrl = landingPageId; // Usa il valore così com'è
        console.log(`Usando URL non decodificato: ${pageUrl}`);
      }
    }
    
    // Assicurati che i modelli necessari esistano nella connessione
    if (!connection.models['Visit']) {
      const { VisitSchema } = require('../models');
      connection.model('Visit', VisitSchema);
    }
    if (!connection.models['Session']) {
      const SessionSchema = new mongoose.Schema({
        sessionId: { type: String, required: true, unique: true },
        userId: { type: String, sparse: true, index: true },
        fingerprint: String,
        startTime: { type: Date, default: Date.now },
        endTime: Date,
        duration: Number,
        isActive: { type: Boolean, default: true },
        lastActivity: { type: Date, default: Date.now },
        entryPage: String,
        exitPage: String,
        referrer: String,
        deviceInfo: Object,
        browserInfo: Object,
        ip: String,
        userAgent: String,
        isNewUser: Boolean,
        cookieConsent: { type: Boolean, default: false },
        location: Object,
        consentCategories: Object,
        utmParams: Object,
        pageViews: { type: Number, default: 0 },
        events: { type: Number, default: 0 },
        conversions: { type: Number, default: 0 },
        totalValue: { type: Number, default: 0 },
        funnelProgress: Object,
        abTestVariants: Object
      });
      
      connection.model('Session', SessionSchema);
    }
    if (!connection.models['User']) {
      const UserSchema = new mongoose.Schema({
        userId: { type: String, required: true, unique: true },
        fingerprint: { type: String, sparse: true, index: true },
        email: { type: String, sparse: true, index: true, unique: true },
        firstName: String,
        lastName: String,
        phone: String,
        leadStage: String,
        firstSeen: { type: Date, default: Date.now },
        lastSeen: { type: Date, default: Date.now },
        visits: { type: Number, default: 1 },
        sessions: [String],
        deviceIds: [String],
        traits: Object,
        adOptimizationConsent: { 
          type: String, 
          enum: ['GRANTED', 'DENIED', 'UNSPECIFIED'], 
          default: 'UNSPECIFIED' 
        },
        totalTimeOnSite: { type: Number, default: 0 },
        totalPageViews: { type: Number, default: 0 },
        conversions: Array,
        location: Object,
        totalValue: { type: Number, default: 0 },
        leadSource: Object,
        tags: [String]
      });
      
      connection.model('User', UserSchema);
    }
    if (!connection.models['Event']) {
      // Schema Evento
      const EventSchema = new mongoose.Schema({
        eventId: { type: String, required: true, unique: true },
        sessionId: { type: String, required: true, index: true },
        userId: { type: String, sparse: true, index: true },
        eventName: { type: String, required: true },
        eventData: Object,
        timestamp: { type: Date, default: Date.now },
        url: String,
        rawUrl: String,
        path: String,
        ip: String,
        userAgent: String,
        location: {
          city: String,
          region: String,
          country: String,
          country_code: String
        },
        category: { 
          type: String, 
          enum: ['page', 'form_interaction', 'click', 'video', 'scroll', 'page_visibility', 
                 'time_on_page', 'session_end', 'conversion', 'pageview', 'system', 
                 'user', 'interaction', 'media', 'error', 'navigation'],
          default: 'interaction'
        },
        originalEventType: String
      });
      
      connection.model('Event', EventSchema);
    }
    
    const Visit = connection.model('Visit');
    const Session = connection.model('Session');
    const User = connection.model('User');
    const Event = connection.model('Event');
    
    // Calcola data di inizio in base al timeRange
    let startDate = new Date();
    switch(timeRange) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case 'all':
        startDate = new Date(0); // Dal 1970
        break;
    }
    
    console.log(`Data inizio ricerca: ${startDate.toISOString()}`);
    
    // FASE 1: Trova tutte le visite per questa URL nel periodo selezionato
    // Deduplicazione per eventId se disponibile nell'Event collection
    const pageviewEvents = await Event.find({
      url: pageUrl,
      timestamp: { $gte: startDate },
      eventName: 'pageview',
      eventId: { $exists: true, $ne: '' }
    }).distinct('sessionId'); // Ottieni solo i sessionId unici
    
    console.log(`Eventi pageview unici trovati per l'URL: ${pageviewEvents.length}`);
    
    // Fallback per visite senza eventId
    let visits = [];
    if (pageviewEvents.length === 0) {
      visits = await Visit.find({
        url: pageUrl,
        timestamp: { $gte: startDate }
      });
      console.log(`Visite di fallback trovate per l'URL: ${visits.length}`);
    }
    
    if (pageviewEvents.length === 0 && visits.length === 0) {
      console.log('Nessuna visita trovata per questa URL');
      return res.status(200).json([]);
    }
    
    // FASE 2: Estrai tutte le sessionId uniche
    let sessionIds = pageviewEvents.length > 0 ? pageviewEvents : 
                     [...new Set(visits.map(visit => visit.sessionId))];
    
    console.log(`Session ID unici trovati: ${sessionIds.length}`);
    
    // FASE 3: Trova tutte le sessioni corrispondenti
    const sessions = await Session.find({
      sessionId: { $in: sessionIds }
    });
    
    console.log(`Sessioni trovate nel DB: ${sessions.length}`);
    
    // FASE 4: Estrai informazioni utente uniche e consolida
    // Useremo una mappa per raggruppare per utente
    const userMap = new Map();
    
    // Primo passaggio: usa userId se disponibile o fingerprint come fallback
    for (const session of sessions) {
      // Determina l'identificatore primario
      const identifier = session.userId || session.fingerprint;
      
      if (!identifier) {
        console.log(`Sessione senza userId o fingerprint: ${session.sessionId}`);
        continue;
      }
      
      if (!userMap.has(identifier)) {
        // Inizializza un nuovo record utente
        userMap.set(identifier, {
          id: identifier,
          fingerprint: session.fingerprint || 'Sconosciuto',
          ip: session.ip || 'Sconosciuto',
          userAgent: session.userAgent || 'Sconosciuto',
          location: session.location?.city || 'Sconosciuta',
          referrer: session.referrer || '',
          firstVisit: session.startTime,
          lastActivity: session.lastActivity || session.startTime,
          sessionsCount: 0,
          isActive: false
        });
      }
      
      const user = userMap.get(identifier);
      
      // Aggiorna le informazioni utente con dati più recenti
      user.sessionsCount++;
      
      // Aggiorna il timestamp di prima visita se precedente
      if (session.startTime < user.firstVisit) {
        user.firstVisit = session.startTime;
      }
      
      // Aggiorna il timestamp dell'ultima attività se successivo
      if (session.lastActivity && session.lastActivity > user.lastActivity) {
        user.lastActivity = session.lastActivity;
      }
      
      // Imposta come attivo se l'ultima attività è negli ultimi 5 minuti
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (session.lastActivity && session.lastActivity >= fiveMinutesAgo) {
        user.isActive = true;
      }
    }
    
    console.log(`Utenti unici trovati: ${userMap.size}`);
    
    // FASE 5: Ottieni dati aggiuntivi dagli utenti nel modello User (se disponibili)
    const userIds = Array.from(userMap.keys());
    const fingerprints = Array.from(userMap.values())
      .map(user => user.fingerprint)
      .filter(fp => fp && fp !== 'Sconosciuto');
    
    // Costruisci una query OR per trovare utenti sia per userId che per fingerprint
    let userQuery = { $or: [] };
    
    if (userIds.length > 0) {
      userQuery.$or.push({ userId: { $in: userIds } });
    }
    
    if (fingerprints.length > 0) {
      userQuery.$or.push({ fingerprint: { $in: fingerprints } });
      userQuery.$or.push({ deviceIds: { $in: fingerprints } });
    }
    
    // Se non abbiamo nessun criterio di ricerca, usiamo una query vuota
    let userRecords = [];
    if (userQuery.$or.length > 0) {
      userRecords = await User.find(userQuery);
      console.log(`Record utenti trovati nel modello User: ${userRecords.length}`);
    }
    
    // Arricchisci i dati utente con informazioni dal modello User
    for (const userRecord of userRecords) {
      // Cerca prima per userId
      if (userRecord.userId && userMap.has(userRecord.userId)) {
        const user = userMap.get(userRecord.userId);
        
        // Aggiorna con dati dal modello User
        user.location = userRecord.location?.city || user.location;
        
        // Se ci sono più dati disponibili dal modello User, aggiungerli qui
      }
      
      // Cerca anche per fingerprint (per catch-all)
      else if (userRecord.fingerprint && userMap.has(userRecord.fingerprint)) {
        const user = userMap.get(userRecord.fingerprint);
        
        // Aggiorna con dati dal modello User
        user.location = userRecord.location?.city || user.location;
        
        // Se ci sono più dati disponibili dal modello User, aggiungerli qui
      }
    }
    
    // FASE 6: Prepara la risposta
    let users = Array.from(userMap.values());
    
    // Filtra i risultati se è presente una query di ricerca
    if (search) {
      const searchLower = search.toLowerCase();
      users = users.filter(user => 
        (user.fingerprint && user.fingerprint.toLowerCase().includes(searchLower)) ||
        (user.ip && user.ip.toLowerCase().includes(searchLower)) ||
        (user.location && String(user.location).toLowerCase().includes(searchLower)) ||
        (user.referrer && user.referrer.toLowerCase().includes(searchLower))
      );
    }
    
    // Ordina per ultima attività (decrescente)
    users = users.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    
    console.log(`Utenti filtrati: ${users.length}`);
    console.log(`===== FINE RECUPERO UTENTI =====\n`);
    
    res.status(200).json(users);
  } catch (error) {
    console.error('Errore nel recupero degli utenti:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Errore nel recupero degli utenti',
      details: error.message
    });
  }
});

// 3. Endpoint per ottenere le sessioni di un utente con deduplicazione eventId
router.get('/sessions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { timeRange = '7d' } = req.query;
    
    console.log(`\n===== INIZIO RICERCA SESSIONI =====`);
    console.log(`ID utente ricevuto: ${userId}`);
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Assicurati che i modelli necessari esistano nella connessione
    if (!connection.models['Session']) {
      const SessionSchema = new mongoose.Schema({
        sessionId: { type: String, required: true, unique: true },
        userId: { type: String, sparse: true, index: true },
        fingerprint: String,
        startTime: { type: Date, default: Date.now },
        endTime: Date,
        duration: Number,
        isActive: { type: Boolean, default: true },
        lastActivity: { type: Date, default: Date.now },
        entryPage: String,
        exitPage: String,
        referrer: String,
        deviceInfo: Object,
        browserInfo: Object,
        ip: String,
        userAgent: String,
        isNewUser: Boolean,
        cookieConsent: { type: Boolean, default: false },
        location: Object,
        consentCategories: Object,
        utmParams: Object,
        pageViews: { type: Number, default: 0 },
        events: { type: Number, default: 0 },
        conversions: { type: Number, default: 0 },
        totalValue: { type: Number, default: 0 },
        funnelProgress: Object,
        abTestVariants: Object
      });
      
      connection.model('Session', SessionSchema);
    }
    if (!connection.models['User']) {
      const UserSchema = new mongoose.Schema({
        userId: { type: String, required: true, unique: true },
        fingerprint: { type: String, sparse: true, index: true },
        email: { type: String, sparse: true, index: true, unique: true },
        firstName: String,
        lastName: String,
        phone: String,
        leadStage: String,
        firstSeen: { type: Date, default: Date.now },
        lastSeen: { type: Date, default: Date.now },
        visits: { type: Number, default: 1 },
        sessions: [String],
        deviceIds: [String],
        traits: Object,
        adOptimizationConsent: String,
        totalTimeOnSite: { type: Number, default: 0 },
        totalPageViews: { type: Number, default: 0 },
        conversions: Array,
        location: Object,
        totalValue: { type: Number, default: 0 },
        leadSource: Object,
        tags: [String]
      });
      
      connection.model('User', UserSchema);
    }
    if (!connection.models['Visit']) {
      const { VisitSchema } = require('../models');
      connection.model('Visit', VisitSchema);
    }
    if (!connection.models['Event']) {
      // Schema Evento
      const EventSchema = new mongoose.Schema({
        eventId: { type: String, required: true, unique: true },
        sessionId: { type: String, required: true, index: true },
        userId: { type: String, sparse: true, index: true },
        eventName: { type: String, required: true },
        eventData: Object,
        timestamp: { type: Date, default: Date.now },
        url: String,
        rawUrl: String,
        path: String,
        ip: String,
        userAgent: String,
        location: {
          city: String,
          region: String,
          country: String,
          country_code: String
        },
        category: { 
          type: String, 
          enum: ['page', 'form_interaction', 'click', 'video', 'scroll', 'page_visibility', 
                 'time_on_page', 'session_end', 'conversion', 'pageview', 'system', 
                 'user', 'interaction', 'media', 'error', 'navigation'],
          default: 'interaction'
        },
        originalEventType: String
      });
      
      connection.model('Event', EventSchema);
    }
    
    const Session = connection.model('Session');
    const User = connection.model('User');
    const Visit = connection.model('Visit');
    const Event = connection.model('Event');
    
    // Calcola data di inizio in base al timeRange
    let startDate = new Date();
    switch(timeRange) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case 'all':
        startDate = new Date(0); // Dal 1970
        break;
    }
    
    // La query principale: cercare sia per userId che per fingerprint
    const query = {
      startTime: { $gte: startDate },
      $or: [
        { userId: userId },
        { fingerprint: userId }
      ]
    };
    
    console.log(`Query di ricerca principale:`, JSON.stringify(query));
    
    // Esegui la query
    const sessions = await Session.find(query).sort({ startTime: -1 });
    console.log(`Trovate ${sessions.length} sessioni direttamente`);
    
    // Se non abbiamo trovato sessioni, possiamo cercare in modo più approfondito
    let allSessions = [...sessions];
    
    if (sessions.length === 0) {
      console.log(`Nessuna sessione trovata direttamente, esecuzione ricerca approfondita...`);
      
      // Cerchiamo l'utente nel modello User
      const user = await User.findOne({ 
        $or: [
          { userId: userId },
          { fingerprint: userId },
          { deviceIds: userId },
          { sessions: userId }
        ]
      });
      
      if (user) {
        console.log(`Utente trovato: ${user.userId}`);
        
        // Se abbiamo trovato un utente, cerchiamo le sue sessioni
        if (user.userId && user.userId !== userId) {
          const userSessions = await Session.find({
            userId: user.userId,
            startTime: { $gte: startDate }
          });
          
          if (userSessions.length > 0) {
            console.log(`Trovate ${userSessions.length} sessioni tramite userId dell'utente`);
            allSessions = [...allSessions, ...userSessions];
          }
        }
        
        // Cerchiamo anche per i suoi fingerprint (se diversi)
        if (user.fingerprint && user.fingerprint !== userId) {
          const fingerprintSessions = await Session.find({
            fingerprint: user.fingerprint,
            startTime: { $gte: startDate }
          });
          
          if (fingerprintSessions.length > 0) {
            console.log(`Trovate ${fingerprintSessions.length} sessioni tramite fingerprint dell'utente`);
            allSessions = [...allSessions, ...fingerprintSessions];
          }
        }
        
        // Controlla anche l'array deviceIds
        if (user.deviceIds && user.deviceIds.length > 0) {
          const deviceSessions = await Session.find({
            fingerprint: { $in: user.deviceIds },
            startTime: { $gte: startDate }
          });
          
          if (deviceSessions.length > 0) {
            console.log(`Trovate ${deviceSessions.length} sessioni tramite deviceIds dell'utente`);
            allSessions = [...allSessions, ...deviceSessions];
          }
        }
      } else {
        console.log(`Nessun utente trovato con questo identificatore`);
      }
    }
    
    // Rimuovi i duplicati 
    const uniqueSessions = [];
    const sessionIds = new Set();
    
    allSessions.forEach(session => {
      if (!sessionIds.has(session.sessionId)) {
        sessionIds.add(session.sessionId);
        uniqueSessions.push(session);
      }
    });
    
    console.log(`Dopo la rimozione dei duplicati: ${uniqueSessions.length} sessioni uniche`);
    
    // Prepara le sessioni per il frontend con deduplicazione eventId
    const sessionList = await Promise.all(uniqueSessions.map(async (session) => {
      // Verifica se ci sono conversioni in questa sessione con deduplicazione per eventId
      const conversions = await Event.aggregate([
        {
          $match: { 
            sessionId: session.sessionId,
            category: 'conversion',
            eventId: { $exists: true, $ne: '' }
          }
        },
        {
          $group: {
            _id: '$eventId', // Raggruppa per eventId per evitare duplicati
            sessionId: { $first: '$sessionId' },
            timestamp: { $first: '$timestamp' }
          }
        }
      ]);
      
      // Trova la pagina di uscita
      const lastVisit = await Visit.findOne({ 
        sessionId: session.sessionId 
      }).sort({ timestamp: -1 });
      
      // Conta le visite di pagina uniche per eventId
      const pageViews = await Event.aggregate([
        {
          $match: { 
            sessionId: session.sessionId,
            eventName: 'pageview',
            eventId: { $exists: true, $ne: '' }
          }
        },
        {
          $group: {
            _id: '$eventId' // Conta solo pageview unici per eventId
          }
        },
        {
          $count: 'total'
        }
      ]);
      
      const pageViewCount = pageViews.length > 0 ? pageViews[0].total : session.pageViews || 0;
      
      // Conta le interazioni uniche per eventId
      const interactions = await Event.aggregate([
        {
          $match: { 
            sessionId: session.sessionId,
            category: { $in: ['interaction', 'form', 'media'] },
            eventId: { $exists: true, $ne: '' }
          }
        },
        {
          $group: {
            _id: '$eventId' // Conta solo interazioni uniche per eventId
          }
        },
        {
          $count: 'total'
        }
      ]);
      
      const interactionCount = interactions.length > 0 ? interactions[0].total : 0;
      
      return {
        id: session.sessionId,
        userId: session.userId || userId,
        landingPageId: session.landingPageId,
        startTime: session.startTime,
        endTime: session.endTime || null,
        duration: session.duration || 0,
        pagesViewed: pageViewCount,
        interactionsCount: interactionCount,
        entryUrl: session.entryPage,
        exitUrl: lastVisit ? lastVisit.url : session.exitPage,
        isConverted: conversions.length > 0
      };
    }));
    
    console.log(`===== FINE RICERCA SESSIONI =====\n`);
    
    res.status(200).json(sessionList);
  } catch (error) {
    console.error('Errore nel recupero delle sessioni:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Errore nel recupero delle sessioni',
      details: error.message
    });
  }
});

// 4. Endpoint per ottenere i dettagli di una sessione - VERSIONE CORRETTA
router.get('/sessions/details/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    console.log(`\n===== INIZIO RECUPERO DETTAGLI SESSIONE =====`);
    console.log(`SessionId: ${sessionId}`);
    
    // Get user connection
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Make sure the UserPath model exists
    if (!connection.models['UserPath']) {
      const { UserPathSchema } = require('../models');
      connection.model('UserPath', UserPathSchema);
    }
    
    const UserPath = connection.model('UserPath');
    
    // Use lean() for better performance and to get plain JavaScript object
    const userPath = await UserPath.findOne({ sessionId }).lean();
    
    if (!userPath) {
      console.log(`Nessun percorso utente trovato per la sessione: ${sessionId}`);
      return res.status(200).json([]);
    }
    
    console.log(`\n========== DIAGNOSTIC INFO ==========`);
    console.log(`UserPath trovato con ${userPath.path.length} pagine`);
    console.log(`TotalInteractions from document: ${userPath.totalInteractions || 0}`);
    
    // Estrai solo le interazioni dagli array, senza aggiungere pageview artificiali
    const sessionDetails = [];
    let totalInteractionsExtracted = 0;
    
    // Itera attraverso le pagine per ottenere le interazioni
    if (userPath.path && userPath.path.length > 0) {
      userPath.path.forEach((page) => {
        // Estrai tutte le interazioni da ogni pagina
        if (Array.isArray(page.interactions)) {
          page.interactions.forEach((interaction) => {
            // Estrai l'eventId corretto
            const eventId = interaction.eventId || 
                          (interaction._id ? interaction._id.toString() : 
                          `interaction_${new Date(interaction.timestamp).getTime()}`);
            
            // Normalizza il campo type
            const eventType = interaction.type || 'event';
            
            // Prepara l'oggetto dati ricco, combinando metadata con i campi originali
            const richData = {
              name: interaction.type || 'event',
              url: page.url,
              rawUrl: page.rawUrl || page.url,
              title: page.title || '',
              ...interaction.metadata, // Includi tutti i campi metadata
              originalEventType: interaction.originalEventType,
              category: interaction.metadata?.category || getEventCategory(eventType)
            };
            
            // Includi dati aggiuntivi dall'interazione se disponibili
            if (interaction.elementId) richData.elementId = interaction.elementId;
            if (interaction.elementText) richData.elementText = interaction.elementText;
            
            // Formatta l'interazione per l'output
            const interactionEvent = {
              id: eventId,
              type: eventType,
              timestamp: new Date(interaction.timestamp).toISOString(),
              data: richData
            };
            
            sessionDetails.push(interactionEvent);
            totalInteractionsExtracted++;
          });
        }
      });
    }
    
    // Ordina per timestamp
    sessionDetails.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    console.log(`\n===== RISULTATO FINALE =====`);
    console.log(`Interazioni estratte: ${totalInteractionsExtracted}`);
    console.log(`Totale dettagli sessione: ${sessionDetails.length}`);
    console.log(`===== FINE RECUPERO DETTAGLI SESSIONE =====\n`);
    
    // Return the session details
    res.status(200).json(sessionDetails);
    
  } catch (error) {
    console.error('Errore nel recupero dei dettagli della sessione:', error);
    console.error('Stack trace completo:', error.stack);
    
    res.status(500).json({
      status: 'error',
      message: 'Errore nel recupero dei dettagli della sessione',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

router.get('/statistics', async (req, res) => {
  try {
    console.log("[STATS API] Richiesta ricevuta per le statistiche");
    console.log(`[STATS API] Headers: ${JSON.stringify(req.headers.origin)}`);
    console.log(`[STATS API] Query params: ${JSON.stringify(req.query)}`);
    
    const { timeRange = '7d' } = req.query;
    console.log(`[STATS API] Intervallo temporale richiesto: ${timeRange}`);
    
    // Otteniamo la connessione al database dell'utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      console.log("[STATS API] ERRORE: Nessuna connessione utente disponibile");
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    console.log("[STATS API] Connessione al database utente ottenuta con successo");
    
    // Determina quale modello di statistiche utilizzare in base al timeRange
    let StatModel;
    let query = {};
    
    switch(timeRange) {
      case '24h':
        // Verifica che il modello DailyStatistics esista
        if (!connection.models['DailyStatistics']) {
          console.log("[STATS API] Modello DailyStatistics non registrato, verifico la disponibilità dello schema");
          const { DailyStatisticsSchema } = require('../models');
          if (DailyStatisticsSchema) {
            console.log("[STATS API] Registrando il modello DailyStatistics sulla connessione utente");
            connection.model('DailyStatistics', DailyStatisticsSchema);
          } else {
            console.log("[STATS API] Schema DailyStatistics non disponibile!");
          }
        }
        
        StatModel = connection.model('DailyStatistics');
        
        // Imposta la query per l'ultimo giorno
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        query = { date: { $gte: yesterday } };
        break;
        
      case '7d':
        // Verifica che il modello WeeklyStatistics esista
        if (!connection.models['WeeklyStatistics']) {
          console.log("[STATS API] Modello WeeklyStatistics non registrato, verifico la disponibilità dello schema");
          const { WeeklyStatisticsSchema } = require('../models');
          if (WeeklyStatisticsSchema) {
            console.log("[STATS API] Registrando il modello WeeklyStatistics sulla connessione utente");
            connection.model('WeeklyStatistics', WeeklyStatisticsSchema);
          } else {
            console.log("[STATS API] Schema WeeklyStatistics non disponibile!");
          }
        }
        
        StatModel = connection.model('WeeklyStatistics');
        
        // Ottieni tutte le settimane disponibili invece di cercare una sola
        query = {};
        console.log("[STATS API] Cerco tutte le statistiche settimanali disponibili");
        break;
        
      case '30d':
        // Verifica che il modello MonthlyStatistics esista
        if (!connection.models['MonthlyStatistics']) {
          console.log("[STATS API] Modello MonthlyStatistics non registrato, verifico la disponibilità dello schema");
          const { MonthlyStatisticsSchema } = require('../models');
          if (MonthlyStatisticsSchema) {
            console.log("[STATS API] Registrando il modello MonthlyStatistics sulla connessione utente");
            connection.model('MonthlyStatistics', MonthlyStatisticsSchema);
          } else {
            console.log("[STATS API] Schema MonthlyStatistics non disponibile!");
          }
        }
        
        StatModel = connection.model('MonthlyStatistics');
        
        // Calcola la chiave del mese corrente
        const monthDate = new Date();
        const monthKey = `${monthDate.getFullYear()}-${(monthDate.getMonth() + 1).toString().padStart(2, '0')}`;
        
        query = { monthKey };
        break;
        
      case 'all':
        // Verifica che il modello TotalStatistics esista
        if (!connection.models['TotalStatistics']) {
          console.log("[STATS API] Modello TotalStatistics non registrato, verifico la disponibilità dello schema");
          const { TotalStatisticsSchema } = require('../models');
          if (TotalStatisticsSchema) {
            console.log("[STATS API] Registrando il modello TotalStatistics sulla connessione utente");
            connection.model('TotalStatistics', TotalStatisticsSchema);
          } else {
            console.log("[STATS API] Schema TotalStatistics non disponibile!");
          }
        }
        
        StatModel = connection.model('TotalStatistics');
        // Cerchiamo tutti i record, poi filtreremo per 'total'
        query = {};
        console.log("[STATS API] Cerco tutte le statistiche totali disponibili");
        break;
        
      default:
        // Fallback a Statistics se esiste
        if (connection.models['Statistics']) {
          console.log("[STATS API] Utilizzo del modello Statistics (fallback)");
          StatModel = connection.model('Statistics');
          query = {};
        } else {
          console.log("[STATS API] Fallback a DailyStatistics");
          // Fallback a DailyStatistics
          if (!connection.models['DailyStatistics']) {
            const { DailyStatisticsSchema } = require('../models');
            if (DailyStatisticsSchema) {
              connection.model('DailyStatistics', DailyStatisticsSchema);
            } else {
              return res.status(500).json({ 
                success: false, 
                message: 'Modelli statistici non disponibili nel database'
              });
            }
          }
          
          StatModel = connection.model('DailyStatistics');
          const defaultDate = new Date();
          defaultDate.setDate(defaultDate.getDate() - 7);
          query = { date: { $gte: defaultDate } };
        }
    }
    
    console.log(`[STATS API] Modello statistico utilizzato: ${StatModel.modelName}`);
    console.log(`[STATS API] Query: ${JSON.stringify(query)}`);
    
    // Elenca tutte le collezioni disponibili (solo in debug)
    try {
      const collections = await connection.db.listCollections().toArray();
      console.log(`[STATS API] Collezioni disponibili nel database: ${collections.map(c => c.name).join(', ')}`);
    } catch (err) {
      console.log(`[STATS API] Impossibile elencare le collezioni: ${err.message}`);
    }
    
    try {
      // Controlla l'esistenza della collezione prima di eseguire la query
      const collections = await connection.db.listCollections({ name: StatModel.collection.name }).toArray();
      if (collections.length === 0) {
        console.log(`[STATS API] ATTENZIONE: La collezione ${StatModel.collection.name} non esiste nel database!`);
        return res.status(200).json([]); // Restituisci un array vuoto
      }
    } catch (err) {
      console.log(`[STATS API] Errore durante la verifica della collezione: ${err.message}`);
    }
    
    // Trova le statistiche nel periodo selezionato
    const statistics = await StatModel.find(query).sort({ 
      // Ordinamento appropriato in base al tipo di statistica
      ...(StatModel.modelName === 'DailyStatistics' ? { date: -1 } : {}),
      ...(StatModel.modelName === 'WeeklyStatistics' ? { weekKey: -1 } : {}),
      ...(StatModel.modelName === 'MonthlyStatistics' ? { monthKey: -1 } : {}),
      ...(StatModel.modelName === 'TotalStatistics' ? { lastUpdated: -1 } : {}),
      ...(StatModel.modelName === 'Statistics' ? { date: -1 } : {})
    });
    
    console.log(`[STATS API] Query completata. Trovati ${statistics.length} documenti`);
    
    // Log dei primi documenti per debug se ce ne sono
    if (statistics.length > 0) {
      console.log("[STATS API] Primo documento trovato:");
      console.log(JSON.stringify(statistics[0], null, 2).substring(0, 300) + "...");
    } else {
      console.log("[STATS API] Nessun documento trovato nella collezione. Verificare che i dati esistano.");
      
      // Opzionale: verifica se i dati esistono in altre collezioni
      try {
        const collectionsToCheck = ['DailyStatistics', 'WeeklyStatistics', 'MonthlyStatistics', 'TotalStatistics', 'Statistics'];
        for (const collName of collectionsToCheck) {
          if (connection.models[collName]) {
            const count = await connection.models[collName].countDocuments({});
            console.log(`[STATS API] Collezione ${collName} contiene ${count} documenti`);
          }
        }
      } catch (err) {
        console.log(`[STATS API] Errore durante la verifica di altre collezioni: ${err.message}`);
      }
    }
    
    // Seleziona statistiche rilevanti con la stessa logica dell'altro endpoint
    let relevantStats = statistics;
    
    // Per le statistiche settimanali, prendi solo la settimana più recente
    if (timeRange === '7d' && statistics.length > 0) {
      // La statistica più recente è già la prima grazie all'ordinamento
      relevantStats = [statistics[0]];
      console.log(`[STATS API] Settimana selezionata: ${relevantStats[0].weekKey || 'N/A'}`);
    }
    
    // Per le statistiche totali, cerca il record con key='total'
    if (timeRange === 'all' && statistics.length > 0) {
      const totalStat = statistics.find(stat => stat.key === 'total');
      if (totalStat) {
        relevantStats = [totalStat];
        console.log('[STATS API] Trovato record con key=total');
      } else {
        console.log('[STATS API] Nessun record con key=total trovato, usando il primo record');
        relevantStats = [statistics[0]];
      }
    }
    
    // Configurazione corretta di CORS
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Invia le statistiche rilevanti
    res.json(relevantStats);
    
    console.log("[STATS API] Risposta inviata al client");
    
  } catch (error) {
    console.error('[STATS API] ERRORE durante il recupero delle statistiche:', error);
    console.error('[STATS API] Stack trace:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch statistics data', 
      error: error.message 
    });
  }
});

module.exports = router;