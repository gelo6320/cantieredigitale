const express = require('express');
const { getUserConnection } = require('../utils');

const router = express.Router();

// API for global search across multiple sections
router.get('/global-search', async (req, res) => {
  try {
    const { query, limit = 10 } = req.query;
    
    if (!query || typeof query !== 'string' || query.length < 2) {
      return res.status(400).json({ 
        success: false, 
        message: 'Search query must be at least 2 characters' 
      });
    }
    
    // Get the connection to the user's database
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database connection not available' 
      });
    }
    
    // Log available models for debugging
    console.log('Available models:', Object.keys(connection.models || {}));
    
    // Define search results array
    const searchResults = [];
    const searchRegex = new RegExp(query, 'i');
    
    // 1. CONTATTI / LEADS - Search in leads (contacts)
    await searchInLeads(connection, searchRegex, searchResults, limit);
    
    // 1.1 SALES FUNNEL - Same data as leads but for funnel section
    await searchInSalesFunnel(connection, searchRegex, searchResults, limit);
    
    // 2. CALENDAR - Search in calendar events
    await searchInCalendar(connection, searchRegex, searchResults, limit);
    
    // 3. PROGETTI - Search in projects
    await searchInProjects(connection, searchRegex, searchResults, limit);
    
    // 4. WHATSAPP CHAT - Search in chat conversations
    await searchInWhatsApp(connection, searchRegex, searchResults, limit);
    
    // 5. BANCA DATI - Search in visits, clients, audiences
    await searchInBancaDati(connection, searchRegex, searchResults, limit);
    
    // Sort results by relevance (prioritize name matches)
    searchResults.sort((a, b) => {
      const aNameMatch = a.name.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
      const bNameMatch = b.name.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
      
      return bNameMatch - aNameMatch;
    });
    
    // Return the combined results
    res.json({
      success: true,
      data: searchResults.slice(0, parseInt(limit) || 10),
      query: query,
      totalFound: searchResults.length
    });
  } catch (error) {
    console.error('Error in global search:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error performing global search', 
      error: error.message 
    });
  }
});

// Helper function to search in leads/contacts
async function searchInLeads(connection, searchRegex, searchResults, limit) {
  try {
    if (!connection.models['Lead']) {
      console.log('Lead model not found. Available models:', Object.keys(connection.models));
      return;
    }
    
    const LeadModel = connection.models['Lead'];
    console.log('Using Lead model for contacts search');
    
    // Search in name, email and phone fields
    const contactsFilter = {
      $or: [
        // Try firstName + lastName
        {
          $and: [
            { firstName: { $exists: true } },
            { lastName: { $exists: true } },
            {
              $expr: {
                $regexMatch: {
                  input: { $concat: ["$firstName", " ", "$lastName"] },
                  regex: searchRegex
                }
              }
            }
          ]
        },
        // Try name field
        { name: searchRegex },
        // Try email
        { email: searchRegex },
        // Try phone
        { phone: searchRegex },
        // Try firstName alone
        { firstName: searchRegex },
        // Try lastName alone
        { lastName: searchRegex }
      ]
    };
    
    const contacts = await LeadModel.find(contactsFilter)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit) || 5, 5));
    
    if (contacts.length > 0) {
      contacts.forEach(contact => {
        const contactName = 
          (contact.firstName && contact.lastName) 
            ? `${contact.firstName} ${contact.lastName}`
            : contact.name || (contact.email ? contact.email.split('@')[0] : 'Contatto');
        
        searchResults.push({
          id: contact._id.toString(),
          leadId: contact.leadId,
          name: contactName,
          email: contact.email,
          phone: contact.phone,
          section: "Contatti",
          sectionPath: "/contacts",
          createdAt: contact.createdAt,
          type: contact.formType || 'contact',
          status: contact.status
        });
      });
    }
  } catch (error) {
    console.error('Error searching in leads:', error);
  }
}

