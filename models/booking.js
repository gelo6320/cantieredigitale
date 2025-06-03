const mongoose = require('mongoose');

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

module.exports = BookingSchema;