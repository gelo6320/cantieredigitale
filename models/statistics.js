const mongoose = require('mongoose');

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
    bySource: { type: Object, default: {} },
    byUrl: { type: Object, default: {} }
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

module.exports = {
  StatisticsSchema,
  DailyStatisticsSchema,
  WeeklyStatisticsSchema,
  MonthlyStatisticsSchema,
  TotalStatisticsSchema
};