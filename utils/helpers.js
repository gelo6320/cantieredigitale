// Helper function to determine event category based on event type
function getEventCategory(eventType) {
    // Map consolidated event types to categories
    const categoryMap = {
      'form_interaction': 'form_interaction',
      'click': 'click',
      'video': 'media',
      'scroll': 'navigation',
      'page_visibility': 'navigation',
      'time_on_page': 'navigation',
      'session_end': 'navigation',
      'conversion': 'conversion',
      'pageview': 'page'
    };
    
    return categoryMap[eventType] || 'interaction';
  }
  
  // Funzione per contare lead reali per campagna
  async function getRealLeadsForCampaign(connection, adId) {
    try {
      if (!connection.models['Lead']) {
        return 0;
      }
      
      const Lead = connection.model('Lead');
      
      // CORREZIONE: Cerca i lead che hanno utm_source uguale all'ad ID
      // Il campo utm_source può essere in diversi posti nel documento
      const count = await Lead.countDocuments({
        $or: [
          // Campo utmSource diretto
          { utmSource: adId },
          // In extendedData.utmParams.utm_source
          { 'extendedData.utmParams.utm_source': adId },
          // In extendedData.formData.utm_source (se presente)
          { 'extendedData.formData.utm_source': adId },
          // Campo source se corrisponde all'adId
          { source: adId }
        ]
      });
      
      console.log(`Lead reali trovati per ad ${adId}: ${count}`);
      return count || 0;
    } catch (error) {
      console.error('Errore nel conteggio dei lead reali:', error);
      return 0;
    }
  }
  
  // Funzione per generare un ID utente casuale per cookie
  function generateUserId() {
    return 'user_' + Math.random().toString(36).substring(2, 15) + 
            Math.random().toString(36).substring(2, 15);
  }
  
  // Funzione per validare email
  function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  // Funzione per pulire il numero di telefono
  function cleanPhoneNumber(phone) {
    if (!phone) return '';
    return phone.replace(/\D/g, ''); // Rimuove tutto tranne i numeri
  }
  
  // Funzione per normalizzare il numero di telefono
  function normalizePhoneNumber(phone) {
    if (!phone) return '';
    let cleaned = cleanPhoneNumber(phone);
    
    // Se inizia con 39, probabilmente è già internazionale
    if (cleaned.startsWith('39')) {
      return '+' + cleaned;
    }
    
    // Se inizia con 0, rimuovi lo 0 e aggiungi +39
    if (cleaned.startsWith('0')) {
      return '+39' + cleaned.substring(1);
    }
    
    // Se non ha prefisso, assumiamo sia italiano
    if (cleaned.length === 9 || cleaned.length === 10) {
      return '+39' + cleaned;
    }
    
    return '+' + cleaned;
  }
  
  // Funzione per generare un ID univoco
  function generateUniqueId(prefix = 'id') {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
  }
  
  // Funzione per formattare data in italiano
  function formatDateItalian(date) {
    if (!date) return '';
    return new Date(date).toLocaleDateString('it-IT', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  // Funzione per calcolare la differenza in giorni tra due date
  function daysBetween(date1, date2) {
    const oneDay = 24 * 60 * 60 * 1000; // ore*minuti*secondi*millisecondi
    const firstDate = new Date(date1);
    const secondDate = new Date(date2);
    
    return Math.round(Math.abs((firstDate - secondDate) / oneDay));
  }
  
  // Funzione per capitalizzare la prima lettera
  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
  
  // Funzione per troncare testo
  function truncateText(text, maxLength = 100) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
  
  // Funzione per parsare i parametri UTM da una URL
  function parseUtmParams(url) {
    if (!url) return {};
    
    try {
      const urlObj = new URL(url);
      const params = {};
      
      const utmParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
      utmParams.forEach(param => {
        const value = urlObj.searchParams.get(param);
        if (value) {
          params[param] = value;
        }
      });
      
      // Aggiungi anche fbclid se presente
      const fbclid = urlObj.searchParams.get('fbclid');
      if (fbclid) {
        params.fbclid = fbclid;
      }
      
      return params;
    } catch (error) {
      console.error('Errore nel parsing dei parametri UTM:', error);
      return {};
    }
  }
  
  // Funzione per sanitizzare input HTML
  function sanitizeHtml(input) {
    if (!input) return '';
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }
  
  // Funzione per deep merge di oggetti
  function deepMerge(target, source) {
    const output = Object.assign({}, target);
    if (isObject(target) && isObject(source)) {
      Object.keys(source).forEach(key => {
        if (isObject(source[key])) {
          if (!(key in target))
            Object.assign(output, { [key]: source[key] });
          else
            output[key] = deepMerge(target[key], source[key]);
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }
  
  function isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }
  
  // Funzione per debounce
  function debounce(func, wait, immediate) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        timeout = null;
        if (!immediate) func(...args);
      };
      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func(...args);
    };
  }
  
  // Funzione per retry con backoff esponenziale
  async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        
        const delay = baseDelay * Math.pow(2, i);
        console.log(`Tentativo ${i + 1} fallito, riprovo tra ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  module.exports = {
    getEventCategory,
    getRealLeadsForCampaign,
    generateUserId,
    isValidEmail,
    cleanPhoneNumber,
    normalizePhoneNumber,
    generateUniqueId,
    formatDateItalian,
    daysBetween,
    capitalize,
    truncateText,
    parseUtmParams,
    sanitizeHtml,
    deepMerge,
    debounce,
    retryWithBackoff
  };