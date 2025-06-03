const axios = require('axios');

// Funzione per ottenere metrics di PageSpeed Insights
async function getPageSpeedMetrics(url) {
  try {
    // Usa l'API di Google PageSpeed Insights
    const apiKey = process.env.PAGESPEED_API_KEY || '';
    // Aggiungi category=ACCESSIBILITY,BEST_PRACTICES,SEO,PERFORMANCE per ottenere tutte le metriche
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}&category=ACCESSIBILITY&category=BEST_PRACTICES&category=SEO&category=PERFORMANCE`;
    
    const response = await axios.get(apiUrl);
    const data = response.data;
    
    // Estrai le metriche principali
    const metrics = {
      performance: data.lighthouseResult?.categories?.performance?.score || 0,
      accessibility: data.lighthouseResult?.categories?.accessibility?.score || 0,
      bestPractices: data.lighthouseResult?.categories?.['best-practices']?.score || 0,
      seo: data.lighthouseResult?.categories?.seo?.score || 0
    };
    
    // Aggiungi metriche dettagliate se disponibili
    const audits = data.lighthouseResult?.audits;
    if (audits) {
      if (audits['first-contentful-paint']) {
        metrics.firstContentfulPaint = audits['first-contentful-paint'].numericValue;
      }
      if (audits['speed-index']) {
        metrics.speedIndex = audits['speed-index'].numericValue;
      }
      if (audits['largest-contentful-paint']) {
        metrics.largestContentfulPaint = audits['largest-contentful-paint'].numericValue;
      }
      if (audits['interactive']) {
        metrics.timeToInteractive = audits['interactive'].numericValue;
      }
      if (audits['total-blocking-time']) {
        metrics.totalBlockingTime = audits['total-blocking-time'].numericValue;
      }
      if (audits['cumulative-layout-shift']) {
        metrics.cumulativeLayoutShift = audits['cumulative-layout-shift'].numericValue;
      }
    }
    
    return metrics;
  } catch (error) {
    console.error('Errore nel recupero delle metrics PageSpeed:', error);
    return {
      performance: 0,
      accessibility: 0,
      bestPractices: 0,
      seo: 0
    };
  }
}

module.exports = {
  getPageSpeedMetrics
};