// Helper function to search in leads for sales funnel
async function searchInSalesFunnel(connection, searchRegex, searchResults, limit) {
  try {
    if (!connection.models['Lead']) {
      console.log('Lead model not found for sales funnel search');
      return;
    }
    
    const LeadModel = connection.models['Lead'];
    console.log('Using Lead model for sales funnel search');
    
    // Same filter as contacts but for funnel
    const leadsFilter = {
      $or: [
        // Try firstName + lastName
        {
          $and: [
            { firstName: { $exists: true } },
            { lastName: { $exists: true } },
            {
              $expr: {
                $regexMatch: {
                  input: { $concat: ["$firstName", " ", "$lastName"] },
                  regex: searchRegex
                }
              }
            }
          ]
        },
        // Try name field
        { name: searchRegex },
        // Try email
        { email: searchRegex },
        // Try phone
        { phone: searchRegex },
        // Try firstName alone
        { firstName: searchRegex },
        // Try lastName alone
        { lastName: searchRegex }
      ]
    };
    
    const leads = await LeadModel.find(leadsFilter)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit) || 3, 3)); // Limit to 3 for funnel to not duplicate too much
    
    if (leads.length > 0) {
      leads.forEach(lead => {
        const leadName = 
          (lead.firstName && lead.lastName) 
            ? `${lead.firstName} ${lead.lastName}`
            : lead.name || (lead.email ? lead.email.split('@')[0] : 'Lead');
        
        searchResults.push({
          id: lead._id.toString(),
          leadId: lead.leadId,
          name: leadName,
          email: lead.email,
          phone: lead.phone,
          section: "Sales Funnel",
          sectionPath: "/sales-funnel",
          createdAt: lead.createdAt,
          type: lead.formType || 'lead',
          status: lead.status,
          value: lead.value,
          service: lead.service
        });
      });
    }
  } catch (error) {
    console.error('Error searching in sales funnel:', error);
  }
}
async function searchInCalendar(connection, searchRegex, searchResults, limit) {
  try {
    if (!connection.models['CalendarEvent']) {
      console.log('CalendarEvent model not found');
      return;
    }
    
    const EventModel = connection.models['CalendarEvent'];
    console.log('Using CalendarEvent model for calendar search');
    
    const eventsFilter = {
      $or: [
        { title: searchRegex },
        { description: searchRegex }
      ]
    };
    
    const events = await EventModel.find(eventsFilter)
      .sort({ start: -1 })
      .limit(Math.min(parseInt(limit) || 3, 3));
    
    if (events.length > 0) {
      events.forEach(event => {
        searchResults.push({
          id: event._id.toString(),
          name: event.title,
          section: "Calendario",
          sectionPath: "/calendar",
          start: event.start,
          end: event.end,
          status: event.status,
          type: 'event',
          description: event.description
        });
      });
    }
  } catch (error) {
    console.error('Error searching in calendar:', error);
  }
}

// Helper function to search in projects
async function searchInProjects(connection, searchRegex, searchResults, limit) {
  try {
    if (!connection.models['Project']) {
      console.log('Project model not found');
      return;
    }
    
    const ProjectModel = connection.models['Project'];
    console.log('Using Project model for projects search');
    
    const projectsFilter = {
      $or: [
        { name: searchRegex },
        { client: searchRegex },
        { description: searchRegex }
      ]
    };
    
    const projects = await ProjectModel.find(projectsFilter)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit) || 3, 3));
    
    if (projects.length > 0) {
      projects.forEach(project => {
        searchResults.push({
          id: project._id.toString(),
          name: project.name,
          description: project.description,
          section: "Progetti",
          sectionPath: "/projects",
          client: project.client,
          status: project.status,
          type: 'project'
        });
      });
    }
  } catch (error) {
    console.error('Error searching in projects:', error);
  }
}

