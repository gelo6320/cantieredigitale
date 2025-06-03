const mongoose = require('mongoose');

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

module.exports = SiteSchema;