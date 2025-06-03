const mongoose = require('mongoose');

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

module.exports = {
  ChatMessageSchema,
  ChatConversationSchema
};