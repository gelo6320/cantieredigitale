// ============================================
// 📁 whatsapp/config.js - VERSIONE SEMPLIFICATA
// ============================================

require('dotenv').config();

console.log('🔧 [CONFIG] Caricamento configurazione semplificata...');

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
        maxTokens: 150, // Risposte brevi
        timeout: 10000
    },
    
    server: {
        port: process.env.PORT || 3000,
        environment: process.env.NODE_ENV || 'development'
    },

    // ===== BUSINESS =====
    business: {
        name: process.env.BUSINESS_NAME || "Assistente Appuntamenti",
        settore: "Consulenza",
        telefono: process.env.BUSINESS_PHONE || "+39 123 456 7890",
        email: process.env.BUSINESS_EMAIL || "info@business.com"
    },

    // ===== BOT SEMPLIFICATO =====
    bot: {
        name: "Alex",
        personality: "amichevole, scherzoso, efficiente",
        
        // MESSAGGI TEMPLATE
        messages: {
            saluto: "Ciao! 😄 Sono Alex, il tuo assistente per gli appuntamenti! Come ti chiami?",
            
            chiedi_nome: "Come ti chiami? 😊",
            chiedi_email: "Perfetto! Qual è la tua email? 📧",
            chiedi_data: "Ottimo! Per che giorno vorresti l'appuntamento? (es: lunedì, martedì, domani...)",
            chiedi_ora: "A che ora preferisci? (es: 10:00, 14:30...)",
            
            riepilogo: `Perfetto! Ricapitoliamo:
👤 Nome: {nome}
📧 Email: {email}
📅 Data: {data}
🕐 Ora: {ora}

Tutto giusto? Scrivi "sì" per confermare! ✅`,

            confermato: "🎉 Appuntamento confermato! Ti ricontatteremo per confermare. Grazie {nome}!",
            
            errore: "Ops! Qualcosa è andato storto 😅 Riprova o scrivimi di nuovo!",
            
            non_capito: "Non ho capito bene... Puoi ripetere? 🤔"
        },

        // STEP DEL PROCESSO
        steps: {
            START: 'start',
            NOME: 'nome', 
            EMAIL: 'email',
            DATA: 'data',
            ORA: 'ora',
            RIEPILOGO: 'riepilogo',
            CONFERMATO: 'confermato'
        }
    }
};

// ===== FUNZIONI SEMPLICI =====

// Genera prompt di sistema semplice
config.bot.generateSystemPrompt = function(conversazione = {}) {
    const step = conversazione.currentStep || this.steps.START;
    const dati = conversazione.datiCliente || {};
    
    return `Sei ${this.name}, un assistente ${this.personality} per prenotare appuntamenti.

🎯 OBIETTIVO: Raccogliere SOLO questi 4 dati:
1. Nome
2. Email  
3. Data appuntamento
4. Ora appuntamento

📊 STATO ATTUALE:
- Step: ${step}
- Nome: ${dati.nome || 'MANCANTE'}
- Email: ${dati.email || 'MANCANTE'}
- Data: ${dati.data || 'MANCANTE'}
- Ora: ${dati.ora || 'MANCANTE'}

⚡ REGOLE:
- Chiedi UN dato alla volta in ordine
- Sii amichevole e usa emoji
- Risposte BREVI (max 1 frase)
- Quando hai tutti i dati, fai riepilogo
- Se conferma con "sì", salva l'appuntamento

💬 USA TONO: amichevole, scherzoso, efficiente
🚫 NON: spiegare troppo, chiedere dati extra, essere formale`;
};

// Determina quale messaggio inviare
config.bot.getNextMessage = function(conversazione, messaggio) {
    const step = conversazione.currentStep || this.steps.START;
    const dati = conversazione.datiCliente || {};
    
    switch (step) {
        case this.steps.START:
            return this.messages.saluto;
            
        case this.steps.NOME:
            if (dati.nome) {
                return this.messages.chiedi_email;
            } else {
                return this.messages.chiedi_nome;
            }
            
        case this.steps.EMAIL:
            if (dati.email) {
                return this.messages.chiedi_data;
            } else {
                return this.messages.chiedi_email;
            }
            
        case this.steps.DATA:
            if (dati.data) {
                return this.messages.chiedi_ora;
            } else {
                return this.messages.chiedi_data;
            }
            
        case this.steps.ORA:
            if (dati.ora) {
                return this.processTemplate(this.messages.riepilogo, dati);
            } else {
                return this.messages.chiedi_ora;
            }
            
        case this.steps.RIEPILOGO:
            if (messaggio.toLowerCase().includes('sì') || messaggio.toLowerCase().includes('si')) {
                return this.processTemplate(this.messages.confermato, dati);
            } else {
                return "Cosa vuoi modificare? Dimmi il nuovo dato 😊";
            }
            
        default:
            return this.messages.non_capito;
    }
};

