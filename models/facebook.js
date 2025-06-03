const mongoose = require('mongoose');

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

module.exports = {
  FacebookEventSchema,
  FacebookLeadSchema,
  FacebookAudienceSchema
};