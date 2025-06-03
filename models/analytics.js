/**
 * Modello Analytics MongoDB
 * ========================
 * 
 * Schema per collezione Analytics con statistiche derivate avanzate.
 * Da aggiungere al file models/index.js esistente.
 * 
 * @author Costruzione Digitale
 * @version 1.0
 */

const mongoose = require('mongoose');
const { createModuleLogger } = require('../config/logging');

const log = createModuleLogger('ANALYTICS_MODEL');

// ================================================================
// SCHEMA ANALYTICS AVANZATE
// ================================================================

const AnalyticsSchema = new mongoose.Schema({
  // Identificatori temporali
  date: { type: Date, required: true, index: true },
  period: { 
    type: String, 
    enum: ['daily', 'weekly', 'monthly', 'yearly'], 
    required: true, 
    index: true 
  },
  periodKey: { type: String, required: true, index: true }, // 2025-06-03, 2025-W23, 2025-06, 2025
  
  // === PATTERN TEMPORALI ===
  temporalPatterns: {
    // Distribuzione oraria (0-23)
    hourlyDistribution: [{
      hour: { type: Number, min: 0, max: 23 },
      visits: { type: Number, default: 0 },
      pageViews: { type: Number, default: 0 },
      engagement: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 }
    }],
    
    // Distribuzione giorni settimana (0=Dom, 6=Sab)
    weeklyDistribution: [{
      dayOfWeek: { type: Number, min: 0, max: 6 },
      dayName: { type: String, enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] },
      visits: { type: Number, default: 0 },
      avgEngagement: { type: Number, default: 0 },
      peakHour: { type: Number, min: 0, max: 23 }
    }],
    
    // Trend settimanali
    weeklyTrends: {
      growth: { type: Number, default: 0 }, // % crescita vs settimana precedente
      momentum: { type: String, enum: ['accelerating', 'stable', 'declining'], default: 'stable' },
      seasonality: { type: Number, default: 0 } // Score stagionalità
    }
  },
  
  // === ENGAGEMENT METRICS ===
  engagement: {
    // Score engagement globale (0-100)
    overallScore: { type: Number, default: 0, min: 0, max: 100 },
    
    // Componenti engagement
    components: {
      timeEngagement: { type: Number, default: 0 }, // Basato su tempo su pagina
      interactionEngagement: { type: Number, default: 0 }, // Click, scroll, form
      depthEngagement: { type: Number, default: 0 }, // Scroll depth, pagine visitate
      conversionEngagement: { type: Number, default: 0 } // Conversioni e micro-conversioni
    },
    
    // Segmentazione engagement
    bySource: [{
      source: String,
      score: { type: Number, default: 0 },
      userCount: { type: Number, default: 0 }
    }],
    
    byDevice: {
      mobile: { score: { type: Number, default: 0 }, userCount: { type: Number, default: 0 } },
      desktop: { score: { type: Number, default: 0 }, userCount: { type: Number, default: 0 } }
    },
    
    // Distribuzione engagement
    distribution: {
      high: { type: Number, default: 0 }, // Score > 70
      medium: { type: Number, default: 0 }, // Score 30-70
      low: { type: Number, default: 0 } // Score < 30
    }
  },
  
  // === HEATMAP COMPORTAMENTALE ===
  behavioralHeatmap: {
    // Hotspots di interazione
    interactionHotspots: [{
      elementType: { type: String, enum: ['button', 'form', 'link', 'image', 'video', 'text', 'page'] },
      elementId: String,
      interactions: { type: Number, default: 0 },
      uniqueUsers: { type: Number, default: 0 },
      heatScore: { type: Number, default: 0 } // 0-100
    }],
    
    // Mappa scroll behavior
    scrollBehavior: {
      avgDepth: { type: Number, default: 0 },
      completionRate: { type: Number, default: 0 }, // % che arriva in fondo
      dropOffPoints: [{ 
        depth: { type: Number, default: 0 },
        dropOffRate: { type: Number, default: 0 }
      }],
      fastScrollers: { type: Number, default: 0 }, // % scroll veloce
      slowReaders: { type: Number, default: 0 } // % lettura lenta
    },
    
    // Pattern di navigazione
    navigationPatterns: [{
      pattern: String, // es. "homepage -> landing -> contact"
      frequency: { type: Number, default: 0 },
      conversionRate: { type: Number, default: 0 },
      avgSessionValue: { type: Number, default: 0 }
    }]
  },
  
  // === ANALISI FUNNEL ===
  funnelAnalysis: {
    // Step del funnel
    steps: [{
      stepName: String,
      stepOrder: Number,
      entries: { type: Number, default: 0 },
      exits: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      dropOffRate: { type: Number, default: 0 },
      avgTimeInStep: { type: Number, default: 0 }
    }],
    
    // Performance funnel
    overall: {
      totalEntries: { type: Number, default: 0 },
      totalCompletions: { type: Number, default: 0 },
      completionRate: { type: Number, default: 0 },
      avgTimeToComplete: { type: Number, default: 0 },
      bottleneckStep: String
    },
    
    // Segmentazione funnel
    bySource: [{
      source: String,
      completionRate: { type: Number, default: 0 },
      avgTimeToComplete: { type: Number, default: 0 }
    }]
  },
  
  // === SEGMENTAZIONE UTENTI ===
  userSegmentation: {
    // Cluster comportamentali
    behavioralClusters: [{
      clusterName: String,
      userCount: { type: Number, default: 0 },
      characteristics: {
        avgSessionDuration: { type: Number, default: 0 },
        avgPageViews: { type: Number, default: 0 },
        conversionRate: { type: Number, default: 0 },
        preferredDevice: String,
        topSources: [String]
      }
    }],
    
    // Segmenti geografici
    geographic: [{
      region: String,
      userCount: { type: Number, default: 0 },
      engagement: { type: Number, default: 0 },
      conversionRate: { type: Number, default: 0 },
      topContent: [String]
    }],
    
    // Segmenti per valore
    valueSegments: {
      highValue: { count: { type: Number, default: 0 }, avgValue: { type: Number, default: 0 } },
      mediumValue: { count: { type: Number, default: 0 }, avgValue: { type: Number, default: 0 } },
      lowValue: { count: { type: Number, default: 0 }, avgValue: { type: Number, default: 0 } }
    }
  },
  
  // === CONTENT PERFORMANCE ===
  contentPerformance: {
    // Top performing pages
    topPages: [{
      url: String,
      visits: { type: Number, default: 0 },
      uniqueVisitors: { type: Number, default: 0 },
      avgTimeOnPage: { type: Number, default: 0 },
      bounceRate: { type: Number, default: 0 },
      conversionRate: { type: Number, default: 0 },
      engagementScore: { type: Number, default: 0 },
      rank: { type: Number, default: 0 }
    }],
    
    // Content categories
    categories: [{
      category: String,
      pageCount: { type: Number, default: 0 },
      totalViews: { type: Number, default: 0 },
      avgEngagement: { type: Number, default: 0 },
      conversionContribution: { type: Number, default: 0 }
    }],
    
    // Exit pages analysis
    exitAnalysis: [{
      url: String,
      exitRate: { type: Number, default: 0 },
      beforeExitActions: [String],
      improvementOpportunity: { type: Number, default: 0 } // Score 0-100
    }]
  },
  
  // === SESSION QUALITY ===
  sessionQuality: {
    // Distribution quality scores
    qualityDistribution: {
      excellent: { type: Number, default: 0 }, // Score > 80
      good: { type: Number, default: 0 }, // Score 60-80
      average: { type: Number, default: 0 }, // Score 40-60
      poor: { type: Number, default: 0 } // Score < 40
    },
    
    // Quality indicators
    indicators: {
      avgPagesPerSession: { type: Number, default: 0 },
      avgSessionDuration: { type: Number, default: 0 },
      interactionRate: { type: Number, default: 0 }, // % sessioni con interazioni
      goalCompletionRate: { type: Number, default: 0 }
    },
    
    // Quality by attributes
    byTrafficSource: [{
      source: String,
      avgQualityScore: { type: Number, default: 0 },
      sessionCount: { type: Number, default: 0 }
    }]
  },
  
  // === PREDICTION SCORES ===
  predictions: {
    // Propensione conversione
    conversionPropensity: {
      nextWeekPrediction: { type: Number, default: 0 },
      confidence: { type: Number, default: 0 },
      factors: [{
        factor: String,
        weight: { type: Number, default: 0 },
        trend: { type: String, enum: ['positive', 'negative', 'neutral'] }
      }]
    },
    
    // Churn prediction
    churnRisk: {
      highRisk: { type: Number, default: 0 },
      mediumRisk: { type: Number, default: 0 },
      lowRisk: { type: Number, default: 0 }
    },
    
    // Growth forecast
    growthForecast: {
      nextPeriodGrowth: { type: Number, default: 0 },
      seasonalityFactor: { type: Number, default: 0 },
      trendMomentum: { type: String, enum: ['accelerating', 'stable', 'declining'] }
    }
  },
  
  // Metadata
  calculatedAt: { type: Date, default: Date.now },
  dataSourcesUsed: [String],
  confidence: { type: Number, default: 0, min: 0, max: 100 },
  sampleSize: { type: Number, default: 0 }
});

