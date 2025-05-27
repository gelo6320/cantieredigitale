const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const MongoStore = require('connect-mongo');
const cookieParser = require('cookie-parser');
const nodemailer = require('nodemailer');
const fs = require('fs');
const compression = require('compression');

// Carica variabili d'ambiente
dotenv.config();

// Inizializza Express
const app = express();
const PORT = process.env.PORT || 3000;

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
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// Configurazione CORS
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://costruzionedigitale.com',
      'https://www.costruzionedigitale.com',
      'https://crm.costruzionedigitale.com',
      'https://api.costruzionedigitale.com',
      'http://localhost:3000',
      'http://localhost:5001'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      callback(null, origin);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

// Configurazione sessione (condivisa tra tutte le parti dell'app)
app.use(session({
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
}));

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

// Connessione MongoDB principale
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connesso con successo');
  })
  .catch(err => console.error('Errore connessione MongoDB:', err));

// ===== DEFINIZIONE SCHEMI =====

const VisitSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now },
  url: String,
  path: String,
  title: String,
  referrer: String,
  funnelStep: Number,
  funnelName: String,
  userAgent: String,
  location: {
    city: String,
    region: String,
    country: String,
    country_code: String
  },
  ip: String,
  deviceInfo: Object,
  cookieConsent: { type: Boolean, default: false },
  utmParams: Object,
  isNewVisitor: Boolean,
  isEntryPoint: { type: Boolean, default: false },
  isExitPoint: { type: Boolean, default: false },
  timeOnPage: Number, // in secondi
  scrollDepth: Number, // percentuale
  facebookCapi: {
    sent: { type: Boolean, default: false },
    timestamp: Date,
    success: Boolean,
    eventId: String,
    payload: Object,
    response: Object,
    error: Object
  }
});

const Visit = mongoose.model('Visit', VisitSchema);

const ClientSchema = new mongoose.Schema({
  // Identificatori
  leadId: { type: String, required: true, unique: true }, // unique: true crea automaticamente un indice
  clientId: { type: String, required: true, unique: true }, // unique: true crea automaticamente un indice
  
  // Dati personali
  firstName: String,
  lastName: String,
  email: { type: String, required: true }, // Rimosso index: true per evitare duplicati
  phone: String,
  fullName: String,
  
  // Dati commerciali
  value: { type: Number, default: 0 },
  service: String,
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'completed', 'on-hold'], 
    default: 'active' 
  },
  
  // Date importanti
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  convertedAt: { type: Date, default: Date.now },
  
  // Origine
  leadSource: String,
  originalSource: String,
  campaign: String,
  medium: String,
  
  // Consensi
  consent: {
    marketing: { type: Boolean, default: false },
    analytics: { type: Boolean, default: false },
    thirdParty: { type: Boolean, default: false },
    timestamp: Date,
    version: String,
    method: String
  },
  
  // Dati estesi
  extendedData: {
    consentGiven: { type: Boolean, default: false },
    ipAddress: String,
    userAgent: String,
    utmParams: Object,
    fbclid: String,
    referrer: String,
    landingPage: String,
    deviceInfo: Object,
    formData: Object,
    notes: String,
    currency: { type: String, default: 'EUR' }
  },
  
  // Dati aggiuntivi
  notes: [{ 
    text: String,
    createdAt: { type: Date, default: Date.now },
    createdBy: String
  }],
  tags: [String],
  properties: { type: Map, of: mongoose.Schema.Types.Mixed },

  location: {
    city: String,
    region: String,
    country: String,
    country_code: String
  },
  
  // Progetti associati
  projects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
  
  // Flag amministrativi
  isArchived: { type: Boolean, default: false },

  // Campo per i dati CAPI Facebook
  facebookCapi: {
    sent: { type: Boolean, default: false },
    timestamp: Date,
    success: Boolean,
    eventId: String,
    payload: Object,
    response: Object,
    error: Object
  }
  
}, { collection: 'clients', strict: false });

// Crea SOLO gli indici necessari che non sono già coperti da unique: true
ClientSchema.index({ email: 1 }); // Mantieni solo questo per le query
ClientSchema.index({ createdAt: 1 });
ClientSchema.index({ updatedAt: 1 });

// Crea il modello Client
const Client = mongoose.model('Client', ClientSchema);

// Schema per i dati del form
const FormDataSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  message: String,
  source: String,
  status: {
    type: String,
    enum: ['new', 'contacted', 'qualified', 'opportunity', 'customer', 'lost'],
    default: 'new'
  },
  value: { type: Number, default: 0 }, // Campo per il valore
  service: String, // Campo per il servizio
  crmEvents: [{
    eventName: String,
    eventTime: Date,
    sentToFacebook: Boolean,
    metadata: Object
  }],
  fbclid: String,
  fbclidTimestamp: Number,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  viewed: { type: Boolean, default: false },
  viewedAt: { type: Date }
});

// Schema per le prenotazioni
const BookingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  message: String,
  bookingDate: { type: String, required: true },
  bookingTime: { type: String, required: true },
  // NUOVO: Campi per timezone
  originalDate: String, // Data originale del cliente (UTC+2)
  originalTime: String, // Ora originale del cliente (UTC+2)
  timezone: { type: String, default: 'Europe/Rome' }, // Timezone del cliente
  // NUOVO: Campi per sito e social
  website: String, // Sito web del cliente
  facebookPage: String, // Pagina Facebook del cliente
  businessInfo: { // Informazioni aggiuntive sul business
    hasWebsite: { type: Boolean, default: false },
    hasFacebook: { type: Boolean, default: false },
    notes: String // Note aggiuntive raccolte dal bot
  },
  bookingTimestamp: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'cancelled', 'completed', 'qualified', 'opportunity', 'proposal', 'customer', 'lost'], 
    default: 'pending' 
  },
  value: { type: Number, default: 0 },
  service: String,
  source: String,
  fbclid: String,
  fbclidTimestamp: Number,
  crmEvents: [{
    eventName: String,
    eventTime: Date,
    sentToFacebook: Boolean,
    metadata: Object
  }],
  createdAt: { type: Date, default: Date.now },
  viewed: { type: Boolean, default: false },
  viewedAt: { type: Date }
});

// Schema per gli amministratori
const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  config: {
    mongodb_uri: String,
    access_token: String,           // Token per Facebook Conversion API (CAPI)
    marketing_api_token: String,    // Token per Facebook Marketing API 
    meta_pixel_id: String,          // ID del pixel Facebook
    fb_account_id: String,          // ID dell'account pubblicitario Facebook
    // NUOVI CAMPI WHATSAPP
    whatsapp_access_token: String,      // Token di accesso WhatsApp Business API
    whatsapp_phone_number_id: String,   // ID del numero di telefono WhatsApp Business
    whatsapp_webhook_token: String,     // Token per autenticare i webhook WhatsApp
    whatsapp_verify_token: String       // Token di verifica per setup webhook
  },
  createdAt: { type: Date, default: Date.now }
});

const Booking = mongoose.model('Booking', BookingSchema);

// Schema per il consenso ai cookie
const CookieConsentSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  essential: { type: Boolean, default: true },
  analytics: { type: Boolean, default: false },
  marketing: { type: Boolean, default: false },
  configured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Schema per gli eventi Facebook
const FacebookEventSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, required: true },
  leadType: { type: String, enum: ['form', 'booking', 'facebook', 'contact'], required: true },
  eventName: { type: String, required: true },
  eventTime: { type: Date, default: Date.now },
  userData: Object,
  customData: Object,
  eventId: String,
  success: { type: Boolean, default: false },
  error: String,
  createdAt: { type: Date, default: Date.now }
});

// Schema per i lead Facebook
const FacebookLeadSchema = new mongoose.Schema({
  leadId: String,
  formId: String,
  adId: String,
  pageId: String,
  adgroupId: String,
  name: String,
  email: String,
  phone: String,
  customFields: Object,
  rawData: Object,
  value: { type: Number, default: 0 }, // Campo per il valore
  service: String, // Campo per il servizio
  status: {
    type: String,
    enum: ['new', 'contacted', 'qualified', 'opportunity', 'customer', 'lost'],
    default: 'new'
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  viewed: { type: Boolean, default: false },
  viewedAt: { type: Date }
});

// Schema per i siti web dell'utente
const SiteSchema = new mongoose.Schema({
  url: { type: String, required: true },
  domain: { type: String, required: true },
  path: { type: String, default: '/' }, 
  screenshotUrl: { type: String, default: '' },
  metrics: {
    performance: { type: Number, default: 0 },
    accessibility: { type: Number, default: 0 },
    bestPractices: { type: Number, default: 0 },
    seo: { type: Number, default: 0 },
    firstContentfulPaint: { type: Number },
    speedIndex: { type: Number },
    largestContentfulPaint: { type: Number },
    timeToInteractive: { type: Number },
    totalBlockingTime: { type: Number },
    cumulativeLayoutShift: { type: Number }
  },
  lastScan: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true }
});

// Aggiungere il modello Site
const Site = mongoose.model('Site', SiteSchema);

// Schema for tracking statistics
const StatisticsSchema = new mongoose.Schema({
  date: { type: Date, required: true, index: true },
  totalVisits: { type: Number, default: 0 },
  uniqueVisitors: { type: Number, default: 0 },
  consentedVisits: { type: Number, default: 0 },
  consentRate: { type: Number, default: 0 },
  pageViews: { type: Number, default: 0 },
  bounceRate: { type: Number, default: 0 },
  avgTimeOnSite: { type: Number, default: 0 },
  totalTimeOnPage: { type: Number, default: 0 },
  avgTimeOnPage: { type: Number, default: 0 },
  buttonClicks: {
    total: { type: Number, default: 0 },
    byId: { type: Map, of: Number, default: {} }
  },
  conversions: {
    total: { type: Number, default: 0 },
    byType: { type: Map, of: Number, default: {} },
    bySource: { type: Map, of: Number, default: {} }
  },
  conversionRate: { type: Number, default: 0 },
  funnel: {
    entries: { type: Number, default: 0 },
    completions: { type: Number, default: 0 }
  },
  mobileVsDesktop: {
    mobile: { type: Number, default: 0 },
    desktop: { type: Number, default: 0 }
  },
  timeBySource: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  sources: { type: Map, of: Number, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Create the model
const Statistics = mongoose.model('Statistics', StatisticsSchema);

// Dopo la definizione di StatisticsSchema, aggiungere i nuovi schemi per timeframe

// Schema base per le statistiche - definisce la struttura comune per tutti i timeframe
const BaseStatisticsSchema = {
  visitsByUrl: {
    type: Object,
    default: {}
  },
  uniqueVisitorsByUrl: {
    type: Object,
    default: {}
  },
  uniqueIdentifiers: [{
    identifier: String,
    type: { type: String, enum: ['userId', 'fingerprint', 'sessionId'] },
    firstSeen: Date,
    urls: [String]
  }],
  totalVisits: { type: Number, default: 0 },
  consentedVisits: { type: Number, default: 0 },
  consentRate: { type: Number, default: 0 },
  pageViews: { type: Number, default: 0 },
  uniqueVisitors: { type: Number, default: 0 },
  bounceRate: { type: Number, default: 0 },
  avgTimeOnSite: { type: Number, default: 0 },
  totalTimeOnPage: { type: Number, default: 0 },
  avgTimeOnPage: { type: Number, default: 0 },
  buttonClicks: {
    total: { type: Number, default: 0 },
    byId: { type: Object, default: {} }
  },
  timeBySource: { type: Object, default: {} },
  conversions: {
    total: { type: Number, default: 0 },
    byType: { type: Object, default: {} },
    bySource: { type: Object, default: {} }
  },
  conversionRate: { type: Number, default: 0 },
  funnel: {
    entries: { type: Number, default: 0 },
    completions: { type: Number, default: 0 },
    dropOffs: Object
  },
  sources: Object,
  campaigns: Object,
  mobileVsDesktop: {
    mobile: { type: Number, default: 0 },
    desktop: { type: Number, default: 0 }
  }
};

// Schema Statistiche Giornaliere
const DailyStatisticsSchema = new mongoose.Schema({
  date: { type: Date, required: true, index: true },
  ...BaseStatisticsSchema,
  // Rinominato per chiarezza
  uniqueIdentifiersToday: [{
    identifier: String,
    type: { type: String, enum: ['userId', 'fingerprint', 'sessionId'] },
    firstSeen: Date,
    urls: [String]
  }]
});

// Schema Statistiche Settimanali
const WeeklyStatisticsSchema = new mongoose.Schema({
  // Anno e numero della settimana (formato: AAAA-WW)
  weekKey: { type: String, required: true, index: true },
  year: { type: Number, required: true },
  week: { type: Number, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  ...BaseStatisticsSchema,
  // Identificatori univoci per questa settimana
  uniqueIdentifiersThisWeek: [{
    identifier: String,
    type: { type: String, enum: ['userId', 'fingerprint', 'sessionId'] },
    firstSeen: Date,
    urls: [String]
  }],
  // Aggiornamenti giornalieri nella settimana
  dailyBreakdown: [{
    date: Date,
    visits: Number,
    pageViews: Number,
    conversions: Number
  }]
});

// Schema Statistiche Mensili
const MonthlyStatisticsSchema = new mongoose.Schema({
  // Anno e mese (formato: AAAA-MM)
  monthKey: { type: String, required: true, index: true },
  year: { type: Number, required: true },
  month: { type: Number, required: true }, // 1-12
  ...BaseStatisticsSchema,
  // Identificatori univoci per questo mese
  uniqueIdentifiersThisMonth: [{
    identifier: String,
    type: { type: String, enum: ['userId', 'fingerprint', 'sessionId'] },
    firstSeen: Date,
    urls: [String]
  }],
  // Aggiornamenti settimanali nel mese
  weeklyBreakdown: [{
    weekKey: String,
    visits: Number,
    pageViews: Number,
    conversions: Number
  }]
});

// Schema Statistiche Totali
const TotalStatisticsSchema = new mongoose.Schema({
  // Identificatore per le statistiche totali
  key: { type: String, default: 'total', required: true, index: true },
  // Periodo coperto
  firstDataPoint: { type: Date },
  lastUpdated: { type: Date, default: Date.now },
  ...BaseStatisticsSchema,
  // Aggiornamenti mensili
  monthlyBreakdown: [{
    monthKey: String,
    year: Number,
    month: Number,
    visits: Number,
    pageViews: Number,
    conversions: Number
  }],
  uniqueUserIdentifiers: [{
    identifier: String,
    type: { type: String, enum: ['userId', 'fingerprint', 'sessionId'] },
    firstSeen: Date
  }]
});

// Registrazione dei modelli
const DailyStatistics = mongoose.model('DailyStatistics', DailyStatisticsSchema);
const WeeklyStatistics = mongoose.model('WeeklyStatistics', WeeklyStatisticsSchema);
const MonthlyStatistics = mongoose.model('MonthlyStatistics', MonthlyStatisticsSchema);
const TotalStatistics = mongoose.model('TotalStatistics', TotalStatisticsSchema);

// Schema Interaction for consolidated events
const InteractionSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  type: { 
    type: String, 
    enum: ['form_interaction', 'click', 'video', 'scroll', 'page_visibility', 
           'time_on_page', 'session_end', 'conversion', 'pageview', 'system', 
           'user', 'interaction', 'media', 'error', 'navigation', 'user_inactive', 'user_active'],
    default: 'interaction'
  },
  eventId: { type: String, required: true },
  // Fields for click events
  elementId: String,
  elementText: String,
  // Expand metadata for specific consolidated event types
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Store original event type
  originalEventType: String
}, { _id: true });

InteractionSchema.index({ eventId: 1 }, { unique: true, sparse: true });

const UserPathSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  userId: { type: String, sparse: true, index: true },
  fingerprint: { type: String, sparse: true, index: true },
  path: [{
    timestamp: Date,
    url: String,
    rawUrl: String, 
    title: String,
    referrer: String,
    pageType: { type: String, enum: ['landing', 'transition', 'exit'], default: 'transition' },
    timeOnPage: Number,
    tempStartTime: Date,
    scrollDepth: Number,
    interactions: [InteractionSchema],
    exitReason: { type: String, enum: ['navigation', 'tab_switch', 'window_close', 'timeout', 'unknown'] }
  }],
  entryPoint: String,
  exitPoint: String,
  duration: Number,
  totalInteractions: { type: Number, default: 0 },
  totalPages: { type: Number, default: 0 },
  conversionOccurred: { type: Boolean, default: false },
  conversionDetails: {
    type: {
      type: String
    },
    value: Number,
    pageUrl: String,
    timestamp: Date
  },
  isActive: { type: Boolean, default: true },
  lastActivity: { type: Date, default: Date.now }
});

const UserPath = mongoose.model('UserPath', UserPathSchema);

const FacebookAudienceSchema = new mongoose.Schema({
  // Identificatori principali
  userId: { type: String, sparse: true, index: true },
  email: { type: String, sparse: true, index: true },
  phone: { type: String, sparse: true },
  fingerprint: { type: String, sparse: true, index: true },
  
  // Dati utente base
  firstName: String,
  lastName: String,
  
  // Campi specifici per Facebook
  fbclid: String,
  fbp: String,
  fbc: String,
  
  // Dati per CAPI (Conversion API)
  hashedEmail: String,
  hashedPhone: String,
  
  // Dati demografici e di posizione
  language: String,
  location: {
    city: String,
    region: String,
    country: String,
    country_code: String
  },
  deviceInfo: mongoose.Schema.Types.Mixed,
  
  // Dati di origine e attribuzione
  source: String,
  medium: String,
  campaign: String,
  referrer: String,
  landingPage: String,
  utmParams: mongoose.Schema.Types.Mixed,
  
  // Dati di conversione (semplificato per evitare problemi di validazione)
  conversions: [{
    type: { type: String },
    formType: String,
    value: Number,
    timestamp: { type: Date, default: Date.now },
    metadata: mongoose.Schema.Types.Mixed
  }],
  
  // Gestione del consenso
  adOptimizationConsent: { 
    type: String, 
    enum: ['GRANTED', 'DENIED', 'UNSPECIFIED'], 
    default: 'UNSPECIFIED' 
  },
  
  // Metadati
  firstSeen: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now },
  
  // Campi per deduplicazione
  duplicateOf: { type: String, sparse: true },
  duplicateScore: Number,
  mergedWith: { type: String, sparse: true },
  mergedRecords: [String],
  
  // Stato di sincronizzazione con Facebook
  syncedToFacebook: { type: Boolean, default: false },
  lastSyncAttempt: Date,
  syncResult: mongoose.Schema.Types.Mixed,
  
  // Nuovo campo per tracciare i dettagli dell'invio a Facebook CAPI
  facebookCapi: {
    sent: { type: Boolean, default: false },
    timestamp: Date,
    success: Boolean,
    eventId: String,
    payload: Object,
    response: Object,
    error: Object
  }
}, {
  // Opzioni schema per maggiore flessibilità
  strict: false, // Permette campi non definiti nello schema
  minimize: false // Non rimuove oggetti vuoti
});

// Verifica se il modello esiste già per evitare duplicati
let FacebookAudience;
try {
  // Prova a ottenere il modello esistente
  FacebookAudience = mongoose.model('FacebookAudience');
  console.log('Modello FacebookAudience già registrato, utilizzo quello esistente');
} catch (e) {
  // Se il modello non esiste, crealo
  FacebookAudience = mongoose.model('FacebookAudience', FacebookAudienceSchema);
  console.log('Nuovo modello FacebookAudience registrato');
}

// Schema per gli eventi del calendario
const CalendarEventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'completed', 'cancelled'],
    default: 'pending'
  },
  eventType: {
    type: String,
    enum: ['appointment', 'reminder'],
    default: 'appointment'
  },
  location: { type: String },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const FormData = mongoose.model('FormData', FormDataSchema);
const Admin = mongoose.model('Admin', AdminSchema);
const CookieConsent = mongoose.model('CookieConsent', CookieConsentSchema);
const FacebookLead = mongoose.model('FacebookLead', FacebookLeadSchema);
const FacebookEvent = mongoose.model('FacebookEvent', FacebookEventSchema);

// Funzione per ottenere metrics di PageSpeed Insights
async function getPageSpeedMetrics(url) {
  try {
    // Usa l'API di Google PageSpeed Insights
    const apiKey = process.env.PAGESPEED_API_KEY || '';
    // Aggiungi category=ACCESSIBILITY,BEST_PRACTICES,SEO,PERFORMANCE per ottenere tutte le metriche
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}&category=ACCESSIBILITY&category=BEST_PRACTICES&category=SEO&category=PERFORMANCE`;
    
    const response = await axios.get(apiUrl);
    const data = response.data;
    
    // Estrai le metriche principali
    const metrics = {
      performance: data.lighthouseResult?.categories?.performance?.score || 0,
      accessibility: data.lighthouseResult?.categories?.accessibility?.score || 0,
      bestPractices: data.lighthouseResult?.categories?.['best-practices']?.score || 0,
      seo: data.lighthouseResult?.categories?.seo?.score || 0
    };
    
    // Aggiungi metriche dettagliate se disponibili
    const audits = data.lighthouseResult?.audits;
    if (audits) {
      if (audits['first-contentful-paint']) {
        metrics.firstContentfulPaint = audits['first-contentful-paint'].numericValue;
      }
      if (audits['speed-index']) {
        metrics.speedIndex = audits['speed-index'].numericValue;
      }
      if (audits['largest-contentful-paint']) {
        metrics.largestContentfulPaint = audits['largest-contentful-paint'].numericValue;
      }
      if (audits['interactive']) {
        metrics.timeToInteractive = audits['interactive'].numericValue;
      }
      if (audits['total-blocking-time']) {
        metrics.totalBlockingTime = audits['total-blocking-time'].numericValue;
      }
      if (audits['cumulative-layout-shift']) {
        metrics.cumulativeLayoutShift = audits['cumulative-layout-shift'].numericValue;
      }
    }
    
    return metrics;
  } catch (error) {
    console.error('Errore nel recupero delle metrics PageSpeed:', error);
    return {
      performance: 0,
      accessibility: 0,
      bestPractices: 0,
      seo: 0
    };
  }
}

// Funzione per ottenere lo screenshot di un sito tramite API esterna
async function getScreenshot(url) {
  try {
    // Opzione 1: Usa l'API di PageSpeed Insights per lo screenshot
    const apiKey = process.env.PAGESPEED_API_KEY || '';
    const pageSpeedUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}`;
    
    const response = await axios.get(pageSpeedUrl);
    
    // Estrai lo screenshot dai risultati
    const screenshot = response.data?.lighthouseResult?.audits?.['final-screenshot']?.details?.data;
    
    if (screenshot) {
      return screenshot; // Questo è già in formato base64 pronto per essere usato come src
    }
    
    // Fallback: Se non riusciamo a ottenere lo screenshot da PageSpeed, usiamo screenshotmachine
    const screenshotApiKey = process.env.SCREENSHOT_API_KEY || 'demo';
    return `https://api.screenshotmachine.com?key=${screenshotApiKey}&url=${encodeURIComponent(url)}&dimension=1024x768&format=jpg&cacheLimit=14`;
  } catch (error) {
    console.error('Errore nel recupero dello screenshot:', error);
    
    // Fallback in caso di errore
    const screenshotApiKey = process.env.SCREENSHOT_API_KEY || 'demo';
    return `https://api.screenshotmachine.com?key=${screenshotApiKey}&url=${encodeURIComponent(url)}&dimension=1024x768&format=jpg&cacheLimit=14`;
  }
}

