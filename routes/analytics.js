/**
 * Routes API Analytics Avanzate
 * =============================
 * 
 * Endpoint per utilizzare le nuove funzionalità di analytics avanzate.
 * Da aggiungere al sistema di routing esistente.
 * 
 * @author Costruzione Digitale
 * @version 1.0
 */

const express = require('express');
const router = express.Router();
const { 
  generateAdvancedAnalytics, 
  getAnalytics, 
  updateTodayAnalytics,
  Analytics 
} = require('../services/analyticsService');
const { log } = require('../utils/logger');
const { getUserConnection } = require('../utils');

/**
 * GET /api/analytics/dashboard
 * Ottiene dashboard completa analytics per oggi
 */
router.get('/dashboard', async (req, res) => {
  const functionName = 'GET /api/analytics/dashboard';
  log.enter(functionName, {
    userAgent: req.headers['user-agent']?.substring(0, 50) + '...'
  });

  try {
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }

    // Genera analytics per oggi se non esistono
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const periodKey = today.toISOString().split('T')[0];

    let analytics = await getAnalytics(periodKey, 'daily', connection);
    
    if (!analytics) {
      log.info(functionName, 'Analytics non trovate, generazione nuove', { periodKey });
      analytics = await updateTodayAnalytics(connection);
    }

    // Genera insights automatici
    const insights = analytics.generateInsights ? analytics.generateInsights() : [];

    // Aggiungi metriche di comparazione (settimana scorsa)
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastWeekKey = lastWeek.toISOString().split('T')[0];
    const lastWeekAnalytics = await getAnalytics(lastWeekKey, 'daily', connection);

    const comparison = lastWeekAnalytics ? {
      engagementChange: analytics.engagement.overallScore - lastWeekAnalytics.engagement.overallScore,
      confidenceChange: analytics.confidence - lastWeekAnalytics.confidence,
      sampleSizeChange: analytics.sampleSize - lastWeekAnalytics.sampleSize
    } : null;

    const dashboard = {
      currentPeriod: {
        periodKey,
        period: 'daily',
        analytics
      },
      insights,
      comparison,
      summary: {
        overallScore: analytics.engagement?.overallScore || 0,
        confidence: analytics.confidence || 0,
        sampleSize: analytics.sampleSize || 0,
        topInteraction: analytics.behavioralHeatmap?.interactionHotspots?.[0]?.elementType || 'none',
        peakHour: getPeakHour(analytics.temporalPatterns?.hourlyDistribution || []),
        topSource: analytics.engagement?.bySource?.[0]?.source || 'unknown'
      },
      lastUpdated: analytics.calculatedAt
    };

    log.info(functionName, 'Dashboard analytics generata', {
      periodKey,
      overallScore: dashboard.summary.overallScore,
      insightsCount: insights.length
    });

    log.exit(functionName, { success: true });
    res.json(dashboard);

  } catch (error) {
    log.error(functionName, 'Errore generazione dashboard', error);
    log.exit(functionName, { success: false, error: true });
    
    res.status(500).json({
      error: 'Errore interno server',
      message: 'Impossibile generare dashboard analytics'
    });
  }
});

/**
 * GET /api/analytics/engagement
 * Ottiene metriche di engagement dettagliate
 */
