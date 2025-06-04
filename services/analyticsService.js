/**
 * Servizio Analytics Avanzate
 * ===========================
 * 
 * Genera statistiche derivate avanzate dai dati esistenti:
 * - Pattern temporali e stagionalità
 * - Engagement scoring e heatmap comportamentale
 * - Analisi del funnel e segmentazione utenti
 * - Content performance e session quality
 * - Journey analysis e prediction scoring
 * 
 * @author Costruzione Digitale
 * @version 1.0
 */

const mongoose = require('mongoose');
const { 
  DailyStatistics, 
  WeeklyStatistics, 
  MonthlyStatistics, 
  TotalStatistics 
} = require('../models/statistics');
const { UserPath, Session, User } = require('../models');
const { log } = require('../utils/logger');

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
      elementType: { type: String, enum: ['button', 'form', 'link', 'image', 'video', 'text'] },
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

// Indici per performance
AnalyticsSchema.index({ date: 1, period: 1 });
AnalyticsSchema.index({ periodKey: 1 });
AnalyticsSchema.index({ 'engagement.overallScore': -1 });
AnalyticsSchema.index({ 'predictions.conversionPropensity.nextWeekPrediction': -1 });

const Analytics = mongoose.model('Analytics', AnalyticsSchema);

/**
 * Genera analytics avanzate per un periodo specifico
 * @param {Date} startDate - Data inizio
 * @param {Date} endDate - Data fine  
 * @param {string} period - Periodo ('daily', 'weekly', 'monthly')
 * @returns {Promise<Object>} - Analytics generate
 */
async function generateAdvancedAnalytics(startDate, endDate, period = 'daily') {
  const functionName = 'generateAdvancedAnalytics';
  log.enter(functionName, {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    period
  });

  try {
    const analytics = {
      date: startDate,
      period,
      periodKey: generatePeriodKey(startDate, period),
      calculatedAt: new Date(),
      dataSourcesUsed: [],
      sampleSize: 0
    };

    // Calcola ogni componente delle analytics
    const [
      temporalPatterns,
      engagement,
      behavioralHeatmap,
      funnelAnalysis,
      userSegmentation,
      contentPerformance,
      sessionQuality,
      predictions
    ] = await Promise.all([
      calculateTemporalPatterns(startDate, endDate),
      calculateEngagementMetrics(startDate, endDate),
      calculateBehavioralHeatmap(startDate, endDate),
      calculateFunnelAnalysis(startDate, endDate),
      calculateUserSegmentation(startDate, endDate),
      calculateContentPerformance(startDate, endDate),
      calculateSessionQuality(startDate, endDate),
      calculatePredictions(startDate, endDate)
    ]);

    analytics.temporalPatterns = temporalPatterns;
    analytics.engagement = engagement;
    analytics.behavioralHeatmap = behavioralHeatmap;
    analytics.funnelAnalysis = funnelAnalysis;
    analytics.userSegmentation = userSegmentation;
    analytics.contentPerformance = contentPerformance;
    analytics.sessionQuality = sessionQuality;
    analytics.predictions = predictions;

    // Calcola confidence score basato sulla qualità dei dati
    analytics.confidence = calculateConfidenceScore(analytics);
    analytics.sampleSize = temporalPatterns.totalSessions || 0;

    // Salva o aggiorna
    const result = await Analytics.findOneAndUpdate(
      { periodKey: analytics.periodKey, period },
      analytics,
      { upsert: true, new: true }
    );

    log.info(functionName, 'Analytics avanzate generate', {
      periodKey: analytics.periodKey,
      confidence: analytics.confidence,
      sampleSize: analytics.sampleSize
    });

    log.exit(functionName, { 
      success: true, 
      periodKey: analytics.periodKey 
    });

    return result;

  } catch (error) {
    log.error(functionName, 'Errore generazione analytics', error);
    log.exit(functionName, { success: false, error: true });
    throw error;
  }
}