// Schemi per WhatsApp Chat Database
const ChatMessageSchema = new mongoose.Schema({
  messageId: { type: String, required: true, unique: true },
  conversationId: { type: String, required: true, index: true },
  role: { 
    type: String, 
    enum: ['user', 'assistant', 'system'], 
    required: true 
  },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  
  // Metadati specifici per WhatsApp
  whatsappMessageId: String,
  whatsappTimestamp: Date,
  
  // Metadati AI
  aiGenerated: { type: Boolean, default: false },
  responseTime: Number, // tempo di risposta AI in ms
  promptTokens: Number,
  responseTokens: Number,
  
  // Status del messaggio
  delivered: { type: Boolean, default: false },
  read: { type: Boolean, default: false },
  failed: { type: Boolean, default: false },
  failureReason: String,
  
  // Metadati extra
  isFirstContact: { type: Boolean, default: false },
  triggerredStep: String,
  metadata: { type: Object, default: {} }
});

const ChatConversationSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, unique: true },
  
  // Informazioni cliente
  cliente: {
    nome: String,
    email: String,
    telefono: { type: String, required: true, index: true },
    whatsappNumber: String,
    normalizedNumber: String,
    contactName: String,
    fonte: String
  },
  
  // Stato conversazione
  status: {
    type: String,
    enum: ['active', 'completed', 'abandoned', 'blocked', 'archived'],
    default: 'active'
  },
  currentStep: String,

  botControl: {
    isPaused: { type: Boolean, default: false },        // Bot in pausa per questa conversazione
    pausedAt: Date,                                      // Quando è stato messo in pausa
    pausedBy: String,                                    // Chi l'ha messo in pausa (username)
    pauseReason: String,                                 // Motivo della pausa
    resumedAt: Date,                                     // Quando è stato riattivato
    resumedBy: String,                                   // Chi l'ha riattivato
    manualTakeoverAt: Date,                             // Quando è iniziata la gestione manuale
    lastBotResponse: Date,                              // Ultima risposta automatica del bot
    manualResponsesCount: { type: Number, default: 0 }  // Contatore risposte manuali
},
  
  // Timing
  startTime: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now },
  endTime: Date,
  totalDuration: Number, // in minuti
  
  // Statistiche conversazione
  stats: {
    totalMessages: { type: Number, default: 0 },
    userMessages: { type: Number, default: 0 },
    botMessages: { type: Number, default: 0 },
    avgResponseTime: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 }
  },
  
  // Dati raccolti durante la conversazione
  datiRaccolti: {
    nome: String,
    email: String,
    data: String,
    ora: String,
    sitoWeb: String,
    paginaFacebook: String,
    note: String
  },
  
  // Risultato finale
  risultato: {
    type: String,
    enum: ['appointment_booked', 'lead_qualified', 'not_interested', 'incomplete', 'error'],
    default: 'incomplete'
  },
  
  appointmentSaved: { type: Boolean, default: false },
  appointmentId: String,
  
  // Classificazione e tags
  tags: [String],
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  // Metadati tecnici
  isProactive: { type: Boolean, default: false }, // NUOVO CAMPO
  sessionId: String,
  fingerprint: String,
  deviceInfo: Object,
  location: {
    city: String,
    region: String,
    country: String,
    ip: String
  },
  
  // Valutazione qualità
  quality: {
    score: { type: Number, min: 1, max: 5 },
    feedback: String,
    reviewedBy: String,
    reviewedAt: Date
  },
  
  // Audit trail
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: String, default: 'WhatsApp Bot' }, // Aggiorna questo campo
  version: { type: Number, default: 1 }
});

// Indici per performance
ChatConversationSchema.index({ 'cliente.telefono': 1 });
ChatConversationSchema.index({ 'cliente.normalizedNumber': 1 });
ChatConversationSchema.index({ status: 1, lastActivity: -1 });
ChatConversationSchema.index({ startTime: -1 });
ChatConversationSchema.index({ risultato: 1 });

ChatMessageSchema.index({ conversationId: 1, timestamp: 1 });
ChatMessageSchema.index({ role: 1, timestamp: -1 });

// Pre-save middleware per aggiornare updatedAt
ChatConversationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

console.log('📱 [WHATSAPP] Schemi Chat definiti nel server principale');

const registerChatModels = (connection) => {
  if (!connection.models['ChatMessage']) {
    connection.model('ChatMessage', ChatMessageSchema);
  }
  if (!connection.models['ChatConversation']) {
    connection.model('ChatConversation', ChatConversationSchema);
  }
};


// ============================================
// ENDPOINT API PER CHAT DATABASE
// ============================================

// ========== CHAT DATABASE ENDPOINTS ==========

app.post('/api/whatsapp/pause-bot/:conversationId', async (req, res) => {
  try {
      const { conversationId } = req.params;
      const { reason } = req.body;
      const username = req.session.user.username;
      
      if (!conversationId) {
          return res.status(400).json({
              success: false,
              message: 'ID conversazione richiesto'
          });
      }

      // Ottieni la connessione utente
      const connection = await getUserConnection(req);
      
      if (!connection) {
          return res.status(503).json({
              success: false,
              message: 'Database non disponibile'
          });
      }

      registerChatModels(connection);
      const ChatConversation = connection.model('ChatConversation');

      // Aggiorna la conversazione
      const updatedConversation = await ChatConversation.findOneAndUpdate(
          { conversationId },
          {
              $set: {
                  'botControl.isPaused': true,
                  'botControl.pausedAt': new Date(),
                  'botControl.pausedBy': username,
                  'botControl.pauseReason': reason || 'Gestione manuale',
                  'botControl.manualTakeoverAt': new Date(),
                  lastActivity: new Date(),
                  updatedAt: new Date()
              }
          },
          { new: true }
      );

      if (!updatedConversation) {
          return res.status(404).json({
              success: false,
              message: 'Conversazione non trovata'
          });
      }

      console.log(`⏸️ [BOT CONTROL] Bot messo in pausa per ${conversationId} da ${username}`);

      res.json({
          success: true,
          message: 'Bot messo in pausa per questa conversazione',
          data: {
              conversationId,
              pausedBy: username,
              pausedAt: new Date(),
              reason: reason || 'Gestione manuale'
          }
      });

  } catch (error) {
      console.error('❌ [BOT CONTROL] Errore pausa bot:', error);
      res.status(500).json({
          success: false,
          message: 'Errore nel mettere in pausa il bot',
          error: error.message
      });
  }
});

// Endpoint per riattivare il bot per una conversazione specifica
app.post('/api/whatsapp/resume-bot/:conversationId', async (req, res) => {
  try {
      const { conversationId } = req.params;
      const username = req.session.user.username;
      
      if (!conversationId) {
          return res.status(400).json({
              success: false,
              message: 'ID conversazione richiesto'
          });
      }

      // Ottieni la connessione utente
      const connection = await getUserConnection(req);
      
      if (!connection) {
          return res.status(503).json({
              success: false,
              message: 'Database non disponibile'
          });
      }

      registerChatModels(connection);
      const ChatConversation = connection.model('ChatConversation');

      // Aggiorna la conversazione
      const updatedConversation = await ChatConversation.findOneAndUpdate(
          { conversationId },
          {
              $set: {
                  'botControl.isPaused': false,
                  'botControl.resumedAt': new Date(),
                  'botControl.resumedBy': username,
                  lastActivity: new Date(),
                  updatedAt: new Date()
              }
          },
          { new: true }
      );

      if (!updatedConversation) {
          return res.status(404).json({
              success: false,
              message: 'Conversazione non trovata'
          });
      }

      console.log(`▶️ [BOT CONTROL] Bot riattivato per ${conversationId} da ${username}`);

      res.json({
          success: true,
          message: 'Bot riattivato per questa conversazione',
          data: {
              conversationId,
              resumedBy: username,
              resumedAt: new Date()
          }
      });

  } catch (error) {
      console.error('❌ [BOT CONTROL] Errore riattivazione bot:', error);
      res.status(500).json({
          success: false,
          message: 'Errore nel riattivare il bot',
          error: error.message
      });
  }
});

// Endpoint per ottenere lo stato del bot per una conversazione
app.get('/api/whatsapp/bot-status/:conversationId', async (req, res) => {
  try {
      const { conversationId } = req.params;
      
      // Ottieni la connessione utente
      const connection = await getUserConnection(req);
      
      if (!connection) {
          return res.status(503).json({
              success: false,
              message: 'Database non disponibile'
          });
      }

      registerChatModels(connection);
      const ChatConversation = connection.model('ChatConversation');

      const conversation = await ChatConversation.findOne({ conversationId });

      if (!conversation) {
          return res.status(404).json({
              success: false,
              message: 'Conversazione non trovata'
          });
      }

      res.json({
          success: true,
          data: {
              conversationId,
              botControl: conversation.botControl || {
                  isPaused: false,
                  pausedAt: null,
                  pausedBy: null,
                  resumedAt: null,
                  resumedBy: null
              }
          }
      });

  } catch (error) {
      console.error('❌ [BOT CONTROL] Errore stato bot:', error);
      res.status(500).json({
          success: false,
          message: 'Errore nel recupero dello stato bot',
          error: error.message
      });
  }
});

// 3. AGGIUNGI funzione helper per tracciare risposta manuale
async function trackManualResponse(conversationId, username, connection) {
  try {
      registerChatModels(connection);
      const ChatConversation = connection.model('ChatConversation');

      await ChatConversation.updateOne(
          { conversationId },
          {
              $inc: { 'botControl.manualResponsesCount': 1 },
              $set: {
                  'botControl.lastManualResponse': new Date(),
                  'botControl.lastManualResponseBy': username,
                  lastActivity: new Date(),
                  updatedAt: new Date()
              }
          }
      );

      console.log(`✋ [BOT CONTROL] Risposta manuale tracciata per ${conversationId} da ${username}`);
  } catch (error) {
      console.error('❌ [BOT CONTROL] Errore tracking risposta manuale:', error);
  }
}

// 1. Ottieni statistiche generali delle chat
app.get('/api/chat/stats', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(503).json({
        status: 'error',
        message: 'Database non disponibile o non configurato correttamente'
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    const ChatConversation = connection.model('ChatConversation');
    const ChatMessage = connection.model('ChatMessage');

    // Calcola statistiche database
    const dbStats = await getWhatsAppStats(req);

    res.json({
      status: 'success',
      data: {
        database: dbStats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[CHAT API] Errore recupero statistiche:', error);
    res.status(500).json({
      status: 'error',
      message: 'Errore nel recupero delle statistiche',
      error: error.message
    });
  }
});

// 2. Lista conversazioni recenti
app.get('/api/chat/conversations', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(503).json({
        status: 'error',
        message: 'Database non disponibile o non configurato correttamente'
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    const ChatConversation = connection.model('ChatConversation');

    const { 
      limit = 50, 
      status = null, 
      page = 1,
      phone = null,
      from = null,
      to = null 
    } = req.query;

    let query = {};
    
    // Filtri
    if (status) query.status = status;
    if (phone) {
      query.$or = [
        { 'cliente.telefono': phone },
        { 'cliente.whatsappNumber': phone },
        { 'cliente.normalizedNumber': phone }
      ];
    }
    if (from || to) {
      query.startTime = {};
      if (from) query.startTime.$gte = new Date(from);
      if (to) query.startTime.$lte = new Date(to);
    }

    // Paginazione
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [conversations, total] = await Promise.all([
      ChatConversation.find(query)
        .sort({ lastActivity: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      ChatConversation.countDocuments(query)
    ]);

    res.json({
      status: 'success',
      data: {
        conversations,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          hasMore: (skip + conversations.length) < total
        }
      }
    });
  } catch (error) {
    console.error('[CHAT API] Errore recupero conversazioni:', error);
    res.status(500).json({
      status: 'error',
      message: 'Errore nel recupero delle conversazioni',
      error: error.message
    });
  }
});

// 3. Ottieni conversazione specifica con tutti i messaggi
app.get('/api/chat/conversations/:conversationId', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(503).json({
        status: 'error',
        message: 'Database non disponibile o non configurato correttamente'
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    const ChatConversation = connection.model('ChatConversation');
    const ChatMessage = connection.model('ChatMessage');

    const { conversationId } = req.params;
    const { includeMetadata = false } = req.query;

    // Recupera conversazione e messaggi in parallelo
    const [conversation, messages] = await Promise.all([
      ChatConversation.findOne({ conversationId }).lean(),
      ChatMessage.find({ conversationId })
        .sort({ timestamp: 1 })
        .lean()
    ]);
    
    if (!conversation) {
      return res.status(404).json({
        status: 'error',
        message: 'Conversazione non trovata'
      });
    }

    // Filtra metadata se richiesto
    let processedMessages = messages;
    if (!includeMetadata) {
      processedMessages = messages.map(msg => ({
        messageId: msg.messageId,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        aiGenerated: msg.aiGenerated,
        delivered: msg.delivered,
        responseTime: msg.responseTime
      }));
    }

    res.json({
      status: 'success',
      data: {
        conversation,
        messages: processedMessages,
        summary: {
          totalMessages: messages.length,
          userMessages: messages.filter(m => m.role === 'user').length,
          botMessages: messages.filter(m => m.role === 'assistant').length,
          avgResponseTime: conversation.stats?.avgResponseTime || 0,
          duration: conversation.totalDuration || 0
        }
      }
    });
  } catch (error) {
    console.error('[CHAT API] Errore recupero conversazione:', error);
    res.status(500).json({
      status: 'error',
      message: 'Errore nel recupero della conversazione',
      error: error.message
    });
  }
});

// 4. Cerca conversazioni per cliente (numero di telefono)
app.get('/api/chat/customer/:phone', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(503).json({
        status: 'error',
        message: 'Database non disponibile o non configurato correttamente'
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    const ChatConversation = connection.model('ChatConversation');
    const ChatMessage = connection.model('ChatMessage');

    const { phone } = req.params;
    const { includeMessages = false } = req.query;

    // Cerca conversazioni per questo numero
    const conversations = await ChatConversation.find({
      $or: [
        { 'cliente.telefono': phone },
        { 'cliente.whatsappNumber': phone },
        { 'cliente.normalizedNumber': phone }
      ]
    }).sort({ startTime: -1 }).lean();
    
    if (conversations.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Nessuna conversazione trovata per questo numero'
      });
    }

    let result = conversations;

    // Se richiesto, includi anche i messaggi
    if (includeMessages === 'true') {
      result = await Promise.all(conversations.map(async (conv) => {
        const messages = await ChatMessage.find({ 
          conversationId: conv.conversationId 
        }).sort({ timestamp: 1 }).lean();
        
        return {
          ...conv,
          messages
        };
      }));
    }

    res.json({
      status: 'success',
      data: {
        customer: {
          phone,
          totalConversations: conversations.length,
          activeConversations: conversations.filter(c => c.status === 'active').length,
          completedConversations: conversations.filter(c => c.status === 'completed').length
        },
        conversations: result
      }
    });
  } catch (error) {
    console.error('[CHAT API] Errore ricerca cliente:', error);
    res.status(500).json({
      status: 'error',
      message: 'Errore nella ricerca del cliente',
      error: error.message
    });
  }
});

app.get('/api/chat/export/:conversationId', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(503).json({
        status: 'error',
        message: 'Database non disponibile o non configurato correttamente'
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    const ChatConversation = connection.model('ChatConversation');
    const ChatMessage = connection.model('ChatMessage');

    const { conversationId } = req.params;
    const { format = 'json' } = req.query;

    // Recupera conversazione e messaggi
    const [conversation, messages] = await Promise.all([
      ChatConversation.findOne({ conversationId }).lean(),
      ChatMessage.find({ conversationId }).sort({ timestamp: 1 }).lean()
    ]);
    
    if (!conversation) {
      return res.status(404).json({
        status: 'error',
        message: 'Conversazione non trovata per esportazione'
      });
    }

    const exportData = {
      conversation,
      messages,
      exportedAt: new Date(),
      exportVersion: '1.0'
    };

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="conversation_${conversationId}.json"`);
      res.json(exportData);
    } else if (format === 'txt') {
      // Formato testo semplice
      let textContent = `CONVERSAZIONE: ${conversationId}\n`;
      textContent += `ESPORTATA: ${exportData.exportedAt}\n`;
      textContent += `CLIENTE: ${conversation.cliente.nome || conversation.cliente.contactName}\n`;
      textContent += `TELEFONO: ${conversation.cliente.telefono}\n`;
      textContent += `STATO: ${conversation.status}\n`;
      textContent += `DURATA: ${conversation.totalDuration || 0} minuti\n`;
      textContent += `\n${'='.repeat(50)}\n\n`;

      messages.forEach(msg => {
        const timestamp = new Date(msg.timestamp).toLocaleString('it-IT');
        const speaker = msg.role === 'user' ? 'CLIENTE' : 'BOT';
        textContent += `[${timestamp}] ${speaker}: ${msg.content}\n\n`;
      });

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="conversation_${conversationId}.txt"`);
      res.send(textContent);
    } else {
      res.status(400).json({
        status: 'error',
        message: 'Formato non supportato. Usa "json" o "txt"'
      });
    }
  } catch (error) {
    console.error('[CHAT API] Errore esportazione:', error);
    res.status(500).json({
      status: 'error',
      message: 'Errore nell\'esportazione della conversazione',
      error: error.message
    });
  }
});

// 6. Aggiorna stato conversazione
app.patch('/api/chat/conversations/:conversationId', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(503).json({
        status: 'error',
        message: 'Database non disponibile o non configurato correttamente'
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    const ChatConversation = connection.model('ChatConversation');

    const { conversationId } = req.params;
    const allowedFields = ['status', 'priority', 'tags', 'quality'];
    
    const updateData = {};
    Object.keys(req.body).forEach(key => {
      if (allowedFields.includes(key)) {
        updateData[key] = req.body[key];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Nessun campo valido da aggiornare'
      });
    }

    const updatedConversation = await ChatConversation.findOneAndUpdate(
      { conversationId },
      { 
        $set: {
          ...updateData,
          lastActivity: new Date(),
          updatedAt: new Date()
        }
      },
      { new: true, runValidators: true }
    );

    if (!updatedConversation) {
      return res.status(404).json({
        status: 'error',
        message: 'Conversazione non trovata'
      });
    }

    res.json({
      status: 'success',
      message: 'Conversazione aggiornata con successo',
      data: updatedConversation
    });
  } catch (error) {
    console.error('[CHAT API] Errore aggiornamento conversazione:', error);
    res.status(500).json({
      status: 'error',
      message: 'Errore nell\'aggiornamento della conversazione',
      error: error.message
    });
  }
});

