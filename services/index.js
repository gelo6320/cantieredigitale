const { 
    sendFacebookConversionEvent, 
    convertTimeRangeToDateRange, 
    calculateMetrics, 
    transformToMarketingOverview, 
    createEmptyOverview, 
    getMarketingCampaignsFromFacebook 
  } = require('./facebook');
  
  const { 
    getWhatsAppStats, 
    registerChatModels, 
    trackManualResponse, 
    calculateHealthScore, 
    generateRecommendations 
  } = require('./whatsapp');
  
  const { getPageSpeedMetrics } = require('./pagespeed');
  const { getScreenshot } = require('./screenshot');
  const { transporter } = require('../config');
  
  module.exports = {
    // Facebook services
    sendFacebookConversionEvent,
    convertTimeRangeToDateRange,
    calculateMetrics,
    transformToMarketingOverview,
    createEmptyOverview,
    getMarketingCampaignsFromFacebook,
    
    // WhatsApp services
    getWhatsAppStats,
    registerChatModels,
    trackManualResponse,
    calculateHealthScore,
    generateRecommendations,
    
    // PageSpeed services
    getPageSpeedMetrics,
    
    // Screenshot services
    getScreenshot,
    
    // Email service
    emailTransporter: transporter
  };