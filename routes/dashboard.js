// routes/dashboard.js - Versione semplificata
const express = require('express');
const { getUserConnection } = require('../utils');

const router = express.Router();

// API for unviewed contacts only
router.get('/new-contacts', async (req, res) => {
  console.log("[/api/dashboard/new-contacts] Request received");
  try {
    // Ensure user is authenticated
    if (!req.session || !req.session.isAuthenticated) {
      console.log("[/api/dashboard/new-contacts] Not authenticated");
      return res.status(401).json({ success: false, message: 'Non autorizzato' });
    }
    
    console.log("[/api/dashboard/new-contacts] User:", req.session.user?.username);
    
    // Get user connection
    const connection = await getUserConnection(req);
    
    if (!connection) {
      console.log("[/api/dashboard/new-contacts] Failed to get database connection");
      return res.status(400).json({ success: false, message: 'Configurazione database non trovata' });
    }
    
    // Get Lead model
    const Lead = connection.model('Lead');
    console.log("[/api/dashboard/new-contacts] Using Lead model");
    
    // Get recent leads regardless of status
    const recentLeads = await Lead.find({})
      .sort({ createdAt: -1 })
      .limit(20);
    
    console.log(`[/api/dashboard/new-contacts] Query result: ${recentLeads.length}`);
    
    // Transform for frontend with improved mapping
    const contacts = recentLeads.map(lead => {
      // Name extraction from firstName/lastName or fallback
      const name = [lead.firstName || '', lead.lastName || ''].filter(Boolean).join(' ') || lead.name || 'Contact';
      
      // Improved type mapping - handle 'contact' formType as 'form'
      let type = 'form'; // Default to form
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
        viewed: lead.viewed === true
      };
    });
    
    console.log(`[/api/dashboard/new-contacts] Transformed contacts: ${contacts.length}`);
    console.log("[/api/dashboard/new-contacts] Sending response");
    res.json(contacts);
  } catch (error) {
    console.error("[/api/dashboard/new-contacts] ERROR:", error.message);
    console.error("[/api/dashboard/new-contacts] Stack:", error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero dei nuovi contatti',
      error: error.message
    });
  }
});

// API to mark a contact as viewed
router.post('/mark-viewed/:id', async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.session || !req.session.isAuthenticated) {
      return res.status(401).json({ 
        success: false, 
        message: 'Non autorizzato' 
      });
    }
    
    const { id } = req.params;
    
    // Get user connection
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(400).json({ 
        success: false, 
        message: 'Configurazione database non trovata' 
      });
    }
    
    // Get the Lead model
    const Lead = connection.model('Lead');
    
    // Update lead to set viewed=true
    const updateResult = await Lead.findByIdAndUpdate(
      id,
      { 
        $set: { 
          viewed: true,          
          viewedAt: new Date(),  
          updatedAt: new Date() 
        }
      },
      { new: true }
    );
    
    if (!updateResult) {
      return res.status(404).json({ 
        success: false, 
        message: 'Contatto non trovato' 
      });
    }
    
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

// API to mark all contacts as viewed
router.post('/mark-all-viewed', async (req, res) => {
  try {
    // Ensure user is authenticated
    if (!req.session || !req.session.isAuthenticated) {
      return res.status(401).json({ 
        success: false, 
        message: 'Non autorizzato' 
      });
    }
    
    // Get user connection
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(400).json({ 
        success: false, 
        message: 'Configurazione database non trovata' 
      });
    }
    
    // Get the Lead model
    const Lead = connection.model('Lead');
    
    // Update all leads with viewed=false to set viewed=true
    const result = await Lead.updateMany(
      { viewed: false }, // Only update unviewed leads
      { 
        $set: { 
          viewed: true,
          viewedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    res.json({ 
      success: true, 
      message: 'Tutti i contatti segnati come visti',
      count: result.modifiedCount || 0
    });
  } catch (error) {
    console.error('Error marking all contacts as viewed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel segnare tutti i contatti come visti' 
    });
  }
});

module.exports = router;