// 7. Dashboard overview per amministratori
app.get('/api/chat/dashboard', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(503).json({
        status: 'error',
        message: 'Database non disponibile o non configurato correttamente'
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    const ChatConversation = connection.model('ChatConversation');

    const { period = '7d' } = req.query;
    
    // Calcola date per il periodo
    const now = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '24h':
        startDate.setDate(now.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // Statistiche del periodo e generali
    const [recentConversations, generalStats] = await Promise.all([
      ChatConversation.find({
        startTime: { $gte: startDate }
      }).sort({ startTime: -1 }).lean(),
      
      // USA LA FUNZIONE ESISTENTE invece dell'aggregazione manuale
      getWhatsAppStats(req)
    ]);

    // Metriche del periodo
    const periodMetrics = {
      totalConversations: recentConversations.length,
      completedConversations: recentConversations.filter(c => c.status === 'completed').length,
      activeConversations: recentConversations.filter(c => c.status === 'active').length,
      avgDuration: recentConversations.reduce((sum, c) => sum + (c.totalDuration || 0), 0) / (recentConversations.length || 1),
      conversionRate: recentConversations.length > 0 
        ? (recentConversations.filter(c => c.risultato === 'appointment_booked').length / recentConversations.length * 100) 
        : 0
    };

    // Top 5 conversazioni più lunghe del periodo
    const topConversations = recentConversations
      .sort((a, b) => (b.totalDuration || 0) - (a.totalDuration || 0))
      .slice(0, 5)
      .map(conv => ({
        conversationId: conv.conversationId,
        cliente: conv.cliente.nome || conv.cliente.contactName,
        telefono: conv.cliente.telefono,
        durata: conv.totalDuration,
        status: conv.status,
        risultato: conv.risultato
      }));

    // USA LE FUNZIONI ESISTENTI per health score e raccomandazioni
    const healthScore = calculateHealthScore(periodMetrics, generalStats);
    const recommendations = generateRecommendations(periodMetrics, generalStats);

    res.json({
      status: 'success',
      data: {
        period: {
          from: startDate.toISOString(),
          to: now.toISOString(),
          label: period
        },
        generalStats, // Ora usa il risultato di getWhatsAppStats()
        periodMetrics,
        topConversations,
        // AGGIUNGI LA SEZIONE SUMMARY con le funzioni esistenti
        summary: {
          healthScore,
          recommendations
        }
      }
    });
  } catch (error) {
    console.error('[CHAT API] Errore dashboard:', error);
    res.status(500).json({
      status: 'error',
      message: 'Errore nel recupero dei dati dashboard',
      error: error.message
    });
  }
});

app.post('/api/chat/cleanup', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(503).json({
        status: 'error',
        message: 'Database non disponibile o non configurato correttamente'
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    const ChatConversation = connection.model('ChatConversation');

    const { daysOld = 30, dryRun = false } = req.body;

    console.log(`🧹 [CLEANUP] Avvio cleanup - ${daysOld} giorni, dryRun: ${dryRun}`);

    // Calcola data di cutoff
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysOld));
    
    console.log(`🧹 [CLEANUP] Data cutoff: ${cutoffDate.toISOString()}`);

    if (dryRun) {
      // Simula il cleanup senza effettuarlo
      console.log('🧹 [CLEANUP] Modalità DRY RUN - nessuna modifica effettuata');
      
      const toArchive = await ChatConversation.find({
        lastActivity: { $lt: cutoffDate },
        status: { $in: ['abandoned', 'completed'] }
      }).lean();

      console.log(`🧹 [CLEANUP] Trovate ${toArchive.length} conversazioni da archiviare`);

      // Preview delle prime 10 conversazioni
      const preview = toArchive.slice(0, 10).map(conv => ({
        conversationId: conv.conversationId,
        lastActivity: conv.lastActivity,
        status: conv.status,
        cliente: conv.cliente?.nome || conv.cliente?.contactName || 'Sconosciuto',
        telefono: conv.cliente?.telefono || 'N/A',
        daysSinceLastActivity: Math.floor((Date.now() - new Date(conv.lastActivity).getTime()) / (1000 * 60 * 60 * 24))
      }));

      res.json({
        status: 'success',
        message: 'Simulazione cleanup completata',
        data: {
          conversationsToArchive: toArchive.length,
          daysOld: parseInt(daysOld),
          cutoffDate: cutoffDate.toISOString(),
          executed: false,
          preview,
          summary: {
            abandoned: toArchive.filter(c => c.status === 'abandoned').length,
            completed: toArchive.filter(c => c.status === 'completed').length
          }
        }
      });
    } else {
      // Esegui il cleanup reale
      console.log('🧹 [CLEANUP] Esecuzione cleanup reale...');
      
      // Prima conta quante ne troverà
      const countToArchive = await ChatConversation.countDocuments({
        lastActivity: { $lt: cutoffDate },
        status: { $in: ['abandoned', 'completed'] }
      });

      console.log(`🧹 [CLEANUP] ${countToArchive} conversazioni da archiviare`);

      if (countToArchive === 0) {
        return res.json({
          status: 'success',
          message: 'Nessuna conversazione da archiviare',
          data: {
            archivedConversations: 0,
            daysOld: parseInt(daysOld),
            cutoffDate: cutoffDate.toISOString(),
            executed: true
          }
        });
      }

      // Esegui l'aggiornamento
      const result = await ChatConversation.updateMany(
        {
          lastActivity: { $lt: cutoffDate },
          status: { $in: ['abandoned', 'completed'] }
        },
        {
          $set: { 
            status: 'archived',
            updatedAt: new Date()
          }
        }
      );

      console.log(`🧹 [CLEANUP] Cleanup completato: ${result.modifiedCount} conversazioni archiviate`);
      
      res.json({
        status: 'success',
        message: 'Cleanup completato con successo',
        data: {
          archivedConversations: result.modifiedCount || 0,
          matchedConversations: result.matchedCount || 0,
          daysOld: parseInt(daysOld),
          cutoffDate: cutoffDate.toISOString(),
          executed: true
        }
      });
    }
  } catch (error) {
    console.error('❌ [CLEANUP] Errore durante il cleanup:', error);
    res.status(500).json({
      status: 'error',
      message: 'Errore durante il cleanup',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ========== FUNZIONI HELPER ==========

function calculateHealthScore(botStats, generalStats) {
  let score = 100;
  
  // Penalizza per errori
  if (botStats.erroriAI > 0) {
    score -= Math.min(20, botStats.erroriAI * 2);
  }
  
  if (botStats.database && botStats.database.erroriDB > 0) {
    score -= Math.min(15, botStats.database.erroriDB * 3);
  }
  
  // Premia per conversion rate alto
  if (botStats.conversionRate > 50) {
    score += 10;
  } else if (botStats.conversionRate < 20) {
    score -= 10;
  }
  
  // Premia per success rate alto
  if (botStats.successRate > 95) {
    score += 5;
  } else if (botStats.successRate < 80) {
    score -= 15;
  }
  
  return Math.max(0, Math.min(100, score));
}

function generateRecommendations(periodMetrics, botStats) {
  const recommendations = [];
  
  if (periodMetrics.conversionRate < 30) {
    recommendations.push({
      type: 'warning',
      message: 'Tasso di conversione basso. Considera di ottimizzare i prompt del bot.',
      priority: 'high'
    });
  }
  
  if (botStats.erroriAI > 5) {
    recommendations.push({
      type: 'error',
      message: 'Troppi errori AI rilevati. Verifica la configurazione di Claude.',
      priority: 'critical'
    });
  }
  
  if (botStats.tempoRispostaMediaMs > 5000) {
    recommendations.push({
      type: 'info',
      message: 'Tempi di risposta elevati. Considera di ottimizzare le chiamate API.',
      priority: 'medium'
    });
  }
  
  if (periodMetrics.activeConversations > periodMetrics.completedConversations * 2) {
    recommendations.push({
      type: 'warning',
      message: 'Molte conversazioni attive non completate. Verifica il follow-up.',
      priority: 'medium'
    });
  }
  
  return recommendations;
}

// ===== ENDPOINT WHATSAPP BUSINESS API =====

// Endpoint per iniziare una nuova conversazione
app.post('/api/whatsapp/start-conversation', async (req, res) => {
  try {
    const { phone, name } = req.body;
    
    if (!phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Numero di telefono richiesto' 
      });
    }

    // Ottieni configurazione utente
    const username = req.session.user.username;
    const userConfig = await getUserConfig(username);
    
    if (!userConfig.whatsapp_access_token || !userConfig.whatsapp_phone_number_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Configurazione WhatsApp mancante nelle impostazioni utente' 
      });
    }

    // Ottieni la connessione utente per il database chat
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(503).json({
        success: false,
        message: 'Database non disponibile o non configurato correttamente'
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    const ChatConversation = connection.model('ChatConversation');
    const ChatMessage = connection.model('ChatMessage');

    // Normalizza il numero di telefono
    let normalizedPhone = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
    
    // Controlla se esiste già una conversazione attiva con questo numero
    const existingConversation = await ChatConversation.findOne({
      $or: [
        { 'cliente.telefono': phone },
        { 'cliente.telefono': normalizedPhone },
        { 'cliente.whatsappNumber': phone },
        { 'cliente.whatsappNumber': normalizedPhone },
        { 'cliente.normalizedNumber': normalizedPhone }
      ],
      status: { $in: ['active', 'completed'] } // Non includere quelle abbandonate o bloccate
    }).sort({ lastActivity: -1 });

    let conversation;
    let messages = [];

    if (existingConversation) {
      // Se esiste già una conversazione, restituiscila
      conversation = existingConversation;
      
      // Recupera i messaggi esistenti
      messages = await ChatMessage.find({ 
        conversationId: existingConversation.conversationId 
      }).sort({ timestamp: 1 }).lean();
      
      console.log(`📱 [WHATSAPP] Conversazione esistente trovata: ${conversation.conversationId}`);
    } else {
      // Crea una nuova conversazione
      const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      conversation = new ChatConversation({
        conversationId,
        cliente: {
          nome: name || 'Nuovo Contatto',
          telefono: phone,
          whatsappNumber: normalizedPhone,
          normalizedNumber: normalizedPhone,
          contactName: name || 'Nuovo Contatto'
        },
        status: 'active',
        startTime: new Date(),
        lastActivity: new Date(),
        stats: {
          totalMessages: 0,
          userMessages: 0,
          botMessages: 0,
          avgResponseTime: 0,
          completionRate: 0
        },
        isProactive: true, // Segnala che è una conversazione iniziata proattivamente
        tags: ['manual_start'],
        priority: 'medium'
      });
      
      await conversation.save();
      
      console.log(`📱 [WHATSAPP] Nuova conversazione creata: ${conversationId} per ${phone}`);
      
      // Crea un messaggio di sistema per indicare l'inizio della conversazione
      const systemMessage = new ChatMessage({
        messageId: `system_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        conversationId,
        role: 'system',
        content: `Conversazione iniziata con ${name || phone}`,
        timestamp: new Date(),
        isFirstContact: true,
        metadata: {
          initiatedBy: username,
          type: 'conversation_start'
        }
      });
      
      await systemMessage.save();
      messages = [systemMessage];
    }

    // Prepara la risposta nel formato ConversationDetails
    const response = {
      conversation: conversation.toObject(),
      messages: messages,
      summary: {
        totalMessages: messages.length,
        userMessages: messages.filter(m => m.role === 'user').length,
        botMessages: messages.filter(m => m.role === 'assistant').length,
        avgResponseTime: conversation.stats?.avgResponseTime || 0,
        duration: conversation.totalDuration || 0
      }
    };

    res.json({
      success: true,
      message: existingConversation ? 'Conversazione esistente recuperata' : 'Nuova conversazione creata',
      data: response
    });

  } catch (error) {
    console.error('❌ [WHATSAPP] Errore nella creazione della conversazione:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Errore nella creazione della conversazione',
      error: error.message
    });
  }
});

app.post('/api/whatsapp/send-message', async (req, res) => {
  try {
    const { to, message, conversationId } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Numero destinatario e messaggio sono richiesti' 
      });
    }

    // Ottieni configurazione utente
    const username = req.session.user.username;
    const userConfig = await getUserConfig(username);
    
    if (!userConfig.whatsapp_access_token || !userConfig.whatsapp_phone_number_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Configurazione WhatsApp mancante nelle impostazioni utente' 
      });
    }

    // Sanifica messaggio
    const sanitizedMessage = message
      .replace(/[\u2000-\u200F\u2028-\u202F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 4096);

    // Payload per Graph API v22.0
    const payload = {
      messaging_product: 'whatsapp',
      to: to,
      text: { body: sanitizedMessage }
    };

    // Invia messaggio tramite Graph API
    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${userConfig.whatsapp_phone_number_id}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${userConfig.whatsapp_access_token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log(`📤 [WHATSAPP API] Messaggio MANUALE inviato a ${to}: "${sanitizedMessage}" da ${username}`);
    
    // Salva messaggio nel database chat se disponibile
    if (conversationId) {
      try {
        const connection = await getUserConnection(req);
        
        if (connection) {
          registerChatModels(connection);
          const ChatMessage = connection.model('ChatMessage');
          const ChatConversation = connection.model('ChatConversation');
          
          // Salva il messaggio
          await ChatMessage.create({
            messageId: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            conversationId,
            role: 'assistant',
            content: sanitizedMessage,
            timestamp: new Date(),
            delivered: true,
            whatsappMessageId: response.data.messages?.[0]?.id,
            aiGenerated: false,  // IMPORTANTE: Non è generato dall'AI
            metadata: {
              sentBy: username,
              sentManually: true,
              isManualResponse: true  // NUOVO: Flag per risposta manuale
            }
          });
          
          // NUOVO: Traccia risposta manuale e aggiorna controlli bot
          await trackManualResponse(conversationId, username, connection);
          
          // NUOVO: Se il bot non era già in pausa, mettilo automaticamente in pausa
          // per evitare conflitti tra risposte manuali e automatiche
          const conversation = await ChatConversation.findOne({ conversationId });
          if (conversation && !conversation.botControl?.isPaused) {
            await ChatConversation.updateOne(
              { conversationId },
              {
                $set: {
                  'botControl.isPaused': true,
                  'botControl.pausedAt': new Date(),
                  'botControl.pausedBy': username,
                  'botControl.pauseReason': 'Auto-pausa per risposta manuale',
                  'botControl.manualTakeoverAt': new Date(),
                  lastActivity: new Date(),
                  updatedAt: new Date()
                }
              }
            );
            
            console.log(`⏸️ [WHATSAPP API] Bot auto-messo in pausa per conversazione ${conversationId} (risposta manuale)`);
          }
          
          console.log(`💾 [WHATSAPP API] Messaggio manuale salvato nel database per conversazione: ${conversationId}`);
        }
      } catch (dbError) {
        console.error('❌ [WHATSAPP API] Errore salvataggio messaggio manuale nel DB:', dbError);
      }
    }

    res.json({
      success: true,
      message: 'Messaggio manuale inviato con successo',
      messageId: response.data.messages?.[0]?.id,
      data: response.data,
      manualResponse: true  // NUOVO: Flag per identificare risposta manuale
    });

  } catch (error) {
    console.error('❌ [WHATSAPP API] Errore invio messaggio manuale:', error);
    
    let errorMessage = 'Errore nell\'invio del messaggio';
    let errorCode = 500;
    
    if (error.response?.data?.error) {
      const apiError = error.response.data.error;
      errorMessage = apiError.message || errorMessage;
      
      if (apiError.code === 131026) {
        errorMessage = 'Numero non registrato su WhatsApp';
        errorCode = 400;
      } else if (apiError.code === 100) {
        errorMessage = 'Token di accesso non valido';
        errorCode = 401;
      }
    }

    res.status(errorCode).json({ 
      success: false, 
      message: errorMessage,
      error: error.response?.data || error.message
    });
  }
});

// 7. IMPLEMENTA funzione trackManualResponse (da aggiungere dopo gli altri endpoint)

async function trackManualResponse(conversationId, username, connection) {
    try {
        registerChatModels(connection);
        const ChatConversation = connection.model('ChatConversation');

        const result = await ChatConversation.updateOne(
            { conversationId },
            {
                $inc: { 'botControl.manualResponsesCount': 1 },
                $set: {
                    'botControl.lastManualResponse': new Date(),
                    'botControl.lastManualResponseBy': username,
                    lastActivity: new Date(),
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount > 0) {
            console.log(`✋ [BOT CONTROL] Risposta manuale tracciata per ${conversationId} da ${username}`);
        } else {
            console.warn(`⚠️ [BOT CONTROL] Conversazione ${conversationId} non trovata per tracking`);
        }
    } catch (error) {
        console.error('❌ [BOT CONTROL] Errore tracking risposta manuale:', error);
    }
}

// 8. AGGIUNGI endpoint per ottenere statistiche controllo bot

app.get('/api/whatsapp/bot-control-stats', async (req, res) => {
    try {
        // Ottieni la connessione utente
        const connection = await getUserConnection(req);
        
        if (!connection) {
            return res.status(503).json({
                success: false,
                message: 'Database non disponibile'
            });
        }

        registerChatModels(connection);
        const ChatConversation = connection.model('ChatConversation');

        // Statistiche aggregate
        const stats = await ChatConversation.aggregate([
            {
                $group: {
                    _id: null,
                    totalConversations: { $sum: 1 },
                    pausedConversations: {
                        $sum: { $cond: [{ $eq: ['$botControl.isPaused', true] }, 1, 0] }
                    },
                    manualTakeovers: {
                        $sum: { $cond: [{ $gt: ['$botControl.manualResponsesCount', 0] }, 1, 0] }
                    },
                    totalManualResponses: { $sum: '$botControl.manualResponsesCount' },
                    avgManualResponses: { $avg: '$botControl.manualResponsesCount' }
                }
            }
        ]);

        // Lista conversazioni in pausa
        const pausedConversations = await ChatConversation.find({
            'botControl.isPaused': true,
            status: 'active'
        }).select('conversationId cliente.nome cliente.telefono botControl').limit(10);

        const result = stats[0] || {
            totalConversations: 0,
            pausedConversations: 0,
            manualTakeovers: 0,
            totalManualResponses: 0,
            avgManualResponses: 0
        };

        res.json({
            success: true,
            data: {
                ...result,
                pausedConversations: pausedConversations.map(conv => ({
                    conversationId: conv.conversationId,
                    clientName: conv.cliente?.nome || 'Sconosciuto',
                    phone: conv.cliente?.telefono,
                    pausedBy: conv.botControl?.pausedBy,
                    pausedAt: conv.botControl?.pausedAt,
                    reason: conv.botControl?.pauseReason
                }))
            }
        });

    } catch (error) {
        console.error('❌ [BOT CONTROL] Errore statistiche controllo bot:', error);
        res.status(500).json({
            success: false,
            message: 'Errore nel recupero delle statistiche',
            error: error.message
        });
    }
});

// Endpoint per ottenere il profilo WhatsApp Business
app.get('/api/whatsapp/profile', async (req, res) => {
  try {
    // Verifica autenticazione
    if (!req.session || !req.session.isAuthenticated) {
      return res.status(401).json({ 
        success: false, 
        message: 'Non autorizzato' 
      });
    }

    // Ottieni configurazione utente
    const username = req.session.user.username;
    const userConfig = await getUserConfig(username);
    
    if (!userConfig.whatsapp_access_token || !userConfig.whatsapp_phone_number_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Configurazione WhatsApp mancante' 
      });
    }

    // Ottieni info account WhatsApp Business
    const response = await axios.get(
      `https://graph.facebook.com/v22.0/${userConfig.whatsapp_phone_number_id}`,
      {
        headers: {
          'Authorization': `Bearer ${userConfig.whatsapp_access_token}`
        },
        timeout: 10000
      }
    );

    res.json({
      success: true,
      data: {
        phone_number: response.data.display_phone_number,
        verified_name: response.data.verified_name,
        name: response.data.name,
        id: response.data.id,
        status: 'connected'
      }
    });

  } catch (error) {
    console.error('❌ [WHATSAPP API] Errore recupero profilo:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero del profilo WhatsApp',
      error: error.response?.data || error.message
    });
  }
});

// Endpoint per testare la connessione WhatsApp
app.get('/api/whatsapp/test-connection', async (req, res) => {
  try {
    const username = req.session.user.username;
    const userConfig = await getUserConfig(username);
    
    if (!userConfig.whatsapp_access_token || !userConfig.whatsapp_phone_number_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Configurazione WhatsApp mancante. Configura WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID nelle impostazioni.' 
      });
    }

    // Test connessione
    const response = await axios.get(
      `https://graph.facebook.com/v22.0/${userConfig.whatsapp_phone_number_id}`,
      {
        headers: {
          'Authorization': `Bearer ${userConfig.whatsapp_access_token}`
        },
        timeout: 10000
      }
    );

    console.log('✅ [WHATSAPP API] Test connessione riuscito');
    
    res.json({
      success: true,
      message: 'Connessione WhatsApp Business API attiva',
      data: {
        phone_number: response.data.display_phone_number,
        verified_name: response.data.verified_name,
        account_name: response.data.name,
        status: 'connected'
      }
    });

  } catch (error) {
    console.error('❌ [WHATSAPP API] Test connessione fallito:', error);
    
    let errorMessage = 'Connessione WhatsApp Business API fallita';
    let suggestion = '';

    if (error.response?.data?.error) {
      const apiError = error.response.data.error;
      errorMessage = apiError.message;
      
      if (apiError.code === 100) {
        suggestion = 'Verifica WHATSAPP_ACCESS_TOKEN nelle impostazioni';
      } else if (apiError.code === 190) {
        suggestion = 'Token scaduto o non valido';
      }
    }

    res.status(400).json({ 
      success: false, 
      message: errorMessage,
      suggestion: suggestion,
      error: error.response?.data || error.message
    });
  }
});

// Endpoint per ottenere statistiche WhatsApp
app.get('/api/whatsapp/stats', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.json({
        success: true,
        data: {
          totalConversations: 0,
          activeConversations: 0,
          completedConversations: 0,
          totalMessages: 0,
          avgResponseTime: 0,
          conversionRate: 0
        }
      });
    }

    // Registra i modelli chat
    registerChatModels(connection);
    
    const ChatConversation = connection.model('ChatConversation');
    const ChatMessage = connection.model('ChatMessage');
    
    // Calcola statistiche
    const stats = await getWhatsAppStats(req);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ [WHATSAPP API] Errore recupero statistiche:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero delle statistiche WhatsApp' 
    });
  }
});

console.log('✅ [WHATSAPP] Endpoint configurati per accesso diretto al database');

// Funzione helper per ottenere statistiche WhatsApp
async function getWhatsAppStats(req) {
  try {
    // Ottieni la connessione utente per accedere al chat database
    const connection = await getUserConnection(req);
    
    if (!connection || !connection.models['ChatConversation']) {
      return {
        totalConversations: 0,
        activeConversations: 0,
        completedConversations: 0,
        totalMessages: 0,
        avgResponseTime: 0,
        conversionRate: 0
      };
    }

    const ChatConversation = connection.model('ChatConversation');
    const ChatMessage = connection.model('ChatMessage');
    
    // Calcola statistiche
    const totalConversations = await ChatConversation.countDocuments();
    const activeConversations = await ChatConversation.countDocuments({ status: 'active' });
    const completedConversations = await ChatConversation.countDocuments({ status: 'completed' });
    const totalMessages = await ChatMessage.countDocuments();
    
    // Calcola conversion rate
    const appointmentBookings = await ChatConversation.countDocuments({ 
      risultato: 'appointment_booked' 
    });
    const conversionRate = totalConversations > 0 ? 
      (appointmentBookings / totalConversations * 100) : 0;

    // Calcola tempo di risposta medio
    const avgResponseTimeResult = await ChatMessage.aggregate([
      { $match: { role: 'assistant', responseTime: { $exists: true, $gt: 0 } } },
      { $group: { _id: null, avgTime: { $avg: '$responseTime' } } }
    ]);
    
    const avgResponseTime = avgResponseTimeResult.length > 0 ? 
      Math.round(avgResponseTimeResult[0].avgTime) : 0;

    return {
      totalConversations,
      activeConversations,
      completedConversations,
      totalMessages,
      avgResponseTime,
      conversionRate: Math.round(conversionRate * 100) / 100
    };
    
  } catch (error) {
    console.error('❌ [WHATSAPP STATS] Errore calcolo statistiche:', error);
    return {
      totalConversations: 0,
      activeConversations: 0,
      completedConversations: 0,
      totalMessages: 0,
      avgResponseTime: 0,
      conversionRate: 0
    };
  }
}

// ========== FINE WHATSAPP ENDPOINTS ==========

// ----------------------------------------------------------------
// ENDPOINT RICERCA
// ----------------------------------------------------------------

// API for global search across multiple sections
app.get('/api/global-search', async (req, res) => {
  try {
    const { query, limit = 10 } = req.query;
    
    if (!query || typeof query !== 'string' || query.length < 2) {
      return res.status(400).json({ 
        success: false, 
        message: 'Search query must be at least 2 characters' 
      });
    }
    
    // Get the connection to the user's database
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database connection not available' 
      });
    }
    
    // Define search results array
    const searchResults = [];
    
    // Search in leads (contacts) - assuming Lead model exists in the connection
    if (connection.models['Lead']) {
      const Lead = connection.models['Lead'];
      
      // Create regex for case-insensitive search
      const searchRegex = new RegExp(query, 'i');
      
      // Search in name, email and phone fields
      const contactsFilter = {
        $or: [
          // Try firstName + lastName
          {
            $and: [
              { firstName: { $exists: true } },
              { lastName: { $exists: true } },
              {
                $expr: {
                  $regexMatch: {
                    input: { $concat: ["$firstName", " ", "$lastName"] },
                    regex: searchRegex
                  }
                }
              }
            ]
          },
          // Try name field
          { name: searchRegex },
          // Try email
          { email: searchRegex },
          // Try phone
          { phone: searchRegex }
        ]
      };
      
      // Execute the query with a limit
      const contacts = await Lead.find(contactsFilter)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit) || 5);
      
      // Format and add to results
      if (contacts.length > 0) {
        contacts.forEach(contact => {
          // Format the name - prioritize firstName + lastName, then name, then email
          const contactName = 
            (contact.firstName && contact.lastName) 
              ? `${contact.firstName} ${contact.lastName}`
              : contact.name || (contact.email ? contact.email.split('@')[0] : 'Contatto');
          
          searchResults.push({
            id: contact._id.toString(),
            leadId: contact.leadId,
            name: contactName,
            email: contact.email,
            phone: contact.phone,
            section: "Contatti",
            sectionPath: "/contacts",
            createdAt: contact.createdAt,
            type: contact.formType || 'contact'
          });
        });
      }
    }
    
    // Search in calendar events
    if (connection.models['CalendarEvent']) {
      const CalendarEvent = connection.models['CalendarEvent'];
      
      const searchRegex = new RegExp(query, 'i');
      const eventsFilter = {
        title: searchRegex
      };
      
      const events = await CalendarEvent.find(eventsFilter)
        .sort({ start: -1 })
        .limit(parseInt(limit) || 3);
      
      if (events.length > 0) {
        events.forEach(event => {
          searchResults.push({
            id: event._id.toString(),
            name: event.title,
            section: "Calendario",
            sectionPath: "/calendar",
            start: event.start,
            end: event.end,
            status: event.status,
            type: 'event'
          });
        });
      }
    }
    
    // Search in projects
    if (connection.models['Project']) {
      const Project = connection.models['Project'];
      
      const searchRegex = new RegExp(query, 'i');
      const projectsFilter = {
        $or: [
          { name: searchRegex },
          { client: searchRegex },
          { description: searchRegex }
        ]
      };
      
      const projects = await Project.find(projectsFilter)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit) || 3);
      
      if (projects.length > 0) {
        projects.forEach(project => {
          searchResults.push({
            id: project._id.toString(),
            name: project.name,
            description: project.description,
            section: "Progetti",
            sectionPath: "/projects",
            client: project.client,
            status: project.status,
            type: 'project'
          });
        });
      }
    }
    
    // Sort results by relevance (for now, prioritize name matches)
    searchResults.sort((a, b) => {
      const aNameMatch = a.name.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
      const bNameMatch = b.name.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
      
      return bNameMatch - aNameMatch;
    });
    
    // Return the combined results
    res.json({
      success: true,
      data: searchResults,
      query: query
    });
  } catch (error) {
    console.error('Error in global search:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error performing global search', 
      error: error.message 
    });
  }
});

// ----------------------------------------------------------------
// ENDPOINT CALENDARIO
// ----------------------------------------------------------------


