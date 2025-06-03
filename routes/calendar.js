const express = require('express');
const { getUserConnection } = require('../utils');
const { CalendarEventSchema, BookingSchema } = require('../models');

const router = express.Router();

// API per ottenere tutti gli eventi del calendario
router.get('/events', async (req, res) => {
  try {
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Se il modello CalendarEvent non esiste nella connessione, crealo
    if (!connection.models['CalendarEvent']) {
      connection.model('CalendarEvent', CalendarEventSchema);
    }
    
    // Se il modello Booking non esiste nella connessione, crealo
    if (!connection.models['Booking']) {
      connection.model('Booking', BookingSchema);
    }
    
    const CalendarEvent = connection.model('CalendarEvent');
    const Booking = connection.model('Booking');
    
    // Filtri opzionali per date
    let eventFilter = {};
    let bookingFilter = {};
    
    if (req.query.startDate && req.query.endDate) {
      eventFilter.start = { 
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
      bookingFilter.bookingTimestamp = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }
    
    // Recupera eventi calendario e prenotazioni in parallelo
    const [calendarEvents, bookings] = await Promise.all([
      CalendarEvent.find(eventFilter).sort({ start: 1 }),
      Booking.find(bookingFilter).sort({ bookingTimestamp: 1 })
    ]);
    
    // Trasforma i booking in formato CalendarEvent
    const bookingEvents = bookings.map(booking => {
      const start = new Date(`${booking.bookingDate}T${booking.bookingTime}:00`);
      const end = new Date(start);
      end.setHours(start.getHours() + 1); // Durata default 1 ora
      
      return {
        id: booking._id.toString(),
        _id: booking._id,
        title: `${booking.name} - ${booking.service || 'Appuntamento'}`,
        start: start,
        end: end,
        status: booking.status || 'pending',
        eventType: 'appointment',
        description: [
          booking.message || `Appuntamento con ${booking.name}`,
          booking.website ? `Sito web: ${booking.website}` : null,
          booking.facebookPage ? `Facebook: ${booking.facebookPage}` : null,
          booking.businessInfo?.notes ? `Note business: ${booking.businessInfo.notes}` : null
        ].filter(Boolean).join('\n'),
        location: 'Ufficio',
        isBooking: true,
        bookingId: booking._id,
        customerName: booking.name,
        customerEmail: booking.email,
        customerPhone: booking.phone,
        service: booking.service,
        source: booking.source,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt || booking.createdAt
      };
    });
    
    // Combina eventi calendario e prenotazioni
    const allEvents = [...calendarEvents, ...bookingEvents];
    
    // Ordina per data di inizio
    allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    
    res.json({
      success: true,
      data: allEvents
    });
  } catch (error) {
    console.error("Errore nel recupero degli eventi del calendario:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero degli eventi', 
      error: error.message 
    });
  }
});

// API per aggiornare un evento del calendario (inclusi booking)
router.put('/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, start, end, status, eventType, location, description, isBooking } = req.body;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Se è un booking, aggiorna la collezione Booking
    if (isBooking) {
      if (!connection.models['Booking']) {
        connection.model('Booking', BookingSchema);
      }
      
      const Booking = connection.model('Booking');
      const booking = await Booking.findById(id);
      
      if (!booking) {
        return res.status(404).json({ success: false, message: 'Prenotazione non trovata' });
      }
      
      if (start) {
        const newDate = new Date(start);
        booking.bookingDate = newDate.toISOString().split('T')[0]; // YYYY-MM-DD
        booking.bookingTime = newDate.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
        // Opzionalmente aggiorna anche bookingTimestamp se necessario
        booking.bookingTimestamp = newDate;
      }
      if (status) booking.status = status;
      if (description) booking.message = description;
      booking.updatedAt = new Date();
      
      await booking.save();
      
      // Restituisci in formato CalendarEvent usando i campi corretti
      const eventStart = new Date(`${booking.bookingDate}T${booking.bookingTime}:00`);
      const eventEnd = new Date(eventStart);
      eventEnd.setHours(eventStart.getHours() + 1);
      
      const updatedEvent = {
        id: booking._id.toString(),
        _id: booking._id,
        title: `${booking.name} - ${booking.service || 'Appuntamento'}`,
        start: eventStart,
        end: eventEnd,
        status: booking.status,
        eventType: 'appointment',
        description: booking.message,
        location: 'Ufficio',
        isBooking: true
      };
      
      res.json({
        success: true,
        data: updatedEvent,
        message: 'Prenotazione aggiornata con successo'
      });
    } else {
      // Gestione normale per CalendarEvent
      if (!connection.models['CalendarEvent']) {
        connection.model('CalendarEvent', CalendarEventSchema);
      }
      
      const CalendarEvent = connection.model('CalendarEvent');
      const event = await CalendarEvent.findById(id);
      
      if (!event) {
        return res.status(404).json({ success: false, message: 'Evento non trovato' });
      }
      
      // Aggiorna i campi
      if (title) event.title = title;
      if (start) event.start = new Date(start);
      if (end) event.end = new Date(end);
      if (status) event.status = status;
      if (eventType) event.eventType = eventType;
      if (location !== undefined) event.location = location;
      if (description !== undefined) event.description = description;
      event.updatedAt = new Date();
      
      await event.save();
      
      res.json({
        success: true,
        data: event,
        message: 'Evento aggiornato con successo'
      });
    }
  } catch (error) {
    console.error('Errore nell\'aggiornamento dell\'evento:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nell\'aggiornamento dell\'evento', 
      error: error.message 
    });
  }
});

// API per creare un nuovo evento del calendario
router.post('/events', async (req, res) => {
  try {
    const { title, start, end, status, eventType, location, description } = req.body;
    
    if (!title || !start || !end) {
      return res.status(400).json({ success: false, message: 'Titolo, data di inizio e fine sono richiesti' });
    }
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Se il modello CalendarEvent non esiste nella connessione, crealo
    if (!connection.models['CalendarEvent']) {
      connection.model('CalendarEvent', CalendarEventSchema);
    }
    
    const CalendarEvent = connection.model('CalendarEvent');
    
    // Crea il nuovo evento
    const newEvent = new CalendarEvent({
      title,
      start: new Date(start),
      end: new Date(end),
      status: status || 'pending',
      eventType: eventType || 'appointment',
      location,
      description
    });
    
    await newEvent.save();
    
    res.status(201).json({
      success: true,
      data: newEvent,
      message: 'Evento creato con successo'
    });
  } catch (error) {
    console.error('Errore nella creazione dell\'evento:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nella creazione dell\'evento', 
      error: error.message 
    });
  }
});

// API per eliminare un evento del calendario
router.delete('/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Se il modello CalendarEvent non esiste nella connessione, crealo
    if (!connection.models['CalendarEvent']) {
      connection.model('CalendarEvent', CalendarEventSchema);
    }
    
    const CalendarEvent = connection.model('CalendarEvent');
    
    // Trova ed elimina l'evento
    const result = await CalendarEvent.deleteOne({ _id: id });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Evento non trovato' });
    }
    
    res.json({
      success: true,
      message: 'Evento eliminato con successo'
    });
  } catch (error) {
    console.error('Errore nell\'eliminazione dell\'evento:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nell\'eliminazione dell\'evento', 
      error: error.message 
    });
  }
});

module.exports = router;