const axios = require('axios');

// Funzione per ottenere lo screenshot di un sito tramite API esterna
async function getScreenshot(url) {
  try {
    // Opzione 1: Usa l'API di PageSpeed Insights per lo screenshot
    const apiKey = process.env.PAGESPEED_API_KEY || '';
    const pageSpeedUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}`;
    
    const response = await axios.get(pageSpeedUrl);
    
    // Estrai lo screenshot dai risultati
    const screenshot = response.data?.lighthouseResult?.audits?.['final-screenshot']?.details?.data;
    
    if (screenshot) {
      return screenshot; // Questo è già in formato base64 pronto per essere usato come src
    }
    
    // Fallback: Se non riusciamo a ottenere lo screenshot da PageSpeed, usiamo screenshotmachine
    const screenshotApiKey = process.env.SCREENSHOT_API_KEY || 'demo';
    return `https://api.screenshotmachine.com?key=${screenshotApiKey}&url=${encodeURIComponent(url)}&dimension=1024x768&format=jpg&cacheLimit=14`;
  } catch (error) {
    console.error('Errore nel recupero dello screenshot:', error);
    
    // Fallback in caso di errore
    const screenshotApiKey = process.env.SCREENSHOT_API_KEY || 'demo';
    return `https://api.screenshotmachine.com?key=${screenshotApiKey}&url=${encodeURIComponent(url)}&dimension=1024x768&format=jpg&cacheLimit=14`;
  }
}

module.exports = {
  getScreenshot
};