// API per ottenere tutti gli eventi del calendario
app.get('/api/calendar/events', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Se il modello CalendarEvent non esiste nella connessione, crealo
    if (!connection.models['CalendarEvent']) {
      connection.model('CalendarEvent', CalendarEventSchema);
    }
    
    // Se il modello Booking non esiste nella connessione, crealo
    if (!connection.models['Booking']) {
      connection.model('Booking', BookingSchema);
    }
    
    const CalendarEvent = connection.model('CalendarEvent');
    const Booking = connection.model('Booking');
    
    // Filtri opzionali per date
    let eventFilter = {};
    let bookingFilter = {};
    
    if (req.query.startDate && req.query.endDate) {
      eventFilter.start = { 
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
      bookingFilter.bookingTimestamp = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }
    
    // Recupera eventi calendario e prenotazioni in parallelo
    const [calendarEvents, bookings] = await Promise.all([
      CalendarEvent.find(eventFilter).sort({ start: 1 }),
      Booking.find(bookingFilter).sort({ bookingTimestamp: 1 })
    ]);
    
    // Trasforma i booking in formato CalendarEvent
    const bookingEvents = bookings.map(booking => {
      const start = new Date(`${booking.bookingDate}T${booking.bookingTime}:00`);
      const end = new Date(start);
      end.setHours(start.getHours() + 1); // Durata default 1 ora
      
      return {
        id: booking._id.toString(),
        _id: booking._id,
        title: `${booking.name} - ${booking.service || 'Appuntamento'}`,
        start: start,
        end: end,
        status: booking.status || 'pending',
        eventType: 'appointment',
        description: [
          booking.message || `Appuntamento con ${booking.name}`,
          booking.website ? `Sito web: ${booking.website}` : null,
          booking.facebookPage ? `Facebook: ${booking.facebookPage}` : null,
          booking.businessInfo?.notes ? `Note business: ${booking.businessInfo.notes}` : null
        ].filter(Boolean).join('\n'),
        location: 'Ufficio',
        isBooking: true,
        bookingId: booking._id,
        customerName: booking.name,
        customerEmail: booking.email,
        customerPhone: booking.phone,
        service: booking.service,
        source: booking.source,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt || booking.createdAt
      };
    });
    
    // Combina eventi calendario e prenotazioni
    const allEvents = [...calendarEvents, ...bookingEvents];
    
    // Ordina per data di inizio
    allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    
    res.json({
      success: true,
      data: allEvents
    });
  } catch (error) {
    console.error("Errore nel recupero degli eventi del calendario:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero degli eventi', 
      error: error.message 
    });
  }
});

// API per aggiornare un evento del calendario (inclusi booking)
app.put('/api/calendar/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, start, end, status, eventType, location, description, isBooking } = req.body;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Se è un booking, aggiorna la collezione Booking
    if (isBooking) {
      if (!connection.models['Booking']) {
        connection.model('Booking', BookingSchema);
      }
      
      const Booking = connection.model('Booking');
      const booking = await Booking.findById(id);
      
      if (!booking) {
        return res.status(404).json({ success: false, message: 'Prenotazione non trovata' });
      }
      
      if (start) {
        const newDate = new Date(start);
        booking.bookingDate = newDate.toISOString().split('T')[0]; // YYYY-MM-DD
        booking.bookingTime = newDate.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
        // Opzionalmente aggiorna anche bookingTimestamp se necessario
        booking.bookingTimestamp = newDate;
      }
      if (status) booking.status = status;
      if (description) booking.message = description;
      booking.updatedAt = new Date();
      
      await booking.save();
      
      // Restituisci in formato CalendarEvent usando i campi corretti
      const eventStart = new Date(`${booking.bookingDate}T${booking.bookingTime}:00`);
      const eventEnd = new Date(eventStart);
      eventEnd.setHours(eventStart.getHours() + 1);
      
      const updatedEvent = {
        id: booking._id.toString(),
        _id: booking._id,
        title: `${booking.name} - ${booking.service || 'Appuntamento'}`,
        start: eventStart,
        end: eventEnd,
        status: booking.status,
        eventType: 'appointment',
        description: booking.message,
        location: 'Ufficio',
        isBooking: true
      };
      
      res.json({
        success: true,
        data: updatedEvent,
        message: 'Prenotazione aggiornata con successo'
      });
    } else {
      // Gestione normale per CalendarEvent
      if (!connection.models['CalendarEvent']) {
        connection.model('CalendarEvent', CalendarEventSchema);
      }
      
      const CalendarEvent = connection.model('CalendarEvent');
      const event = await CalendarEvent.findById(id);
      
      if (!event) {
        return res.status(404).json({ success: false, message: 'Evento non trovato' });
      }
      
      // Aggiorna i campi
      if (title) event.title = title;
      if (start) event.start = new Date(start);
      if (end) event.end = new Date(end);
      if (status) event.status = status;
      if (eventType) event.eventType = eventType;
      if (location !== undefined) event.location = location;
      if (description !== undefined) event.description = description;
      event.updatedAt = new Date();
      
      await event.save();
      
      res.json({
        success: true,
        data: event,
        message: 'Evento aggiornato con successo'
      });
    }
  } catch (error) {
    console.error('Errore nell\'aggiornamento dell\'evento:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nell\'aggiornamento dell\'evento', 
      error: error.message 
    });
  }
});

// API per creare un nuovo evento del calendario
app.post('/api/calendar/events', async (req, res) => {
  try {
    const { title, start, end, status, eventType, location, description } = req.body;
    
    if (!title || !start || !end) {
      return res.status(400).json({ success: false, message: 'Titolo, data di inizio e fine sono richiesti' });
    }
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Se il modello CalendarEvent non esiste nella connessione, crealo
    if (!connection.models['CalendarEvent']) {
      connection.model('CalendarEvent', CalendarEventSchema);
    }
    
    const CalendarEvent = connection.model('CalendarEvent');
    
    // Crea il nuovo evento
    const newEvent = new CalendarEvent({
      title,
      start: new Date(start),
      end: new Date(end),
      status: status || 'pending',
      eventType: eventType || 'appointment',
      location,
      description
    });
    
    await newEvent.save();
    
    res.status(201).json({
      success: true,
      data: newEvent,
      message: 'Evento creato con successo'
    });
  } catch (error) {
    console.error('Errore nella creazione dell\'evento:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nella creazione dell\'evento', 
      error: error.message 
    });
  }
});

// API per aggiornare un evento del calendario
app.put('/api/calendar/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, start, end, status, eventType, location, description } = req.body;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Se il modello CalendarEvent non esiste nella connessione, crealo
    if (!connection.models['CalendarEvent']) {
      connection.model('CalendarEvent', CalendarEventSchema);
    }
    
    const CalendarEvent = connection.model('CalendarEvent');
    
    // Trova l'evento
    const event = await CalendarEvent.findById(id);
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Evento non trovato' });
    }
    
    // Aggiorna i campi
    if (title) event.title = title;
    if (start) event.start = new Date(start);
    if (end) event.end = new Date(end);
    if (status) event.status = status;
    if (eventType) event.eventType = eventType;
    if (location !== undefined) event.location = location;
    if (description !== undefined) event.description = description;
    event.updatedAt = new Date();
    
    await event.save();
    
    res.json({
      success: true,
      data: event,
      message: 'Evento aggiornato con successo'
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento dell\'evento:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nell\'aggiornamento dell\'evento', 
      error: error.message 
    });
  }
});

// API per eliminare un evento del calendario
app.delete('/api/calendar/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Se il modello CalendarEvent non esiste nella connessione, crealo
    if (!connection.models['CalendarEvent']) {
      connection.model('CalendarEvent', CalendarEventSchema);
    }
    
    const CalendarEvent = connection.model('CalendarEvent');
    
    // Trova ed elimina l'evento
    const result = await CalendarEvent.deleteOne({ _id: id });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Evento non trovato' });
    }
    
    res.json({
      success: true,
      message: 'Evento eliminato con successo'
    });
  } catch (error) {
    console.error('Errore nell\'eliminazione dell\'evento:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nell\'eliminazione dell\'evento', 
      error: error.message 
    });
  }
});

// ----------------------------------------------------------------
// ENDPOINT TRACCIAMENTO CRM - CON DEDUPLICAZIONE EVENTID
// ----------------------------------------------------------------