// ================================================================
// INDICI PER PERFORMANCE
// ================================================================

AnalyticsSchema.index({ date: 1, period: 1 });
AnalyticsSchema.index({ periodKey: 1 });
AnalyticsSchema.index({ 'engagement.overallScore': -1 });
AnalyticsSchema.index({ 'predictions.conversionPropensity.nextWeekPrediction': -1 });
AnalyticsSchema.index({ 'temporalPatterns.weeklyTrends.growth': -1 });
AnalyticsSchema.index({ calculatedAt: -1 });

// ================================================================
// MIDDLEWARE
// ================================================================

AnalyticsSchema.pre('save', function() {
  log.database('Analytics', 'PRE_SAVE', 'analytics', {
    periodKey: this.periodKey,
    period: this.period,
    overallScore: this.engagement?.overallScore || 0,
    confidence: this.confidence,
    isNew: this.isNew
  });
});

AnalyticsSchema.post('save', function(doc) {
  log.database('Analytics', 'POST_SAVE', 'analytics', {
    periodKey: doc.periodKey,
    period: doc.period,
    id: doc._id,
    overallScore: doc.engagement?.overallScore || 0,
    success: true
  });
});

// ================================================================
// METODI STATICI
// ================================================================

/**
 * Trova analytics per range di date
 * @param {Date} startDate - Data inizio
 * @param {Date} endDate - Data fine
 * @param {string} period - Periodo
 * @returns {Promise<Array>} - Analytics nel range
 */
