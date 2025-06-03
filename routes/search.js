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
    
    // Define search results array
    const searchResults = [];
    
    // Search in leads (contacts) - assuming Lead model exists in the connection
    if (connection.models['Lead']) {
      const Lead = connection.models['Lead'];
      
      // Create regex for case-insensitive search
      const searchRegex = new RegExp(query, 'i');
      
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
          { phone: searchRegex }
        ]
      };
      
      // Execute the query with a limit
      const contacts = await Lead.find(contactsFilter)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit) || 5);
      
      // Format and add to results
      if (contacts.length > 0) {
        contacts.forEach(contact => {
          // Format the name - prioritize firstName + lastName, then name, then email
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
            type: contact.formType || 'contact'
          });
        });
      }
    }
    
    // Search in calendar events
    if (connection.models['CalendarEvent']) {
      const CalendarEvent = connection.models['CalendarEvent'];
      
      const searchRegex = new RegExp(query, 'i');
      const eventsFilter = {
        title: searchRegex
      };
      
      const events = await CalendarEvent.find(eventsFilter)
        .sort({ start: -1 })
        .limit(parseInt(limit) || 3);
      
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
            type: 'event'
          });
        });
      }
    }
    
    // Search in projects
    if (connection.models['Project']) {
      const Project = connection.models['Project'];
      
      const searchRegex = new RegExp(query, 'i');
      const projectsFilter = {
        $or: [
          { name: searchRegex },
          { client: searchRegex },
          { description: searchRegex }
        ]
      };
      
      const projects = await Project.find(projectsFilter)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit) || 3);
      
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
    }
    
    // Search in chat conversations
    if (connection.models['ChatConversation']) {
      const ChatConversation = connection.models['ChatConversation'];
      
      const searchRegex = new RegExp(query, 'i');
      const conversationsFilter = {
        $or: [
          { 'cliente.nome': searchRegex },
          { 'cliente.contactName': searchRegex },
          { 'cliente.telefono': searchRegex },
          { 'cliente.whatsappNumber': searchRegex }
        ]
      };
      
      const conversations = await ChatConversation.find(conversationsFilter)
        .sort({ startTime: -1 })
        .limit(parseInt(limit) || 3);
      
      if (conversations.length > 0) {
        conversations.forEach(conv => {
          searchResults.push({
            id: conv.conversationId,
            name: conv.cliente.nome || conv.cliente.contactName || 'Conversazione',
            section: "Chat WhatsApp",
            sectionPath: "/whatsapp",
            phone: conv.cliente.telefono,
            status: conv.status,
            type: 'conversation',
            startTime: conv.startTime
          });
        });
      }
    }
    
    // Sort results by relevance (for now, prioritize name matches)
    searchResults.sort((a, b) => {
      const aNameMatch = a.name.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
      const bNameMatch = b.name.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
      
      return bNameMatch - aNameMatch;
    });
    
    // Return the combined results
    res.json({
      success: true,
      data: searchResults,
      query: query
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

module.exports = router;