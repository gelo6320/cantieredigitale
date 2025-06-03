const mongoose = require('mongoose');

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

module.exports = {
  UserPathSchema,
  InteractionSchema
};