AnalyticsSchema.statics.findByDateRange = function(startDate, endDate, period = 'daily') {
  const functionName = 'Analytics.findByDateRange';
  log.enter(functionName, { startDate, endDate, period });

  try {
    const query = {
      date: { $gte: startDate, $lte: endDate },
      period: period
    };

    log.debug(functionName, 'Query costruita per range di date', {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      period
    });

    const result = this.find(query).sort({ date: -1 });
    
    log.exit(functionName, { success: true });
    return result;

  } catch (error) {
    log.error(functionName, 'Errore query range di date', error);
    log.exit(functionName, { success: false, error: true });
    throw error;
  }
};

/**
 * Trova top performers per engagement
 * @param {number} limit - Limite risultati
 * @param {Date} fromDate - Data da cui cercare
 * @returns {Promise<Array>} - Top performers
 */
AnalyticsSchema.statics.findTopEngagement = function(limit = 10, fromDate = null) {
  const functionName = 'Analytics.findTopEngagement';
  log.enter(functionName, { limit, fromDate });

  try {
    let query = {};
    if (fromDate) {
      query.date = { $gte: fromDate };
    }

    const result = this.find(query)
      .sort({ 'engagement.overallScore': -1 })
      .limit(limit)
      .select('periodKey period engagement.overallScore engagement.components date');

    log.debug(functionName, 'Query top engagement costruita', {
      limit,
      hasDateFilter: !!fromDate
    });

    log.exit(functionName, { success: true });
    return result;

  } catch (error) {
    log.error(functionName, 'Errore query top engagement', error);
    log.exit(functionName, { success: false, error: true });
    throw error;
  }
};

/**
 * Calcola trend engagement
 * @param {number} days - Giorni da analizzare
 * @returns {Promise<Object>} - Trend engagement
 */
