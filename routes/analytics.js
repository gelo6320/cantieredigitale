/**
 * Routes Analytics Semplificato - Solo Pattern Temporali
 * @author Costruzione Digitale
 * @version 2.0
 */

const express = require('express');
const router = express.Router();
const { 
  generateTemporalAnalytics, 
  getTemporalAnalytics,
  generatePeriodKey
} = require('../services/analyticsService');
const { log } = require('../utils/logger');
const { getUserConnection } = require('../utils');

/**
 * GET /api/analytics/temporal
 * Ottiene pattern temporali per un periodo
 */
router.get('/temporal', async (req, res) => {
  const functionName = 'GET /api/analytics/temporal';
  const { period = 'monthly', weeks = 4, days = 30 } = req.query;
  
  log.enter(functionName, { period, weeks, days });

  try {
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile' 
      });
    }

    // Calcola range date basato sul periodo
    const endDate = new Date();
    const startDate = new Date(endDate);
    
    if (period === 'monthly') {
      startDate.setDate(startDate.getDate() - parseInt(days));
    } else {
      startDate.setDate(startDate.getDate() - (parseInt(weeks) * 7));
    }

    // Genera period key per il periodo corrente
    const currentPeriodKey = generatePeriodKey(endDate, period);
    
    // Cerca analytics esistenti
    let analytics = await getTemporalAnalytics(currentPeriodKey, period, connection);
    
    // Se non esistono, genera nuove analytics
    if (!analytics) {
      log.info(functionName, 'Analytics non trovate, generazione nuove', { 
        periodKey: currentPeriodKey 
      });
      
      analytics = await generateTemporalAnalytics(startDate, endDate, period, connection);
    }

    // Identifica pattern e insights
    const insights = generateInsights(analytics);

    const response = {
      period,
      periodKey: currentPeriodKey,
      dateRange: {
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0]
      },
      hourlyDistribution: analytics.hourlyDistribution || [],
      weeklyDistribution: analytics.weeklyDistribution || [],
      insights,
      summary: {
        totalSessions: analytics.totalSessions || 0,
        avgEngagement: analytics.avgEngagement || 0,
        peakHour: findPeakHour(analytics.hourlyDistribution || []),
        peakDay: findPeakDay(analytics.weeklyDistribution || [])
      },
      lastUpdated: analytics.calculatedAt || new Date()
    };

    log.info(functionName, 'Pattern temporali recuperati', {
      periodKey: currentPeriodKey,
      totalSessions: response.summary.totalSessions
    });

    log.exit(functionName, { success: true });
    res.json(response);

  } catch (error) {
    log.error(functionName, 'Errore recupero pattern temporali', error);
    log.exit(functionName, { success: false, error: true });
    
    res.status(500).json({
      error: 'Errore recupero pattern temporali',
      message: error.message
    });
  }
});

/**
 * POST /api/analytics/temporal/generate
 * Forza la rigenerazione dei pattern temporali
 */
router.post('/temporal/generate', async (req, res) => {
  const functionName = 'POST /api/analytics/temporal/generate';
  const { period = 'monthly', force = true } = req.body;
  
  log.enter(functionName, { period, force });

  try {
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile' 
      });
    }

    const endDate = new Date();
    const startDate = new Date(endDate);
    
    // Imposta range in base al periodo
    if (period === 'monthly') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (period === 'weekly') {
      startDate.setDate(startDate.getDate() - 7);
    } else {
      startDate.setDate(startDate.getDate() - 1);
    }

    log.info(functionName, 'Generazione pattern temporali', {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      period
    });

    const analytics = await generateTemporalAnalytics(startDate, endDate, period, connection);

    log.info(functionName, 'Pattern temporali generati', {
      periodKey: analytics.periodKey,
      totalSessions: analytics.totalSessions
    });

    log.exit(functionName, { success: true });
    res.json({
      message: 'Pattern temporali generati con successo',
      periodKey: analytics.periodKey,
      analytics,
      generated: true
    });

  } catch (error) {
    log.error(functionName, 'Errore generazione pattern temporali', error);
    log.exit(functionName, { success: false, error: true });
    
    res.status(500).json({
      error: 'Errore generazione pattern temporali',
      message: error.message
    });
  }
});