// Helper function to search in WhatsApp conversations
async function searchInWhatsApp(connection, searchRegex, searchResults, limit) {
  try {
    if (!connection.models['ChatConversation']) {
      console.log('ChatConversation model not found');
      return;
    }
    
    const ConversationModel = connection.models['ChatConversation'];
    console.log('Using ChatConversation model for WhatsApp search');
    
    const conversationsFilter = {
      $or: [
        { 'cliente.nome': searchRegex },
        { 'cliente.contactName': searchRegex },
        { 'cliente.telefono': searchRegex },
        { 'cliente.whatsappNumber': searchRegex }
      ]
    };
    
    const conversations = await ConversationModel.find(conversationsFilter)
      .sort({ startTime: -1 })
      .limit(Math.min(parseInt(limit) || 3, 3));
    
    if (conversations.length > 0) {
      conversations.forEach(conv => {
        searchResults.push({
          id: conv.conversationId,
          name: conv.cliente.nome || conv.cliente.contactName || 'Conversazione WhatsApp',
          section: "WhatsApp",
          sectionPath: "/whatsapp",
          phone: conv.cliente.telefono,
          status: conv.status,
          type: 'conversation',
          startTime: conv.startTime
        });
      });
    }
  } catch (error) {
    console.error('Error searching in WhatsApp conversations:', error);
  }
}

// Helper function to search in Banca Dati (visits, clients, audiences)
async function searchInBancaDati(connection, searchRegex, searchResults, limit) {
  try {
    // Search in visits
    await searchInVisits(connection, searchRegex, searchResults, limit);
    
    // Search in converted clients
    await searchInClients(connection, searchRegex, searchResults, limit);
    
    // Search in Facebook audiences
    await searchInAudiences(connection, searchRegex, searchResults, limit);
    
  } catch (error) {
    console.error('Error searching in banca dati:', error);
  }
}

// Search in visits
async function searchInVisits(connection, searchRegex, searchResults, limit) {
  try {
    if (!connection.models['Visit']) {
      console.log('Visit model not found');
      return;
    }
    
    const VisitModel = connection.models['Visit'];
    console.log('Using Visit model for visits search');
    
    const visitsFilter = {
      $or: [
        { url: searchRegex },
        { title: searchRegex },
        { ip: searchRegex },
        { 'location.city': searchRegex },
        { 'location.region': searchRegex }
      ]
    };
    
    const visits = await VisitModel.find(visitsFilter)
      .sort({ timestamp: -1 })
      .limit(Math.min(parseInt(limit) || 2, 2));
    
    if (visits.length > 0) {
      visits.forEach(visit => {
        const locationString = visit.location ? 
          `${visit.location.city || ''}, ${visit.location.region || ''}` : 
          visit.ip || '';
        
        searchResults.push({
          id: visit._id.toString(),
          name: visit.title || visit.url || `Visita da ${locationString}`,
          section: "Banca Dati - Visite",
          sectionPath: "/banca-dati",
          type: 'visit',
          timestamp: visit.timestamp,
          location: locationString,
          ip: visit.ip
        });
      });
    }
  } catch (error) {
    console.error('Error searching in visits:', error);
  }
}

// Search in converted clients
async function searchInClients(connection, searchRegex, searchResults, limit) {
  try {
    if (!connection.models['Client']) {
      console.log('Client model not found');
      return;
    }
    
    const ClientModel = connection.models['Client'];
    console.log('Using Client model for clients search');
    
    const clientsFilter = {
      $or: [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { fullName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        // Search for full name combination
        {
          $and: [
            { firstName: { $exists: true } },
            { lastName: { $exists: true } },
            {
              $expr: {
                $regexMatch: {
                  input: { $concat: ["$firstName", " ", "$lastName"] },
                  regex: searchRegex
                }
              }
            }
          ]
        }
      ]
    };
    
    const clients = await ClientModel.find(clientsFilter)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit) || 2, 2));
    
    if (clients.length > 0) {
      clients.forEach(client => {
        const clientName = client.fullName || 
          `${client.firstName || ''} ${client.lastName || ''}`.trim() || 
          client.email?.split('@')[0] || 'Cliente';
        
        searchResults.push({
          id: client._id.toString(),
          leadId: client.leadId,
          name: clientName,
          email: client.email,
          phone: client.phone,
          section: "Banca Dati - Clienti",
          sectionPath: "/banca-dati",
          type: 'client',
          value: client.value,
          status: client.status,
          createdAt: client.createdAt
        });
      });
    }
  } catch (error) {
    console.error('Error searching in clients:', error);
  }
}

