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

    database: {
        mongoUrl: process.env.MONGODB_URI_BOOKING || process.env.MONGODB_URI || 'mongodb://localhost:27017/appointments'
    },
    
    claude: {
        apiKey: process.env.CLAUDE_API_KEY,
        model: 'claude-sonnet-4-20250514',
        maxTokens: 150,
        timeout: 10000
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
            INTERESSE: 'interesse',
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
            saluto: "Ciao! 👋 Sono Sofia di Costruzione Digitale. Aiutiamo imprese edili a trovare nuovi clienti online. Vuoi una consulenza gratuita? 🏗️",
            
            servizi: `Cosa facciamo per le imprese edili:
        🏗️ Siti web che convertono
        🎯 Lead generation Facebook/Google  
        📱 Social media management
        💼 Branding professionale
        
        Fissiamo una call gratuita? 📞`,
        
            interesse_confermato: "Perfetto! Per organizzare tutto, ho bisogno di qualche info. Come ti chiami? 📝",
            
            chiedi_nome: "Come ti chiami? 📝",
            chiedi_email: "Ciao {nome}! La tua email? 📧", 
            chiedi_data: "Che giorno va bene? (lunedì, martedì, oggi...)",
            chiedi_ora: "A che ora? (es. 15:00, mattina, pomeriggio) 🕐",
            
            riepilogo: `Consulenza confermata:
        👤 {nome}
        📧 {email} 
        📅 {data} alle {ora}
        
        Tutto ok? Scrivi "sì" per confermare ✅`,
        
            confermato: "🎉 Fatto! Ti chiameremo {data} alle {ora}. A presto {nome}! 🏗️",
            
            errore: "Non ho capito... puoi ripetere? 😅",
            rifiuto_finale: "Ok, nessun problema! Se cambi idea, scrivimi. Ciao! 👋"
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
    
    // NON estrarre dati nei step START e INTERESSE
    if (step === this.steps.START || step === this.steps.INTERESSE) {
        return;
    }
    
    switch (step) {
        case this.steps.NOME:
            if (messaggio.length >= 1) {
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
                if (messaggio.length >= 1) {
                    const rawDate = messaggio.trim();
                    dati.data = this.normalizeDate(rawDate);
                    console.log(`📅 Data estratta: ${rawDate} → ${dati.data}`);
                }
                break;
                
            case this.steps.ORA:
                if (messaggio.length >= 1) {
                    const rawTime = messaggio.trim();
                    dati.ora = this.normalizeTime(rawTime);
                    console.log(`🕐 Ora estratta: ${rawTime} → ${dati.ora}`);
                }
                break;
    }
};

// Normalizza data colloquiale in formato standard
config.bot.normalizeDate = function(dateText) {
    const oggi = new Date();
    const domani = new Date(oggi);
    domani.setDate(oggi.getDate() + 1);
    
    const dateTextLower = dateText.toLowerCase().trim();
    
    if (dateTextLower.includes('oggi')) {
        return oggi.toISOString().split('T')[0]; // YYYY-MM-DD
    }
    if (dateTextLower.includes('domani')) {
        return domani.toISOString().split('T')[0]; // YYYY-MM-DD
    }
    
    // Prova a parsare date come "15/01", "lunedì", etc
    // Per ora restituisce il testo originale, si può migliorare
    return dateText;
};

// Normalizza ora colloquiale in formato 24h
config.bot.normalizeTime = function(timeText) {
    const timeTextLower = timeText.toLowerCase().trim();
    
    // Mappature comuni
    const timeMap = {
        'mattina': '09:00',
        'mattino': '09:00',
        'pomeriggio': '14:00',
        'sera': '18:00',
        'pranzo': '12:00'
    };
    
    // Controlla mappature dirette
    for (const [key, value] of Object.entries(timeMap)) {
        if (timeTextLower.includes(key)) {
            return value;
        }
    }
    
    // Gestisce "10 di mattina", "3 del pomeriggio", etc
    const numberMatch = timeTextLower.match(/(\d{1,2})/);
    if (numberMatch) {
        let hour = parseInt(numberMatch[1]);
        
        if (timeTextLower.includes('mattina') || timeTextLower.includes('mattino')) {
            return `${hour.toString().padStart(2, '0')}:00`;
        }
        if (timeTextLower.includes('pomeriggio') || timeTextLower.includes('sera')) {
            if (hour < 12) hour += 12;
            return `${hour.toString().padStart(2, '0')}:00`;
        }
        // Se solo numero, assumiamo formato 24h
        return `${hour.toString().padStart(2, '0')}:00`;
    }
    
    // Se già in formato HH:MM, restituisce così
    if (/^\d{1,2}:\d{2}$/.test(timeTextLower)) {
        return timeTextLower;
    }
    
    return timeText; // Fallback
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