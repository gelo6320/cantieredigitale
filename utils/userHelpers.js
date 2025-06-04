const { mongoose } = require('../config');
const { AdminSchema } = require('../models');
const connectionManager = require('./connectionManager');

// Crea il modello Admin
const Admin = mongoose.model('Admin', AdminSchema);

// Funzione per ottenere la connessione MongoDB dell'utente
async function getUserConnection(req) {
  try {
    console.log("[getUserConnection] Starting...");
    
    if (!req.session || !req.session.isAuthenticated) {
      console.log("[getUserConnection] No valid session");
      return null;
    }
    
    if (!req.session.userConfig || !req.session.userConfig.mongodb_uri) {
      console.log("[getUserConnection] No MongoDB URI in config");
      return null;
    }
    
    const username = req.session.user.username;
    const mongodb_uri = req.session.userConfig.mongodb_uri;
    
    console.log(`[getUserConnection] Attempting connection for ${username} to ${mongodb_uri.substring(0, 20)}...`);
    
    // Get or create connection
    const connection = await connectionManager.getConnection(username, mongodb_uri);
    
    // Register all your models here
    if (!connection.models['Lead']) {
      console.log("[getUserConnection] Accessing leads collection");
      
      const LeadSchema = new mongoose.Schema({
        leadId: { type: String, required: true, unique: true },
        sessionId: { type: String, required: true, index: true },
        userId: { type: String, sparse: true, index: true },
        email: { type: String, required: true, index: true },
        firstName: String,
        lastName: String,
        phone: String,
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
        source: String,
        medium: String,
        campaign: String,
        utmSource: String,
        formType: { type: String, required: true },
        status: {
          type: String,
          enum: ['new', 'contacted', 'qualified', 'opportunity', 'proposal', 'converted', 'lost'],
          default: 'new'
        },
        // Add these two fields at the top level:
        value: { type: Number, default: 0 },
        service: { type: String },
        extendedData: {
          consentGiven: { type: Boolean, default: false },
          ipAddress: String,
          userAgent: String,
          utmParams: Object,
          fbclid: String,
          referrer: String,
          landingPage: String,
          deviceInfo: Object,
          formData: Object,
          notes: String,
          value: Number,
          currency: String
        },
        tags: [String],
        properties: { type: Map, of: mongoose.Schema.Types.Mixed },
        consent: {
          marketing: { type: Boolean, default: false },
          analytics: { type: Boolean, default: false },
          thirdParty: { type: Boolean, default: false },
          timestamp: Date,
          version: String,
          method: String
        },
        viewed: { type: Boolean, default: false },
        viewedAt: { type: Date }
      }, { 
        collection: 'leads',
        strict: false
      });
      
      connection.model('Lead', LeadSchema);
      console.log("[getUserConnection] Leads collection accessed successfully");
    }
    
    // For backwards compatibility, register the old models if needed
    const { 
      FormDataSchema, 
      BookingSchema, 
      FacebookEventSchema, 
      FacebookLeadSchema,
      DailyStatisticsSchema,
      WeeklyStatisticsSchema,
      MonthlyStatisticsSchema,
      TotalStatisticsSchema
    } = require('../models');
    
    if (!connection.models['FormData']) {
      console.log("[getUserConnection] Registering legacy models");
      connection.model('FormData', FormDataSchema);
      connection.model('Booking', BookingSchema);
      connection.model('FacebookEvent', FacebookEventSchema);
      connection.model('FacebookLead', FacebookLeadSchema);
      console.log("[getUserConnection] Legacy models registered");
    }
    
    // Register statistics models if they don't exist
    if (!connection.models['DailyStatistics']) {
      connection.model('DailyStatistics', DailyStatisticsSchema);
    }
    
    if (!connection.models['WeeklyStatistics']) {
      connection.model('WeeklyStatistics', WeeklyStatisticsSchema);
    }
    
    if (!connection.models['MonthlyStatistics']) {
      connection.model('MonthlyStatistics', MonthlyStatisticsSchema);
    }
    
    if (!connection.models['TotalStatistics']) {
      connection.model('TotalStatistics', TotalStatisticsSchema);
    }
    
    const { registerAnalyticsModels } = require('../services/analyticsService');
    registerAnalyticsModels(connection);
    
    console.log("[getUserConnection] Connection and models ready");
    return connection;
  } catch (error) {
    console.error('[getUserConnection] ERROR:', error);
    console.error('[getUserConnection] Stack trace:', error.stack);
    return null;
  }
}

