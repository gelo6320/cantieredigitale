// routes/dashboard.js - Fix per gestione campo 'viewed'
const express = require('express');
const { getUserConnection } = require('../utils');

const router = express.Router();

// API for unviewed contacts only - FIXED
router.get('/new-contacts', async (req, res) => {
  console.log("[/api/dashboard/new-contacts] Request received");
  try {
    if (!req.session || !req.session.isAuthenticated) {
      console.log("[/api/dashboard/new-contacts] Not authenticated");
      return res.status(401).json({ success: false, message: 'Non autorizzato' });
    }
    
    console.log("[/api/dashboard/new-contacts] User:", req.session.user?.username);
    
    const connection = await getUserConnection(req);
    
    if (!connection) {
      console.log("[/api/dashboard/new-contacts] Failed to get database connection");
      return res.status(400).json({ success: false, message: 'Configurazione database non trovata' });
    }
    
    const Lead = connection.model('Lead');
    console.log("[/api/dashboard/new-contacts] Using Lead model");
    
    // ✅ FIX: Query per tutti i lead non visti (false, null, undefined)
    const recentLeads = await Lead.find({
      $or: [
        { viewed: false },
        { viewed: null },
        { viewed: { $exists: false } }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(20);
    
    console.log(`[/api/dashboard/new-contacts] Found ${recentLeads.length} unviewed leads`);
    
    // ✅ FIX: Mapping corretto - normalizza il campo viewed
    const contacts = recentLeads.map(lead => {
      const name = [lead.firstName || '', lead.lastName || ''].filter(Boolean).join(' ') || lead.name || 'Contact';
      
      let type = 'form';
      if (lead.formType === 'booking') type = 'booking';
      if (lead.formType === 'facebook') type = 'facebook';
      
      return {
        _id: lead._id,
        leadId: lead.leadId,
        name: name,
        email: lead.email || '',
        source: lead.source || lead.formType || 'Unknown',
        type: type,
        createdAt: lead.createdAt,
        viewed: Boolean(lead.viewed) // ✅ Normalizza: true solo se esplicitamente true
      };
    });
    
    console.log(`[/api/dashboard/new-contacts] Returning ${contacts.length} unviewed contacts`);
    res.json(contacts);
  } catch (error) {
    console.error("[/api/dashboard/new-contacts] ERROR:", error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero dei nuovi contatti',
      error: error.message
    });
  }
});

// API to mark all contacts as viewed - FIXED
router.post('/mark-all-viewed', async (req, res) => {
  console.log("[/api/dashboard/mark-all-viewed] Request received");
  
  try {
    if (!req.session || !req.session.isAuthenticated) {
      console.log("[/api/dashboard/mark-all-viewed] Authentication failed");
      return res.status(401).json({ 
        success: false, 
        message: 'Non autorizzato' 
      });
    }
    
    console.log("[/api/dashboard/mark-all-viewed] User authenticated:", req.session.user?.username);
    
    const connection = await getUserConnection(req);
    
    if (!connection) {
      console.log("[/api/dashboard/mark-all-viewed] Database connection failed");
      return res.status(400).json({ 
        success: false, 
        message: 'Configurazione database non trovata' 
      });
    }
    
    const Lead = connection.model('Lead');
    
    // ✅ FIX: Conta tutti i lead non visti (false, null, undefined)
    const unviewedQuery = {
      $or: [
        { viewed: false },
        { viewed: null },
        { viewed: { $exists: false } }
      ]
    };
    
    const unviewedCount = await Lead.countDocuments(unviewedQuery);
    console.log(`[/api/dashboard/mark-all-viewed] Found ${unviewedCount} unviewed leads`);
    
    if (unviewedCount === 0) {
      console.log("[/api/dashboard/mark-all-viewed] No unviewed leads to update");
      return res.json({ 
        success: true, 
        message: 'Nessun contatto da aggiornare',
        count: 0
      });
    }
    
    // ✅ FIX: Aggiorna tutti i lead non visti (false, null, undefined)
    const result = await Lead.updateMany(
      unviewedQuery, // Usa la stessa query per l'update
      { 
        $set: { 
          viewed: true,
          viewedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    console.log(`[/api/dashboard/mark-all-viewed] Update result:`, {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      acknowledged: result.acknowledged
    });
    
    // Verifica che l'aggiornamento sia andato a buon fine
    const remainingUnviewed = await Lead.countDocuments(unviewedQuery);
    console.log(`[/api/dashboard/mark-all-viewed] Remaining unviewed after update: ${remainingUnviewed}`);
    
    const response = { 
      success: true, 
      message: 'Tutti i contatti segnati come visti',
      count: result.modifiedCount || 0,
      debug: {
        initialUnviewed: unviewedCount,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        remainingUnviewed: remainingUnviewed
      }
    };
    
    console.log("[/api/dashboard/mark-all-viewed] Sending response:", response);
    res.json(response);
    
  } catch (error) {
    console.error('[/api/dashboard/mark-all-viewed] ERROR:', error.message);
    console.error('[/api/dashboard/mark-all-viewed] Stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel segnare tutti i contatti come visti',
      error: error.message
    });
  }
});

// API to mark a single contact as viewed - FIXED  
router.post('/mark-viewed/:id', async (req, res) => {
  try {
    if (!req.session || !req.session.isAuthenticated) {
      return res.status(401).json({ 
        success: false, 
        message: 'Non autorizzato' 
      });
    }
    
    const { id } = req.params;
    
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(400).json({ 
        success: false, 
        message: 'Configurazione database non trovata' 
      });
    }
    
    const Lead = connection.model('Lead');
    
    // ✅ FIX: Assicurati che il campo viewed venga sempre aggiunto
    const updateResult = await Lead.findByIdAndUpdate(
      id,
      { 
        $set: { 
          viewed: true,          
          viewedAt: new Date(),  
          updatedAt: new Date() 
        }
      },
      { 
        new: true,
        upsert: false  // Non creare nuovo documento se non esiste
      }
    );
    
    if (!updateResult) {
      return res.status(404).json({ 
        success: false, 
        message: 'Contatto non trovato' 
      });
    }
    
    console.log(`[mark-viewed] Successfully marked lead ${id} as viewed`);
    
    res.json({ 
      success: true, 
      message: 'Contatto segnato come visto', 
      data: updateResult 
    });
  } catch (error) {
    console.error('Error marking contact as viewed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel segnare il contatto come visto' 
    });
  }
});

module.exports = router;