// Aggiungi questo nuovo endpoint a server.js
app.get('/api/tracciamento/landing-pages-stats', async (req, res) => {
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
      if (stat.visitsByUrl && typeof stat.visitsByUrl === 'object') {
        console.log(`Elaborazione statistiche con ${Object.keys(stat.visitsByUrl).length} URL`);
        
        // Processa ogni URL
        for (const [url, visits] of Object.entries(stat.visitsByUrl)) {
          // Ottieni i visitatori unici, con fallback a 0 se non disponibili
          const uniqueVisitors = stat.uniqueVisitorsByUrl && typeof stat.uniqueVisitorsByUrl === 'object' 
            ? (stat.uniqueVisitorsByUrl[url] || 0)
            : 0;
          
          landingPages.push({
            url,
            title: url, // Potremmo migliorare questo in futuro recuperando i titoli effettivi
            totalVisits: Number(visits),
            uniqueUsers: Number(uniqueVisitors),
            conversionRate: 0, // Sarà calcolato dopo
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
app.get('/api/tracciamento/users/:landingPageId', async (req, res) => {
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
app.get('/api/tracciamento/sessions/:userId', async (req, res) => {
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
app.get('/api/tracciamento/sessions/details/:sessionId', async (req, res) => {
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

// Helper function to determine event category based on event type
function getEventCategory(eventType) {
  // Map consolidated event types to categories
  const categoryMap = {
    'form_interaction': 'form_interaction',
    'click': 'click',
    'video': 'media',
    'scroll': 'navigation',
    'page_visibility': 'navigation',
    'time_on_page': 'navigation',
    'session_end': 'navigation',
    'conversion': 'conversion',
    'pageview': 'page'
  };
  
  return categoryMap[eventType] || 'interaction';
}

// Endpoint per accedere ai dati delle visite
app.get('/api/banca-dati/visits', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Se il modello Visit non esiste nella connessione, crealo
    if (!connection.models['Visit']) {
      connection.model('Visit', VisitSchema);
    }
    
    const UserVisit = connection.model('Visit');
    
    // Conta il totale e ottieni i dati paginati
    const total = await UserVisit.countDocuments({});
    const visits = await UserVisit.find({})
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({
      success: true,
      data: visits,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Errore nel recupero delle visite:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero delle visite', 
      error: error.message 
    });
  }
});

// Endpoint per accedere ai dati dei clienti
app.get('/api/banca-dati/clients', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Se il modello Client non esiste nella connessione, crealo
    if (!connection.models['Client']) {
      connection.model('Client', ClientSchema);
    }
    
    const UserClient = connection.model('Client');
    
    // Conta il totale e ottieni i dati paginati
    const total = await UserClient.countDocuments({});
    const clients = await UserClient.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({
      success: true,
      data: clients,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Errore nel recupero dei clienti:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero dei clienti', 
      error: error.message 
    });
  }
});

// API per accedere ai dati delle audience Facebook
app.get('/api/banca-dati/audiences', async (req, res) => {
  try {
    console.log("[AUDIENCE API] Richiesta ricevuta per le audience Facebook");
    console.log(`[AUDIENCE API] Headers: ${JSON.stringify(req.headers.origin)}`);
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      console.log("[AUDIENCE API] ERRORE: Nessuna connessione utente disponibile");
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    console.log("[AUDIENCE API] Connessione al database utente ottenuta con successo");
    
    // Se il modello FacebookAudience non esiste nella connessione, crealo
    if (!connection.models['FacebookAudience']) {
      console.log("[AUDIENCE API] Registrazione del modello FacebookAudience sulla connessione");
      connection.model('FacebookAudience', FacebookAudienceSchema);
    }
    
    const UserFacebookAudience = connection.model('FacebookAudience');
    
    // Funzione per normalizzare i documenti audience
    function normalizeAudience(audience) {
      // Se l'audience è un documento Mongoose, convertiamolo in oggetto normale
      const doc = audience.toObject ? audience.toObject() : {...audience};
      
      // Creiamo un nuovo oggetto normalizzato con i dati di base
      const normalized = {
        ...doc,
        email: doc.email || null,
        phone: doc.phone || null,
        firstName: doc.firstName || null,
        lastName: doc.lastName || null,
        location: doc.location || {
          city: doc.city,
          region: doc.region || doc.state,
          country: doc.country,
          country_code: doc.country_code
        }
      };
      
      // Cerca i dati nelle conversioni se presenti
      if (doc.conversions && doc.conversions.length > 0) {
        // Ottieni l'ultima conversione
        const lastConversion = doc.conversions[doc.conversions.length - 1];
        
        // Estrai i dati dal formData, se disponibili
        if (lastConversion.metadata && lastConversion.metadata.formData) {
          const formData = lastConversion.metadata.formData;
          
          // Aggiungi i dati mancanti dall'ultima conversione
          if (!normalized.email && formData.email) normalized.email = formData.email;
          if (!normalized.phone && formData.phone) normalized.phone = formData.phone;
          if (!normalized.firstName && formData.firstName) normalized.firstName = formData.firstName;
          if (!normalized.lastName && formData.lastName) normalized.lastName = formData.lastName;
          
          // Aggiungi il campo consentAds se presente
          if (formData.adOptimizationConsent && !normalized.adOptimizationConsent) {
            normalized.adOptimizationConsent = formData.adOptimizationConsent === true ? 'GRANTED' : 'DENIED';
          }
        }
      }
      
      return normalized;
    }
    
    // Conta il totale e ottieni i dati paginati
    console.log("[AUDIENCE API] Esecuzione query sulla collection FacebookAudience...");
    const total = await UserFacebookAudience.countDocuments({});
    const audiences = await UserFacebookAudience.find({})
      .sort({ lastUpdated: -1 })
      .skip(skip)
      .limit(limit);
    
    console.log(`[AUDIENCE API] Query completata. Trovati ${audiences.length} documenti`);
    
    // Normalizza ogni audience prima di inviarla
    const normalizedAudiences = audiences.map(normalizeAudience);
    
    // Log dei primi documenti per debug se ce ne sono
    if (normalizedAudiences.length > 0) {
      console.log("[AUDIENCE API] Primo documento normalizzato:");
      console.log(JSON.stringify(normalizedAudiences[0], null, 2).substring(0, 300) + "...");
    }
    
    // Configurazione corretta di CORS
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    res.json({
      success: true,
      data: normalizedAudiences,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
    console.log("[AUDIENCE API] Risposta inviata al client");
    
  } catch (error) {
    console.error('[AUDIENCE API] ERRORE durante il recupero delle audience:', error);
    console.error('[AUDIENCE API] Stack trace:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero delle audience', 
      error: error.message 
    });
  }
});

// Endpoint per esportare i clienti in CSV
app.get('/api/banca-dati/clients/export', async (req, res) => {
  try {
    console.log("[EXPORT API] Richiesta di esportazione clienti per Facebook");
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Se il modello Client non esiste nella connessione, crealo
    if (!connection.models['Client']) {
      connection.model('Client', ClientSchema);
    }
    
    const UserClient = connection.model('Client');
    
    // Ottieni tutti i clienti per l'esportazione
    const clients = await UserClient.find({});
    console.log(`[EXPORT API] Trovati ${clients.length} clienti`);
    
    // Definisci le intestazioni per il CSV secondo il formato Facebook esteso
    const headers = [
      "email",              // Email
      "phone",              // Telefono
      "fn",                 // Nome
      "ln",                 // Cognome
      "country",            // Paese (codice ISO)
      "ct",                 // Città
      "st",                 // Stato/Regione
      "external_id",        // ID esterno (clientId)
      "client_ip_address",  // Indirizzo IP
      "client_user_agent",  // User agent
      "fbc",                // Facebook click parameter
      "fbp",                // Facebook browser parameter
      "lead_id",            // ID del lead originale
      "subscription_id",    // ID abbonamento
      "value",              // Valore cliente (LTV)
      "currency",           // Valuta
      "f_name",             // Nome (formato alternativo)
      "l_name",             // Cognome (formato alternativo)
      "zp",                 // CAP
      "conversion_date",    // Data di conversione
      "source",             // Fonte
      "medium",             // Medium
      "campaign"            // Campagna
    ];
    
    // Funzione per formattare una riga di CSV e pulire i dati
    const formatRow = (client) => {
      // Estrai il nome e cognome
      let firstName = client.firstName || "";
      let lastName = client.lastName || "";
      
      // Se è disponibile solo il fullName, tenta di dividerlo
      if (!firstName && !lastName && client.fullName) {
        const parts = client.fullName.split(' ');
        if (parts.length > 0) firstName = parts[0];
        if (parts.length > 1) lastName = parts.slice(1).join(' ');
      }
      
      // Formatta il telefono in formato internazionale
      let phone = client.phone || "";
      if (phone && !phone.startsWith('+')) {
        phone = phone.replace(/^0/, '+39');
      }
      
      // Estrai dati estesi
      let extData = client.extendedData || {};
      
      // Estrai fbc da fbclid se disponibile
      let fbc = "";
      if (extData.fbclid) {
        const timestamp = extData.fbclidTimestamp || Math.floor(Date.now() / 1000);
        fbc = `fb.1.${timestamp}.${extData.fbclid}`;
      }
      
      // Crea un array di valori secondo l'ordine delle intestazioni
      const values = [
        client.email || "",                 // email
        phone.replace(/\s+/g, ""),          // phone (pulito)
        firstName,                          // fn
        lastName,                           // ln
        extData.country || "IT",            // country (default IT)
        extData.city || "",                 // ct (city)
        client.clientId || "",              // external_id
        extData.ipAddress || "",            // client_ip_address
        extData.userAgent || "",            // client_user_agent
        fbc,                                // fbc
        extData.fbp || "",                  // fbp
        client.leadId || "",                // lead_id
        "",                                 // subscription_id (vuoto)
        (client.value || 0).toString(),     // value
        extData.currency || "EUR",          // currency (default EUR)
        firstName,                          // f_name (duplicate di fn per compatibilità)
        lastName,                           // l_name (duplicate di ln per compatibilità)
        extData.state || extData.province || "", // st (stato/provincia)
        extData.postalCode || extData.zip || "", // zp (CAP)
        client.convertedAt ? new Date(client.convertedAt).toISOString().split('T')[0] : "", // conversion_date
        client.leadSource || "",            // source
        client.medium || "",                // medium
        client.campaign || ""               // campaign
      ];
      
      // Escape dei valori CSV
      return values.map(value => {
        if (typeof value !== 'string') return '';
        const escaped = value.replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',');
    };
    
    // Crea il contenuto del CSV
    let csv = headers.join(',') + '\n';
    clients.forEach(client => {
      // Include solo record con almeno un identificatore valido
      if (client.email || client.phone || client.clientId || (client.firstName && client.lastName)) {
        csv += formatRow(client) + '\n';
      }
    });
    
    // Imposta gli header per il download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=clients_facebook_complete.csv');
    
    // Invia il file CSV
    res.send(csv);
    console.log("[EXPORT API] CSV clienti inviato");
  } catch (error) {
    console.error("[EXPORT API] Errore nell'esportazione dei clienti:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nell\'esportazione dei clienti', 
      error: error.message 
    });
  }
});

// Endpoint per esportare le audience Facebook in CSV
app.get('/api/banca-dati/audiences/export', async (req, res) => {
  try {
    console.log("[EXPORT API] Richiesta di esportazione audience per Facebook");
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Se il modello FacebookAudience non esiste nella connessione, crealo
    if (!connection.models['FacebookAudience']) {
      connection.model('FacebookAudience', FacebookAudienceSchema);
    }
    
    const UserFacebookAudience = connection.model('FacebookAudience');
    
    // Ottieni tutte le audience per l'esportazione
    const audiences = await UserFacebookAudience.find({});
    console.log(`[EXPORT API] Trovate ${audiences.length} audience`);
    
    // Normalizza i documenti per estrarre i dati anche dalle conversioni
    const normalizedAudiences = audiences.map(audience => {
      const doc = audience.toObject ? audience.toObject() : {...audience};
      const normalized = {...doc};
      
      // Cerca i dati nelle conversioni se presenti
      if (doc.conversions && doc.conversions.length > 0) {
        const lastConversion = doc.conversions[doc.conversions.length - 1];
        if (lastConversion.metadata?.formData) {
          const formData = lastConversion.metadata.formData;
          if (!normalized.email && formData.email) normalized.email = formData.email;
          if (!normalized.phone && formData.phone) normalized.phone = formData.phone;
          if (!normalized.firstName && formData.firstName) normalized.firstName = formData.firstName;
          if (!normalized.lastName && formData.lastName) normalized.lastName = formData.lastName;
        }
      }
      
      return normalized;
    });
    
    // Definisci le intestazioni per il CSV secondo il formato Facebook esteso
    // Include tutti i possibili identificatori supportati da Facebook
    const headers = [
      "email",              // Email
      "phone",              // Telefono
      "fn",                 // Nome
      "ln",                 // Cognome
      "country",            // Paese (codice ISO)
      "ct",                 // Città
      "st",                 // Stato/Regione
      "external_id",        // ID esterno
      "client_ip_address",  // Indirizzo IP
      "client_user_agent",  // User agent
      "fbc",                // Facebook click parameter
      "fbp",                // Facebook browser parameter
      "lead_id",            // Facebook lead ID
      "subscription_id",    // ID abbonamento
      "madid",              // Mobile advertiser ID
      "value",              // Valore cliente
      "f_name",             // Nome (formato alternativo)
      "l_name",             // Cognome (formato alternativo)
      "zp",                 // CAP
      "gen",                // Genere
      "db"                  // Data di nascita
    ];
    
    // Funzione per formattare una riga di CSV e pulire i dati
    const formatRow = (audience) => {
      // Formatta il telefono in formato internazionale
      let phone = audience.phone || "";
      if (phone && !phone.startsWith('+')) {
        phone = phone.replace(/^0/, '+39');
      }
      
      // Estrai ip e user agent
      let ip = "";
      let userAgent = "";
      if (audience.deviceInfo) {
        ip = audience.deviceInfo.ip || "";
        userAgent = audience.deviceInfo.userAgent || "";
      }
      
      // Formatta fbc con fbclid se disponibile
      let fbc = audience.fbc || "";
      if (!fbc && audience.fbclid) {
        const timestamp = audience.fbclidTimestamp || Math.floor(Date.now() / 1000);
        fbc = `fb.1.${timestamp}.${audience.fbclid}`;
      }
      
      // Crea un array di valori secondo l'ordine delle intestazioni
      const values = [
        audience.email || "",                 // email
        phone.replace(/\s+/g, ""),           // phone (pulito)
        audience.firstName || "",             // fn
        audience.lastName || "",              // ln
        audience.country || "IT",             // country (default IT)
        audience.city || "",                  // ct (city)
        audience.userId || "",                // external_id
        ip,                                   // client_ip_address
        userAgent,                            // client_user_agent
        fbc,                                  // fbc
        audience.fbp || "",                   // fbp
        audience.leadId || "",                // lead_id
        "",                                   // subscription_id (vuoto)
        audience.madid || "",                 // madid (mobile advertiser ID)
        (audience.value || 0).toString(),     // value
        audience.firstName || "",             // f_name (duplicate di fn per compatibilità)
        audience.lastName || "",              // l_name (duplicate di ln per compatibilità)
        audience.state || "",                 // st (stato/provincia)
        audience.zip || audience.postalCode || "", // zp (CAP)
        audience.gender || "",                // gen (genere)
        audience.birthdate || ""              // db (data di nascita)
      ];
      
      // Escape dei valori CSV
      return values.map(value => {
        if (typeof value !== 'string') return '';
        const escaped = value.replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',');
    };
    
    // Crea il contenuto del CSV
    let csv = headers.join(',') + '\n';
    normalizedAudiences.forEach(audience => {
      // Include solo record con almeno un identificatore valido
      if (audience.email || audience.phone || audience.fbclid || audience.userId || (audience.firstName && audience.lastName)) {
        csv += formatRow(audience) + '\n';
      }
    });
    
    // Imposta gli header per il download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=facebook_audience_complete.csv');
    
    // Invia il file CSV
    res.send(csv);
    console.log("[EXPORT API] CSV audience inviato");
  } catch (error) {
    console.error("[EXPORT API] Errore nell'esportazione delle audience:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nell\'esportazione delle audience', 
      error: error.message 
    });
  }
});

// API per ottenere tutti i siti dell'utente
app.get('/api/sites', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const sites = await Site.find({ userId }).sort({ createdAt: -1 });
    
    res.json(sites);
  } catch (error) {
    console.error('Errore nel recupero dei siti:', error);
    res.status(500).json({ success: false, message: 'Errore nel recupero dei siti', error: error.message });
  }
});

app.get('/api/tracciamento/statistics', async (req, res) => {
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

// API per aggiungere un nuovo sito
app.post('/api/sites', async (req, res) => {
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
      path,  // Aggiungi questa linea
      screenshotUrl,
      metrics,
      lastScan: new Date(),
      userId
    });
    
    await site.save();
    
    res.status(201).json(site);
  } catch (error) {
    console.error('Errore nell\'aggiunta del sito:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'aggiunta del sito', error: error.message });
  }
});

// Aggiungi questo codice al tuo file server.js

// API per ottenere le configurazioni utente
app.get('/api/user/config', async (req, res) => {
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
    
    // Prepara el objeto de respuesta con los valores de configuración incluyendo WhatsApp
    res.json({
      success: true,
      config: {
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

// API per aggiornare le metriche di un sito
app.post('/api/sites/:id/refresh', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    
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
    res.status(500).json({ success: false, message: 'Errore nell\'aggiornamento delle metriche', error: error.message });
  }
});

// API per eliminare un sito
app.delete('/api/sites/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    
    // Trova ed elimina il sito
    const result = await Site.deleteOne({ _id: id, userId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Sito non trovato' });
    }
    
    res.json({ success: true, message: 'Sito eliminato con successo' });
  } catch (error) {
    console.error('Errore nell\'eliminazione del sito:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'eliminazione del sito', error: error.message });
  }
});

// ===== FUNZIONI UTILITY =====

// Funzione per ottenere la connessione MongoDB dell'utente
async function getUserConnection(req) {
  try {
    console.log("[getUserConnection] Starting...");
    
    if (!req.session || !req.session.isAuthenticated) {
      console.log("[getUserConnection] No valid session");
      return null;
    }
    
    if (!req.session.userConfig || !req.session.userConfig.mongodb_uri) {
      console.log("[getUserConnection] No MongoDB URI in config");
      return null;
    }
    
    const username = req.session.user.username;
    const mongodb_uri = req.session.userConfig.mongodb_uri;
    
    console.log(`[getUserConnection] Attempting connection for ${username} to ${mongodb_uri.substring(0, 20)}...`);
    
    // Get or create connection
    const connection = await connectionManager.getConnection(username, mongodb_uri);
    
    // Register all your models here
    if (!connection.models['Lead']) {
      console.log("[getUserConnection] Accessing leads collection");
      
      const LeadSchema = new mongoose.Schema({
        leadId: { type: String, required: true, unique: true },
        sessionId: { type: String, required: true, index: true },
        userId: { type: String, sparse: true, index: true },
        email: { type: String, required: true, index: true },
        firstName: String,
        lastName: String,
        phone: String,
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
        source: String,
        medium: String,
        campaign: String,
        formType: { type: String, required: true },
        status: {
          type: String,
          enum: ['new', 'contacted', 'qualified', 'opportunity', 'proposal', 'converted', 'lost'],
          default: 'new'
        },
        // Add these two fields at the top level:
        value: { type: Number, default: 0 },
        service: { type: String },
        extendedData: {
          consentGiven: { type: Boolean, default: false },
          ipAddress: String,
          userAgent: String,
          utmParams: Object,
          fbclid: String,
          referrer: String,
          landingPage: String,
          deviceInfo: Object,
          formData: Object,
          notes: String,
          value: Number,
          currency: String
        },
        tags: [String],
        properties: { type: Map, of: mongoose.Schema.Types.Mixed },
        consent: {
          marketing: { type: Boolean, default: false },
          analytics: { type: Boolean, default: false },
          thirdParty: { type: Boolean, default: false },
          timestamp: Date,
          version: String,
          method: String
        },
        viewed: { type: Boolean, default: false },
        viewedAt: { type: Date }
      }, { 
        collection: 'leads',
        strict: false
      });
      
      connection.model('Lead', LeadSchema);
      console.log("[getUserConnection] Leads collection accessed successfully");
    }
    
    // For backwards compatibility, register the old models if needed
    if (!connection.models['FormData']) {
      console.log("[getUserConnection] Registering legacy models");
      connection.model('FormData', FormDataSchema);
      connection.model('Booking', BookingSchema);
      connection.model('FacebookEvent', FacebookEventSchema);
      connection.model('FacebookLead', FacebookLeadSchema);
      console.log("[getUserConnection] Legacy models registered");
    }
    
    // Register statistics models if they don't exist
    if (!connection.models['DailyStatistics']) {
      connection.model('DailyStatistics', DailyStatisticsSchema);
    }
    
    if (!connection.models['WeeklyStatistics']) {
      connection.model('WeeklyStatistics', WeeklyStatisticsSchema);
    }
    
    if (!connection.models['MonthlyStatistics']) {
      connection.model('MonthlyStatistics', MonthlyStatisticsSchema);
    }
    
    if (!connection.models['TotalStatistics']) {
      connection.model('TotalStatistics', TotalStatisticsSchema);
    }
    
    console.log("[getUserConnection] Connection and models ready");
    return connection;
  } catch (error) {
    console.error('[getUserConnection] ERROR:', error);
    console.error('[getUserConnection] Stack trace:', error.stack);
    return null;
  }
}

// Funzione per recuperare le configurazioni dell'utente
async function getUserConfig(username) {
  try {
    if (!username) {
      return {
        mongodb_uri: process.env.MONGODB_URI,
        access_token: process.env.ACCESS_TOKEN,
        marketing_api_token: process.env.MARKETING_API_TOKEN || '',
        meta_pixel_id: process.env.FACEBOOK_PIXEL_ID || '1543790469631614',
        fb_account_id: process.env.FACEBOOK_ACCOUNT_ID || '',
        whatsapp_access_token: process.env.WHATSAPP_ACCESS_TOKEN || '',
        whatsapp_phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
        whatsapp_webhook_token: process.env.WHATSAPP_WEBHOOK_TOKEN || '',
        whatsapp_verify_token: process.env.WHATSAPP_VERIFY_TOKEN || ''
      };
    }
    
    // Cerca l'utente nel database
    const user = await Admin.findOne({ username });
    
    if (!user) {
      return {
        mongodb_uri: process.env.MONGODB_URI,
        access_token: process.env.ACCESS_TOKEN,
        marketing_api_token: process.env.MARKETING_API_TOKEN || '',
        meta_pixel_id: process.env.FACEBOOK_PIXEL_ID || '1543790469631614',
        fb_account_id: process.env.FACEBOOK_ACCOUNT_ID || '',
        whatsapp_access_token: process.env.WHATSAPP_ACCESS_TOKEN || '',
        whatsapp_phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
        whatsapp_webhook_token: process.env.WHATSAPP_WEBHOOK_TOKEN || '',
        whatsapp_verify_token: process.env.WHATSAPP_VERIFY_TOKEN || ''
      };
    }
    
    // Combina la configurazione dell'utente con i valori predeterminati
    return {
      mongodb_uri: user.config?.mongodb_uri || process.env.MONGODB_URI,
      access_token: user.config?.access_token || process.env.ACCESS_TOKEN,
      marketing_api_token: user.config?.marketing_api_token || process.env.MARKETING_API_TOKEN || '',
      meta_pixel_id: user.config?.meta_pixel_id || process.env.FACEBOOK_PIXEL_ID || '1543790469631614',
      fb_account_id: user.config?.fb_account_id || process.env.FACEBOOK_ACCOUNT_ID || '',
      whatsapp_access_token: user.config?.whatsapp_access_token || process.env.WHATSAPP_ACCESS_TOKEN || '',
      whatsapp_phone_number_id: user.config?.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      whatsapp_webhook_token: user.config?.whatsapp_webhook_token || process.env.WHATSAPP_WEBHOOK_TOKEN || '',
      whatsapp_verify_token: user.config?.whatsapp_verify_token || process.env.WHATSAPP_VERIFY_TOKEN || ''
    };
  } catch (error) {
    console.error('Errore nel recupero delle configurazioni WhatsApp:', error);
    // Fallback alla configurazione predeterminata
    return {
      mongodb_uri: process.env.MONGODB_URI,
      access_token: process.env.ACCESS_TOKEN,
      marketing_api_token: process.env.MARKETING_API_TOKEN || '',
      meta_pixel_id: process.env.FACEBOOK_PIXEL_ID || '1543790469631614',
      fb_account_id: process.env.FACEBOOK_ACCOUNT_ID || '',
      whatsapp_access_token: process.env.WHATSAPP_ACCESS_TOKEN || '',
      whatsapp_phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      whatsapp_webhook_token: process.env.WHATSAPP_WEBHOOK_TOKEN || '',
      whatsapp_verify_token: process.env.WHATSAPP_VERIFY_TOKEN || ''
    };
  }
}

// Connection Manager
const connectionManager = {
  connections: {},
  
  // Update the getConnection method in connectionManager
  async getConnection(username, uri) {
    console.log(`[connectionManager] Request for connection: ${username}`);
    
    if (this.connections[username]) {
      console.log(`[connectionManager] Reusing existing connection for ${username}`);
      this.resetTimeout(username);
      return this.connections[username].connection;
    }
    
    console.log(`[connectionManager] Creating new connection for ${username}`);
    try {
      const connection = await mongoose.createConnection(uri, {
        connectTimeoutMS: 10000,
        socketTimeoutMS: 10000,
        maxPoolSize: 10,
        minPoolSize: 1,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 10000
      });
      
      console.log(`[connectionManager] Connection established for ${username}`);
      
      this.connections[username] = {
        connection,
        lastUsed: Date.now(),
        timeout: this.setConnectionTimeout(username)
      };
      
      return connection;
    } catch (error) {
      console.error(`[connectionManager] Connection error for ${username}:`, error);
      throw error;
    }
  },
  
  resetTimeout(username) {
    if (this.connections[username]) {
      clearTimeout(this.connections[username].timeout);
      this.connections[username].lastUsed = Date.now();
      this.connections[username].timeout = this.setConnectionTimeout(username);
    }
  },
  
  setConnectionTimeout(username) {
    // Chiudi la connessione dopo 10 minuti di inattività
    return setTimeout(() => {
      if (this.connections[username]) {
        this.connections[username].connection.close();
        delete this.connections[username];
        console.log(`Connessione per ${username} chiusa per inattività`);
      }
    }, 10 * 60 * 1000);
  },
  
  closeAll() {
    Object.keys(this.connections).forEach(username => {
      clearTimeout(this.connections[username].timeout);
      this.connections[username].connection.close();
    });
    this.connections = {};
    console.log('Tutte le connessioni utente chiuse');
  }
};

// Esegui cleanup ogni ora
setInterval(() => {
  const now = Date.now();
  const inactiveThreshold = 30 * 60 * 1000; // 30 minuti
  
  Object.keys(connectionManager.connections).forEach(username => {
    const connInfo = connectionManager.connections[username];
    if (now - connInfo.lastUsed > inactiveThreshold) {
      clearTimeout(connInfo.timeout);
      connInfo.connection.close();
      delete connectionManager.connections[username];
      console.log(`Connessione inattiva per ${username} chiusa durante cleanup`);
    }
  });
}, 60 * 60 * 1000); // Ogni ora

// Funzione per inviare eventi a Facebook
async function sendFacebookConversionEvent(eventName, userData, customData = {}, req) {

  console.log('EventName:', eventName);
  console.log('CustomData ricevuto:', JSON.stringify(customData));

  try {
    // Usa direttamente le configurazioni dalla sessione
    let accessToken = process.env.FACEBOOK_ACCESS_TOKEN || process.env.ACCESS_TOKEN;
    let metaPixelId = process.env.FACEBOOK_PIXEL_ID || '1543790469631614';
    
    // Se abbiamo configurazioni nella sessione, usale
    if (req?.session?.userConfig) {
      accessToken = req.session.userConfig.access_token || accessToken;
      metaPixelId = req.session.userConfig.meta_pixel_id || metaPixelId;
    }
    
    if (!accessToken) {
      throw new Error('Facebook Access Token non configurato');
    }
    
    // Genera un ID evento univoco
    const eventId = 'crm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    
    // Prepara i dati dell'utente con hashing
    const hashedUserData = {};
    
    if (userData.email) {
      hashedUserData.em = crypto.createHash('sha256').update(userData.email.toLowerCase().trim()).digest('hex');
    }
    
    if (userData.phone) {
      hashedUserData.ph = crypto.createHash('sha256').update(userData.phone.replace(/\D/g, '')).digest('hex');
    }
    
    if (userData.name) {
      const nameParts = userData.name.split(' ');
      hashedUserData.fn = crypto.createHash('sha256').update(nameParts[0].toLowerCase().trim()).digest('hex');
      
      if (nameParts.length > 1) {
        hashedUserData.ln = crypto.createHash('sha256').update(nameParts.slice(1).join(' ').toLowerCase().trim()).digest('hex');
      }
    }
    
    // Aggiungi identificatori aggiuntivi
    if (userData.lead_id) {
      hashedUserData.lead_id = userData.lead_id;
    }
    
    if (userData.fbclid) {
      const timestamp = userData.fbclidTimestamp || Math.floor(Date.now() / 1000);
      hashedUserData.fbc = `fb.1.${timestamp}.${userData.fbclid}`;
    }
    
    // Crea l'oggetto customData arricchito
    const enrichedCustomData = {
      lead_event_source: "CRM Dashboard",
      event_source: "crm",
      ...customData
    };
    
    // Poi crea il payload base
    const payload = {
      data: [{
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "system_generated",
        user_data: hashedUserData,
        custom_data: enrichedCustomData  // Usa il nuovo oggetto arricchito
      }],
      access_token: accessToken,
      partner_agent: 'costruzionedigitale-nodejs-crm'
    };
    
    if (eventName === 'Purchase') {
      // Se customData.value non è definito ma esiste eventMetadata.value, usalo 
      const purchaseValue = customData.value || (customData.eventMetadata && customData.eventMetadata.value) || 0;
      
      // Aggiorna il payload con i parametri richiesti per l'evento Purchase
      payload.data[0].custom_data = {
        ...payload.data[0].custom_data,
        value: purchaseValue,
        currency: customData.currency || 'EUR',
        content_type: customData.content_type || 'product',
        content_name: customData.content_name || 'Servizio'
      };
      
      console.log('Payload aggiornato per evento Purchase:', JSON.stringify(payload.data[0].custom_data));
    }
    
    // Invia l'evento
    const response = await axios.post(
      `https://graph.facebook.com/v22.0/1543790469631614/events?access_token=EAAd7rpHujUkBO3iESqN0hqKg15uiHeDZCIffdtbJIYuzTBVAfq0qMLM6dO70WmZCGE4XmL9kPZAX2S0VbTkIA0ORxypfSnrDK1nALetbLRu0nrEyyfOU7mkQ3Joy1YISlIlEdr9qbjc9YOR6DfS3zKkUf4Vhu9HhTKYta5ZAZCPnEZAbgF8CPvAeVHPS2nggZDZD`,
      payload
    );
    
    return {
      success: true,
      eventId,
      response: response.data
    };
  } catch (error) {
    console.error(`Errore nell'invio dell'evento ${eventName}:`, error.message);
    return {
      success: false,
      error: error.message || 'Errore sconosciuto',
      details: error.response ? error.response.data : null
    };
  }
}

// Funzione per generare un ID utente casuale per cookie
function generateUserId() {
  return 'user_' + Math.random().toString(36).substring(2, 15) + 
          Math.random().toString(36).substring(2, 15);
}

// Configura Nodemailer per l'invio di email
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Funzione per inviare email di conferma prenotazione
async function sendBookingConfirmationEmail(booking) {
  try {
    const bookingDate = new Date(booking.bookingTimestamp);
    const formattedDate = bookingDate.toLocaleDateString('it-IT', {
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
    
    // Opzioni per l'email al cliente
    const clientMailOptions = {
      from: `"Costruzione Digitale" <${process.env.EMAIL_FROM || 'info@costruzionedigitale.com'}>`,
      to: booking.email,
      subject: 'Conferma prenotazione chiamata conoscitiva',
      html: `
        <style type="text/css">
          /* Sovrascrivi gli stili di Gmail */
          .im {
            color: inherit !important;
          }
        </style>
        <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; color: #FFFFFF !important; background-color: #212121; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
          <div style="text-align: center; margin-bottom: 30px;">
            <img src="https://costruzionedigitale.com/logosito.webp" alt="Costruzione Digitale" style="height: 80px;">
          </div>
          
          <h2 style="color: #FF6B00 !important; margin-bottom: 25px; font-weight: 700; text-transform: uppercase; text-align: center;">Prenotazione Confermata!</h2>
          
          <p style="margin-bottom: 15px; line-height: 1.6; color: #FFFFFF !important;">Gentile ${booking.name},</p>
          
          <p style="margin-bottom: 20px; line-height: 1.6; color: #FFFFFF !important;">Grazie per aver prenotato una chiamata conoscitiva con Costruzione Digitale. Di seguito i dettagli della tua prenotazione:</p>
          
          <div style="background-color: #333333; padding: 20px; border-radius: 10px; margin: 25px 0; border-left: 4px solid #FF6B00;">
            <p style="margin-bottom: 10px; color: #FFFFFF !important;"><strong style="color: #FF6B00 !important;">Data:</strong> ${formattedDate}</p>
            <p style="margin-bottom: 10px; color: #FFFFFF !important;"><strong style="color: #FF6B00 !important;">Orario:</strong> ${booking.bookingTime}</p>
            <p style="margin-bottom: 0; color: #FFFFFF !important;"><strong style="color: #FF6B00 !important;">Durata:</strong> 30 minuti</p>
          </div>
          
          <p style="margin-bottom: 20px; line-height: 1.6; color: #FFFFFF !important;">Uno dei nostri esperti ti contatterà al numero ${booking.phone} all'orario stabilito.</p>
          
          <p style="margin-bottom: 15px; line-height: 1.6; color: #FFFFFF !important;">Se desideri modificare o cancellare la prenotazione, ti preghiamo di contattarci rispondendo a questa email o chiamando il nostro numero +39 0123 456789.</p>
          
          <p style="margin-bottom: 15px; line-height: 1.6; color: #FFFFFF !important;">Per prepararti al meglio alla chiamata, potresti pensare a:</p>
          <ul style="margin-bottom: 25px; padding-left: 20px; line-height: 1.8; color: #FFFFFF !important;">
            <li style="color: #FFFFFF !important;">Obiettivi del tuo progetto digitale</li>
            <li style="color: #FFFFFF !important;">Eventuali sfide o problemi che stai affrontando</li>
            <li style="color: #FFFFFF !important;">Domande specifiche che vorresti porci</li>
          </ul>
          
          <p style="margin-bottom: 10px; line-height: 1.6; color: #FFFFFF !important;">A presto!</p>
          
          <p style="margin-bottom: 30px; line-height: 1.6; color: #FFFFFF !important;">Il team di <span style="color: #FF6B00 !important; font-weight: 700;">Costruzione Digitale</span></p>
          
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 13px; color: rgba(255,255,255,0.7) !important; text-align: center;">
            <p style="margin-bottom: 5px; color: rgba(255,255,255,0.7) !important;">Costruzione Digitale Srl - Via Esempio 123, Milano</p>
            <p style="margin-bottom: 5px; color: rgba(255,255,255,0.7) !important;">Tel: +39 0123 456789 - Email: info@costruzionedigitale.com</p>
            <p style="margin-bottom: 0; font-size: 11px; margin-top: 15px; color: rgba(255,255,255,0.5) !important;">© ${new Date().getFullYear()} Costruzione Digitale. Tutti i diritti riservati.</p>
          </div>
        </div>
      `
    };
    
    // Opzioni per l'email di notifica all'amministratore
    const adminMailOptions = {
      from: `"Sistema di Prenotazioni" <${process.env.EMAIL_FROM || 'info@costruzionedigitale.com'}>`,
      to: process.env.ADMIN_EMAIL || 'olegbolonniy@gmail.com',
      subject: `Nuova prenotazione: ${booking.name} - ${formattedDate} ${booking.bookingTime}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <h2 style="color: #FF6B00; margin-bottom: 20px;">Nuova Prenotazione Ricevuta</h2>
          
          <p>È stata effettuata una nuova prenotazione per una chiamata conoscitiva. Ecco i dettagli:</p>
          
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Nome cliente:</strong> ${booking.name}</p>
            <p><strong>Email:</strong> ${booking.email}</p>
            <p><strong>Telefono:</strong> ${booking.phone}</p>
            <p><strong>Data:</strong> ${formattedDate}</p>
            <p><strong>Orario:</strong> ${booking.bookingTime}</p>
            <p><strong>Origine:</strong> ${formatSource(booking.source)}</p>
            ${booking.message ? `<p><strong>Messaggio:</strong> ${booking.message}</p>` : ''}
          </div>
          
          <p>Ricordati di contattare il cliente all'orario stabilito.</p>
          
          <p>Sistema di prenotazioni automatizzato di Costruzione Digitale</p>
        </div>
      `
    };
    
    // Invia le email
    await transporter.sendMail(clientMailOptions);
    await transporter.sendMail(adminMailOptions);
    
    return true;
  } catch (error) {
    console.error('Errore invio email di conferma:', error);
    return false;
  }
}

// Funzione per inviare email di aggiornamento stato
async function sendBookingStatusEmail(booking, status) {
  try {
    const bookingDate = new Date(booking.bookingTimestamp);
    const formattedDate = bookingDate.toLocaleDateString('it-IT', {
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
    
    let subject, content;
    
    if (status === 'confirmed') {
      subject = 'Prenotazione confermata';
      content = `
        <h2 style="color: #27ae60; margin-bottom: 20px;">Prenotazione Confermata</h2>
        <p>Gentile ${booking.name},</p>
        <p>Siamo lieti di confermare la tua prenotazione per una chiamata conoscitiva con Costruzione Digitale.</p>
        <p>Ti contatteremo al numero ${booking.phone} come programmato.</p>
      `;
    } else if (status === 'cancelled') {
      subject = 'Prenotazione cancellata';
      content = `
        <h2 style="color: #e74c3c; margin-bottom: 20px;">Prenotazione Cancellata</h2>
        <p>Gentile ${booking.name},</p>
        <p>La tua prenotazione per una chiamata conoscitiva con Costruzione Digitale è stata cancellata.</p>
        <p>Se desideri riprogrammare la chiamata, puoi farlo visitando il nostro sito web o contattandoci direttamente.</p>
      `;
    } else {
      return false; // Non inviamo email per altri stati
    }
    
    // Opzioni per l'email
    const mailOptions = {
      from: `"Costruzione Digitale" <${process.env.EMAIL_FROM || 'info@costruzionedigitale.com'}>`,
      to: booking.email,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
          <div style="text-align: center; margin-bottom: 30px;">
            <img src="https://costruzionedigitale.com/logosito.webp" alt="Costruzione Digitale" style="height: 60px;">
          </div>
          
          ${content}
          
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Data:</strong> ${formattedDate}</p>
            <p><strong>Orario:</strong> ${booking.bookingTime}</p>
          </div>
          
          <p>Per qualsiasi domanda, non esitare a contattarci rispondendo a questa email o chiamando il nostro numero +39 0123 456789.</p>
          
          <p>Cordiali saluti,</p>
          <p>Il team di Costruzione Digitale</p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #777; text-align: center;">
            <p>Costruzione Digitale Srl - Via Esempio 123, Milano</p>
            <p>Tel: +39 0123 456789 - Email: info@costruzionedigitale.com</p>
          </div>
        </div>
      `
    };
    
    // Invia l'email
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error(`Errore invio email di ${status}:`, error);
    return false;
  }
}

// Funzione per formattare la fonte
function formatSource(source) {
  switch (source) {
    case 'hero-form': return 'Form Hero';
    case 'popup-form': return 'Form Popup';
    case 'contatti-form': return 'Form Contatti';
    case 'booking-form': return 'Prenotazione Chiamata';
    case 'facebook-ad': return 'Facebook Ads';
    case 'instagram-ad': return 'Instagram Ads';
    case 'google-ads': return 'Google Ads';
    case 'referral': return 'Passaparola';
    case 'old-client': return 'Cliente Precedente';
    default: return source || 'Sconosciuto';
  }
}

// Funzione per formattare lo stato della prenotazione
function formatStatus(status) {
  switch (status) {
    case 'pending': return 'In attesa';
    case 'confirmed': return 'Confermata';
    case 'cancelled': return 'Cancellata';
    case 'completed': return 'Completata';
    default: return status || 'Sconosciuto';
  }
}

// ===== MIDDLEWARE =====

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

// Middleware per catturare fbclid e inviare PageView alla CAPI
app.use(async (req, res, next) => {
  // Estrai fbclid dalla query
  let fbclid = req.query.fbclid;
  
  // Se non c'è nella query diretta, controlla l'header referer
  if (!fbclid && req.headers.referer) {
    try {
      const refererUrl = new URL(req.headers.referer);
      fbclid = refererUrl.searchParams.get('fbclid');
    } catch (e) {
      // Errore parsing URL referer, ignora
    }
  }
  
  // Verifica se l'fbclid è già presente nella sessione
  const sessionFbclid = req.session && req.session.fbclid;
  if (!fbclid && sessionFbclid) {
    fbclid = sessionFbclid;
  }
  
  // Procedi solo se c'è un fbclid nella URL e non è stato già tracciato questo fbclid
  if (fbclid && (!req.session || !req.session.fbclidTracked || req.session.fbclid !== fbclid)) {
    // Salva fbclid in sessione se presente
    if (req.session) {
      req.session.fbclid = fbclid;
      req.session.fbclidTimestamp = Date.now();
      req.session.fbclidTracked = true;
    }
    
    try {
      // Genera un ID evento univoco per la deduplicazione
      const eventId = 'pageview_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
      
      // Payload per l'evento
      const payload = {
        data: [{
          event_name: 'PageView',
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          event_source_url: req.headers.referer || `https://${req.get('host')}${req.originalUrl}`,
          user_data: {
            client_user_agent: req.headers['user-agent'] || '',
          },
          custom_data: {}
        }],
        access_token: process.env.ACCESS_TOKEN,
        partner_agent: 'costruzionedigitale-nodejs',
        test_event_code: process.env.NODE_ENV === 'production' ? undefined : process.env.FACEBOOK_TEST_EVENT_CODE
      };
      
      // Aggiungi fbclid al campo corretto
      if (fbclid) {
        // L'fbclid deve essere passato come parametro esterno per il matching
        const timestamp = Date.now();
        payload.data[0].user_data.fbc = `fb.1.${timestamp}.${fbclid}`;
      }
      
      // Invia l'evento PageView alla CAPI
      await axios.post(
        `https://graph.facebook.com/v22.0/1543790469631614/events?access_token=EAAd7rpHujUkBO3iESqN0hqKg15uiHeDZCIffdtbJIYuzTBVAfq0qMLM6dO70WmZCGE4XmL9kPZAX2S0VbTkIA0ORxypfSnrDK1nALetbLRu0nrEyyfOU7mkQ3Joy1YISlIlEdr9qbjc9YOR6DfS3zKkUf4Vhu9HhTKYta5ZAZCPnEZAbgF8CPvAeVHPS2nggZDZD`,
        payload
      );
    } catch (error) {
      console.error('Errore invio PageView a CAPI:', error.message);
    }
  }
  
  next();
});

// Applica i middleware
app.use(checkCookieConsent);

app.use(checkApiAuth);

// Proteggi le route CRM
app.use('/crm', isAuthenticated);
app.use('/api/crm', isAuthenticated);
app.use('/api/dashboard', isAuthenticated);

// ===== ROUTE API =====

// API for getting all leads with unified structure
app.get('/api/leads', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 200;
    const skip = (page - 1) * limit;
    
    // Get user connection
    const connection = await getUserConnection(req);
    
    if (!connection) {
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
    
    // Use the Lead model from the connection
    const Lead = connection.model('Lead');
    
    // Filtering
    let filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.formType) filter.formType = req.query.formType;
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex }
      ];
    }
    
    // Count total documents and get data
    const total = await Lead.countDocuments(filter);
    const leads = await Lead.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({
      success: true,
      data: leads,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching leads', 
      error: error.message 
    });
  }
});

app.get('/api/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user connection
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database not available or not properly configured' 
      });
    }
    
    // Get the Lead model
    const Lead = connection.model('Lead');
    
    // Try to find by leadId field (for UUID format IDs)
    let lead = await Lead.findOne({ leadId: id });
    
    if (lead) {
      return res.json(lead);
    }
    
    // If we reach here, lead wasn't found
    return res.status(404).json({ 
      success: false, 
      message: 'Lead not found' 
    });
    
  } catch (error) {
    console.error('Error retrieving lead:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error retrieving lead', 
      error: error.message 
    });
  }
});

