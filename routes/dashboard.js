const express = require('express');
const { getUserConnection } = require('../utils');

const router = express.Router();

// Calcolo statistiche dashboard potenziate
router.get('/stats', async (req, res) => {
  console.log("[/api/dashboard/stats] Request received");
  try {
    // Verify authentication
    if (!req.session || !req.session.isAuthenticated) {
      console.log("[/api/dashboard/stats] Not authenticated");
      return res.status(401).json({ success: false, message: 'Non autorizzato' });
    }
    
    console.log("[/api/dashboard/stats] User:", req.session.user?.username);
    
    // Get user connection
    const connection = await getUserConnection(req);
    
    if (!connection) {
      console.log("[/api/dashboard/stats] Failed to get database connection");
      return res.status(400).json({ success: false, message: 'Configurazione database non trovata' });
    }
    
    // Get Lead model
    const Lead = connection.model('Lead');
    console.log("[/api/dashboard/stats] Using Lead model");
    
    // Get data for dashboard stats
    console.log("[/api/dashboard/stats] Calculating statistics...");
    
    // Today and date ranges
    const today = new Date();
    const oneWeekAgo = new Date(today); oneWeekAgo.setDate(today.getDate() - 7);
    const twoWeeksAgo = new Date(today); twoWeeksAgo.setDate(today.getDate() - 14);
    
    // Form leads include both 'form' and 'contact' formTypes
    console.log("[/api/dashboard/stats] Counting form leads (including 'contact' type)");
    const formTotal = await Lead.countDocuments({ 
      $or: [
        { formType: 'form' },
        { formType: 'contact' }
      ]
    });
    console.log(`[/api/dashboard/stats] Form leads count: ${formTotal}`);
    
    // Form conversions
    const formConverted = await Lead.countDocuments({ 
      $or: [
        { formType: 'form' },
        { formType: 'contact' }
      ], 
      status: 'converted' 
    });
    
    // Form leads this week
    const formThisWeek = await Lead.countDocuments({ 
      $or: [
        { formType: 'form' },
        { formType: 'contact' }
      ],
      createdAt: { $gte: oneWeekAgo, $lte: today } 
    });
    
    // Form leads last week
    const formLastWeek = await Lead.countDocuments({ 
      $or: [
        { formType: 'form' },
        { formType: 'contact' }
      ],
      createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo } 
    });
    
    // Booking leads
    const bookingTotal = await Lead.countDocuments({ formType: 'booking' });
    const bookingConverted = await Lead.countDocuments({ formType: 'booking', status: 'converted' });
    const bookingThisWeek = await Lead.countDocuments({ 
      formType: 'booking', 
      createdAt: { $gte: oneWeekAgo, $lte: today } 
    });
    const bookingLastWeek = await Lead.countDocuments({ 
      formType: 'booking', 
      createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo } 
    });
    
    // Facebook leads
    const facebookTotal = await Lead.countDocuments({ formType: 'facebook' });
    const facebookConverted = await Lead.countDocuments({ formType: 'facebook', status: 'converted' });
    const facebookThisWeek = await Lead.countDocuments({ 
      formType: 'facebook', 
      createdAt: { $gte: oneWeekAgo, $lte: today } 
    });
    const facebookLastWeek = await Lead.countDocuments({ 
      formType: 'facebook', 
      createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo } 
    });
    
    // Calculate total stats and conversion rates
    const totalLeads = formTotal + bookingTotal + facebookTotal;
    const totalConverted = formConverted + bookingConverted + facebookConverted;
    const totalConversionRate = totalLeads > 0 ? Math.round((totalConverted / totalLeads) * 100) : 0;
    
    const totalThisWeek = formThisWeek + bookingThisWeek + facebookThisWeek;
    const totalLastWeek = formLastWeek + bookingLastWeek + facebookLastWeek;
    
    // Calculate trends
    let formTrend = 0, bookingTrend = 0, facebookTrend = 0, totalTrend = 0;
    
    if (formLastWeek > 0) formTrend = Math.round(((formThisWeek - formLastWeek) / formLastWeek) * 100);
    if (bookingLastWeek > 0) bookingTrend = Math.round(((bookingThisWeek - bookingLastWeek) / bookingLastWeek) * 100);
    if (facebookLastWeek > 0) facebookTrend = Math.round(((facebookThisWeek - facebookLastWeek) / facebookLastWeek) * 100);
    if (totalLastWeek > 0) totalTrend = Math.round(((totalThisWeek - totalLastWeek) / totalLastWeek) * 100);
    
    // Debug total counts
    console.log(`[/api/dashboard/stats] Total counts - Forms: ${formTotal}, Bookings: ${bookingTotal}, Facebook: ${facebookTotal}`);
    
    // Prepare response
    const stats = {
      forms: {
        total: formTotal,
        converted: formConverted,
        conversionRate: formTotal > 0 ? Math.round((formConverted / formTotal) * 100) : 0,
        trend: formTrend,
        thisWeek: formThisWeek,
        lastWeek: formLastWeek
      },
      bookings: {
        total: bookingTotal,
        converted: bookingConverted,
        conversionRate: bookingTotal > 0 ? Math.round((bookingConverted / bookingTotal) * 100) : 0,
        trend: bookingTrend,
        thisWeek: bookingThisWeek,
        lastWeek: bookingLastWeek
      },
      facebook: {
        total: facebookTotal,
        converted: facebookConverted,
        conversionRate: facebookTotal > 0 ? Math.round((facebookConverted / facebookTotal) * 100) : 0,
        trend: facebookTrend,
        thisWeek: facebookThisWeek,
        lastWeek: facebookLastWeek
      },
      events: {
        total: 0,
        success: 0,
        successRate: 0
      },
      totalConversionRate,
      totalTrend,
      totalThisWeek,
      totalLastWeek
    };
    
    console.log("[/api/dashboard/stats] Sending response");
    res.json(stats);
  } catch (error) {
    console.error("[/api/dashboard/stats] ERROR:", error.message);
    console.error("[/api/dashboard/stats] Stack:", error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero delle statistiche',
      error: error.message
    });
  }
});

// API for recent events
router.get('/recent-events', async (req, res) => {
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
    
    // Get models
    const UserFacebookEvent = connection.model('FacebookEvent');
    
    // Get the 10 most recent events
    const events = await UserFacebookEvent.find({})
      .sort({ createdAt: -1 })
      .limit(10);
    
    res.json(events);
  } catch (error) {
    console.error('Error fetching recent events:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero degli eventi recenti' 
    });
  }
});

// API for unviewed contacts
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
    
    // Debug the first lead
    if (recentLeads.length > 0) {
      console.log("First lead details:", JSON.stringify(recentLeads[0]).substring(0, 500));
    }
    
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
        name: name,
        email: lead.email || '',
        source: lead.source || lead.formType || 'Unknown',
        type: type,
        createdAt: lead.createdAt,
        viewed: lead.viewed === true // Use the explicit viewed field instead of inferring from status
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

// Updated API to mark a contact as viewed
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
    
    // Update lead to set viewed=true and update status from 'new' to 'contacted'
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

// Updated API to mark all contacts as viewed
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

// Inizializza sessione dashboard
router.get('/init-session', (req, res) => {
  if (!req.session || !req.session.isAuthenticated) {
    return res.json({
      success: false,
      message: 'Sessione non autenticata',
      authenticated: false
    });
  }
  
  res.json({
    success: true,
    message: 'Sessione inizializzata',
    authenticated: true,
    user: req.session.user ? req.session.user.username : null
  });
});

module.exports = router;