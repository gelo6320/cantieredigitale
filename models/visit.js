const mongoose = require('mongoose');

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

module.exports = VisitSchema;