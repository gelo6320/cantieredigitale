const express = require('express');
const { getUserConnection } = require('../utils');
const { ProjectSchema } = require('../models');

const router = express.Router();

// API per ottenere tutti i progetti dell'utente
router.get('/', async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Registra il modello Project se non esiste
    if (!connection.models['Project']) {
      connection.model('Project', ProjectSchema);
    }
    
    const Project = connection.model('Project');
    const projects = await Project.find({ userId }).sort({ createdAt: -1 });
    
    res.json(projects);
  } catch (error) {
    console.error('Errore nel recupero dei progetti:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero dei progetti', 
      error: error.message 
    });
  }
});

// API per ottenere un singolo progetto
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Registra il modello Project se non esiste
    if (!connection.models['Project']) {
      connection.model('Project', ProjectSchema);
    }
    
    const Project = connection.model('Project');
    const project = await Project.findOne({ _id: id, userId });
    
    if (!project) {
      return res.status(404).json({ success: false, message: 'Progetto non trovato' });
    }
    
    res.json(project);
  } catch (error) {
    console.error('Errore nel recupero del progetto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nel recupero del progetto', 
      error: error.message 
    });
  }
});

// API per creare un nuovo progetto
router.post('/', async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Registra il modello Project se non esiste
    if (!connection.models['Project']) {
      connection.model('Project', ProjectSchema);
    }
    
    const Project = connection.model('Project');
    const projectData = {
      ...req.body,
      userId
    };
    
    const project = new Project(projectData);
    await project.save();
    
    res.status(201).json(project);
  } catch (error) {
    console.error('Errore nella creazione del progetto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nella creazione del progetto', 
      error: error.message 
    });
  }
});

// API per aggiornare un progetto
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Registra il modello Project se non esiste
    if (!connection.models['Project']) {
      connection.model('Project', ProjectSchema);
    }
    
    const Project = connection.model('Project');
    
    // Trova il progetto e verifica che appartenga all'utente
    const project = await Project.findOne({ _id: id, userId });
    
    if (!project) {
      return res.status(404).json({ success: false, message: 'Progetto non trovato' });
    }
    
    // Aggiorna i campi del progetto
    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };
    
    // Esegui l'aggiornamento
    const updatedProject = await Project.findByIdAndUpdate(
      id, 
      updateData,
      { new: true } // Ritorna il documento aggiornato
    );
    
    res.json(updatedProject);
  } catch (error) {
    console.error('Errore nell\'aggiornamento del progetto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nell\'aggiornamento del progetto', 
      error: error.message 
    });
  }
});

// API per eliminare un progetto
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Registra il modello Project se non esiste
    if (!connection.models['Project']) {
      connection.model('Project', ProjectSchema);
    }
    
    const Project = connection.model('Project');
    
    // Trova ed elimina il progetto
    const result = await Project.deleteOne({ _id: id, userId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Progetto non trovato' });
    }
    
    res.json({ success: true, message: 'Progetto eliminato con successo' });
  } catch (error) {
    console.error('Errore nell\'eliminazione del progetto:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nell\'eliminazione del progetto', 
      error: error.message 
    });
  }
});

// API per aggiungere un'immagine a un progetto
router.post('/:id/images', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const { name, imageUrl, caption } = req.body;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Registra il modello Project se non esiste
    if (!connection.models['Project']) {
      connection.model('Project', ProjectSchema);
    }
    
    const Project = connection.model('Project');
    
    // Verifica che il progetto esista e appartenga all'utente
    const project = await Project.findOne({ _id: id, userId });
    
    if (!project) {
      return res.status(404).json({ success: false, message: 'Progetto non trovato' });
    }
    
    // Aggiungi l'immagine all'array delle immagini
    project.images.push({
      name,
      imageUrl,
      caption,
      uploadDate: new Date()
    });
    
    project.updatedAt = new Date();
    await project.save();
    
    res.status(201).json(project);
  } catch (error) {
    console.error('Errore nell\'aggiunta dell\'immagine:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nell\'aggiunta dell\'immagine', 
      error: error.message 
    });
  }
});

// API per aggiungere un documento a un progetto
router.post('/:id/documents', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const { name, fileUrl, fileType } = req.body;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Registra il modello Project se non esiste
    if (!connection.models['Project']) {
      connection.model('Project', ProjectSchema);
    }
    
    const Project = connection.model('Project');
    
    // Verifica che il progetto esista e appartenga all'utente
    const project = await Project.findOne({ _id: id, userId });
    
    if (!project) {
      return res.status(404).json({ success: false, message: 'Progetto non trovato' });
    }
    
    // Aggiungi il documento all'array dei documenti
    project.documents.push({
      name,
      fileUrl,
      fileType,
      uploadDate: new Date()
    });
    
    project.updatedAt = new Date();
    await project.save();
    
    res.status(201).json(project);
  } catch (error) {
    console.error('Errore nell\'aggiunta del documento:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nell\'aggiunta del documento', 
      error: error.message 
    });
  }
});

// API per aggiungere un'attività al progetto
router.post('/:id/tasks', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const { name, description, status, dueDate } = req.body;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Registra il modello Project se non esiste
    if (!connection.models['Project']) {
      connection.model('Project', ProjectSchema);
    }
    
    const Project = connection.model('Project');
    
    // Verifica che il progetto esista e appartenga all'utente
    const project = await Project.findOne({ _id: id, userId });
    
    if (!project) {
      return res.status(404).json({ success: false, message: 'Progetto non trovato' });
    }
    
    // Aggiungi l'attività all'array delle attività
    project.tasks.push({
      name,
      description,
      status: status || 'da iniziare',
      dueDate: dueDate ? new Date(dueDate) : null
    });
    
    project.updatedAt = new Date();
    await project.save();
    
    res.status(201).json(project);
  } catch (error) {
    console.error('Errore nell\'aggiunta dell\'attività:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nell\'aggiunta dell\'attività', 
      error: error.message 
    });
  }
});

// API per aggiungere una nota al progetto
router.post('/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user.id;
    const { text } = req.body;
    
    // Ottieni la connessione utente
    const connection = await getUserConnection(req);
    
    if (!connection) {
      return res.status(404).json({ 
        success: false, 
        message: 'Database non disponibile o non configurato correttamente' 
      });
    }
    
    // Registra il modello Project se non esiste
    if (!connection.models['Project']) {
      connection.model('Project', ProjectSchema);
    }
    
    const Project = connection.model('Project');
    
    // Verifica che il progetto esista e appartenga all'utente
    const project = await Project.findOne({ _id: id, userId });
    
    if (!project) {
      return res.status(404).json({ success: false, message: 'Progetto non trovato' });
    }
    
    // Aggiungi la nota all'array delle note
    project.notes.push({
      text,
      createdAt: new Date(),
      createdBy: req.session.user.username
    });
    
    project.updatedAt = new Date();
    await project.save();
    
    res.status(201).json(project);
  } catch (error) {
    console.error('Errore nell\'aggiunta della nota:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Errore nell\'aggiunta della nota', 
      error: error.message 
    });
  }
});

module.exports = router;