// API for updating lead metadata
// API for updating lead metadata
app.post('/api/leads/:id/update-metadata', async (req, res) => {
  try {
    const { id } = req.params;
    const { value, service, leadType } = req.body;
    
    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID required' 
      });
    }
    
    // Get user connection
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database not available or not properly configured' 
      });
    }
    
    // Use the Lead model from the connection
    const Lead = connection.model('Lead');
    
    // IMPORTANT: Find by leadId field instead of _id
    const lead = await Lead.findOne({ leadId: id });
    
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    
    // Update both top-level fields and extendedData for compatibility
    const updates = {};
    
    if (value !== undefined && value !== null) {
      updates.value = value;
      
      // Also update in extendedData for backward compatibility
      if (!lead.extendedData) {
        lead.extendedData = {};
      }
      lead.extendedData.value = value;
    }
    
    if (service !== undefined) {
      updates.service = service;
      
      // Also update in extendedData.formData for backward compatibility
      if (!lead.extendedData) {
        lead.extendedData = {};
      }
      if (!lead.extendedData.formData) {
        lead.extendedData.formData = {};
      }
      lead.extendedData.formData.service = service;
    }
    
    updates.updatedAt = new Date();
    
    // Apply all the updates
    Object.assign(lead, updates);
    await lead.save();
    
    res.json({
      success: true,
      message: 'Metadata updated successfully',
      data: lead
    });
  } catch (error) {
    console.error('Error updating lead metadata:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating metadata', 
      error: error.message 
    });
  }
});

// In server.js, aggiungi un endpoint per ottenere un singolo lead
app.get('/api/leads/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    // Se non c'è connessione, restituisci un errore
    if (connection === null) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    let model;
    
    // Determina il modello in base al tipo di lead
    if (type === 'form') {
      model = connection.model('FormData');
    } else if (type === 'booking') {
      model = connection.model('Booking');
    } else if (type === 'facebook') {
      model = connection.model('FacebookLead');
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Tipo di lead non valido' 
      });
    }
    
    // Trova il lead
    const lead = await model.findById(id);
    if (!lead) {
      return res.status(404).json({ 
        success: false, 
        message: 'Lead non trovato' 
      });
    }
    
    res.json(lead);
  } catch (error) {
    console.error('Errore nel recupero del lead:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero del lead', 
      error: error.message 
    });
  }
});

// API per il login
app.post('/api/login', async (req, res) => {
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

// In server.js, verifica che questa route funzioni correttamente
app.post('/api/logout', (req, res) => {
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

// API per il logout
app.get('/api/logout', (req, res) => {
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

// Schema per i progetti/cantieri
const ProjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  client: { type: String, required: true },
  address: { type: String, required: true },
  description: { type: String },
  startDate: { type: Date },
  estimatedEndDate: { type: Date },
  status: {
    type: String,
    enum: ['pianificazione', 'in corso', 'in pausa', 'completato', 'cancellato'],
    default: 'pianificazione'
  },
  budget: { type: Number, default: 0 }, // Valore stimato in euro
  progress: { type: Number, default: 0 }, // Percentuale di completamento
  documents: [{
    name: String,
    fileUrl: String,
    fileType: String,
    uploadDate: { type: Date, default: Date.now }
  }],
  images: [{
    name: String,
    imageUrl: String,
    caption: String,
    uploadDate: { type: Date, default: Date.now }
  }],
  notes: [{
    text: String,
    createdAt: { type: Date, default: Date.now },
    createdBy: String
  }],
  tasks: [{
    name: String,
    description: String,
    status: {
      type: String,
      enum: ['da iniziare', 'in corso', 'completato'],
      default: 'da iniziare'
    },
    dueDate: Date
  }],
  contactPerson: {
    name: String,
    phone: String,
    email: String
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true }
});

// Crea il modello Project
const Project = mongoose.model('Project', ProjectSchema);

// Calcolo statistiche dashboard potenziate
app.get('/api/dashboard/stats', async (req, res) => {
  console.log("[/api/dashboard/stats] Request received");
  try {
    // Verify authentication
    if (!req.session || !req.session.isAuthenticated) {
      console.log("[/api/dashboard/stats] Not authenticated");
      return res.status(401).json({ success: false, message: 'Non autorizzato' });
    }
    
    console.log("[/api/dashboard/stats] User:", req.session.user?.username);
    
    // Get user connection
    const connection = await getUserConnection(req);
    
    if (!connection) {
      console.log("[/api/dashboard/stats] Failed to get database connection");
      return res.status(400).json({ success: false, message: 'Configurazione database non trovata' });
    }
    
    // Get Lead model
    const Lead = connection.model('Lead');
    console.log("[/api/dashboard/stats] Using Lead model");
    
    // Get data for dashboard stats
    console.log("[/api/dashboard/stats] Calculating statistics...");
    
    // Today and date ranges
    const today = new Date();
    const oneWeekAgo = new Date(today); oneWeekAgo.setDate(today.getDate() - 7);
    const twoWeeksAgo = new Date(today); twoWeeksAgo.setDate(today.getDate() - 14);
    
    // Form leads include both 'form' and 'contact' formTypes
    console.log("[/api/dashboard/stats] Counting form leads (including 'contact' type)");
    const formTotal = await Lead.countDocuments({ 
      $or: [
        { formType: 'form' },
        { formType: 'contact' }
      ]
    });
    console.log(`[/api/dashboard/stats] Form leads count: ${formTotal}`);
    
    // Form conversions
    const formConverted = await Lead.countDocuments({ 
      $or: [
        { formType: 'form' },
        { formType: 'contact' }
      ], 
      status: 'converted' 
    });
    
    // Form leads this week
    const formThisWeek = await Lead.countDocuments({ 
      $or: [
        { formType: 'form' },
        { formType: 'contact' }
      ],
      createdAt: { $gte: oneWeekAgo, $lte: today } 
    });
    
    // Form leads last week
    const formLastWeek = await Lead.countDocuments({ 
      $or: [
        { formType: 'form' },
        { formType: 'contact' }
      ],
      createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo } 
    });
    
    // Booking leads
    const bookingTotal = await Lead.countDocuments({ formType: 'booking' });
    const bookingConverted = await Lead.countDocuments({ formType: 'booking', status: 'converted' });
    const bookingThisWeek = await Lead.countDocuments({ 
      formType: 'booking', 
      createdAt: { $gte: oneWeekAgo, $lte: today } 
    });
    const bookingLastWeek = await Lead.countDocuments({ 
      formType: 'booking', 
      createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo } 
    });
    
    // Facebook leads
    const facebookTotal = await Lead.countDocuments({ formType: 'facebook' });
    const facebookConverted = await Lead.countDocuments({ formType: 'facebook', status: 'converted' });
    const facebookThisWeek = await Lead.countDocuments({ 
      formType: 'facebook', 
      createdAt: { $gte: oneWeekAgo, $lte: today } 
    });
    const facebookLastWeek = await Lead.countDocuments({ 
      formType: 'facebook', 
      createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo } 
    });
    
    // Calculate total stats and conversion rates
    const totalLeads = formTotal + bookingTotal + facebookTotal;
    const totalConverted = formConverted + bookingConverted + facebookConverted;
    const totalConversionRate = totalLeads > 0 ? Math.round((totalConverted / totalLeads) * 100) : 0;
    
    const totalThisWeek = formThisWeek + bookingThisWeek + facebookThisWeek;
    const totalLastWeek = formLastWeek + bookingLastWeek + facebookLastWeek;
    
    // Calculate trends
    let formTrend = 0, bookingTrend = 0, facebookTrend = 0, totalTrend = 0;
    
    if (formLastWeek > 0) formTrend = Math.round(((formThisWeek - formLastWeek) / formLastWeek) * 100);
    if (bookingLastWeek > 0) bookingTrend = Math.round(((bookingThisWeek - bookingLastWeek) / bookingLastWeek) * 100);
    if (facebookLastWeek > 0) facebookTrend = Math.round(((facebookThisWeek - facebookLastWeek) / facebookLastWeek) * 100);
    if (totalLastWeek > 0) totalTrend = Math.round(((totalThisWeek - totalLastWeek) / totalLastWeek) * 100);
    
    // Debug total counts
    console.log(`[/api/dashboard/stats] Total counts - Forms: ${formTotal}, Bookings: ${bookingTotal}, Facebook: ${facebookTotal}`);
    
    // Prepare response
    const stats = {
      forms: {
        total: formTotal,
        converted: formConverted,
        conversionRate: formTotal > 0 ? Math.round((formConverted / formTotal) * 100) : 0,
        trend: formTrend,
        thisWeek: formThisWeek,
        lastWeek: formLastWeek
      },
      bookings: {
        total: bookingTotal,
        converted: bookingConverted,
        conversionRate: bookingTotal > 0 ? Math.round((bookingConverted / bookingTotal) * 100) : 0,
        trend: bookingTrend,
        thisWeek: bookingThisWeek,
        lastWeek: bookingLastWeek
      },
      facebook: {
        total: facebookTotal,
        converted: facebookConverted,
        conversionRate: facebookTotal > 0 ? Math.round((facebookConverted / facebookTotal) * 100) : 0,
        trend: facebookTrend,
        thisWeek: facebookThisWeek,
        lastWeek: facebookLastWeek
      },
      events: {
        total: 0,
        success: 0,
        successRate: 0
      },
      totalConversionRate,
      totalTrend,
      totalThisWeek,
      totalLastWeek
    };
    
    console.log("[/api/dashboard/stats] Sending response");
    res.json(stats);
  } catch (error) {
    console.error("[/api/dashboard/stats] ERROR:", error.message);
    console.error("[/api/dashboard/stats] Stack:", error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero delle statistiche',
      error: error.message
    });
  }
});

// API for recent events
app.get('/api/dashboard/recent-events', async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.session || !req.session.isAuthenticated) {
      return res.status(401).json({ 
        success: false, 
        message: 'Non autorizzato' 
      });
    }
    
    // Get user connection
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(400).json({ 
        success: false, 
        message: 'Configurazione database non trovata' 
      });
    }
    
    // Get models
    const UserFacebookEvent = connection.model('FacebookEvent');
    
    // Get the 10 most recent events
    const events = await UserFacebookEvent.find({})
      .sort({ createdAt: -1 })
      .limit(10);
    
    res.json(events);
  } catch (error) {
    console.error('Error fetching recent events:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero degli eventi recenti' 
    });
  }
});

// API for unviewed contacts
app.get('/api/dashboard/new-contacts', async (req, res) => {
  console.log("[/api/dashboard/new-contacts] Request received");
  try {
    // Ensure user is authenticated
    if (!req.session || !req.session.isAuthenticated) {
      console.log("[/api/dashboard/new-contacts] Not authenticated");
      return res.status(401).json({ success: false, message: 'Non autorizzato' });
    }
    
    console.log("[/api/dashboard/new-contacts] User:", req.session.user?.username);
    
    // Get user connection
    const connection = await getUserConnection(req);
    
    if (!connection) {
      console.log("[/api/dashboard/new-contacts] Failed to get database connection");
      return res.status(400).json({ success: false, message: 'Configurazione database non trovata' });
    }
    
    // Get Lead model
    const Lead = connection.model('Lead');
    console.log("[/api/dashboard/new-contacts] Using Lead model");
    
    // Get recent leads regardless of status
    const recentLeads = await Lead.find({})
      .sort({ createdAt: -1 })
      .limit(20);
    
    console.log(`[/api/dashboard/new-contacts] Query result: ${recentLeads.length}`);
    
    // Debug the first lead
    if (recentLeads.length > 0) {
      console.log("First lead details:", JSON.stringify(recentLeads[0]).substring(0, 500));
    }
    
    // Transform for frontend with improved mapping
    const contacts = recentLeads.map(lead => {
      // Name extraction from firstName/lastName or fallback
      const name = [lead.firstName || '', lead.lastName || ''].filter(Boolean).join(' ') || lead.name || 'Contact';
      
      // Improved type mapping - handle 'contact' formType as 'form'
      let type = 'form'; // Default to form
      if (lead.formType === 'booking') type = 'booking';
      if (lead.formType === 'facebook') type = 'facebook';
      
      return {
        _id: lead._id,
        name: name,
        email: lead.email || '',
        source: lead.source || lead.formType || 'Unknown',
        type: type,
        createdAt: lead.createdAt,
        viewed: lead.viewed === true // Use the explicit viewed field instead of inferring from status
      };
    });
    
    console.log(`[/api/dashboard/new-contacts] Transformed contacts: ${contacts.length}`);
    console.log("[/api/dashboard/new-contacts] Sending response");
    res.json(contacts);
  } catch (error) {
    console.error("[/api/dashboard/new-contacts] ERROR:", error.message);
    console.error("[/api/dashboard/new-contacts] Stack:", error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero dei nuovi contatti',
      error: error.message
    });
  }
});

// Updated API to mark a contact as viewed
app.post('/api/dashboard/mark-viewed/:id', async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.session || !req.session.isAuthenticated) {
      return res.status(401).json({ 
        success: false, 
        message: 'Non autorizzato' 
      });
    }
    
    const { id } = req.params;
    
    // Get user connection
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(400).json({ 
        success: false, 
        message: 'Configurazione database non trovata' 
      });
    }
    
    // Get the Lead model
    const Lead = connection.model('Lead');
    
    // Update lead to set viewed=true and update status from 'new' to 'contacted'
    const updateResult = await Lead.findByIdAndUpdate(
      id,
      { 
        $set: { 
          viewed: true,          
          viewedAt: new Date(),  
          updatedAt: new Date() 
        }
      },
      { new: true }
    );
    
    if (!updateResult) {
      return res.status(404).json({ 
        success: false, 
        message: 'Contatto non trovato' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Contatto segnato come visto', 
      data: updateResult 
    });
  } catch (error) {
    console.error('Error marking contact as viewed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel segnare il contatto come visto' 
    });
  }
});

// Updated API to mark all contacts as viewed
app.post('/api/dashboard/mark-all-viewed', async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.session || !req.session.isAuthenticated) {
      return res.status(401).json({ 
        success: false, 
        message: 'Non autorizzato' 
      });
    }
    
    // Get user connection
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(400).json({ 
        success: false, 
        message: 'Configurazione database non trovata' 
      });
    }
    
    // Get the Lead model
    const Lead = connection.model('Lead');
    
    // Update all leads with viewed=false to set viewed=true
    const result = await Lead.updateMany(
      { viewed: false }, // Only update unviewed leads
      { 
        $set: { 
          viewed: true,
          viewedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    res.json({ 
      success: true, 
      message: 'Tutti i contatti segnati come visti',
      count: result.modifiedCount || 0
    });
  } catch (error) {
    console.error('Error marking all contacts as viewed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel segnare tutti i contatti come visti' 
    });
  }
});

// API per ottenere tutti i progetti dell'utente
app.get('/api/projects', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const projects = await Project.find({ userId }).sort({ createdAt: -1 });
    
    res.json(projects);
  } catch (error) {
    console.error('Errore nel recupero dei progetti:', error);
    res.status(500).json({ success: false, message: 'Errore nel recupero dei progetti', error: error.message });
  }
});

// API per ottenere un singolo progetto
app.get('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    
    const project = await Project.findOne({ _id: id, userId });
    
    if (!project) {
      return res.status(404).json({ success: false, message: 'Progetto non trovato' });
    }
    
    res.json(project);
  } catch (error) {
    console.error('Errore nel recupero del progetto:', error);
    res.status(500).json({ success: false, message: 'Errore nel recupero del progetto', error: error.message });
  }
});

// API per creare un nuovo progetto
app.post('/api/projects', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const projectData = {
      ...req.body,
      userId
    };
    
    const project = new Project(projectData);
    await project.save();
    
    res.status(201).json(project);
  } catch (error) {
    console.error('Errore nella creazione del progetto:', error);
    res.status(500).json({ success: false, message: 'Errore nella creazione del progetto', error: error.message });
  }
});

// API per aggiornare un progetto
app.put('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    
    // Trova il progetto e verifica che appartenga all'utente
    const project = await Project.findOne({ _id: id, userId });
    
    if (!project) {
      return res.status(404).json({ success: false, message: 'Progetto non trovato' });
    }
    
    // Aggiorna i campi del progetto
    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };
    
    // Esegui l'aggiornamento
    const updatedProject = await Project.findByIdAndUpdate(
      id, 
      updateData,
      { new: true } // Ritorna il documento aggiornato
    );
    
    res.json(updatedProject);
  } catch (error) {
    console.error('Errore nell\'aggiornamento del progetto:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'aggiornamento del progetto', error: error.message });
  }
});

// API per eliminare un progetto
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    
    // Trova ed elimina il progetto
    const result = await Project.deleteOne({ _id: id, userId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Progetto non trovato' });
    }
    
    res.json({ success: true, message: 'Progetto eliminato con successo' });
  } catch (error) {
    console.error('Errore nell\'eliminazione del progetto:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'eliminazione del progetto', error: error.message });
  }
});

