// ============================================
// 📁 whatsapp/config.js - VERSIONE CORRETTA
// ============================================

// IMPORTANTE: Assicurati che dotenv sia caricato
require('dotenv').config();

console.log('🔧 [WHATSAPP CONFIG] Caricamento configurazioni...');

// Verifica che le variabili siano caricate
const requiredVars = [
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_ACCESS_TOKEN', 
    'WHATSAPP_WEBHOOK_TOKEN',
    'CLAUDE_API_KEY'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('❌ [WHATSAPP CONFIG] ERRORE: Variabili d\'ambiente mancanti:');
    missingVars.forEach(varName => {
        console.error(`   - ${varName}`);
    });
    console.error('💡 Verifica che il file .env sia nella root del progetto');
    console.error('💡 Riavvia il server dopo aver configurato le variabili');
}

const config = {
    whatsapp: {
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
        webhookToken: process.env.WHATSAPP_WEBHOOK_TOKEN,
        // Aggiungi verifica token
        verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_TOKEN
    },
    claude: {
        apiKey: process.env.CLAUDE_API_KEY,
        model: 'claude-sonnet-4-20250514',
        maxTokens: 300,
        timeout: 10000
    },
    business: {
        name: process.env.BUSINESS_NAME || "Costruzione Digitale",
        settore: process.env.BUSINESS_SECTOR || "Consulenza digitale",
        servizi: (process.env.BUSINESS_SERVICES || "Sviluppo web,Analytics,Marketing").split(','),
        orariApertura: process.env.BUSINESS_HOURS || "Lun-Ven 9:00-18:00"
    },
    server: {
        port: process.env.PORT || 3000,
        environment: process.env.NODE_ENV || 'development'
    }
};

// Log delle configurazioni (senza esporre token completi)
console.log('📋 [WHATSAPP CONFIG] Configurazioni caricate:');
console.log(`   📱 WhatsApp Phone ID: ${config.whatsapp.phoneNumberId ? '✅ OK' : '❌ MANCANTE'}`);
console.log(`   🔑 WhatsApp Token: ${config.whatsapp.accessToken ? '✅ OK' : '❌ MANCANTE'}`);
console.log(`   🔐 Webhook Token: ${config.whatsapp.webhookToken ? '✅ OK' : '❌ MANCANTE'}`);
console.log(`   🤖 Claude API Key: ${config.claude.apiKey ? '✅ OK' : '❌ MANCANTE'}`);
console.log(`   🏢 Business Name: ${config.business.name}`);
console.log(`   📊 Claude Model: ${config.claude.model}`);

// Funzione di validazione
config.validate = function() {
    const errors = [];
    
    if (!this.whatsapp.phoneNumberId) {
        errors.push('WHATSAPP_PHONE_NUMBER_ID mancante');
    }
    
    if (!this.whatsapp.accessToken) {
        errors.push('WHATSAPP_ACCESS_TOKEN mancante');
    }
    
    if (!this.whatsapp.webhookToken) {
        errors.push('WHATSAPP_WEBHOOK_TOKEN mancante');
    }
    
    if (!this.claude.apiKey) {
        errors.push('CLAUDE_API_KEY mancante');
    }
    
    // Verifica formato token WhatsApp
    if (this.whatsapp.accessToken && !this.whatsapp.accessToken.startsWith('EAA')) {
        errors.push('WHATSAPP_ACCESS_TOKEN formato non valido (dovrebbe iniziare con EAA)');
    }
    
    // Verifica formato Claude API Key
    if (this.claude.apiKey && !this.claude.apiKey.startsWith('sk-ant-')) {
        errors.push('CLAUDE_API_KEY formato non valido (dovrebbe iniziare con sk-ant-)');
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
};

// Validazione automatica
const validation = config.validate();
if (!validation.isValid) {
    console.error('❌ [WHATSAPP CONFIG] ERRORI DI CONFIGURAZIONE:');
    validation.errors.forEach(error => {
        console.error(`   - ${error}`);
    });
} else {
    console.log('✅ [WHATSAPP CONFIG] Tutte le configurazioni sono valide');
}

module.exports = config;