// Aggiorna step della conversazione
config.bot.updateStep = function(conversazione, messaggio) {
    const step = conversazione.currentStep || this.steps.START;
    const dati = conversazione.datiCliente || {};
    
    switch (step) {
        case this.steps.START:
            conversazione.currentStep = this.steps.NOME;
            break;
            
        case this.steps.NOME:
            if (dati.nome) {
                conversazione.currentStep = this.steps.EMAIL;
            }
            break;
            
        case this.steps.EMAIL:
            if (dati.email) {
                conversazione.currentStep = this.steps.DATA;
            }
            break;
            
        case this.steps.DATA:
            if (dati.data) {
                conversazione.currentStep = this.steps.ORA;
            }
            break;
            
        case this.steps.ORA:
            if (dati.ora) {
                conversazione.currentStep = this.steps.RIEPILOGO;
            }
            break;
            
        case this.steps.RIEPILOGO:
            if (messaggio.toLowerCase().includes('sì') || messaggio.toLowerCase().includes('si')) {
                conversazione.currentStep = this.steps.CONFERMATO;
            }
            break;
    }
};

// Estrai dati dal messaggio
config.bot.extractData = function(conversazione, messaggio) {
    const step = conversazione.currentStep || this.steps.START;
    
    if (!conversazione.datiCliente) {
        conversazione.datiCliente = {};
    }
    
    const dati = conversazione.datiCliente;
    
    switch (step) {
        case this.steps.NOME:
            if (!dati.nome && messaggio.length > 1) {
                // Prendi la prima parola/frase come nome
                dati.nome = messaggio.trim();
                console.log(`👤 Nome estratto: ${dati.nome}`);
            }
            break;
            
        case this.steps.EMAIL:
            if (!dati.email) {
                const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
                const emailMatch = messaggio.match(emailRegex);
                if (emailMatch) {
                    dati.email = emailMatch[0];
                    console.log(`📧 Email estratta: ${dati.email}`);
                }
            }
            break;
            
        case this.steps.DATA:
            if (!dati.data) {
                const dataKeywords = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica', 'domani', 'dopodomani'];
                const dataFound = dataKeywords.find(d => messaggio.toLowerCase().includes(d));
                if (dataFound) {
                    dati.data = dataFound;
                    console.log(`📅 Data estratta: ${dati.data}`);
                } else if (messaggio.length > 2) {
                    // Accetta qualsiasi input come data
                    dati.data = messaggio.trim();
                    console.log(`📅 Data estratta: ${dati.data}`);
                }
            }
            break;
            
        case this.steps.ORA:
            if (!dati.ora) {
                const oraRegex = /(\d{1,2}):?(\d{2})?/;
                const oraMatch = messaggio.match(oraRegex);
                if (oraMatch) {
                    const ora = oraMatch[1];
                    const minuti = oraMatch[2] || '00';
                    dati.ora = `${ora}:${minuti}`;
                    console.log(`🕐 Ora estratta: ${dati.ora}`);
                }
            }
            break;
    }
};

// Controlla se appuntamento è completo
config.bot.isAppointmentComplete = function(conversazione) {
    const dati = conversazione.datiCliente || {};
    return dati.nome && dati.email && dati.data && dati.ora;
};

// Processa template
config.bot.processTemplate = function(template, data = {}) {
    let processed = template;
    
    Object.entries(data).forEach(([key, value]) => {
        const regex = new RegExp(`{${key}}`, 'g');
        processed = processed.replace(regex, value || '');
    });
    
    return processed;
};

// Fallback semplice
config.bot.getFallbackMessage = function() {
    return this.messages.errore;
};

// Rileva intent semplice
config.bot.detectIntent = function(message) {
    const messageLower = message.toLowerCase();
    
    if (messageLower.includes('ciao') || messageLower.includes('salve') || messageLower.includes('buongiorno')) {
        return 'saluto';
    }
    
    if (messageLower.includes('sì') || messageLower.includes('si') || messageLower.includes('confermo')) {
        return 'conferma';
    }
    
    if (messageLower.includes('no') || messageLower.includes('annulla')) {
        return 'rifiuto';
    }
    
    return 'generale';
};

// ===== VALIDAZIONE =====
const requiredVars = [
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_ACCESS_TOKEN', 
    'WHATSAPP_WEBHOOK_TOKEN',
    'CLAUDE_API_KEY'
];

config.validate = function() {
    const errors = [];
    
    requiredVars.forEach(varName => {
        if (!process.env[varName]) {
            errors.push(`${varName} mancante`);
        }
    });
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
};

// Log
console.log('📋 [CONFIG] Bot semplificato caricato:');
console.log(`   🤖 Nome bot: ${config.bot.name}`);
console.log(`   🎭 Personalità: ${config.bot.personality}`);
console.log(`   ⚡ Max tokens: ${config.claude.maxTokens}`);

const validation = config.validate();
if (!validation.isValid) {
    console.error('❌ [CONFIG] ERRORI:');
    validation.errors.forEach(error => console.error(`   - ${error}`));
} else {
    console.log('✅ [CONFIG] Configurazione valida!');
}

module.exports = config;