const mongoose = require('mongoose');

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

module.exports = ClientSchema;