/**
 * Calcola pattern temporali e stagionalità
 * @param {Date} startDate - Data inizio
 * @param {Date} endDate - Data fine
 * @returns {Promise<Object>} - Pattern temporali
 */
async function calculateTemporalPatterns(startDate, endDate) {
  const functionName = 'calculateTemporalPatterns';
  log.enter(functionName, { startDate, endDate });

  try {
    // Inizializza distribuzione oraria (24 ore)
    const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      visits: 0,
      pageViews: 0,
      engagement: 0,
      conversions: 0
    }));

    // Inizializza distribuzione settimanale
    const weeklyDistribution = [
      { dayOfWeek: 0, dayName: 'Sunday', visits: 0, avgEngagement: 0, peakHour: 0 },
      { dayOfWeek: 1, dayName: 'Monday', visits: 0, avgEngagement: 0, peakHour: 0 },
      { dayOfWeek: 2, dayName: 'Tuesday', visits: 0, avgEngagement: 0, peakHour: 0 },
      { dayOfWeek: 3, dayName: 'Wednesday', visits: 0, avgEngagement: 0, peakHour: 0 },
      { dayOfWeek: 4, dayName: 'Thursday', visits: 0, avgEngagement: 0, peakHour: 0 },
      { dayOfWeek: 5, dayName: 'Friday', visits: 0, avgEngagement: 0, peakHour: 0 },
      { dayOfWeek: 6, dayName: 'Saturday', visits: 0, avgEngagement: 0, peakHour: 0 }
    ];

    // Recupera dati dalle sessioni
    const sessions = await Session.find({
      startTime: { $gte: startDate, $lte: endDate },
      duration: { $exists: true, $gt: 0 }
    }).lean();

    log.debug(functionName, 'Sessioni recuperate per analisi temporale', {
      sessionCount: sessions.length
    });

    let totalSessions = sessions.length;
    let totalEngagement = 0;

    // Analizza ogni sessione
    for (const session of sessions) {
      const sessionDate = new Date(session.startTime);
      const hour = sessionDate.getHours();
      const dayOfWeek = sessionDate.getDay();
      
      // Calcola engagement sessione
      const engagement = calculateSessionEngagement(session);
      totalEngagement += engagement;

      // Aggiorna distribuzione oraria
      hourlyDistribution[hour].visits += 1;
      hourlyDistribution[hour].pageViews += session.pageViews || 0;
      hourlyDistribution[hour].engagement += engagement;
      hourlyDistribution[hour].conversions += session.conversions || 0;

      // Aggiorna distribuzione settimanale
      weeklyDistribution[dayOfWeek].visits += 1;
      weeklyDistribution[dayOfWeek].avgEngagement += engagement;
    }

    // Calcola medie
    hourlyDistribution.forEach(hour => {
      if (hour.visits > 0) {
        hour.engagement = Math.round(hour.engagement / hour.visits);
      }
    });

    weeklyDistribution.forEach(day => {
      if (day.visits > 0) {
        day.avgEngagement = Math.round(day.avgEngagement / day.visits);
        
        // Trova picco orario per questo giorno
        const dayHours = hourlyDistribution.filter((_, hour) => {
          return sessions.some(s => {
            const sDate = new Date(s.startTime);
            return sDate.getDay() === day.dayOfWeek && sDate.getHours() === hour;
          });
        });
        
        if (dayHours.length > 0) {
          const peakHour = dayHours.reduce((max, current, index) => 
            current.visits > dayHours[max].visits ? index : max, 0);
          day.peakHour = peakHour;
        }
      }
    });

    // Calcola trend settimanali (richiede dati storici)
    const weeklyTrends = await calculateWeeklyTrends(startDate, endDate);

    const result = {
      hourlyDistribution,
      weeklyDistribution,
      weeklyTrends,
      totalSessions,
      avgEngagement: totalSessions > 0 ? Math.round(totalEngagement / totalSessions) : 0
    };

    log.debug(functionName, 'Pattern temporali calcolati', {
      peakHour: hourlyDistribution.reduce((max, current, index) => 
        current.visits > hourlyDistribution[max].visits ? index : max, 0),
      peakDay: weeklyDistribution.reduce((max, current) => 
        current.visits > max.visits ? current : max).dayName
    });

    log.exit(functionName, { success: true });
    return result;

  } catch (error) {
    log.error(functionName, 'Errore calcolo pattern temporali', error);
    throw error;
  }
}