// Funzione per recuperare le configurazioni dell'utente
async function getUserConfig(username) {
  try {
    if (!username) {
      return {
        mongodb_uri: process.env.MONGODB_URI,
        access_token: process.env.ACCESS_TOKEN,
        marketing_api_token: process.env.MARKETING_API_TOKEN || '',
        meta_pixel_id: process.env.FACEBOOK_PIXEL_ID || '1543790469631614',
        fb_account_id: process.env.FACEBOOK_ACCOUNT_ID || '',
        whatsapp_access_token: process.env.WHATSAPP_ACCESS_TOKEN || '',
        whatsapp_phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
        whatsapp_webhook_token: process.env.WHATSAPP_WEBHOOK_TOKEN || '',
        whatsapp_verify_token: process.env.WHATSAPP_VERIFY_TOKEN || ''
      };
    }
    
    // Cerca l'utente nel database
    const user = await Admin.findOne({ username });
    
    if (!user) {
      return {
        mongodb_uri: process.env.MONGODB_URI,
        access_token: process.env.ACCESS_TOKEN,
        marketing_api_token: process.env.MARKETING_API_TOKEN || '',
        meta_pixel_id: process.env.FACEBOOK_PIXEL_ID || '1543790469631614',
        fb_account_id: process.env.FACEBOOK_ACCOUNT_ID || '',
        whatsapp_access_token: process.env.WHATSAPP_ACCESS_TOKEN || '',
        whatsapp_phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
        whatsapp_webhook_token: process.env.WHATSAPP_WEBHOOK_TOKEN || '',
        whatsapp_verify_token: process.env.WHATSAPP_VERIFY_TOKEN || ''
      };
    }
    
    // Combina la configurazione dell'utente con i valori predeterminati
    return {
      mongodb_uri: user.config?.mongodb_uri || process.env.MONGODB_URI,
      access_token: user.config?.access_token || process.env.ACCESS_TOKEN,
      marketing_api_token: user.config?.marketing_api_token || process.env.MARKETING_API_TOKEN || '',
      meta_pixel_id: user.config?.meta_pixel_id || process.env.FACEBOOK_PIXEL_ID || '1543790469631614',
      fb_account_id: user.config?.fb_account_id || process.env.FACEBOOK_ACCOUNT_ID || '',
      whatsapp_access_token: user.config?.whatsapp_access_token || process.env.WHATSAPP_ACCESS_TOKEN || '',
      whatsapp_phone_number_id: user.config?.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      whatsapp_webhook_token: user.config?.whatsapp_webhook_token || process.env.WHATSAPP_WEBHOOK_TOKEN || '',
      whatsapp_verify_token: user.config?.whatsapp_verify_token || process.env.WHATSAPP_VERIFY_TOKEN || ''
    };
  } catch (error) {
    console.error('Errore nel recupero delle configurazioni WhatsApp:', error);
    // Fallback alla configurazione predeterminata
    return {
      mongodb_uri: process.env.MONGODB_URI,
      access_token: process.env.ACCESS_TOKEN,
      marketing_api_token: process.env.MARKETING_API_TOKEN || '',
      meta_pixel_id: process.env.FACEBOOK_PIXEL_ID || '1543790469631614',
      fb_account_id: process.env.FACEBOOK_ACCOUNT_ID || '',
      whatsapp_access_token: process.env.WHATSAPP_ACCESS_TOKEN || '',
      whatsapp_phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      whatsapp_webhook_token: process.env.WHATSAPP_WEBHOOK_TOKEN || '',
      whatsapp_verify_token: process.env.WHATSAPP_VERIFY_TOKEN || ''
    };
  }
}

module.exports = {
  getUserConnection,
  getUserConfig,
  Admin
};