// API per aggiungere un'immagine a un progetto
app.post('/api/projects/:id/images', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const { name, imageUrl, caption } = req.body;
    
    // Verifica che il progetto esista e appartenga all'utente
    const project = await Project.findOne({ _id: id, userId });
    
    if (!project) {
      return res.status(404).json({ success: false, message: 'Progetto non trovato' });
    }
    
    // Aggiungi l'immagine all'array delle immagini
    project.images.push({
      name,
      imageUrl,
      caption,
      uploadDate: new Date()
    });
    
    project.updatedAt = new Date();
    await project.save();
    
    res.status(201).json(project);
  } catch (error) {
    console.error('Errore nell\'aggiunta dell\'immagine:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'aggiunta dell\'immagine', error: error.message });
  }
});

// API per aggiungere un documento a un progetto
app.post('/api/projects/:id/documents', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const { name, fileUrl, fileType } = req.body;
    
    // Verifica che il progetto esista e appartenga all'utente
    const project = await Project.findOne({ _id: id, userId });
    
    if (!project) {
      return res.status(404).json({ success: false, message: 'Progetto non trovato' });
    }
    
    // Aggiungi il documento all'array dei documenti
    project.documents.push({
      name,
      fileUrl,
      fileType,
      uploadDate: new Date()
    });
    
    project.updatedAt = new Date();
    await project.save();
    
    res.status(201).json(project);
  } catch (error) {
    console.error('Errore nell\'aggiunta del documento:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'aggiunta del documento', error: error.message });
  }
});

// API per aggiungere un'attività al progetto
app.post('/api/projects/:id/tasks', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const { name, description, status, dueDate } = req.body;
    
    // Verifica che il progetto esista e appartenga all'utente
    const project = await Project.findOne({ _id: id, userId });
    
    if (!project) {
      return res.status(404).json({ success: false, message: 'Progetto non trovato' });
    }
    
    // Aggiungi l'attività all'array delle attività
    project.tasks.push({
      name,
      description,
      status: status || 'da iniziare',
      dueDate: dueDate ? new Date(dueDate) : null
    });
    
    project.updatedAt = new Date();
    await project.save();
    
    res.status(201).json(project);
  } catch (error) {
    console.error('Errore nell\'aggiunta dell\'attività:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'aggiunta dell\'attività', error: error.message });
  }
});

// API per aggiungere una nota al progetto
app.post('/api/projects/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const { text } = req.body;
    
    // Verifica che il progetto esista e appartenga all'utente
    const project = await Project.findOne({ _id: id, userId });
    
    if (!project) {
      return res.status(404).json({ success: false, message: 'Progetto non trovato' });
    }
    
    // Aggiungi la nota all'array delle note
    project.notes.push({
      text,
      createdAt: new Date(),
      createdBy: req.session.user.username
    });
    
    project.updatedAt = new Date();
    await project.save();
    
    res.status(201).json(project);
  } catch (error) {
    console.error('Errore nell\'aggiunta della nota:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'aggiunta della nota', error: error.message });
  }
});

// API per verificare lo stato dell'autenticazione
app.get('/api/check-auth', (req, res) => {
  // Sempre rispondere con un JSON, mai reindirizzare
  res.json({ 
    authenticated: !!(req.session && req.session.isAuthenticated),
    user: req.session && req.session.user ? {
      username: req.session.user.username,
      role: req.session.user.role || 'user'
    } : null
  });
});

// API per ottenere lo stato attuale del consenso ai cookie
app.get('/api/cookie-consent', async (req, res) => {
  try {
    const userId = req.cookies.userId;
    console.log(`[Server] GET /api/cookie-consent - userId: ${userId}`);
    
    if (!userId) {
      console.log('[Server] Nessun userId trovato nei cookie');
      return res.status(200).json({
        essential: true,
        analytics: false,
        marketing: false,
        configured: false
      });
    }
    
    const consent = await CookieConsent.findOne({ userId });
    
    if (!consent) {
      console.log('[Server] Nessun consenso trovato nel DB per userId:', userId);
      return res.status(200).json({
        essential: true,
        analytics: false,
        marketing: false,
        configured: false
      });
    }
    
    console.log('[Server] Consenso trovato nel DB:', consent);
    res.status(200).json({
      essential: consent.essential,
      analytics: consent.analytics,
      marketing: consent.marketing,
      configured: consent.configured || false
    });
  } catch (error) {
    console.error('[Server] Errore nel recupero del consenso cookie:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero delle preferenze cookie'
    });
  }
});

// API per salvare il consenso ai cookie
app.post('/api/cookie-consent', async (req, res) => {
  try {
    const { essential, analytics, marketing } = req.body;
    const userId = req.cookies.userId || generateUserId();
    
    console.log(`[Server] POST /api/cookie-consent - userId: ${userId}, data:`, req.body);
    
    // Se l'utente non ha ancora un ID, imposta il cookie
    if (!req.cookies.userId) {
      console.log('[Server] Impostando nuovo userId cookie:', userId);
      res.cookie('userId', userId, { 
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 anno
        httpOnly: true,
        sameSite: 'strict'
      });
    }
    
    // Imposta anche il cookie di consenso nel browser per garantire la sincronizzazione
    const consentData = {
      essential: essential !== undefined ? essential : true,
      analytics: analytics !== undefined ? analytics : false,
      marketing: marketing !== undefined ? marketing : false,
      configured: true
    };
    
    res.cookie('user_cookie_consent', JSON.stringify(consentData), { 
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 anno
      path: '/',
      sameSite: 'strict'
    });
    
    console.log('[Server] Cookie di consenso impostato:', consentData);
    
    // Cerca il consenso esistente o crea nuovo
    let consent = await CookieConsent.findOne({ userId });
    
    if (consent) {
      console.log('[Server] Aggiornamento consenso esistente nel DB');
      // Aggiorna il consenso esistente
      consent.essential = essential !== undefined ? essential : true; // Essential è sempre true
      consent.analytics = analytics !== undefined ? analytics : false;
      consent.marketing = marketing !== undefined ? marketing : false;
      consent.configured = true;  // Segna come configurato
      consent.updatedAt = new Date();
      await consent.save();
    } else {
      console.log('[Server] Creazione nuovo consenso nel DB');
      // Crea un nuovo record di consenso
      consent = await CookieConsent.create({
        userId,
        essential: essential !== undefined ? essential : true,
        analytics: analytics !== undefined ? analytics : false,
        marketing: marketing !== undefined ? marketing : false,
        configured: true  // Segna come configurato
      });
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Preferenze cookie salvate con successo',
      consent: {
        essential: consent.essential,
        analytics: consent.analytics,
        marketing: consent.marketing,
        configured: consent.configured
      }
    });
  } catch (error) {
    console.error('[Server] Errore nel salvataggio del consenso cookie:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel salvataggio delle preferenze cookie'
    });
  }
});

// Reset Cookie Consent
app.post('/api/cookie-consent/reset', async (req, res) => {
  try {
    const userId = req.cookies.userId;
    
    if (userId) {
      // Rimuovi il record dal database
      await CookieConsent.findOneAndDelete({ userId });
    }
    
    // Cancella i cookie
    res.clearCookie('userId');
    res.clearCookie('user_cookie_consent');
    
    res.status(200).json({ 
      success: true, 
      message: 'Preferenze cookie resettate con successo'
    });
  } catch (error) {
    console.error('Errore nel reset delle preferenze cookie:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel reset delle preferenze cookie'
    });
  }
});

// API per la gestione dell'invio del form
app.post('/api/submit-form', async (req, res) => {
  try {
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

// API per la gestione dell'invio della prenotazione
app.post('/api/submit-booking', async (req, res) => {
  try {
    // Genera un ID evento univoco per la deduplicazione
    const eventId = 'event_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    
    // Assicurati che il timestamp della prenotazione sia valido
    const bookingData = { ...req.body };
    
    // Aggiungi fbclid alla prenotazione se presente nella sessione
    if (req.session && req.session.fbclid) {
      bookingData.fbclid = req.session.fbclid;
      bookingData.fbclidTimestamp = req.session.fbclidTimestamp || Date.now();
    }

    // Parse del timestamp se è una stringa, mantenendo l'ora locale
    if (typeof bookingData.bookingTimestamp === 'string') {
        // Crea un timestamp dal valore ISO string mantenendo l'ora corretta
        const bookingTimestamp = new Date(bookingData.bookingTimestamp);
        
        // Estrai l'ora dalla stringa dell'orario fornita
        // perché il timestamp ISO potrebbe aver modificato il fuso orario
        if (bookingData.bookingTime) {
            const hourString = bookingData.bookingTime.split(':')[0];
            const hour = parseInt(hourString, 10);
            
            // Assicurati che sia l'ora corretta nel database
            const date = new Date(bookingTimestamp);
            date.setHours(hour, 0, 0, 0);
            bookingData.bookingTimestamp = date;
        } else {
            bookingData.bookingTimestamp = bookingTimestamp;
        }
    }
    
    // Controlla se già esiste una prenotazione per lo stesso orario
    const bookingHour = new Date(bookingData.bookingTimestamp).getHours();
    const bookingDay = new Date(bookingData.bookingTimestamp).setHours(0, 0, 0, 0);
    
    const existingBooking = await Booking.findOne({
        $and: [
            // Stessa data (ignorando l'ora)
            {
                bookingTimestamp: {
                    $gte: new Date(bookingDay),
                    $lt: new Date(bookingDay + 24 * 60 * 60 * 1000)
                }
            },
            // Stessa ora
            {
                $expr: {
                    $eq: [{ $hour: "$bookingTimestamp" }, bookingHour]
                }
            },
            // Non cancellata
            { status: { $ne: 'cancelled' } }
        ]
    });
    
    if (existingBooking) {
      return res.status(409).json({ 
        success: false, 
        error: 'Questo orario è già stato prenotato. Per favore, seleziona un altro orario.' 
      });
    }
    
    // Crea un nuovo documento di prenotazione
    const booking = new Booking(bookingData);
    
    // Salva la prenotazione
    await booking.save();
    
    // Invia email di conferma all'utente
    try {
      await sendBookingConfirmationEmail(booking);
    } catch (emailError) {
      console.error('Errore invio email:', emailError);
      // Continuiamo comunque perché la prenotazione è stata salvata
    }
    
    // Invia evento alla Facebook Conversion API
    try {
      const userData = {
        email: req.body.email,
        phone: req.body.phone,
        name: req.body.name
      };
      
      const eventData = {
        sourceUrl: req.headers.referer || 'https://costruzionedigitale.com',
        customData: {
          form_type: 'booking_call',
          content_name: 'Prenotazione chiamata',
          booking_date: req.body.bookingDate,
          booking_time: req.body.bookingTime
        }
      };
      
      // Invia gli eventi come Lead e Schedule
      await sendFacebookConversionEvent('Lead', userData, eventData, req);
      await sendFacebookConversionEvent('Schedule', userData, eventData, req);
    } catch (conversionError) {
      console.error('Errore nell\'invio degli eventi alla CAPI:', conversionError);
    }
    
    // Restituisci l'eventId per la deduplicazione lato client
    res.status(200).json({ 
      success: true, 
      eventId, 
      message: 'Prenotazione completata con successo'
    });
  } catch (error) {
    console.error('Errore nella prenotazione:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Errore durante la prenotazione',
      details: error.message
    });
  }
});

// API per verificare disponibilità delle date
app.get('/api/booking/availability', async (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ success: false, error: 'Data non specificata' });
    }
    
    // Converte la data in formato ISO in un oggetto Date
    // Assicurandosi che la data sia interpretata come mezzanotte UTC
    const selectedDate = new Date(date + 'T00:00:00.000Z');
    
    // Imposta la data a mezzanotte locale
    selectedDate.setHours(0, 0, 0, 0);
    
    // Trova le prenotazioni per la data selezionata
    const nextDay = new Date(selectedDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    const bookings = await Booking.find({
      bookingTimestamp: {
        $gte: selectedDate,
        $lt: nextDay
      },
      status: { $ne: 'cancelled' }
    });
    
    // Slot orari disponibili (9:00 - 17:00)
    const workHours = [9, 10, 11, 12, 14, 15, 16, 17];
    
    // Trova gli slot già prenotati
    const bookedSlots = bookings.map(booking => {
      // Estrai solo l'ora dal timestamp della prenotazione
      if (booking.bookingTimestamp) {
        // Crea un oggetto date locale senza conversione UTC
        const bookingDate = new Date(booking.bookingTimestamp);
        // Ajusta l'orario per il fuso UTC+2 (Roma)
        const localHour = bookingDate.getHours();
        return localHour;
      }
      
      // Fallback: estrai l'ora dalla stringa dell'orario se il timestamp non è valido
      if (booking.bookingTime) {
        const hourStr = booking.bookingTime.split(':')[0];
        return parseInt(hourStr, 10);
      }
      
      return null;
    }).filter(hour => hour !== null);
    
    // Genera l'array di disponibilità
    const availability = workHours.map(hour => ({
      hour,
      formatted: `${hour}:00`,
      available: !bookedSlots.includes(hour)
    }));
    
    res.status(200).json({ 
      success: true, 
      date: selectedDate.toISOString().split('T')[0],
      availability,
      message: 'Disponibilità recuperata con successo'
    });
  } catch (error) {
    console.error('Errore nel recupero disponibilità:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Errore nel recupero disponibilità',
      details: error.message 
    });
  }
});

// ===== ROUTE WEBHOOK FACEBOOK =====

// Route form webhook per Facebook (verifica)
app.get('/webhook/facebook-leads', (req, res) => {
  try {
    // Verifica dell'autenticazione del webhook
    const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
    
    // Verifica del modo - per la configurazione iniziale
    if (req.query['hub.mode'] === 'subscribe' && 
        req.query['hub.verify_token'] === VERIFY_TOKEN) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    
    // Se è una semplice visita all'URL senza parametri di verifica
    if (!req.query['hub.mode']) {
      return res.status(200).send('Webhook endpoint attivo. Usa questo URL nella configurazione di Facebook.');
    }
    
    // Se la verifica fallisce
    res.status(403).send('Forbidden: token non valido');
  } catch (error) {
    console.error('Errore nella verifica del webhook:', error);
    res.status(500).send('Errore interno');
  }
});

// Webhook per ricevere lead da Facebook
app.post('/webhook/facebook-leads', async (req, res) => {
  try {
    // Verifica dell'autenticazione del webhook
    const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
    
    // Verifica del modo - per la configurazione iniziale
    if (req.query['hub.mode'] === 'subscribe' && 
        req.query['hub.verify_token'] === VERIFY_TOKEN) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    
    // Elabora la notifica di lead
    const data = req.body;
    
    // Verifica che sia una notifica di lead
    if (data.object === 'page' && data.entry && data.entry.length > 0) {
      for (const entry of data.entry) {
        for (const change of entry.changes) {
          if (change.field === 'leadgen' && change.value) {
            const leadData = change.value;
            
            // L'ID del lead è in leadData.leadgen_id
            const leadId = leadData.leadgen_id;
            const formId = leadData.form_id;
            
            try {
              // Recupera i dettagli completi del lead tramite API Graph
              await retrieveLeadDetails(leadId, formId);
            } catch (error) {
              // Salva almeno i dati di base nel modello FacebookLead
              try {
                await FacebookLead.create({
                  leadId: leadData.leadgen_id,
                  formId: leadData.form_id,
                  adId: leadData.ad_id,
                  pageId: leadData.page_id,
                  adgroupId: leadData.adgroup_id,
                  createdTime: leadData.created_time,
                  name: 'Lead da Facebook',
                  email: 'lead@facebook.com',  // Email placeholder
                  phone: '',
                  rawData: leadData
                });
              } catch (dbError) {
                console.error('Errore nel salvataggio dei dati di base del lead:', dbError);
              }
            }
          }
        }
      }
    }
    
    // Rispondi con successo a Facebook
    res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    console.error('Errore webhook lead:', error);
    res.status(500).send('ERRORE_INTERNO');
  }
});

// Funzione per recuperare i dettagli completi del lead
async function retrieveLeadDetails(leadId, formId) {
  try {
    // Assicurati di avere un token d'accesso con i permessi necessari
    const response = await axios.get(
      `https://graph.facebook.com/v22.0/1543790469631614/events?access_token=EAAd7rpHujUkBO3iESqN0hqKg15uiHeDZCIffdtbJIYuzTBVAfq0qMLM6dO70WmZCGE4XmL9kPZAX2S0VbTkIA0ORxypfSnrDK1nALetbLRu0nrEyyfOU7mkQ3Joy1YISlIlEdr9qbjc9YOR6DfS3zKkUf4Vhu9HhTKYta5ZAZCPnEZAbgF8CPvAeVHPS2nggZDZD`
    );
    
    const leadDetails = response.data;
    
    // Estrai i campi del form (dipende dalla struttura del tuo form)
    const fieldsData = {};
    if (leadDetails.field_data && leadDetails.field_data.length > 0) {
      for (const field of leadDetails.field_data) {
        fieldsData[field.name] = field.values[0];
      }
    }
    
    // Crea un nuovo lead nel modello FacebookLead
    const newLead = await FacebookLead.create({
      leadId: leadId,
      formId: formId,
      adId: leadDetails.ad_id,
      pageId: leadDetails.page_id,
      adgroupId: leadDetails.adgroup_id,
      createdTime: leadDetails.created_time,
      name: fieldsData.full_name || fieldsData.name || 'N/A',
      email: fieldsData.email || 'N/A',
      phone: fieldsData.phone_number || fieldsData.phone || 'N/A',
      customFields: fieldsData,
      rawData: leadDetails
    });
    
    return newLead;
  } catch (error) {
    console.error('Errore recupero dettagli lead:', error);
    throw error;
  }
}

// ===== ROUTE API DASHBOARD =====

// API per aggiornare i metadati di un form (valore e servizio)
app.post('/api/leads/forms/:id/update-metadata', async (req, res) => {
  try {
    const { id } = req.params;
    const { value, service } = req.body;
    
    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID richiesto' 
      });
    }
    
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    // Se non c'è connessione, restituisci un errore
    if (connection === null) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Usa i modelli dalla connessione
    const UserFormData = connection.model('FormData');
    
    // Trova il form
    const form = await UserFormData.findById(id);
    if (!form) {
      return res.status(404).json({ success: false, message: 'Form non trovato' });
    }
    
    // Aggiorna i metadati
    if (value !== undefined && value !== null) {
      form.value = value;
    }
    
    if (service !== undefined) {
      form.service = service;
    }
    
    form.updatedAt = new Date();
    
    await form.save();
    
    res.json({
      success: true,
      message: 'Metadati aggiornati con successo',
      data: form
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento dei metadati:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'aggiornamento dei metadati', error: error.message });
  }
});

// API per aggiornare i metadati di una prenotazione (valore e servizio)
app.post('/api/leads/bookings/:id/update-metadata', async (req, res) => {
  try {
    const { id } = req.params;
    const { value, service } = req.body;
    
    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID richiesto' 
      });
    }
    
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    // Se non c'è connessione, restituisci un errore
    if (connection === null) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Usa i modelli dalla connessione
    const UserBooking = connection.model('Booking');
    
    // Trova la prenotazione
    const booking = await UserBooking.findById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Prenotazione non trovata' });
    }
    
    // Aggiorna i metadati
    if (value !== undefined && value !== null) {
      booking.value = value;
    }
    
    if (service !== undefined) {
      booking.service = service;
    }
    
    await booking.save();
    
    res.json({
      success: true,
      message: 'Metadati aggiornati con successo',
      data: booking
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento dei metadati:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'aggiornamento dei metadati', error: error.message });
  }
});

// API per aggiornare i metadati di un lead Facebook (valore e servizio)
app.post('/api/leads/facebook/:id/update-metadata', async (req, res) => {
  try {
    const { id } = req.params;
    const { value, service } = req.body;
    
    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID richiesto' 
      });
    }
    
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    // Se non c'è connessione, restituisci un errore
    if (connection === null) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Usa i modelli dalla connessione
    const UserFacebookLead = connection.model('FacebookLead');
    
    // Trova il lead
    const lead = await UserFacebookLead.findById(id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead Facebook non trovato' });
    }
    
    // Aggiorna i metadati
    if (value !== undefined && value !== null) {
      lead.value = value;
    }
    
    if (service !== undefined) {
      lead.service = service;
    }
    
    lead.updatedAt = new Date();
    
    await lead.save();
    
    res.json({
      success: true,
      message: 'Metadati aggiornati con successo',
      data: lead
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento dei metadati:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'aggiornamento dei metadati', error: error.message });
  }
});