// ================================================================
// FUNZIONI HELPER
// ================================================================

/**
 * Trova l'ora di picco
 */
function findPeakHour(hourlyData) {
  if (!hourlyData || hourlyData.length === 0) return { hour: 0, visits: 0 };
  
  const peak = hourlyData.reduce((max, current) => 
    current.visits > max.visits ? current : max, hourlyData[0]);
  
  return {
    hour: peak.hour,
    visits: peak.visits,
    time: `${peak.hour.toString().padStart(2, '0')}:00`
  };
}

/**
 * Trova il giorno di picco
 */
function findPeakDay(weeklyData) {
  if (!weeklyData || weeklyData.length === 0) return { day: 'N/A', visits: 0 };
  
  const peak = weeklyData.reduce((max, current) => 
    current.visits > max.visits ? current : max, weeklyData[0]);
  
  return {
    day: peak.dayName,
    visits: peak.visits,
    dayOfWeek: peak.dayOfWeek
  };
}

/**
 * Genera insights dai pattern temporali
 */
function generateInsights(analytics) {
  const insights = [];
  
  if (!analytics.hourlyDistribution || !analytics.weeklyDistribution) {
    return insights;
  }
  
  // Insight ora di picco
  const peakHour = findPeakHour(analytics.hourlyDistribution);
  if (peakHour.visits > 0) {
    insights.push({
      type: 'peak_hour',
      message: `Picco di traffico alle ${peakHour.time} con ${peakHour.visits} visite`,
      recommendation: 'Pianifica contenuti e campagne per quest\'orario'
    });
  }
  
  // Insight giorno di picco
  const peakDay = findPeakDay(analytics.weeklyDistribution);
  if (peakDay.visits > 0) {
    insights.push({
      type: 'peak_day',
      message: `${peakDay.day} è il giorno più attivo con ${peakDay.visits} visite`,
      recommendation: 'Concentra le attività di marketing in questo giorno'
    });
  }
  
  // Insight distribuzione oraria
  const businessHours = analytics.hourlyDistribution.slice(9, 17);
  const businessTraffic = businessHours.reduce((sum, h) => sum + h.visits, 0);
  const totalTraffic = analytics.hourlyDistribution.reduce((sum, h) => sum + h.visits, 0);
  
  if (totalTraffic > 0) {
    const businessPercentage = (businessTraffic / totalTraffic) * 100;
    if (businessPercentage > 70) {
      insights.push({
        type: 'business_hours',
        message: `${businessPercentage.toFixed(1)}% del traffico è in orari lavorativi (9-17)`,
        recommendation: 'Target audience prevalentemente B2B'
      });
    } else if (businessPercentage < 30) {
      insights.push({
        type: 'after_hours',
        message: `${(100 - businessPercentage).toFixed(1)}% del traffico è fuori orari lavorativi`,
        recommendation: 'Target audience prevalentemente B2C o tempo libero'
      });
    }
  }
  
  // Insight weekend vs weekdays
  const weekendTraffic = analytics.weeklyDistribution[0].visits + analytics.weeklyDistribution[6].visits;
  const weekdayTraffic = analytics.weeklyDistribution.slice(1, 6).reduce((sum, d) => sum + d.visits, 0);
  
  if (weekdayTraffic > 0) {
    const weekendRatio = weekendTraffic / (weekdayTraffic / 5);
    if (weekendRatio > 1.2) {
      insights.push({
        type: 'weekend_traffic',
        message: 'Traffico weekend significativamente più alto della media',
        recommendation: 'Crea contenuti specifici per il tempo libero'
      });
    }
  }

  return insights;
}

module.exports = router;