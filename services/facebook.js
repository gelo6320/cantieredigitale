const axios = require('axios');
const crypto = require('crypto');
const { getUserConfig } = require('../utils/userHelpers');

// Funzione per inviare eventi a Facebook
async function sendFacebookConversionEvent(eventName, userData, customData = {}, req) {

  console.log('EventName:', eventName);
  console.log('CustomData ricevuto:', JSON.stringify(customData));

  try {
    // Usa direttamente le configurazioni dalla sessione
    let accessToken = process.env.FACEBOOK_ACCESS_TOKEN || process.env.ACCESS_TOKEN;
    let metaPixelId = process.env.FACEBOOK_PIXEL_ID || '1543790469631614';
    
    // Se abbiamo configurazioni nella sessione, usale
    if (req?.session?.userConfig) {
      accessToken = req.session.userConfig.access_token || accessToken;
      metaPixelId = req.session.userConfig.meta_pixel_id || metaPixelId;
    }
    
    if (!accessToken) {
      throw new Error('Facebook Access Token non configurato');
    }
    
    // Genera un ID evento univoco
    const eventId = 'crm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    
    // Prepara i dati dell'utente con hashing
    const hashedUserData = {};
    
    if (userData.email) {
      hashedUserData.em = crypto.createHash('sha256').update(userData.email.toLowerCase().trim()).digest('hex');
    }
    
    if (userData.phone) {
      hashedUserData.ph = crypto.createHash('sha256').update(userData.phone.replace(/\D/g, '')).digest('hex');
    }
    
    if (userData.name) {
      const nameParts = userData.name.split(' ');
      hashedUserData.fn = crypto.createHash('sha256').update(nameParts[0].toLowerCase().trim()).digest('hex');
      
      if (nameParts.length > 1) {
        hashedUserData.ln = crypto.createHash('sha256').update(nameParts.slice(1).join(' ').toLowerCase().trim()).digest('hex');
      }
    }
    
    // Aggiungi identificatori aggiuntivi
    if (userData.lead_id) {
      hashedUserData.lead_id = userData.lead_id;
    }
    
    if (userData.fbclid) {
      const timestamp = userData.fbclidTimestamp || Math.floor(Date.now() / 1000);
      hashedUserData.fbc = `fb.1.${timestamp}.${userData.fbclid}`;
    }
    
    // Crea l'oggetto customData arricchito
    const enrichedCustomData = {
      lead_event_source: "CRM Dashboard",
      event_source: "crm",
      ...customData
    };
    
    // Poi crea il payload base
    const payload = {
      data: [{
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "system_generated",
        user_data: hashedUserData,
        custom_data: enrichedCustomData  // Usa il nuovo oggetto arricchito
      }],
      access_token: accessToken,
      partner_agent: 'costruzionedigitale-nodejs-crm'
    };
    
    if (eventName === 'Purchase') {
      // Se customData.value non è definito ma esiste eventMetadata.value, usalo 
      const purchaseValue = customData.value || (customData.eventMetadata && customData.eventMetadata.value) || 0;
      
      // Aggiorna il payload con i parametri richiesti per l'evento Purchase
      payload.data[0].custom_data = {
        ...payload.data[0].custom_data,
        value: purchaseValue,
        currency: customData.currency || 'EUR',
        content_type: customData.content_type || 'product',
        content_name: customData.content_name || 'Servizio'
      };
      
      console.log('Payload aggiornato per evento Purchase:', JSON.stringify(payload.data[0].custom_data));
    }
    
    // Invia l'evento
    const response = await axios.post(
      `https://graph.facebook.com/v22.0/1543790469631614/events?access_token=EAAd7rpHujUkBO3iESqN0hqKg15uiHeDZCIffdtbJIYuzTBVAfq0qMLM6dO70WmZCGE4XmL9kPZAX2S0VbTkIA0ORxypfSnrDK1nALetbLRu0nrEyyfOU7mkQ3Joy1YISlIlEdr9qbjc9YOR6DfS3zKkUf4Vhu9HhTKYta5ZAZCPnEZAbgF8CPvAeVHPS2nggZDZD`,
      payload
    );
    
    return {
      success: true,
      eventId,
      response: response.data
    };
  } catch (error) {
    console.error(`Errore nell'invio dell'evento ${eventName}:`, error.message);
    return {
      success: false,
      error: error.message || 'Errore sconosciuto',
      details: error.response ? error.response.data : null
    };
  }
}

// Funzioni helper per marketing API
function convertTimeRangeToDateRange(timeRange) {
  const now = new Date();
  let since = new Date();
  
  switch(timeRange) {
    case '7d':
      since.setDate(now.getDate() - 7);
      break;
    case '30d':
      since.setDate(now.getDate() - 30);
      break;
    case '90d':
      since.setDate(now.getDate() - 90);
      break;
    default:
      since.setDate(now.getDate() - 7);
  }
  
  const sinceStr = since.toISOString().split('T')[0];
  const untilStr = now.toISOString().split('T')[0];
  
  return { since: sinceStr, until: untilStr };
}