/**
 * Calcola metriche di engagement avanzate
 * @param {Date} startDate - Data inizio
 * @param {Date} endDate - Data fine
 * @returns {Promise<Object>} - Metriche engagement
 */
async function calculateEngagementMetrics(startDate, endDate) {
  const functionName = 'calculateEngagementMetrics';
  log.enter(functionName, { startDate, endDate });

  try {
    // Recupera tutti i percorsi utente nel periodo
    const userPaths = await UserPath.find({
      lastActivity: { $gte: startDate, $lte: endDate },
      totalInteractions: { $gt: 0 }
    }).lean();

    log.debug(functionName, 'UserPaths recuperati per engagement', {
      pathCount: userPaths.length
    });

    let totalEngagement = 0;
    let timeEngagementSum = 0;
    let interactionEngagementSum = 0;
    let depthEngagementSum = 0;
    let conversionEngagementSum = 0;

    const sourceEngagement = new Map();
    const deviceEngagement = { mobile: [], desktop: [] };
    const engagementDistribution = { high: 0, medium: 0, low: 0 };

    // Calcola engagement per ogni percorso
    for (const path of userPaths) {
      const engagement = calculateDetailedEngagement(path);
      totalEngagement += engagement.overall;
      
      timeEngagementSum += engagement.time;
      interactionEngagementSum += engagement.interaction;
      depthEngagementSum += engagement.depth;
      conversionEngagementSum += engagement.conversion;

      // Classifica per distribuzione
      if (engagement.overall > 70) engagementDistribution.high++;
      else if (engagement.overall > 30) engagementDistribution.medium++;
      else engagementDistribution.low++;

      // Raggruppa per fonte (dalla sessione)
      try {
        const session = await Session.findOne({ sessionId: path.sessionId }).lean();
        if (session && session.trafficSource) {
          if (!sourceEngagement.has(session.trafficSource)) {
            sourceEngagement.set(session.trafficSource, { scores: [], count: 0 });
          }
          sourceEngagement.get(session.trafficSource).scores.push(engagement.overall);
          sourceEngagement.get(session.trafficSource).count++;
        }

        // Raggruppa per device
        if (session && session.deviceInfo) {
          const isMobile = session.deviceInfo.deviceType === 'mobile' || 
                          session.deviceInfo.deviceType === 'tablet';
          if (isMobile) {
            deviceEngagement.mobile.push(engagement.overall);
          } else {
            deviceEngagement.desktop.push(engagement.overall);
          }
        }
      } catch (sessionError) {
        log.warn(functionName, 'Errore recupero sessione per engagement', sessionError);
      }
    }

    const pathCount = userPaths.length;
    const overallScore = pathCount > 0 ? Math.round(totalEngagement / pathCount) : 0;

    // Calcola medie per fonte
    const bySource = Array.from(sourceEngagement.entries()).map(([source, data]) => ({
      source,
      score: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
      userCount: data.count
    })).sort((a, b) => b.score - a.score);

    // Calcola medie per device
    const byDevice = {
      mobile: {
        score: deviceEngagement.mobile.length > 0 ? 
          Math.round(deviceEngagement.mobile.reduce((a, b) => a + b, 0) / deviceEngagement.mobile.length) : 0,
        userCount: deviceEngagement.mobile.length
      },
      desktop: {
        score: deviceEngagement.desktop.length > 0 ? 
          Math.round(deviceEngagement.desktop.reduce((a, b) => a + b, 0) / deviceEngagement.desktop.length) : 0,
        userCount: deviceEngagement.desktop.length
      }
    };

    const result = {
      overallScore,
      components: {
        timeEngagement: pathCount > 0 ? Math.round(timeEngagementSum / pathCount) : 0,
        interactionEngagement: pathCount > 0 ? Math.round(interactionEngagementSum / pathCount) : 0,
        depthEngagement: pathCount > 0 ? Math.round(depthEngagementSum / pathCount) : 0,
        conversionEngagement: pathCount > 0 ? Math.round(conversionEngagementSum / pathCount) : 0
      },
      bySource,
      byDevice,
      distribution: engagementDistribution
    };

    log.info(functionName, 'Engagement metrics calcolate', {
      overallScore: result.overallScore,
      topSource: bySource[0]?.source || 'none',
      pathsAnalyzed: pathCount
    });

    log.exit(functionName, { success: true });
    return result;

  } catch (error) {
    log.error(functionName, 'Errore calcolo engagement metrics', error);
    throw error;
  }
}