// API per spostare un lead da uno stato a un altro nel funnel
// API per spostare un lead da uno stato a un altro nel funnel (versione aggiornata)
app.post('/api/sales-funnel/move', async (req, res) => {
  try {
    const { 
      leadId, 
      leadType, 
      fromStage, 
      toStage, 
      sendToFacebook, 
      facebookData, 
      originalFromStage, 
      originalToStage,
      createClient,
      consentError
    } = req.body;
    
    if (!leadId || !fromStage || !toStage) {
      return res.status(400).json({ 
        success: false, 
        message: 'Lead ID, status originale e status destinazione sono richiesti' 
      });
    }
    
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Usa il modello Lead
    const Lead = connection.model('Lead');
    
    // IMPORTANTE: Cerca utilizzando il campo leadId invece di _id
    const lead = await Lead.findOne({ leadId: leadId });
    
    if (!lead) {
      return res.status(404).json({ 
        success: false, 
        message: 'Lead non trovato' 
      });
    }
    
    // Aggiorna lo stato
    lead.status = toStage;
    lead.updatedAt = new Date();
    
    await lead.save();
    
    // Risultati dell'invio a Facebook
    let facebookResult = null;
    let clientResult = null;
    
    // Se è richiesta la creazione di un cliente (lead convertito in customer)
    if (createClient && toStage === 'converted') {
      try {
        // Verifica se esiste già un Client model nel connection
        if (!connection.models['Client']) {
          // Definiamo lo schema Client sulla connessione dell'utente
          const ClientSchema = new mongoose.Schema({
            leadId: { type: String, required: true, unique: true },
            clientId: { type: String, required: true, unique: true },
            firstName: String,
            lastName: String,
            email: { type: String, required: true, index: true },
            phone: String,
            fullName: String,
            value: { type: Number, default: 0 },
            service: String,
            status: { 
              type: String, 
              enum: ['active', 'inactive', 'completed', 'on-hold'], 
              default: 'active' 
            },
            createdAt: { type: Date, default: Date.now },
            updatedAt: { type: Date, default: Date.now },
            convertedAt: { type: Date, default: Date.now },
            leadSource: String,
            originalSource: String,
            campaign: String,
            medium: String,
            consent: {
              marketing: { type: Boolean, default: false },
              analytics: { type: Boolean, default: false },
              thirdParty: { type: Boolean, default: false },
              timestamp: Date,
              version: String,
              method: String
            },
            extendedData: mongoose.Schema.Types.Mixed,
            notes: [{
              text: String,
              createdAt: { type: Date, default: Date.now },
              createdBy: String
            }],
            tags: [String],
            properties: { type: Map, of: mongoose.Schema.Types.Mixed },
            location: Object,
            projects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
            isArchived: { type: Boolean, default: false },
            // Nuovo campo per il tracciamento CAPI
            facebookCapi: {
              sent: { type: Boolean, default: false },
              timestamp: Date,
              success: Boolean,
              eventId: String,
              payload: Object,
              response: Object,
              error: Object
            }
          }, { collection: 'clients', strict: false });
          
          // Registra il modello
          connection.model('Client', ClientSchema);
        }
        
        // Ottieni il modello Client
        const Client = connection.model('Client');
        
        // Verifica se esiste già un cliente con questo leadId
        const existingClient = await Client.findOne({ leadId: leadId });
        
        // Variabile per mantenere il riferimento al cliente per aggiornare i dati CAPI in seguito
        let client = null;
        
        if (!existingClient) {
          // Prepara i dati del cliente basandosi sul lead
          const clientData = {
            leadId: lead.leadId,
            clientId: 'CL-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            firstName: lead.firstName || '',
            lastName: lead.lastName || '',
            email: lead.email,
            phone: lead.phone || '',
            fullName: [lead.firstName || '', lead.lastName || ''].filter(Boolean).join(' ') || lead.name || lead.email.split('@')[0],
            value: lead.value || 0,
            service: lead.service || '',
            leadSource: lead.source || lead.medium || '',
            campaign: lead.campaign || '',
            medium: lead.medium || '',
            location: lead.location || {},
            convertedAt: new Date(),
            consent: lead.consent || {
              marketing: false,
              analytics: false,
              thirdParty: false
            },
            extendedData: lead.extendedData || {},
            // Inizializza il campo facebookCapi
            facebookCapi: {
              sent: false,
              timestamp: null,
              success: null,
              eventId: null,
              payload: null,
              response: null,
              error: null
            }
          };
          
          // Crea il nuovo cliente
          const newClient = new Client(clientData);
          await newClient.save();
          
          clientResult = {
            success: true,
            clientId: newClient.clientId,
            message: 'Cliente creato con successo'
          };
          
          client = newClient;
        } else {
          // Aggiorna il cliente esistente
          existingClient.updatedAt = new Date();
          existingClient.value = lead.value || existingClient.value;
          existingClient.service = lead.service || existingClient.service;
          existingClient.status = 'active';
          
          // Assicurati che il campo facebookCapi esista
          if (!existingClient.facebookCapi) {
            existingClient.facebookCapi = {
              sent: false,
              timestamp: null,
              success: null,
              eventId: null,
              payload: null,
              response: null,
              error: null
            };
          }
          
          await existingClient.save();
          
          clientResult = {
            success: true,
            clientId: existingClient.clientId,
            message: 'Cliente esistente aggiornato'
          };
          
          client = existingClient;
        }
        
        // Salvare l'ID del cliente per poterlo aggiornare con i risultati CAPI dopo
        // l'invio a Facebook
        if (client) {
          clientResult.client = client;
        }
      } catch (clientError) {
        console.error('Errore nella creazione/aggiornamento del cliente:', clientError);
        clientResult = {
          success: false,
          error: clientError.message,
          message: 'Errore nella gestione del cliente'
        };
      }
    }
    
    if (sendToFacebook && facebookData) {
      try {
        // Recupera le configurazioni Facebook dell'utente
        const accessToken = req.session?.userConfig?.access_token || process.env.FACEBOOK_ACCESS_TOKEN || process.env.ACCESS_TOKEN;
        const metaPixelId = req.session?.userConfig?.meta_pixel_id || process.env.FACEBOOK_PIXEL_ID || '1543790469631614';
        
        if (!accessToken) {
          throw new Error('Facebook Access Token non configurato');
        }
        
        // Timestamp dell'invio
        const sendTimestamp = new Date();
        
        // Prepara il payload per la CAPI
        const payload = {
          data: [{
            event_name: facebookData.eventName,
            event_time: Math.floor(Date.now() / 1000),
            event_id: facebookData.eventId,
            action_source: "system_generated",
            user_data: facebookData.userData,
            custom_data: facebookData.customData,
            event_source_url: facebookData.eventSourceUrl || `https://${req.get('host')}`,
          }],
          access_token: accessToken,
          partner_agent: 'costruzionedigitale-nodejs-crm'
        };
        
        // Aggiungi parametri specifici per eventi di acquisto
        if (facebookData.eventName === 'Purchase') {
          payload.data[0].custom_data = {
            ...payload.data[0].custom_data,
            value: facebookData.value || 0,
            currency: facebookData.currency || 'EUR',
            content_type: facebookData.contentType || 'product',
            content_name: facebookData.customData.content_name || 'Servizio'
          };
        }
        
        // IP address e user agent se disponibili
        if (facebookData.ipAddress) {
          payload.data[0].user_data.client_ip_address = facebookData.ipAddress;
        }
        
        if (facebookData.userAgent) {
          payload.data[0].user_data.client_user_agent = facebookData.userAgent;
        }
        
        // Aggiungi FBC se disponibile
        if (facebookData.fbc) {
          payload.data[0].user_data.fbc = facebookData.fbc;
        }
        
        // Invia l'evento alla Facebook CAPI
        const response = await axios.post(
          `https://graph.facebook.com/v22.0/${metaPixelId}/events`,
          payload
        );
        
        // Salva l'evento nel database
        if (connection.models['FacebookEvent']) {
          const FacebookEvent = connection.models['FacebookEvent'];
          
          await FacebookEvent.create({
            leadId: lead._id,
            leadType: leadType,
            eventName: facebookData.eventName,
            eventTime: new Date(),
            userData: facebookData.userData,
            customData: facebookData.customData,
            eventId: facebookData.eventId,
            success: true,
            response: response.data
          });
        }
        
        // Prepara l'oggetto risultato
        facebookResult = {
          success: true,
          eventId: facebookData.eventId,
          response: response.data
        };
        
        // NUOVO: Aggiorna il cliente con i dati CAPI se disponibile
        if (clientResult && clientResult.client) {
          try {
            const client = clientResult.client;
            
            // Aggiorna il record del cliente con i dati di successo
            client.facebookCapi = {
              sent: true,
              timestamp: sendTimestamp,
              success: true,
              eventId: facebookData.eventId,
              payload: payload,
              response: response.data
            };
            
            await client.save();
            console.log(`Record cliente ${client.clientId} aggiornato con dati CAPI`);
          } catch (clientUpdateError) {
            console.error('Errore nell\'aggiornamento dei dati CAPI del cliente:', clientUpdateError);
          }
        }
      } catch (fbError) {
        console.error(`Errore nell'invio dell'evento ${facebookData.eventName}:`, fbError);
        
        // Timestamp dell'errore
        const errorTimestamp = new Date();
        
        // Registra comunque l'errore nel database
        if (connection.models['FacebookEvent']) {
          const FacebookEvent = connection.models['FacebookEvent'];
          
          await FacebookEvent.create({
            leadId: lead._id,
            leadType: leadType,
            eventName: facebookData?.eventName || 'unknown',
            eventTime: new Date(),
            userData: facebookData?.userData || {},
            customData: facebookData?.customData || {},
            eventId: facebookData?.eventId || `error_${Date.now()}`,
            success: false,
            error: fbError.message || 'Errore sconosciuto',
            details: fbError.response ? fbError.response.data : null
          });
        }
        
        // Prepara l'oggetto risultato di errore
        facebookResult = {
          success: false,
          error: fbError.message || 'Errore sconosciuto',
          details: fbError.response ? fbError.response.data : null
        };
        
        // NUOVO: Aggiorna il cliente con i dati di errore CAPI se disponibile
        if (clientResult && clientResult.client) {
          try {
            const client = clientResult.client;
            
            // Aggiorna il record del cliente con i dati dell'errore
            client.facebookCapi = {
              sent: true,
              timestamp: errorTimestamp,
              success: false,
              eventId: facebookData?.eventId || `error_${Date.now()}`,
              payload: facebookData ? {
                eventName: facebookData.eventName,
                userData: facebookData.userData,
                customData: facebookData.customData
              } : null,
              error: {
                message: fbError.message,
                stack: fbError.stack,
                details: fbError.response ? fbError.response.data : null
              }
            };
            
            await client.save();
            console.log(`Record cliente ${client.clientId} aggiornato con dati errore CAPI`);
          } catch (clientUpdateError) {
            console.error('Errore nell\'aggiornamento dei dati errore CAPI del cliente:', clientUpdateError);
          }
        }
      }
    }
    
    res.json({
      success: true,
      message: 'Lead spostato con successo',
      data: { 
        leadId, 
        status: toStage, 
        originalStatus: originalToStage || toStage 
      },
      facebookResult,
      clientResult
    });
  } catch (error) {
    console.error('Errore nello spostamento del lead:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nello spostamento del lead', 
      error: error.message 
    });
  }
});

// Inizializza sessione dashboard
app.get('/api/dashboard/init-session', (req, res) => {
  if (!req.session || !req.session.isAuthenticated) {
    return res.json({
      success: false,
      message: 'Sessione non autenticata',
      authenticated: false
    });
  }
  
  res.json({
    success: true,
    message: 'Sessione inizializzata',
    authenticated: true,
    user: req.session.user ? req.session.user.username : null
  });
});

// API per ottenere i form
app.get('/api/leads/forms', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
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
    const UserFormData = connection.model('FormData');
    
    // Filtraggio
    let filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { message: searchRegex }
      ];
    }
    
    // Conta totale documenti e ottieni i dati
    const total = await UserFormData.countDocuments(filter);
    const forms = await UserFormData.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({
      success: true,
      data: forms,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Errore nel recupero dei form:', error);
    res.status(500).json({ success: false, message: 'Errore nel recupero dei form', error: error.message });
  }
});

// API per ottenere le prenotazioni
app.get('/api/leads/bookings', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
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
    const UserBooking = connection.model('Booking');
    
    // Filtraggio
    let filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { message: searchRegex }
      ];
    }
    
    // Conta totale documenti e ottieni i dati
    const total = await UserBooking.countDocuments(filter);
    const bookings = await UserBooking.find(filter)
      .sort({ bookingTimestamp: -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({
      success: true,
      data: bookings,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Errore nel recupero delle prenotazioni:', error);
    res.status(500).json({ success: false, message: 'Errore nel recupero delle prenotazioni', error: error.message });
  }
});

// API per ottenere i lead di Facebook
app.get('/api/leads/facebook', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
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
    const UserFacebookLead = connection.model('FacebookLead');
    
    // Filtraggio
    let filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { leadId: searchRegex },
        { formId: searchRegex }
      ];
    }
    
    // Conta totale documenti e ottieni i dati
    const total = await UserFacebookLead.countDocuments(filter);
    const facebookLeads = await UserFacebookLead.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({
      success: true,
      data: facebookLeads,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Errore nel recupero dei lead Facebook:', error);
    res.status(500).json({ success: false, message: 'Errore nel recupero dei lead Facebook', error: error.message });
  }
});

// API per ottenere gli eventi
app.get('/api/events', async (req, res) => {
  try {
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

// API per aggiornare lo stato di un form
app.post('/api/leads/forms/:id/update', async (req, res) => {
  try {
    const { id } = req.params;
    const { newStatus, eventName, eventMetadata } = req.body;
    
    if (!id || !newStatus || !eventName) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID, nuovo stato ed evento sono richiesti' 
      });
    }
    
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    // Se non c'è connessione, restituisci un errore
    if (connection === null) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Usa i modelli dalla connessione
    const UserFormData = connection.model('FormData');
    const UserFacebookEvent = connection.model('FacebookEvent');
    
    // Trova il form
    const form = await UserFormData.findById(id);
    if (!form) {
      return res.status(404).json({ success: false, message: 'Form non trovato' });
    }
    
    // Aggiorna lo stato
    form.status = newStatus;
    form.updatedAt = new Date();
    
    // Aggiungi evento CRM
    const newEvent = {
      eventName,
      eventTime: new Date(),
      sentToFacebook: false,
      metadata: eventMetadata || {}
    };
    
    form.crmEvents = form.crmEvents || [];
    form.crmEvents.push(newEvent);
    
    await form.save();
    
    // Invia evento a Facebook
    const userData = {
      email: form.email,
      phone: form.phone,
      name: form.name,
      fbclid: form.fbclid,
      fbclidTimestamp: form.fbclidTimestamp
    };
    
    const customData = {
      form_id: form._id.toString(),
      form_source: form.source,
      lead_status: newStatus,
      ...eventMetadata
    };
    
    const facebookResult = await sendFacebookConversionEvent(eventName, userData, customData, req);
    
    // Aggiorna lo stato e registra l'evento
    if (facebookResult.success) {
      form.crmEvents[form.crmEvents.length - 1].sentToFacebook = true;
      await form.save();
      
      await UserFacebookEvent.create({
        leadId: form._id,
        leadType: 'form',
        eventName,
        userData,
        customData,
        eventId: facebookResult.eventId,
        success: true
      });
    } else {
      await UserFacebookEvent.create({
        leadId: form._id,
        leadType: 'form',
        eventName,
        userData,
        customData,
        success: false,
        error: facebookResult.error
      });
    }
    
    res.json({
      success: true,
      data: form,
      facebookResult
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento del form:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'aggiornamento del form', error: error.message });
  }
});

// API per aggiornare lo stato di una prenotazione
app.post('/api/leads/bookings/:id/update', async (req, res) => {
  try {
    const { id } = req.params;
    const { newStatus, eventName, eventMetadata } = req.body;
    
    if (!id || !newStatus || !eventName) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID, nuovo stato ed evento sono richiesti' 
      });
    }
    
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    // Se non c'è connessione, restituisci un errore
    if (connection === null) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Usa i modelli dalla connessione
    const UserBooking = connection.model('Booking');
    const UserFacebookEvent = connection.model('FacebookEvent');
    
    // Trova la prenotazione
    const booking = await UserBooking.findById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Prenotazione non trovata' });
    }
    
    // Aggiorna lo stato
    booking.status = newStatus;
    
    // Aggiungi evento CRM
    const newEvent = {
      eventName,
      eventTime: new Date(),
      sentToFacebook: false,
      metadata: eventMetadata || {}
    };
    
    booking.crmEvents = booking.crmEvents || [];
    booking.crmEvents.push(newEvent);
    
    await booking.save();
    
    // Invia evento a Facebook
    const userData = {
      email: booking.email,
      phone: booking.phone,
      name: booking.name,
      fbclid: booking.fbclid,
      fbclidTimestamp: booking.fbclidTimestamp
    };
    
    const customData = {
      booking_id: booking._id.toString(),
      booking_source: booking.source,
      booking_date: booking.bookingDate,
      booking_time: booking.bookingTime,
      lead_status: newStatus,
      ...eventMetadata
    };
    
    const facebookResult = await sendFacebookConversionEvent(eventName, userData, customData, req);
    
    // Aggiorna lo stato e registra l'evento
    if (facebookResult.success) {
      booking.crmEvents[booking.crmEvents.length - 1].sentToFacebook = true;
      await booking.save();
      
      await UserFacebookEvent.create({
        leadId: booking._id,
        leadType: 'booking',
        eventName,
        userData,
        customData,
        eventId: facebookResult.eventId,
        success: true
      });
    } else {
      await UserFacebookEvent.create({
        leadId: booking._id,
        leadType: 'booking',
        eventName,
        userData,
        customData,
        success: false,
        error: facebookResult.error
      });
    }
    
    res.json({
      success: true,
      data: booking,
      facebookResult
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento della prenotazione:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'aggiornamento della prenotazione', error: error.message });
  }
});

// API per aggiornare lo stato di un lead Facebook
app.post('/api/leads/facebook/:id/update', async (req, res) => {
  try {
    const { id } = req.params;
    const { newStatus, eventName, eventMetadata } = req.body;
    
    if (!id || !newStatus || !eventName) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID, nuovo stato ed evento sono richiesti' 
      });
    }
    
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    // Se non c'è connessione, restituisci un errore
    if (connection === null) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Usa i modelli dalla connessione
    const UserFacebookLead = connection.model('FacebookLead');
    const UserFacebookEvent = connection.model('FacebookEvent');
    
    // Trova il lead
    const lead = await UserFacebookLead.findById(id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead Facebook non trovato' });
    }
    
    // Aggiorna lo stato
    lead.status = newStatus;
    lead.updatedAt = new Date();
    
    await lead.save();
    
    // Invia evento a Facebook
    const userData = {
      email: lead.email,
      phone: lead.phone,
      name: lead.name,
      lead_id: lead.leadId
    };
    
    const customData = {
      form_id: lead.formId,
      ad_id: lead.adId,
      lead_status: newStatus,
      ...eventMetadata
    };
    
    const facebookResult = await sendFacebookConversionEvent(eventName, userData, customData, req);
    
    // Registra l'evento Facebook
    let eventRecord;
    if (facebookResult.success) {
      eventRecord = await UserFacebookEvent.create({
        leadId: lead._id,
        leadType: 'facebook',
        eventName,
        userData,
        customData,
        eventId: facebookResult.eventId,
        success: true
      });
    } else {
      eventRecord = await UserFacebookEvent.create({
        leadId: lead._id,
        leadType: 'facebook',
        eventName,
        userData,
        customData,
        success: false,
        error: facebookResult.error
      });
    }
    
    res.json({
      success: true,
      data: lead,
      facebookResult,
      event: eventRecord
    });
  } catch (error) {
    console.error('Errore nell\'aggiornamento del lead Facebook:', error);
    res.status(500).json({ success: false, message: 'Errore nell\'aggiornamento del lead Facebook', error: error.message });
  }
});

// Configurazione utente API
app.post('/api/user/config', async (req, res) => {
  try {
    const { 
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
    
    // Aggiorna solo i campi forniti
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
    
    res.status(200).json({ 
      success: true, 
      message: 'Configurazioni aggiornate con successo',
      config: {
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
    res.status(500).json({ success: false, message: 'Errore nell\'aggiornamento delle configurazioni' });
  }
});

// ===== ROUTE FRONTEND =====

// Serve file statici per il frontend principale
app.use(express.static(path.join(__dirname, 'www'), {
  extensions: ['html'],
  index: false
}));

// Serve file statici per il frontend dashboard
app.use('/dashboard/assets', express.static(path.join(__dirname, 'public/assets')));
app.use('/api/dashboard', express.static(path.join(__dirname, 'public/api')));

// Route per il tracciamento personalizzato
app.get('/js/tracking.js', async (req, res) => {
  const userId = req.cookies.userId;
  
  // Valori predefiniti
  let consent = { essential: true, analytics: false, marketing: false };
  
  // Controlla i cookie del browser
  if (req.cookies.user_cookie_consent) {
    try {
      const cookieConsent = JSON.parse(req.cookies.user_cookie_consent);
      if (cookieConsent && cookieConsent.configured) {
        consent = {
          essential: cookieConsent.essential !== undefined ? cookieConsent.essential : true,
          analytics: cookieConsent.analytics !== undefined ? cookieConsent.analytics : false,
          marketing: cookieConsent.marketing !== undefined ? cookieConsent.marketing : false
        };
      }
    } catch (error) {
      console.error('Errore nel parsing del cookie di consenso:', error);
    }
  }
  
  // Se l'utente ha un ID, controlla anche il database
  if (userId && !req.cookies.user_cookie_consent) {
    try {
      const userConsent = await CookieConsent.findOne({ userId });
      if (userConsent && userConsent.configured) {
        consent = {
          essential: userConsent.essential,
          analytics: userConsent.analytics, 
          marketing: userConsent.marketing
        };
        
        // Imposta il cookie per sincronizzare
        res.cookie('user_cookie_consent', JSON.stringify({
          essential: consent.essential,
          analytics: consent.analytics,
          marketing: consent.marketing,
          configured: true
        }), { 
          maxAge: 365 * 24 * 60 * 60 * 1000, // 1 anno
          path: '/',
          sameSite: 'strict'
        });
      }
    } catch (error) {
      console.error('Errore nel recupero del consenso dal database:', error);
    }
  }
  
  let trackingCode = '';
  
  // Base script sempre incluso
  trackingCode += `
    console.log("Consenso utente:", ${JSON.stringify(consent)});
    window.userConsent = ${JSON.stringify(consent)};
  `;
  
  // Google Analytics - solo se il consenso analytics è true
  if (consent.analytics) {
    trackingCode += `
      // Google Analytics
      (function() {
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-MBFTYV86P7');
        
        // Carica lo script GA
        var gaScript = document.createElement('script');
        gaScript.async = true;
        gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-MBFTYV86P7';
        document.head.appendChild(gaScript);
        
        console.log('Google Analytics attivato basato sul consenso utente');
      })();
    `;
  }
  
  // Meta Pixel - solo se il consenso marketing è true
  if (consent.marketing) {
    trackingCode += `
      // Meta Pixel
      (function() {
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
        n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
        document,'script','https://connect.facebook.net/en_US/fbevents.js');
        
        // Inizializza pixel e invia PageView
        window.fbEventId = 'event_' + new Date().getTime() + '_' + Math.random().toString(36).substring(2, 15);
        fbq('init', '1543790469631614');
        fbq('track', 'PageView', {}, {eventID: window.fbEventId});
        
        console.log('Meta Pixel attivato basato sul consenso utente, eventID:', window.fbEventId);
      })();
    `;
  }
  
  res.type('application/javascript');
  res.send(trackingCode);
});

// Manager dei cookie
app.get('/js/cookie-consent-manager.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'www/js/cookie-consent-manager.js'));
});

// Pagina di login
app.get('/login', (req, res) => {
  // Se già autenticato, reindirizza al CRM
  if (req.session && req.session.isAuthenticated) {
    return res.redirect('/crm');
  }
  res.sendFile(path.join(__dirname, 'www', 'login.html'));
});

// Serve la dashboard
app.get('/dashboard', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard/*', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve il CRM
app.get('/crm', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'www', 'crm.html'));
});

// Route principale
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'www', 'index.html'));
});

// Gestione delle URL con estensione .html
app.get('*.html', (req, res) => {
  const urlWithoutExt = req.path.replace('.html', '');
  res.redirect(301, urlWithoutExt);
});

app.get('*', (req, res) => {
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
  const htmlPath = path.join(__dirname, 'www', filePath + '.html');
  
  // Percorso completo al file senza estensione
  const fullPath = path.join(__dirname, 'www', filePath);
  
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

// ===== INIZIALIZZAZIONE SERVER =====

// Crea utente admin iniziale (solo al primo avvio)
const createInitialAdmin = async () => {
  try {
    const adminExists = await Admin.findOne({ username: 'admin' });
    
    if (!adminExists) {
      const password = process.env.ADMIN_PASSWORD || 'CostruzioneDig2025';
      const hashedPassword = await bcrypt.hash(password, 10);
      
      await Admin.create({
        username: 'admin',
        password: hashedPassword,
        role: 'admin', // Imposta il ruolo a 'admin'
        config: {
          mongodb_uri: process.env.MONGODB_URI,
          access_token: process.env.ACCESS_TOKEN,
          meta_pixel_id: process.env.FACEBOOK_PIXEL_ID || '1543790469631614'
        }
      });
      
      console.log('Utente admin creato con successo con configurazioni predefinite');
    }
  } catch (error) {
    console.error('Errore nella creazione dell\'admin:', error);
  }
};

// Avvia il server
const server = app.listen(PORT, () => {
  console.log(`Server principale in esecuzione sulla porta ${PORT}`);
  mongoose.connection.once('connected', createInitialAdmin);
});

// Gestione corretta dell'arresto del server
process.on('SIGTERM', () => {
  console.log('SIGTERM ricevuto. Chiusura del server...');
  server.close(() => {
    console.log('Server Express chiuso.');
    connectionManager.closeAll();
    // Fix: Remove the callback
    mongoose.connection.close().then(() => {
      console.log('Connessione MongoDB principale chiusa.');
      process.exit(0);
    }).catch(err => {
      console.error('Errore nella chiusura della connessione:', err);
      process.exit(1);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT ricevuto. Chiusura del server...');
  server.close(() => {
    console.log('Server Express chiuso.');
    connectionManager.closeAll();
    mongoose.connection.close().then(() => {
      console.log('Connessione MongoDB principale chiusa.');
      process.exit(0);
    }).catch(err => {
      console.error('Errore nella chiusura della connessione:', err);
      process.exit(1);
    });
  });
});