function calculateMetrics(data) {
  const impressions = parseInt(data.impressions) || 0;
  const clicks = parseInt(data.clicks) || 0;
  const spend = parseFloat(data.spend) || 0;
  
  // Estrai lead e conversioni dalle actions
  let leads = 0;
  let conversions = 0;
  
  if (data.actions && Array.isArray(data.actions)) {
    data.actions.forEach(action => {
      if (action.action_type === 'lead') {
        leads += parseFloat(action.value) || 0;
      } else if (
        action.action_type === 'purchase' || 
        action.action_type === 'complete_registration' ||
        action.action_type === 'offsite_conversion'
      ) {
        conversions += parseFloat(action.value) || 0;
      }
    });
  }
  
  const ctr = clicks > 0 && impressions > 0 ? clicks / impressions * 100 : 0;
  const cpc = clicks > 0 && spend > 0 ? spend / clicks : 0;
  const costPerLead = leads > 0 && spend > 0 ? spend / leads : 0;
  const costPerConversion = conversions > 0 && spend > 0 ? spend / conversions : 0;
  
  // Stima ROAS (personalizzare in base al valore reale)
  const estimatedValue = conversions * 100; // 100€ per conversione
  const roas = spend > 0 ? estimatedValue / spend : 0;
  
  return {
    impressions,
    clicks,
    ctr,
    cpc,
    spend,
    leads,
    realLeads: 0, // Sarà calcolato dopo
    costPerLead,
    conversions,
    costPerConversion,
    roas
  };
}

function transformToMarketingOverview(responseData, timeRange) {
  try {
    console.log(`[transformToMarketingOverview] Trasformazione dati per timeRange: ${timeRange}`);
    
    // Se non ci sono dati, restituisci struttura vuota
    if (!responseData || !responseData.data || responseData.data.length === 0) {
      console.log('[transformToMarketingOverview] Nessun dato trovato, restituisco struttura vuota');
      return createEmptyOverview(timeRange);
    }
    
    const data = responseData.data;
    console.log(`[transformToMarketingOverview] Processando ${data.length} record`);
    
    // Ordina per data
    data.sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());
    
    // Estrai le date e inizializza gli array
    const dates = data.map(item => {
      const date = new Date(item.date_start);
      return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    });
    
    const leads = [];
    const conversions = [];
    const roas = [];
    
    let totalLeads = 0;
    let totalConversions = 0;
    let totalSpend = 0;
    let totalRevenue = 0;
    
    // Processa ogni giorno
    data.forEach(dayData => {
      // Estrai lead dalle actions
      let dayLeads = 0;
      let dayConversions = 0;
      let dayRevenue = 0;
      
      if (dayData.actions && Array.isArray(dayData.actions)) {
        dayData.actions.forEach(action => {
          if (action.action_type === 'lead') {
            dayLeads += parseInt(action.value) || 0;
          } else if (action.action_type === 'purchase' || 
                     action.action_type === 'complete_registration' ||
                     action.action_type === 'offsite_conversion') {
            dayConversions += parseInt(action.value) || 0;
          }
        });
      }
      
      // Estrai revenue dalle action_values
      if (dayData.action_values && Array.isArray(dayData.action_values)) {
        dayData.action_values.forEach(actionValue => {
          if (actionValue.action_type === 'purchase' || 
              actionValue.action_type === 'offsite_conversion') {
            dayRevenue += parseFloat(actionValue.value) || 0;
          }
        });
      }
      
      const daySpend = parseFloat(dayData.spend) || 0;
      const dayRoas = daySpend > 0 ? dayRevenue / daySpend : 0;
      
      leads.push(dayLeads);
      conversions.push(dayConversions);
      roas.push(dayRoas);
      
      totalLeads += dayLeads;
      totalConversions += dayConversions;
      totalSpend += daySpend;
      totalRevenue += dayRevenue;
    });
    
    const averageRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    
    const result = {
      dates,
      leads,
      conversions,
      roas,
      totalLeads,
      totalConversions,
      averageRoas: Number(averageRoas.toFixed(2))
    };
    
    console.log(`[transformToMarketingOverview] Trasformazione completata:`, {
      totalLeads: result.totalLeads,
      totalConversions: result.totalConversions,
      averageRoas: result.averageRoas,
      daysProcessed: dates.length
    });
    
    return result;
    
  } catch (error) {
    console.error('[transformToMarketingOverview] Errore durante la trasformazione:', error);
    return createEmptyOverview(timeRange);
  }
}

function createEmptyOverview(timeRange) {
  // Crea date vuote in base al timeRange
  const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
  const dates = [];
  const leads = [];
  const conversions = [];
  const roas = [];
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dates.push(date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }));
    leads.push(0);
    conversions.push(0);
    roas.push(0);
  }
  
  return {
    dates,
    leads,
    conversions,
    roas,
    totalLeads: 0,
    totalConversions: 0,
    averageRoas: 0
  };
}

