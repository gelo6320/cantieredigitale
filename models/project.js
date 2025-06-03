const mongoose = require('mongoose');

// Schema per i progetti/cantieri
const ProjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  client: { type: String, required: true },
  address: { type: String, required: true },
  description: { type: String },
  startDate: { type: Date },
  estimatedEndDate: { type: Date },
  status: {
    type: String,
    enum: ['pianificazione', 'in corso', 'in pausa', 'completato', 'cancellato'],
    default: 'pianificazione'
  },
  budget: { type: Number, default: 0 }, // Valore stimato in euro
  progress: { type: Number, default: 0 }, // Percentuale di completamento
  documents: [{
    name: String,
    fileUrl: String,
    fileType: String,
    uploadDate: { type: Date, default: Date.now }
  }],
  images: [{
    name: String,
    imageUrl: String,
    caption: String,
    uploadDate: { type: Date, default: Date.now }
  }],
  notes: [{
    text: String,
    createdAt: { type: Date, default: Date.now },
    createdBy: String
  }],
  tasks: [{
    name: String,
    description: String,
    status: {
      type: String,
      enum: ['da iniziare', 'in corso', 'completato'],
      default: 'da iniziare'
    },
    dueDate: Date
  }],
  contactPerson: {
    name: String,
    phone: String,
    email: String
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true }
});

module.exports = ProjectSchema;