AnalyticsSchema.statics.getEngagementTrend = async function(days = 30) {
  const functionName = 'Analytics.getEngagementTrend';
  log.enter(functionName, { days });

  try {
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    const pipeline = [
      {
        $match: {
          date: { $gte: startDate, $lte: endDate },
          period: 'daily'
        }
      },
      {
        $group: {
          _id: null,
          avgEngagement: { $avg: '$engagement.overallScore' },
          maxEngagement: { $max: '$engagement.overallScore' },
          minEngagement: { $min: '$engagement.overallScore' },
          totalRecords: { $sum: 1 },
          engagementData: { 
            $push: {
              date: '$date',
              score: '$engagement.overallScore',
              periodKey: '$periodKey'
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          avgEngagement: { $round: ['$avgEngagement', 2] },
          maxEngagement: 1,
          minEngagement: 1,
          totalRecords: 1,
          volatility: { 
            $round: [{ $subtract: ['$maxEngagement', '$minEngagement'] }, 2] 
          },
          trend: {
            $cond: {
              if: { $gte: ['$totalRecords', 2] },
              then: 'calculable',
              else: 'insufficient_data'
            }
          },
          recentData: { 
            $slice: [
              { $sortArray: { input: '$engagementData', sortBy: { date: -1 } } }, 
              7
            ] 
          }
        }
      }
    ];

    const result = await this.aggregate(pipeline);
    
    log.info(functionName, 'Trend engagement calcolato', {
      days,
      recordsFound: result[0]?.totalRecords || 0
    });

    log.exit(functionName, { success: true });
    return result[0] || {
      avgEngagement: 0,
      maxEngagement: 0,
      minEngagement: 0,
      totalRecords: 0,
      volatility: 0,
      trend: 'no_data',
      recentData: []
    };

  } catch (error) {
    log.error(functionName, 'Errore calcolo trend engagement', error);
    log.exit(functionName, { success: false, error: true });
    throw error;
  }
};

/**
 * Ottieni insight automatici
 * @param {string} periodKey - Chiave periodo
 * @returns {Promise<Array>} - Array di insight
 */
AnalyticsSchema.methods.generateInsights = function() {
  const functionName = 'Analytics.generateInsights';
  log.enter(functionName, { periodKey: this.periodKey });

  const insights = [];

  try {
    // Insight engagement
    if (this.engagement?.overallScore > 80) {
      insights.push({
        type: 'positive',
        category: 'engagement',
        message: `Engagement eccellente (${this.engagement.overallScore}/100)`,
        priority: 'high'
      });
    } else if (this.engagement?.overallScore < 40) {
      insights.push({
        type: 'negative',
        category: 'engagement',
        message: `Engagement basso (${this.engagement.overallScore}/100) - considera ottimizzazioni`,
        priority: 'high'
      });
    }

    // Insight patterns temporali
    const hourlyData = this.temporalPatterns?.hourlyDistribution || [];
    if (hourlyData.length > 0) {
      const peakHour = hourlyData.reduce((max, current, index) => 
        current.visits > hourlyData[max].visits ? index : max, 0);
      
      insights.push({
        type: 'info',
        category: 'temporal',
        message: `Picco di traffico alle ${peakHour}:00`,
        priority: 'medium'
      });
    }

    // Insight heatmap
    const hotspots = this.behavioralHeatmap?.interactionHotspots || [];
    if (hotspots.length > 0) {
      const topHotspot = hotspots[0];
      insights.push({
        type: 'info',
        category: 'behavior',
        message: `Elemento più interattivo: ${topHotspot.elementType} (${topHotspot.interactions} interazioni)`,
        priority: 'medium'
      });
    }

    // Insight scroll behavior
    const scrollBehavior = this.behavioralHeatmap?.scrollBehavior;
    if (scrollBehavior?.completionRate < 30) {
      insights.push({
        type: 'warning',
        category: 'content',
        message: `Solo ${scrollBehavior.completionRate}% degli utenti legge fino in fondo`,
        priority: 'high'
      });
    }

    // Insight predizioni
    if (this.predictions?.conversionPropensity?.nextWeekPrediction > 0) {
      const prediction = this.predictions.conversionPropensity.nextWeekPrediction;
      insights.push({
        type: 'prediction',
        category: 'conversion',
        message: `Previsione conversioni prossima settimana: ${prediction.toFixed(1)}%`,
        priority: 'medium'
      });
    }

    log.info(functionName, 'Insights generati', {
      periodKey: this.periodKey,
      insightsCount: insights.length
    });

    log.exit(functionName, { success: true, insightsCount: insights.length });
    return insights;

  } catch (error) {
    log.error(functionName, 'Errore generazione insights', error);
    log.exit(functionName, { success: false, error: true });
    return [];
  }
};

// ================================================================
// EXPORT SCHEMA E MODELLO
// ================================================================

// Per essere integrato nel file models/index.js esistente, 
// aggiungi queste righe al file index.js:

/*
const Analytics = mongoose.model('Analytics', AnalyticsSchema);

// Aggiungi agli indici:
AnalyticsSchema.index({ date: 1, period: 1 });
AnalyticsSchema.index({ periodKey: 1 });
AnalyticsSchema.index({ 'engagement.overallScore': -1 });

// Aggiungi al module.exports:
module.exports = {
  // ... altri modelli esistenti
  Analytics,
  // ... 
  // ... altri schemi esistenti
  AnalyticsSchema
};
*/

module.exports = {
  AnalyticsSchema
};