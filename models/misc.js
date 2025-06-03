const mongoose = require('mongoose');

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

module.exports = {
  CookieConsentSchema,
  FormDataSchema,
  CalendarEventSchema
};