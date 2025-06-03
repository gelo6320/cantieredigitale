const express = require('express');
const { getUserConnection, getUserConfig, getRealLeadsForCampaign } = require('../utils');
const { 
  getMarketingCampaignsFromFacebook, 
  transformToMarketingOverview, 
  createEmptyOverview,
  convertTimeRangeToDateRange 
} = require('../services');
const axios = require('axios');

const router = express.Router();

router.get('/campaigns', async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;
    
    // Ottieni i dati dalle API di marketing (ora funzionante)
    const campaigns = await getMarketingCampaignsFromFacebook(timeRange, req);
    
    // Ottieni la connessione utente per i lead reali
    const connection = await getUserConnection(req);
    
    if (!connection) {
      const campaignsWithZeroRealLeads = campaigns.map(campaign => ({
        ...campaign,
        realLeads: 0,
        adSets: campaign.adSets.map(adSet => ({
          ...adSet,
          realLeads: 0,
          ads: adSet.ads.map(ad => ({
            ...ad,
            realLeads: 0
          }))
        }))
      }));
      
      return res.json(campaignsWithZeroRealLeads);
    }
    
    // Aggiungi lead reali per ogni livello
    const campaignsWithRealLeads = await Promise.all(campaigns.map(async (campaign) => {
      const adSetsWithRealLeads = await Promise.all(campaign.adSets.map(async (adSet) => {
        const adsWithRealLeads = await Promise.all(adSet.ads.map(async (ad) => {
          const realLeads = await getRealLeadsForCampaign(connection, ad.id);
          
          // NUOVO: Ricalcola costPerLead con lead reali
          const costPerLeadReal = realLeads > 0 && ad.spend > 0 ? ad.spend / realLeads : 0;
          
          return {
            ...ad,
            realLeads,
            costPerLead: costPerLeadReal // Aggiorna con il calcolo basato sui lead reali
          };
        }));
        
        const adSetRealLeads = adsWithRealLeads.reduce((sum, ad) => sum + ad.realLeads, 0);
        
        // NUOVO: Ricalcola costPerLead dell'adset con lead reali aggregati
        const adSetCostPerLeadReal = adSetRealLeads > 0 && adSet.spend > 0 ? adSet.spend / adSetRealLeads : 0;
        
        return {
          ...adSet,
          realLeads: adSetRealLeads,
          costPerLead: adSetCostPerLeadReal, // Aggiorna con il calcolo basato sui lead reali
          ads: adsWithRealLeads
        };
      }));
      
      const totalRealLeads = adSetsWithRealLeads.reduce((sum, adSet) => sum + adSet.realLeads, 0);
      
      // NUOVO: Ricalcola costPerLead della campagna con lead reali aggregati
      const campaignCostPerLeadReal = totalRealLeads > 0 && campaign.spend > 0 ? campaign.spend / totalRealLeads : 0;
      
      return {
        ...campaign,
        realLeads: totalRealLeads,
        costPerLead: campaignCostPerLeadReal, // Aggiorna con il calcolo basato sui lead reali
        adSets: adSetsWithRealLeads
      };
    }));
    
    res.json(campaignsWithRealLeads);
  } catch (error) {
    console.error('Errore nel recupero delle campagne:', error);
    res.status(500).json({ error: 'Errore nel recupero delle campagne' });
  }
});

// SOSTITUISCI l'endpoint esistente con questo:
router.get('/overview', async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;
    
    console.log(`[Marketing Overview] Richiesta per timeRange: ${timeRange}`);
    
    // Ottieni configurazione utente
    const userConfig = await getUserConfig(req.session.user.username);
    const FB_MARKETING_TOKEN = userConfig.marketing_api_token || '';
    const FB_ACCOUNT_ID = userConfig.fb_account_id || '';
    
    if (!FB_MARKETING_TOKEN || !FB_ACCOUNT_ID) {
      console.warn('[Marketing Overview] Token marketing o account ID mancanti, restituisco dati vuoti');
      return res.json(createEmptyOverview(timeRange));
    }

    const { since, until } = convertTimeRangeToDateRange(timeRange);
    
    try {
      console.log(`[Marketing Overview] Chiamata Facebook API per account ${FB_ACCOUNT_ID}`);
      
      // Richiesta all'API di Facebook per insights account-level
      const response = await axios.get(
        `https://graph.facebook.com/v22.0/act_${FB_ACCOUNT_ID}/insights`,
        {
          params: {
            access_token: FB_MARKETING_TOKEN,
            time_range: JSON.stringify({ since, until }),
            level: 'account',
            time_increment: 1, // Dati giornalieri
            fields: 'date_start,impressions,clicks,spend,actions,action_values,cost_per_action_type'
          },
          timeout: 25000 // Ridotto a 25 secondi
        }
      );
      
      console.log(`[Marketing Overview] Risposta Facebook API ricevuta`);
      const overviewData = transformToMarketingOverview(response.data, timeRange);
      
      res.json(overviewData);
      
    } catch (fbError) {
      console.error('[Marketing Overview] Errore Facebook API:', fbError.message);
      
      // IMPORTANTE: Restituisci una risposta anche in caso di errore
      if (fbError.response && fbError.response.status === 400) {
        console.log('[Marketing Overview] Errore configurazione Facebook, restituisco dati vuoti');
      } else {
        console.log('[Marketing Overview] Timeout o errore rete Facebook, restituisco dati vuoti');
      }
      
      return res.json(createEmptyOverview(timeRange));
    }
    
  } catch (error) {
    console.error('[Marketing Overview] Errore generale:', error);
    
    // Assicurati di restituire sempre una risposta
    res.status(500).json({ 
      error: 'Errore nel recupero dell\'overview marketing',
      details: error.message 
    });
  }
});

module.exports = router;