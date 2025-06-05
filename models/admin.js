const mongoose = require('mongoose');

// Schema per gli amministratori
const AdminSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true
  },
  password: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    enum: ['user', 'admin'], 
    default: 'user' 
  },
  
  // Nuovi campi per informazioni personali/aziendali
  name: {
    type: String,
    trim: true,
    default: function() {
      return this.username; // Usa username come default se name non è fornito
    }
  },
  company: {
    type: String,
    trim: true,
    default: ''
  },
  companyLogo: {
    type: String, // URL del logo aziendale
    trim: true,
    default: ''
  },
  
  config: {
    mongodb_uri: String,
    access_token: String,           // Token per Facebook Conversion API (CAPI)
    marketing_api_token: String,    // Token per Facebook Marketing API 
    meta_pixel_id: String,          // ID del pixel Facebook
    fb_account_id: String,          // ID dell'account pubblicitario Facebook
    // CAMPI WHATSAPP
    whatsapp_access_token: String,      // Token di accesso WhatsApp Business API
    whatsapp_phone_number_id: String,   // ID del numero di telefono WhatsApp Business
    whatsapp_webhook_token: String,     // Token per autenticare i webhook WhatsApp
    whatsapp_verify_token: String       // Token di verifica per setup webhook
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  },
  lastLogin: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true // Questo aggiorna automaticamente createdAt e updatedAt
});

// Middleware per aggiornare updatedAt prima del save
AdminSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Metodo per ottenere il nome visualizzato
AdminSchema.methods.getDisplayName = function() {
  return this.name || this.username || 'Utente';
};

// Metodo per verificare se ha un logo aziendale configurato
AdminSchema.methods.hasCompanyLogo = function() {
  return !!(this.companyLogo && this.companyLogo.trim().length > 0);
};

// Metodo per ottenere le iniziali del nome (utile per avatar di fallback)
AdminSchema.methods.getInitials = function() {
  const displayName = this.getDisplayName();
  const nameParts = displayName.split(' ');
  
  if (nameParts.length >= 2) {
    return (nameParts[0][0] + nameParts[1][0]).toUpperCase();
  } else {
    return displayName.substring(0, 2).toUpperCase();
  }
};

module.exports = AdminSchema;