async function getMarketingCampaignsFromFacebook(timeRange, req) {
  try {
    // Ottieni configurazione utente
    const userConfig = await getUserConfig(req.session.user.username);
    const FB_MARKETING_TOKEN = userConfig.marketing_api_token || '';
    const FB_ACCOUNT_ID = userConfig.fb_account_id || '';
    
    if (!FB_MARKETING_TOKEN || !FB_ACCOUNT_ID) {
      console.warn('ATTENZIONE: Token marketing o account ID mancanti');
      return [];
    }

    const { since, until } = convertTimeRangeToDateRange(timeRange);
    
    // 1. Ottieni campagne
    const campaignsResponse = await axios.get(
      `https://graph.facebook.com/v22.0/act_${FB_ACCOUNT_ID}/campaigns`,
      {
        params: {
          access_token: FB_MARKETING_TOKEN,
          fields: 'id,name,status,daily_budget,lifetime_budget',
          limit: 50
        }
      }
    );
    
    const campaigns = campaignsResponse.data.data || [];
    
    // 2. Ottieni insights per campagne
    const campaignInsightsResponse = await axios.get(
      `https://graph.facebook.com/v22.0/act_${FB_ACCOUNT_ID}/insights`,
      {
        params: {
          access_token: FB_MARKETING_TOKEN,
          time_range: JSON.stringify({ since, until }),
          level: 'campaign',
          fields: 'campaign_id,campaign_name,impressions,clicks,spend,actions,conversions',
          limit: 50
        }
      }
    );
    
    const campaignInsights = campaignInsightsResponse.data.data || [];
    
    // 3. Ottieni AdSets per ogni campagna
    const result = [];
    
    for (const campaign of campaigns) {
      const campaignInsight = campaignInsights.find(i => i.campaign_id === campaign.id) || {};
      const campaignMetrics = calculateMetrics(campaignInsight);
      
      // Ottieni AdSets per questa campagna
      const adSetsResponse = await axios.get(
        `https://graph.facebook.com/v22.0/${campaign.id}/adsets`,
        {
          params: {
            access_token: FB_MARKETING_TOKEN,
            fields: 'id,name,status,daily_budget,lifetime_budget',
            limit: 50
          }
        }
      );
      
      const adSets = adSetsResponse.data.data || [];
      
      // Ottieni insights per AdSets
      const adSetInsightsResponse = await axios.get(
        `https://graph.facebook.com/v22.0/act_${FB_ACCOUNT_ID}/insights`,
        {
          params: {
            access_token: FB_MARKETING_TOKEN,
            time_range: JSON.stringify({ since, until }),
            level: 'adset',
            fields: 'adset_id,adset_name,impressions,clicks,spend,actions,conversions',
            filtering: [{
              field: 'campaign.id',
              operator: 'EQUAL',
              value: campaign.id
            }],
            limit: 50
          }
        }
      );
      
      const adSetInsights = adSetInsightsResponse.data.data || [];
      
      // Processa AdSets
      const processedAdSets = [];
      
      for (const adSet of adSets) {
        const adSetInsight = adSetInsights.find(i => i.adset_id === adSet.id) || {};
        const adSetMetrics = calculateMetrics(adSetInsight);
        
        // Ottieni Ads per questo AdSet
        const adsResponse = await axios.get(
          `https://graph.facebook.com/v22.0/${adSet.id}/ads`,
          {
            params: {
              access_token: FB_MARKETING_TOKEN,
              fields: 'id,name,status',
              limit: 50
            }
          }
        );
        
        const ads = adsResponse.data.data || [];
        
        // Ottieni insights per Ads
        const adInsightsResponse = await axios.get(
          `https://graph.facebook.com/v22.0/act_${FB_ACCOUNT_ID}/insights`,
          {
            params: {
              access_token: FB_MARKETING_TOKEN,
              time_range: JSON.stringify({ since, until }),
              level: 'ad',
              fields: 'ad_id,ad_name,impressions,clicks,spend,actions,conversions',
              filtering: [{
                field: 'adset.id',
                operator: 'EQUAL',
                value: adSet.id
              }],
              limit: 50
            }
          }
        );
        
        const adInsights = adInsightsResponse.data.data || [];
        
        // Processa Ads
        const processedAds = ads.map(ad => {
          const adInsight = adInsights.find(i => i.ad_id === ad.id) || {};
          const adMetrics = calculateMetrics(adInsight);
          
          return {
            id: ad.id,
            name: ad.name,
            status: ad.status,
            dailyBudget: 0,
            ...adMetrics
          };
        });
        
        processedAdSets.push({
          id: adSet.id,
          name: adSet.name,
          status: adSet.status,
          dailyBudget: adSet.daily_budget ? parseInt(adSet.daily_budget) / 100 : 0,
          ...adSetMetrics,
          ads: processedAds
        });
      }
      
      result.push({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        dailyBudget: campaign.daily_budget ? parseInt(campaign.daily_budget) / 100 : 0,
        ...campaignMetrics,
        adSets: processedAdSets
      });
    }
    
    return result;
  } catch (error) {
    console.error('Errore nel recupero delle campagne Facebook:', error);
    throw error;
  }
}

module.exports = {
  sendFacebookConversionEvent,
  convertTimeRangeToDateRange,
  calculateMetrics,
  transformToMarketingOverview,
  createEmptyOverview,
  getMarketingCampaignsFromFacebook
};