/**
 * Calcola heatmap comportamentale
 * @param {Date} startDate - Data inizio
 * @param {Date} endDate - Data fine
 * @returns {Promise<Object>} - Heatmap comportamentale
 */
async function calculateBehavioralHeatmap(startDate, endDate) {
  const functionName = 'calculateBehavioralHeatmap';
  log.enter(functionName, { startDate, endDate });

  try {
    // Recupera tutti i percorsi con interazioni
    const userPaths = await UserPath.find({
      lastActivity: { $gte: startDate, $lte: endDate },
      'path.interactions': { $exists: true, $ne: [] }
    }).lean();

    const interactionHotspots = new Map();
    const scrollData = [];
    const navigationPatterns = new Map();

    // Analizza ogni percorso utente
    for (const path of userPaths) {
      let pathString = [];
      let totalScrollDepth = 0;
      let scrollCount = 0;

      for (const page of path.path) {
        // Costruisci pattern di navigazione
        pathString.push(cleanUrlForPattern(page.url));

        // Analizza scroll behavior
        if (page.scrollDepth > 0) {
          totalScrollDepth += page.scrollDepth;
          scrollCount++;
        }

        // Analizza interazioni
        if (page.interactions) {
          for (const interaction of page.interactions) {
            analyzeInteractionForHeatmap(interaction, interactionHotspots);
          }
        }
      }

      // Registra scroll behavior
      if (scrollCount > 0) {
        scrollData.push({
          avgDepth: totalScrollDepth / scrollCount,
          maxDepth: Math.max(...path.path.map(p => p.scrollDepth || 0)),
          sessionDuration: path.duration || 0
        });
      }

      // Registra pattern navigazione
      if (pathString.length > 1) {
        const pattern = pathString.join(' -> ');
        if (!navigationPatterns.has(pattern)) {
          navigationPatterns.set(pattern, {
            frequency: 0,
            conversions: 0,
            totalValue: 0
          });
        }
        const patternData = navigationPatterns.get(pattern);
        patternData.frequency++;
        if (path.conversionOccurred) {
          patternData.conversions++;
          patternData.totalValue += path.conversionDetails?.value || 0;
        }
      }
    }

    // Converti hotspots in array e calcola heat scores
    const interactionHotspotsArray = Array.from(interactionHotspots.entries())
      .map(([key, data]) => {
        const [elementType, elementId] = key.split('::');
        return {
          elementType,
          elementId,
          interactions: data.interactions,
          uniqueUsers: data.uniqueUsers.size,
          heatScore: calculateHeatScore(data.interactions, data.uniqueUsers.size)
        };
      })
      .sort((a, b) => b.heatScore - a.heatScore)
      .slice(0, 20); // Top 20 hotspots

    // Analizza scroll behavior
    const scrollBehavior = analyzeScrollBehavior(scrollData);

    // Converti navigation patterns
    const navigationPatternsArray = Array.from(navigationPatterns.entries())
      .map(([pattern, data]) => ({
        pattern,
        frequency: data.frequency,
        conversionRate: data.frequency > 0 ? (data.conversions / data.frequency) * 100 : 0,
        avgSessionValue: data.conversions > 0 ? data.totalValue / data.conversions : 0
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 15); // Top 15 patterns

    const result = {
      interactionHotspots: interactionHotspotsArray,
      scrollBehavior,
      navigationPatterns: navigationPatternsArray
    };

    log.info(functionName, 'Heatmap comportamentale calcolata', {
      hotspots: interactionHotspotsArray.length,
      patterns: navigationPatternsArray.length,
      scrollSamples: scrollData.length
    });

    log.exit(functionName, { success: true });
    return result;

  } catch (error) {
    log.error(functionName, 'Errore calcolo heatmap comportamentale', error);
    throw error;
  }
}

// ================================================================
// FUNZIONI HELPER
// ================================================================

/**
 * Calcola l'engagement di una sessione
 * @param {Object} session - Sessione
 * @returns {number} - Score engagement (0-100)
 */
function calculateSessionEngagement(session) {
  let score = 0;
  
  // Componente tempo (max 25 punti)
  const duration = session.duration || 0;
  if (duration > 300) score += 25; // 5+ minuti = max punti
  else if (duration > 120) score += 20; // 2-5 minuti
  else if (duration > 60) score += 15; // 1-2 minuti
  else if (duration > 30) score += 10; // 30s-1min
  else score += 5; // <30s

  // Componente pageviews (max 25 punti)
  const pageViews = session.pageViews || 0;
  if (pageViews >= 5) score += 25;
  else if (pageViews >= 3) score += 20;
  else if (pageViews >= 2) score += 15;
  else score += 10;

  // Componente conversioni (max 30 punti)
  const conversions = session.conversions || 0;
  score += Math.min(conversions * 15, 30);

  // Componente bounce (max 20 punti)
  const isNotBounce = pageViews > 1 || duration > 30;
  if (isNotBounce) score += 20;

  return Math.min(score, 100);
}

/**
 * Calcola engagement dettagliato per un percorso utente
 * @param {Object} path - Percorso utente
 * @returns {Object} - Engagement dettagliato
 */
function calculateDetailedEngagement(path) {
  const totalTime = path.path.reduce((sum, page) => sum + (page.timeOnPage || 0), 0);
  const avgTimePerPage = path.totalPages > 0 ? totalTime / path.totalPages : 0;
  
  // Time engagement (0-100)
  let timeScore = 0;
  if (avgTimePerPage > 120) timeScore = 100;
  else if (avgTimePerPage > 60) timeScore = 80;
  else if (avgTimePerPage > 30) timeScore = 60;
  else if (avgTimePerPage > 15) timeScore = 40;
  else timeScore = 20;

  // Interaction engagement (0-100)
  const interactionsPerPage = path.totalPages > 0 ? path.totalInteractions / path.totalPages : 0;
  let interactionScore = 0;
  if (interactionsPerPage > 5) interactionScore = 100;
  else if (interactionsPerPage > 3) interactionScore = 80;
  else if (interactionsPerPage > 2) interactionScore = 60;
  else if (interactionsPerPage > 1) interactionScore = 40;
  else interactionScore = 20;

  // Depth engagement (0-100)
  const avgScrollDepth = path.path.reduce((sum, page) => sum + (page.scrollDepth || 0), 0) / path.totalPages;
  let depthScore = 0;
  if (avgScrollDepth > 80) depthScore = 100;
  else if (avgScrollDepth > 60) depthScore = 80;
  else if (avgScrollDepth > 40) depthScore = 60;
  else if (avgScrollDepth > 20) depthScore = 40;
  else depthScore = 20;

  // Conversion engagement (0-100)
  let conversionScore = 0;
  if (path.conversionOccurred) {
    conversionScore = 100;
  } else {
    // Micro-conversioni (form interactions, deep engagement)
    const hasFormInteraction = path.path.some(page => 
      page.interactions?.some(int => int.type === 'form_interaction')
    );
    if (hasFormInteraction) conversionScore = 60;
    else if (path.totalPages > 3) conversionScore = 30;
    else conversionScore = 0;
  }

  // Overall score (weighted average)
  const overall = Math.round(
    timeScore * 0.25 + 
    interactionScore * 0.25 + 
    depthScore * 0.25 + 
    conversionScore * 0.25
  );

  return {
    overall,
    time: timeScore,
    interaction: interactionScore,
    depth: depthScore,
    conversion: conversionScore
  };
}

/**
 * Analizza interazione per heatmap
 * @param {Object} interaction - Interazione
 * @param {Map} hotspots - Mappa hotspots
 */
function analyzeInteractionForHeatmap(interaction, hotspots) {
  let elementType = 'unknown';
  let elementId = 'unknown';

  // Determina tipo elemento e ID
  if (interaction.type === 'click') {
    elementType = 'button';
    elementId = interaction.elementId || interaction.metadata?.buttonType || 'unknown';
  } else if (interaction.type === 'form_interaction') {
    elementType = 'form';
    elementId = interaction.metadata?.formName || 'unknown';
  } else if (interaction.type === 'scroll') {
    elementType = 'page';
    elementId = 'scroll';
  } else if (interaction.type === 'video') {
    elementType = 'video';
    elementId = interaction.metadata?.videoId || 'unknown';
  }

  const key = `${elementType}::${elementId}`;
  
  if (!hotspots.has(key)) {
    hotspots.set(key, {
      interactions: 0,
      uniqueUsers: new Set()
    });
  }

  const data = hotspots.get(key);
  data.interactions++;
  
  // Aggiungi utente se disponibile (dall'interaction parent path)
  if (interaction.sessionId) {
    data.uniqueUsers.add(interaction.sessionId);
  }
}

/**
 * Calcola heat score per un hotspot
 * @param {number} interactions - Numero interazioni
 * @param {number} uniqueUsers - Utenti unici
 * @returns {number} - Heat score (0-100)
 */
function calculateHeatScore(interactions, uniqueUsers) {
  // Score basato su frequenza e reach
  const frequencyScore = Math.min(interactions / 10, 1) * 50; // Max 50 per frequenza
  const reachScore = Math.min(uniqueUsers / 5, 1) * 50; // Max 50 per reach
  
  return Math.round(frequencyScore + reachScore);
}

/**
 * Analizza comportamento scroll
 * @param {Array} scrollData - Dati scroll
 * @returns {Object} - Analisi scroll behavior
 */
function analyzeScrollBehavior(scrollData) {
  if (scrollData.length === 0) {
    return {
      avgDepth: 0,
      completionRate: 0,
      dropOffPoints: [],
      fastScrollers: 0,
      slowReaders: 0
    };
  }

  const avgDepth = scrollData.reduce((sum, d) => sum + d.avgDepth, 0) / scrollData.length;
  const completionRate = scrollData.filter(d => d.maxDepth > 90).length / scrollData.length * 100;

  // Calcola drop-off points
  const depthBuckets = [25, 50, 75, 90];
  const dropOffPoints = depthBuckets.map(depth => {
    const reachedDepth = scrollData.filter(d => d.maxDepth >= depth).length;
    const dropOffRate = reachedDepth > 0 ? 
      (scrollData.length - reachedDepth) / scrollData.length * 100 : 0;
    
    return { depth, dropOffRate };
  });

  // Classifica velocità scroll (basato su depth/time ratio)
  let fastScrollers = 0;
  let slowReaders = 0;
  
  scrollData.forEach(d => {
    if (d.sessionDuration > 0) {
      const scrollSpeed = d.avgDepth / (d.sessionDuration / 60); // depth per minute
      if (scrollSpeed > 30) fastScrollers++;
      else if (scrollSpeed < 10) slowReaders++;
    }
  });

  return {
    avgDepth: Math.round(avgDepth),
    completionRate: Math.round(completionRate),
    dropOffPoints,
    fastScrollers: Math.round(fastScrollers / scrollData.length * 100),
    slowReaders: Math.round(slowReaders / scrollData.length * 100)
  };
}

/**
 * Pulisce URL per pattern analysis
 * @param {string} url - URL da pulire
 * @returns {string} - URL pulito
 */
function cleanUrlForPattern(url) {
  if (!url) return 'unknown';
  
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    
    // Semplifica path comuni
    if (path === '/' || path === '') return 'homepage';
    if (path.includes('/landing')) return 'landing';
    if (path.includes('/contact')) return 'contact';
    if (path.includes('/about')) return 'about';
    if (path.includes('/services')) return 'services';
    if (path.includes('/blog')) return 'blog';
    
    return path.split('/').filter(p => p).join('/') || 'homepage';
  } catch {
    return 'unknown';
  }
}

/**
 * Calcola trend settimanali
 * @param {Date} startDate - Data inizio
 * @param {Date} endDate - Data fine
 * @returns {Promise<Object>} - Trend settimanali
 */
async function calculateWeeklyTrends(startDate, endDate) {
  // Implementazione base - può essere espansa con più logica predittiva
  return {
    growth: 0,
    momentum: 'stable',
    seasonality: 0
  };
}

/**
 * Calcola analisi funnel (implementazione base)
 * @param {Date} startDate - Data inizio
 * @param {Date} endDate - Data fine
 * @returns {Promise<Object>} - Analisi funnel
 */
async function calculateFunnelAnalysis(startDate, endDate) {
  // Implementazione base per funnel analysis
  return {
    steps: [],
    overall: {
      totalEntries: 0,
      totalCompletions: 0,
      completionRate: 0,
      avgTimeToComplete: 0,
      bottleneckStep: 'none'
    },
    bySource: []
  };
}

/**
 * Calcola segmentazione utenti (implementazione base)
 * @param {Date} startDate - Data inizio
 * @param {Date} endDate - Data fine
 * @returns {Promise<Object>} - Segmentazione utenti
 */
async function calculateUserSegmentation(startDate, endDate) {
  // Implementazione base per user segmentation
  return {
    behavioralClusters: [],
    geographic: [],
    valueSegments: {
      highValue: { count: 0, avgValue: 0 },
      mediumValue: { count: 0, avgValue: 0 },
      lowValue: { count: 0, avgValue: 0 }
    }
  };
}

/**
 * Calcola performance contenuti (implementazione base)
 * @param {Date} startDate - Data inizio
 * @param {Date} endDate - Data fine
 * @returns {Promise<Object>} - Performance contenuti
 */
async function calculateContentPerformance(startDate, endDate) {
  // Implementazione base per content performance
  return {
    topPages: [],
    categories: [],
    exitAnalysis: []
  };
}

/**
 * Calcola qualità sessioni (implementazione base)
 * @param {Date} startDate - Data inizio
 * @param {Date} endDate - Data fine
 * @returns {Promise<Object>} - Qualità sessioni
 */
async function calculateSessionQuality(startDate, endDate) {
  // Implementazione base per session quality
  return {
    qualityDistribution: {
      excellent: 0,
      good: 0,
      average: 0,
      poor: 0
    },
    indicators: {
      avgPagesPerSession: 0,
      avgSessionDuration: 0,
      interactionRate: 0,
      goalCompletionRate: 0
    },
    byTrafficSource: []
  };
}

/**
 * Calcola predictions (implementazione base)
 * @param {Date} startDate - Data inizio
 * @param {Date} endDate - Data fine
 * @returns {Promise<Object>} - Predictions
 */
async function calculatePredictions(startDate, endDate) {
  // Implementazione base per predictions
  return {
    conversionPropensity: {
      nextWeekPrediction: 0,
      confidence: 0,
      factors: []
    },
    churnRisk: {
      highRisk: 0,
      mediumRisk: 0,
      lowRisk: 0
    },
    growthForecast: {
      nextPeriodGrowth: 0,
      seasonalityFactor: 0,
      trendMomentum: 'stable'
    }
  };
}

/**
 * Calcola confidence score
 * @param {Object} analytics - Dati analytics
 * @returns {number} - Confidence score (0-100)
 */
function calculateConfidenceScore(analytics) {
  let score = 0;
  
  // Basato su sample size
  if (analytics.sampleSize > 100) score += 40;
  else if (analytics.sampleSize > 50) score += 30;
  else if (analytics.sampleSize > 10) score += 20;
  else score += 10;
  
  // Basato su completezza dati
  if (analytics.engagement?.overallScore > 0) score += 20;
  if (analytics.temporalPatterns?.hourlyDistribution?.length > 0) score += 20;
  if (analytics.behavioralHeatmap?.interactionHotspots?.length > 0) score += 20;
  
  return Math.min(score, 100);
}

/**
 * Genera chiave periodo
 * @param {Date} date - Data
 * @param {string} period - Periodo
 * @returns {string} - Chiave periodo
 */
function generatePeriodKey(date, period) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  switch (period) {
    case 'daily':
      return `${year}-${month}-${day}`;
    case 'weekly':
      const weekNumber = Math.ceil((date.getDate() + new Date(year, date.getMonth(), 1).getDay()) / 7);
      return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
    case 'monthly':
      return `${year}-${month}`;
    case 'yearly':
      return `${year}`;
    default:
      return `${year}-${month}-${day}`;
  }
}

