const express = require('express');
const { getUserConnection, getUserConfig } = require('../utils');
const { sendFacebookConversionEvent } = require('../services');

const router = express.Router();

// API for getting all leads with unified structure
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 200;
    const skip = (page - 1) * limit;
    
    // Get user connection
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          total: 0,
          page,
          limit,
          pages: 0
        }
      });
    }
    
    // Use the Lead model from the connection
    const Lead = connection.model('Lead');
    
    // Filtering
    let filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.formType) filter.formType = req.query.formType;
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex }
      ];
    }
    
    // Count total documents and get data
    const total = await Lead.countDocuments(filter);
    const leads = await Lead.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({
      success: true,
      data: leads,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching leads', 
      error: error.message 
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user connection
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database not available or not properly configured' 
      });
    }
    
    // Get the Lead model
    const Lead = connection.model('Lead');
    
    // Try to find by leadId field (for UUID format IDs)
    let lead = await Lead.findOne({ leadId: id });
    
    if (lead) {
      return res.json(lead);
    }
    
    // If we reach here, lead wasn't found
    return res.status(404).json({ 
      success: false, 
      message: 'Lead not found' 
    });
    
  } catch (error) {
    console.error('Error retrieving lead:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error retrieving lead', 
      error: error.message 
    });
  }
});

// API for updating lead metadata
router.post('/:id/update-metadata', async (req, res) => {
  try {
    const { id } = req.params;
    const { value, service, notes, leadType } = req.body;
    
    console.log(`[updateLeadMetadata] Updating lead ${id}:`, { 
      leadType, 
      value, 
      service, 
      notes: notes ? `${notes.substring(0, 50)}...` : 'no notes'
    });
    
    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID required' 
      });
    }
    
    // Get user connection
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database not available or not properly configured' 
      });
    }
    
    // Use the Lead model from the connection
    const Lead = connection.model('Lead');
    
    // IMPORTANT: Find by leadId field instead of _id
    const lead = await Lead.findOne({ leadId: id });
    
    if (!lead) {
      console.log(`[updateLeadMetadata] Lead not found with leadId: ${id}`);
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    
    // Update both top-level fields and extendedData for compatibility
    const updates = {};
    
    if (value !== undefined && value !== null) {
      updates.value = value;
      
      // Also update in extendedData for backward compatibility
      if (!lead.extendedData) {
        lead.extendedData = {};
      }
      lead.extendedData.value = value;
    }
    
    if (service !== undefined && service !== null) {
      updates.service = service;
      
      // Also update in extendedData.formData for backward compatibility
      if (!lead.extendedData) {
        lead.extendedData = {};
      }
      if (!lead.extendedData.formData) {
        lead.extendedData.formData = {};
      }
      lead.extendedData.formData.service = service;
    }
    
    // NUOVO: Gestione delle note
    if (notes !== undefined) {
      if (!lead.extendedData) {
        lead.extendedData = {};
      }
      lead.extendedData.notes = notes;
    }
    
    updates.updatedAt = new Date();
    
    console.log(`[updateLeadMetadata] Update data for lead ${id}:`, {
      ...updates,
      extendedDataNotes: lead.extendedData?.notes ? 'notes updated' : 'no notes'
    });
    
    // Apply all the updates
    Object.assign(lead, updates);
    await lead.save();
    
    console.log(`[updateLeadMetadata] Lead ${id} updated successfully`);
    
    res.json({
      success: true,
      message: 'Metadata updated successfully',
      data: {
        leadId: lead.leadId,
        value: lead.value,
        service: lead.service,
        notes: lead.extendedData?.notes,
        updatedAt: lead.updatedAt
      }
    });
  } catch (error) {
    console.error('[updateLeadMetadata] ERROR:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating metadata', 
      error: error.message 
    });
  }
});

// In server.js, aggiungi un endpoint per ottenere un singolo lead
router.get('/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    
    // Ottieni la connessione dell'utente
    const connection = await getUserConnection(req);
    
    // Se non c'è connessione, restituisci un errore
    if (connection === null) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    let model;
    
    // Determina il modello in base al tipo di lead
    if (type === 'form') {
      model = connection.model('FormData');
    } else if (type === 'booking') {
      model = connection.model('Booking');
    } else if (type === 'facebook') {
      model = connection.model('FacebookLead');
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Tipo di lead non valido' 
      });
    }
    
    // Trova il lead
    const lead = await model.findById(id);
    if (!lead) {
      return res.status(404).json({ 
        success: false, 
        message: 'Lead non trovato' 
      });
    }
    
    res.json(lead);
  } catch (error) {
    console.error('Errore nel recupero del lead:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero del lead', 
      error: error.message 
    });
  }
});

module.exports = router;