router.get('/engagement', async (req, res) => {
  const functionName = 'GET /api/analytics/engagement';
  const { period = 'daily', days = 7 } = req.query;
  
  log.enter(functionName, { period, days });

  try {
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Recupera analytics per il periodo usando la connessione
    const Analytics = connection.model('Analytics');
    const analyticsData = await Analytics.find({
      date: { $gte: startDate, $lte: endDate },
      period: period
    }).sort({ date: 1 }).lean();

    // Prepara dati per il grafico
    const chartData = analyticsData.map(analytics => ({
      date: analytics.periodKey,
      overallScore: analytics.engagement?.overallScore || 0,
      timeEngagement: analytics.engagement?.components?.timeEngagement || 0,
      interactionEngagement: analytics.engagement?.components?.interactionEngagement || 0,
      depthEngagement: analytics.engagement?.components?.depthEngagement || 0,
      conversionEngagement: analytics.engagement?.components?.conversionEngagement || 0
    })).reverse(); // Ordine cronologico

    // Calcola statistiche aggregate
    const stats = {
      avgOverallScore: chartData.length > 0 ? 
        Math.round(chartData.reduce((sum, d) => sum + d.overallScore, 0) / chartData.length) : 0,
      bestDay: chartData.reduce((best, current) => 
        current.overallScore > best.overallScore ? current : best, 
        { overallScore: 0, date: 'N/A' }),
      worstDay: chartData.reduce((worst, current) => 
        current.overallScore < worst.overallScore ? current : worst,
        { overallScore: 100, date: 'N/A' }),
      trend: 'stable'
    };

    const response = {
      period,
      days: parseInt(days),
      dateRange: {
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0]
      },
      chartData,
      stats,
      totalRecords: analyticsData.length
    };

    log.info(functionName, 'Dati engagement recuperati', {
      records: analyticsData.length,
      avgScore: stats.avgOverallScore
    });

    log.exit(functionName, { success: true });
    res.json(response);

  } catch (error) {
    log.error(functionName, 'Errore recupero engagement', error);
    log.exit(functionName, { success: false, error: true });
    
    res.status(500).json({
      error: 'Errore recupero dati engagement',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/heatmap
 * Ottiene dati heatmap comportamentale
 */
router.get('/heatmap', async (req, res) => {
  const functionName = 'GET /api/analytics/heatmap';
  const { period = 'daily', date } = req.query;
  
  log.enter(functionName, { period, date });

  try {
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }

    const targetDate = date ? new Date(date) : new Date();
    const periodKey = generatePeriodKey(targetDate, period);

    const analytics = await getAnalytics(periodKey, period, connection);

    if (!analytics || !analytics.behavioralHeatmap) {
      log.warn(functionName, 'Dati heatmap non trovati', { periodKey, period });
      return res.status(404).json({
        error: 'Dati non trovati',
        message: 'Nessun dato heatmap disponibile per il periodo specificato'
      });
    }

    const heatmap = analytics.behavioralHeatmap;

    // Processa hotspots per visualizzazione
    const processedHotspots = heatmap.interactionHotspots.map(hotspot => ({
      ...hotspot,
      intensity: hotspot.heatScore / 100, // Normalizza per visualizzazione
      category: categorizeElement(hotspot.elementType),
      efficiency: hotspot.uniqueUsers > 0 ? 
        (hotspot.interactions / hotspot.uniqueUsers).toFixed(2) : 0
    }));

    // Analizza scroll patterns
    const scrollAnalysis = {
      ...heatmap.scrollBehavior,
      recommendations: generateScrollRecommendations(heatmap.scrollBehavior)
    };

    // Top navigation patterns con insights
    const navigationInsights = heatmap.navigationPatterns.slice(0, 10).map(pattern => ({
      ...pattern,
      insight: generateNavigationInsight(pattern),
      efficiency: pattern.frequency > 0 ? 
        (pattern.conversionRate / pattern.frequency * 100).toFixed(2) : 0
    }));

    const response = {
      periodKey,
      period,
      date: targetDate.toISOString().split('T')[0],
      hotspots: processedHotspots,
      scrollBehavior: scrollAnalysis,
      navigationPatterns: navigationInsights,
      summary: {
        totalHotspots: processedHotspots.length,
        topElementType: processedHotspots[0]?.elementType || 'none',
        avgScrollDepth: scrollAnalysis.avgDepth,
        topPattern: navigationInsights[0]?.pattern || 'none'
      },
      lastUpdated: analytics.calculatedAt
    };

    log.info(functionName, 'Dati heatmap recuperati', {
      periodKey,
      hotspots: processedHotspots.length,
      patterns: navigationInsights.length
    });

    log.exit(functionName, { success: true });
    res.json(response);

  } catch (error) {
    log.error(functionName, 'Errore recupero heatmap', error);
    log.exit(functionName, { success: false, error: true });
    
    res.status(500).json({
      error: 'Errore recupero dati heatmap',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/temporal
 * Ottiene analisi pattern temporali
 */
router.get('/temporal', async (req, res) => {
  const functionName = 'GET /api/analytics/temporal';
  const { period = 'weekly', weeks = 4 } = req.query;
  
  log.enter(functionName, { period, weeks });

  try {
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (parseInt(weeks) * 7));

    // Recupera dati per il periodo
    const Analytics = connection.model('Analytics');
    const analyticsData = await Analytics.find({
      date: { $gte: startDate, $lte: endDate },
      period: 'daily'
    }).sort({ date: 1 }).lean();

    // Aggrega pattern temporali
    const hourlyAggregated = Array.from({ length: 24 }, () => ({
      visits: 0, pageViews: 0, engagement: 0, conversions: 0, count: 0
    }));

    const weeklyAggregated = Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i,
      dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i],
      visits: 0, engagement: 0, count: 0
    }));

    analyticsData.forEach(analytics => {
      if (analytics.temporalPatterns?.hourlyDistribution) {
        analytics.temporalPatterns.hourlyDistribution.forEach((hour, index) => {
          if (hourlyAggregated[index]) {
            hourlyAggregated[index].visits += hour.visits;
            hourlyAggregated[index].pageViews += hour.pageViews;
            hourlyAggregated[index].engagement += hour.engagement;
            hourlyAggregated[index].conversions += hour.conversions;
            hourlyAggregated[index].count++;
          }
        });
      }

      if (analytics.temporalPatterns?.weeklyDistribution) {
        analytics.temporalPatterns.weeklyDistribution.forEach(day => {
          if (weeklyAggregated[day.dayOfWeek]) {
            weeklyAggregated[day.dayOfWeek].visits += day.visits;
            weeklyAggregated[day.dayOfWeek].engagement += day.avgEngagement;
            weeklyAggregated[day.dayOfWeek].count++;
          }
        });
      }
    });

    // Calcola medie
    hourlyAggregated.forEach(hour => {
      if (hour.count > 0) {
        hour.avgVisits = Math.round(hour.visits / hour.count);
        hour.avgPageViews = Math.round(hour.pageViews / hour.count);
        hour.avgEngagement = Math.round(hour.engagement / hour.count);
        hour.avgConversions = Math.round(hour.conversions / hour.count);
      }
    });

    weeklyAggregated.forEach(day => {
      if (day.count > 0) {
        day.avgVisits = Math.round(day.visits / day.count);
        day.avgEngagement = Math.round(day.engagement / day.count);
      }
    });

    // Identifica pattern e insight
    const peakHour = hourlyAggregated.reduce((max, current, index) => 
      current.avgVisits > hourlyAggregated[max].avgVisits ? index : max, 0);
    
    const peakDay = weeklyAggregated.reduce((max, current) => 
      current.avgVisits > max.avgVisits ? current : max);

    const insights = generateTemporalInsights(hourlyAggregated, weeklyAggregated);

    const response = {
      period,
      weeks: parseInt(weeks),
      dateRange: {
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0]
      },
      hourlyPattern: hourlyAggregated.map((hour, index) => ({
        hour: index,
        time: `${index.toString().padStart(2, '0')}:00`,
        ...hour
      })),
      weeklyPattern: weeklyAggregated,
      insights: {
        peakHour: {
          hour: peakHour,
          time: `${peakHour.toString().padStart(2, '0')}:00`,
          visits: hourlyAggregated[peakHour].avgVisits
        },
        peakDay: {
          day: peakDay.dayName,
          visits: peakDay.avgVisits
        },
        patterns: insights
      },
      recordsAnalyzed: analyticsData.length
    };

    log.info(functionName, 'Pattern temporali analizzati', {
      records: analyticsData.length,
      peakHour: peakHour,
      peakDay: peakDay.dayName
    });

    log.exit(functionName, { success: true });
    res.json(response);

  } catch (error) {
    log.error(functionName, 'Errore analisi pattern temporali', error);
    log.exit(functionName, { success: false, error: true });
    
    res.status(500).json({
      error: 'Errore analisi pattern temporali',
      message: error.message
    });
  }
});

/**
 * POST /api/analytics/generate
 * Genera nuove analytics per un periodo specifico
 */
router.post('/generate', async (req, res) => {
  const functionName = 'POST /api/analytics/generate';
  const { startDate, endDate, period = 'daily', force = false } = req.body;
  
  log.enter(functionName, { startDate, endDate, period, force });

  try {
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Validazione date
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        error: 'Date non valide',
        message: 'Fornire startDate e endDate in formato ISO valido'
      });
    }

    if (start >= end) {
      return res.status(400).json({
        error: 'Range date non valido',
        message: 'startDate deve essere precedente a endDate'
      });
    }

    // Verifica se analytics esistono già
    const periodKey = generatePeriodKey(start, period);
    const existing = await getAnalytics(periodKey, period, connection);

    if (existing && !force) {
      log.info(functionName, 'Analytics esistenti trovate', {
        periodKey,
        confidence: existing.confidence
      });

      return res.json({
        message: 'Analytics già esistenti per questo periodo',
        periodKey,
        analytics: existing,
        generated: false
      });
    }

    // Genera nuove analytics
    log.info(functionName, 'Inizio generazione analytics', {
      periodKey,
      force
    });

    const analytics = await generateAdvancedAnalytics(start, end, period, connection);

    log.info(functionName, 'Analytics generate con successo', {
      periodKey,
      confidence: analytics.confidence,
      sampleSize: analytics.sampleSize
    });

    log.exit(functionName, { success: true });
    res.json({
      message: 'Analytics generate con successo',
      periodKey,
      analytics,
      generated: true
    });

  } catch (error) {
    log.error(functionName, 'Errore generazione analytics', error);
    log.exit(functionName, { success: false, error: true });
    
    res.status(500).json({
      error: 'Errore generazione analytics',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/insights/:periodKey
 * Ottiene insights per un periodo specifico
 */
router.get('/insights/:periodKey', async (req, res) => {
  const functionName = 'GET /api/analytics/insights/:periodKey';
  const { periodKey } = req.params;
  const { period = 'daily' } = req.query;
  
  log.enter(functionName, { periodKey, period });

  try {
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }

    const analytics = await getAnalytics(periodKey, period, connection);

    if (!analytics) {
      return res.status(404).json({
        error: 'Analytics non trovate',
        message: `Nessuna analytics disponibile per ${periodKey}`
      });
    }

    const insights = analytics.generateInsights ? analytics.generateInsights() : [];

    // Aggiungi insights comparativi se disponibili
    const comparativeInsights = await generateComparativeInsights(periodKey, period, connection);

    const response = {
      periodKey,
      period,
      insights,
      comparativeInsights,
      summary: {
        totalInsights: insights.length,
        highPriority: insights.filter(i => i.priority === 'high').length,
        categories: [...new Set(insights.map(i => i.category))]
      },
      analytics: {
        overallScore: analytics.engagement?.overallScore || 0,
        confidence: analytics.confidence || 0,
        sampleSize: analytics.sampleSize || 0
      }
    };

    log.info(functionName, 'Insights recuperati', {
      periodKey,
      insightsCount: insights.length,
      highPriorityCount: response.summary.highPriority
    });

    log.exit(functionName, { success: true });
    res.json(response);

  } catch (error) {
    log.error(functionName, 'Errore recupero insights', error);
    log.exit(functionName, { success: false, error: true });
    
    res.status(500).json({
      error: 'Errore recupero insights',
      message: error.message
    });
  }
});

// ================================================================
// FUNZIONI HELPER
// ================================================================

/**
 * Trova l'ora di picco dai dati orari
 * @param {Array} hourlyData - Dati distribuzione oraria
 * @returns {number} - Ora di picco
 */
function getPeakHour(hourlyData) {
  if (!hourlyData || hourlyData.length === 0) return 0;
  
  return hourlyData.reduce((max, current, index) => 
    current.visits > hourlyData[max].visits ? index : max, 0);
}

/**
 * Categorizza tipo elemento per heatmap
 * @param {string} elementType - Tipo elemento
 * @returns {string} - Categoria
 */
function categorizeElement(elementType) {
  const categories = {
    'button': 'action',
    'form': 'input',
    'link': 'navigation',
    'image': 'media',
    'video': 'media',
    'text': 'content',
    'page': 'navigation'
  };
  
  return categories[elementType] || 'other';
}

/**
 * Genera raccomandazioni per scroll behavior
 * @param {Object} scrollBehavior - Dati comportamento scroll
 * @returns {Array} - Array raccomandazioni
 */
function generateScrollRecommendations(scrollBehavior) {
  const recommendations = [];
  
  if (scrollBehavior.completionRate < 30) {
    recommendations.push({
      type: 'content',
      message: 'Considera di spostare contenuto importante più in alto',
      priority: 'high'
    });
  }
  
  if (scrollBehavior.fastScrollers > 60) {
    recommendations.push({
      type: 'engagement',
      message: 'Molti utenti scorrono velocemente - aggiungi elementi di stop',
      priority: 'medium'
    });
  }
  
  if (scrollBehavior.avgDepth < 40) {
    recommendations.push({
      type: 'layout',
      message: 'Considera un layout più compatto per migliorare la lettura',
      priority: 'medium'
    });
  }
  
  return recommendations;
}

/**
 * Genera insight per pattern navigazione
 * @param {Object} pattern - Pattern navigazione
 * @returns {string} - Insight
 */
function generateNavigationInsight(pattern) {
  if (pattern.conversionRate > 10) {
    return 'Percorso ad alta conversione - considera di promuoverlo';
  } else if (pattern.conversionRate < 2) {
    return 'Percorso a bassa conversione - potrebbe necessitare ottimizzazioni';
  } else if (pattern.frequency > 50) {
    return 'Percorso molto frequente - monitora la user experience';
  }
  
  return 'Percorso standard';
}

/**
 * Genera insights pattern temporali
 * @param {Array} hourlyData - Dati orari
 * @param {Array} weeklyData - Dati settimanali
 * @returns {Array} - Array insights
 */
function generateTemporalInsights(hourlyData, weeklyData) {
  const insights = [];
  
  // Analizza distribuzione oraria
  const businessHours = hourlyData.slice(9, 17); // 9-17
  const totalBusinessVisits = businessHours.reduce((sum, h) => sum + h.avgVisits, 0);
  const totalVisits = hourlyData.reduce((sum, h) => sum + h.avgVisits, 0);
  
  if (totalBusinessVisits / totalVisits > 0.7) {
    insights.push({
      type: 'business',
      message: 'Traffico concentrato in orari lavorativi',
      recommendation: 'Ottimizza per audience B2B'
    });
  }
  
  // Analizza weekend vs weekdays
  const weekendVisits = weeklyData[0].avgVisits + weeklyData[6].avgVisits;
  const weekdayVisits = weeklyData.slice(1, 6).reduce((sum, d) => sum + d.avgVisits, 0);
  
  if (weekendVisits > weekdayVisits / 5) {
    insights.push({
      type: 'weekend',
      message: 'Traffico significativo nel weekend',
      recommendation: 'Considera contenuti specifici per il tempo libero'
    });
  }
  
  return insights;
}

/**
 * Genera insights comparativi
 * @param {string} periodKey - Chiave periodo
 * @param {string} period - Tipo periodo
 * @param {Object} connection - Connessione database
 * @returns {Promise<Array>} - Insights comparativi
 */
async function generateComparativeInsights(periodKey, period, connection) {
  try {
    // Trova periodo precedente per comparazione
    const currentDate = new Date(periodKey);
    const previousDate = new Date(currentDate);
    
    if (period === 'daily') {
      previousDate.setDate(previousDate.getDate() - 1);
    } else if (period === 'weekly') {
      previousDate.setDate(previousDate.getDate() - 7);
    } else if (period === 'monthly') {
      previousDate.setMonth(previousDate.getMonth() - 1);
    }
    
    const previousPeriodKey = generatePeriodKey(previousDate, period);
    const previousAnalytics = await getAnalytics(previousPeriodKey, period, connection);
    
    if (!previousAnalytics) {
      return [];
    }
    
    const insights = [];
    
    // Compara engagement
    const currentAnalytics = await getAnalytics(periodKey, period, connection);
    if (currentAnalytics) {
      const engagementDiff = currentAnalytics.engagement.overallScore - previousAnalytics.engagement.overallScore;
      
      if (Math.abs(engagementDiff) > 10) {
        insights.push({
          type: engagementDiff > 0 ? 'improvement' : 'decline',
          category: 'engagement',
          message: `Engagement ${engagementDiff > 0 ? 'aumentato' : 'diminuito'} di ${Math.abs(engagementDiff)} punti`,
          change: engagementDiff
        });
      }
    }
    
    return insights;
    
  } catch (error) {
    log.error('generateComparativeInsights', 'Errore generazione insights comparativi', error);
    return [];
  }
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

module.exports = router;