// Search in Facebook audiences
async function searchInAudiences(connection, searchRegex, searchResults, limit) {
  try {
    if (!connection.models['FacebookAudience']) {
      console.log('FacebookAudience model not found');
      return;
    }
    
    const AudienceModel = connection.models['FacebookAudience'];
    console.log('Using FacebookAudience model for audiences search');
    
    const audiencesFilter = {
      $or: [
        { email: searchRegex },
        { phone: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        // Search for full name combination
        {
          $and: [
            { firstName: { $exists: true } },
            { lastName: { $exists: true } },
            {
              $expr: {
                $regexMatch: {
                  input: { $concat: ["$firstName", " ", "$lastName"] },
                  regex: searchRegex
                }
              }
            }
          ]
        },
        { 'location.city': searchRegex },
        { 'location.region': searchRegex },
        // Also search in conversions array
        { 'conversions.metadata.formData.firstName': searchRegex },
        { 'conversions.metadata.formData.lastName': searchRegex },
        { 'conversions.metadata.formData.email': searchRegex },
        // Search for full name in conversions
        {
          $and: [
            { 'conversions.metadata.formData.firstName': { $exists: true } },
            { 'conversions.metadata.formData.lastName': { $exists: true } },
            {
              $expr: {
                $regexMatch: {
                  input: { 
                    $concat: [
                      { $arrayElemAt: ["$conversions.metadata.formData.firstName", -1] }, 
                      " ", 
                      { $arrayElemAt: ["$conversions.metadata.formData.lastName", -1] }
                    ]
                  },
                  regex: searchRegex
                }
              }
            }
          ]
        }
      ]
    };
    
    const audiences = await AudienceModel.find(audiencesFilter)
      .sort({ lastSeen: -1 })
      .limit(Math.min(parseInt(limit) || 2, 2));
    
    if (audiences.length > 0) {
      audiences.forEach(audience => {
        // Helper function to get user info from conversions or direct fields
        const getUserInfo = (field) => {
          if (audience[field] && audience[field] !== "") return audience[field];
          if (audience.conversions && audience.conversions.length > 0) {
            const lastConversion = audience.conversions[audience.conversions.length - 1];
            if (lastConversion.metadata?.formData?.[field] && lastConversion.metadata.formData[field] !== "") {
              return lastConversion.metadata.formData[field];
            }
          }
          return null;
        };
        
        const firstName = getUserInfo('firstName');
        const lastName = getUserInfo('lastName');
        const email = getUserInfo('email');
        
        const audienceName = (firstName || lastName) ? 
          `${firstName || ''} ${lastName || ''}`.trim() : 
          email || 'Facebook Audience';
        
        searchResults.push({
          id: audience._id.toString(),
          name: audienceName,
          email: email,
          section: "Banca Dati - Facebook",
          sectionPath: "/banca-dati",
          type: 'audience',
          source: audience.source,
          lastSeen: audience.lastSeen,
          location: audience.location ? 
            `${audience.location.city || ''}, ${audience.location.region || ''}` : 
            `${audience.city || ''}, ${audience.region || ''}`
        });
      });
    }
  } catch (error) {
    console.error('Error searching in audiences:', error);
  }
}

module.exports = router;