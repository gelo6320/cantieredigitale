const mongoose = require('mongoose');

// Schema per gli amministratori
const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  config: {
    mongodb_uri: String,
    access_token: String,           // Token per Facebook Conversion API (CAPI)
    marketing_api_token: String,    // Token per Facebook Marketing API 
    meta_pixel_id: String,          // ID del pixel Facebook
    fb_account_id: String,          // ID dell'account pubblicitario Facebook
    // NUOVI CAMPI WHATSAPP
    whatsapp_access_token: String,      // Token di accesso WhatsApp Business API
    whatsapp_phone_number_id: String,   // ID del numero di telefono WhatsApp Business
    whatsapp_webhook_token: String,     // Token per autenticare i webhook WhatsApp
    whatsapp_verify_token: String       // Token di verifica per setup webhook
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = AdminSchema;