/**
 * Recupera analytics per periodo
 * @param {string} periodKey - Chiave periodo
 * @param {string} period - Tipo periodo
 * @returns {Promise<Object>} - Analytics recuperate
 */
async function getAnalytics(periodKey, period = 'daily') {
  const functionName = 'getAnalytics';
  log.enter(functionName, { periodKey, period });

  try {
    const analytics = await Analytics.findOne({ periodKey, period }).lean();
    
    if (!analytics) {
      log.warn(functionName, 'Analytics non trovate per periodo', { periodKey, period });
      return null;
    }

    log.info(functionName, 'Analytics recuperate', {
      periodKey,
      confidence: analytics.confidence,
      sampleSize: analytics.sampleSize
    });

    log.exit(functionName, { success: true });
    return analytics;

  } catch (error) {
    log.error(functionName, 'Errore recupero analytics', error);
    log.exit(functionName, { success: false, error: true });
    throw error;
  }
}

/**
 * Aggiorna analytics automaticamente per oggi
 * @returns {Promise<Object>} - Analytics aggiornate
 */
async function updateTodayAnalytics() {
  const functionName = 'updateTodayAnalytics';
  log.enter(functionName);

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const analytics = await generateAdvancedAnalytics(today, tomorrow, 'daily');

    log.info(functionName, 'Analytics di oggi aggiornate', {
      date: today.toISOString().split('T')[0],
      confidence: analytics.confidence
    });

    log.exit(functionName, { success: true });
    return analytics;

  } catch (error) {
    log.error(functionName, 'Errore aggiornamento analytics oggi', error);
    log.exit(functionName, { success: false, error: true });
    throw error;
  }
}

module.exports = {
  Analytics,
  generateAdvancedAnalytics,
  getAnalytics,
  updateTodayAnalytics,
  calculateTemporalPatterns,
  calculateEngagementMetrics,
  calculateBehavioralHeatmap,
  calculateSessionEngagement,
  calculateDetailedEngagement
};