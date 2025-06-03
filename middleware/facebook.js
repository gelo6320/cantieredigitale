const axios = require('axios');

// Middleware per catturare fbclid e inviare PageView alla CAPI
const facebookTrackingMiddleware = async (req, res, next) => {
  // Estrai fbclid dalla query
  let fbclid = req.query.fbclid;
  
  // Se non c'è nella query diretta, controlla l'header referer
  if (!fbclid && req.headers.referer) {
    try {
      const refererUrl = new URL(req.headers.referer);
      fbclid = refererUrl.searchParams.get('fbclid');
    } catch (e) {
      // Errore parsing URL referer, ignora
    }
  }
  
  // Verifica se l'fbclid è già presente nella sessione
  const sessionFbclid = req.session && req.session.fbclid;
  if (!fbclid && sessionFbclid) {
    fbclid = sessionFbclid;
  }
  
  // Procedi solo se c'è un fbclid nella URL e non è stato già tracciato questo fbclid
  if (fbclid && (!req.session || !req.session.fbclidTracked || req.session.fbclid !== fbclid)) {
    // Salva fbclid in sessione se presente
    if (req.session) {
      req.session.fbclid = fbclid;
      req.session.fbclidTimestamp = Date.now();
      req.session.fbclidTracked = true;
    }
    
    try {
      // Genera un ID evento univoco per la deduplicazione
      const eventId = 'pageview_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
      
      // Payload per l'evento
      const payload = {
        data: [{
          event_name: 'PageView',
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          event_source_url: req.headers.referer || `https://${req.get('host')}${req.originalUrl}`,
          user_data: {
            client_user_agent: req.headers['user-agent'] || '',
          },
          custom_data: {}
        }],
        access_token: process.env.ACCESS_TOKEN,
        partner_agent: 'costruzionedigitale-nodejs',
        test_event_code: process.env.NODE_ENV === 'production' ? undefined : process.env.FACEBOOK_TEST_EVENT_CODE
      };
      
      // Aggiungi fbclid al campo corretto
      if (fbclid) {
        // L'fbclid deve essere passato come parametro esterno per il matching
        const timestamp = Date.now();
        payload.data[0].user_data.fbc = `fb.1.${timestamp}.${fbclid}`;
      }
      
      // Invia l'evento PageView alla CAPI
      await axios.post(
        `https://graph.facebook.com/v22.0/1543790469631614/events?access_token=EAAd7rpHujUkBO3iESqN0hqKg15uiHeDZCIffdtbJIYuzTBVAfq0qMLM6dO70WmZCGE4XmL9kPZAX2S0VbTkIA0ORxypfSnrDK1nALetbLRu0nrEyyfOU7mkQ3Joy1YISlIlEdr9qbjc9YOR6DfS3zKkUf4Vhu9HhTKYta5ZAZCPnEZAbgF8CPvAeVHPS2nggZDZD`,
        payload
      );
    } catch (error) {
      console.error('Errore invio PageView a CAPI:', error.message);
    }
  }
  
  next();
};

module.exports = {
  facebookTrackingMiddleware
};