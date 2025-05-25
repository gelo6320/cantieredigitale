// ============================================
// 📁 whatsapp/config.js - CONFIGURAZIONE SEMPLIFICATA
// ============================================

require('dotenv').config();

const config = {
    // ===== API =====
    whatsapp: {
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
        webhookToken: process.env.WHATSAPP_WEBHOOK_TOKEN,
        verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_TOKEN
    },
    
    claude: {
        apiKey: process.env.CLAUDE_API_KEY,
        model: 'claude-sonnet-4-20250514',
        maxTokens: 150,
        timeout: 10000
    },

    database: {
        mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/appointments'
    },
    
    server: {
        port: process.env.PORT || 3000,
        environment: process.env.NODE_ENV || 'development'
    },

    // ===== BUSINESS =====
    business: {
        name: "Costruzione Digitale",
        settore: "Marketing per imprese edili",
        servizi: [
            "Siti web per imprese edili",
            "Lead generation qualificati", 
            "Campagne Google e Facebook",
            "Gestione social media",
            "Branding aziendale"
        ],
        telefono: process.env.BUSINESS_PHONE || "+39 123 456 7890",
        email: process.env.BUSINESS_EMAIL || "info@costruzionedigitale.it"
    },

    // ===== BOT SEMPLIFICATO =====
    bot: {
        name: "Sofia",
        
        // STEP DEL PROCESSO
        steps: {
            START: 'start',
            NOME: 'nome', 
            EMAIL: 'email',
            DATA: 'data',
            ORA: 'ora',
            RIEPILOGO: 'riepilogo',
            CONFERMATO: 'confermato'
        },

        // PAROLE CHIAVE PER INTENT
        keywords: {
            saluto: ["ciao", "salve", "buongiorno", "buonasera", "hey"],
            appuntamento: ["appuntamento", "incontro", "consulenza", "prenotare", "fissare"],
            servizi: ["servizi", "cosa fate", "marketing", "prezzi", "web", "sito"],
            conferma: ["sì", "si", "ok", "va bene", "perfetto", "confermo", "conferma"],
            rifiuto: ["no", "non", "annulla", "cancella"],
            ricomincia: ["ricomincia", "riparti", "da capo"]
        },

        // MESSAGGI
        messages: {
            saluto: "Ciao! 👋 Sono Sofia di Costruzione Digitale, agenzia specializzata nel marketing per imprese edili. Sono qui per fissarti una consulenza gratuita con i nostri esperti. Ti va bene?",
            
            servizi: `I nostri servizi per imprese edili:
🏗️ Siti web professionali
🎯 Lead generation clienti qualificati  
📱 Campagne Google e Facebook
📊 Gestione social media
💼 Branding aziendale

Vuoi una consulenza gratuita? 📞`,

            chiedi_nome: "Perfetto! Come ti chiami? 📝",
            chiedi_email: "Grazie {nome}! Qual è la tua email? 📧", 
            chiedi_data: "Ottimo! In che giorno preferisci la consulenza? (lunedì, martedì, mercoledì...)",
            chiedi_ora: "Perfetto! A che ora ti va meglio? (9:00-18:00) 🕐",
            
            riepilogo: `Ecco il riepilogo della tua consulenza:
👤 Nome: {nome}
📧 Email: {email} 
📅 Data: {data}
🕐 Ora: {ora}

✅ Confermi? Scrivi "sì" per confermare`,

            confermato: "🎉 Perfetto {nome}! Consulenza confermata per {data} alle {ora}. Ti ricontatteremo presto! 🏗️",
            
            errore: "Mi scusi, non ho capito. Può ripetere?",
            
            rifiuto_finale: "Capisco! Se cambi idea, sono sempre qui. Buona giornata! 👋"
        }
    }
};

// ===== FUNZIONI SEMPLICI =====

// Rileva intent dal messaggio
config.bot.detectIntent = function(message) {
    const messageLower = message.toLowerCase();
    
    for (const [intent, keywords] of Object.entries(this.keywords)) {
        if (keywords.some(keyword => messageLower.includes(keyword))) {
            return intent;
        }
    }
    
    return 'generale';
};

// Sostituisce variabili nel template
config.bot.processTemplate = function(template, data = {}) {
    let processed = template;
    Object.entries(data).forEach(([key, value]) => {
        processed = processed.replace(new RegExp(`{${key}}`, 'g'), value || '');
    });
    return processed;
};

// Estrae dati dal messaggio
config.bot.extractData = function(conversazione, messaggio) {
    const step = conversazione.currentStep;
    const dati = conversazione.datiCliente;
    
    switch (step) {
        case this.steps.NOME:
            if (messaggio.length > 1) {
                dati.nome = messaggio.trim();
                console.log(`👤 Nome estratto: ${dati.nome}`);
            }
            break;
            
        case this.steps.EMAIL:
            const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
            const emailMatch = messaggio.match(emailRegex);
            if (emailMatch) {
                dati.email = emailMatch[0];
                console.log(`📧 Email estratta: ${dati.email}`);
            }
            break;
            
        case this.steps.DATA:
            if (messaggio.length > 2) {
                dati.data = messaggio.trim();
                console.log(`📅 Data estratta: ${dati.data}`);
            }
            break;
            
        case this.steps.ORA:
            if (messaggio.length > 2) {
                dati.ora = messaggio.trim();
                console.log(`🕐 Ora estratta: ${dati.ora}`);
            }
            break;
    }
};

// Controlla se appuntamento è completo
config.bot.isComplete = function(conversazione) {
    const dati = conversazione.datiCliente;
    return dati.nome && dati.email && dati.data && dati.ora;
};

// Validazione configurazione
config.validate = function() {
    const required = ['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_WEBHOOK_TOKEN', 'CLAUDE_API_KEY'];
    const errors = required.filter(varName => !process.env[varName]);
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
};

module.exports = config;