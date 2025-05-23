// ============================================
// 📁 whatsapp/config.js - BOT APPUNTAMENTI CON INTENT
// ============================================

require('dotenv').config();

console.log('🔧 [CONFIG] Caricamento bot appuntamenti con intent...');

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
        maxTokens: 200,
        timeout: 10000
    },
    
    server: {
        port: process.env.PORT || 3000,
        environment: process.env.NODE_ENV || 'development'
    },

    // ===== BUSINESS =====
    business: {
        name: process.env.BUSINESS_NAME || "Costruzione Digitale",
        settore: "Consulenza digitale e sviluppo web",
        servizi: ["Sviluppo siti web", "Marketing digitale", "Consulenza AI", "E-commerce"],
        telefono: process.env.BUSINESS_PHONE || "+39 123 456 7890",
        email: process.env.BUSINESS_EMAIL || "info@costruzionedigitale.com",
        sito: process.env.BUSINESS_WEBSITE || "https://costruzionedigitale.com"
    },

    // ===== BOT CON INTENT =====
    bot: {
        name: "Alex",
        personality: "amichevole, scherzoso, professionale ma rilassato",
        
        // ===== KEYWORDS PER INTENT =====
        keywords: {
            saluto: ["ciao", "salve", "buongiorno", "buonasera", "hey", "hello", "salut"],
            
            appuntamento: ["appuntamento", "incontro", "chiamata", "call", "meeting", "prenotare", "fissare", "quando", "disponibile"],
            
            servizi: ["servizi", "cosa fate", "cosa offrite", "lavori", "progetti", "web", "sito", "marketing", "prezzi", "costi"],
            
            info_business: ["chi siete", "dove siete", "contatti", "telefono", "email", "indirizzo", "info", "informazioni"],
            
            conferma: ["sì", "si", "ok", "va bene", "perfetto", "confermo", "esatto", "giusto"],
            
            rifiuto: ["no", "non", "annulla", "cancella", "stop"],
            
            saluti_finali: ["grazie", "ciao", "arrivederci", "a presto", "buona giornata"],
            
            problemi: ["problema", "errore", "non funziona", "aiuto", "help"]
        },

        // ===== MESSAGGI PER INTENT =====
        messages: {
            // SALUTI
            saluto_iniziale: "Ciao! 😄 Sono Alex di {business_name}! Come posso aiutarti oggi?",
            saluto_ritorno: "Ciao di nuovo! 👋 Come va? Posso aiutarti con qualcosa?",
            
            // SERVIZI  
            descrizione_servizi: `Ci occupiamo di:
🌐 Sviluppo siti web
📱 Marketing digitale  
🤖 Consulenza AI
🛒 E-commerce

Ti interessa qualcosa in particolare? Ti va di fissare una chiamata per parlarne? 📞`,

            // APPUNTAMENTI
            proposta_appuntamento: "Perfetto! Fissiamo una chiamata per parlarne meglio. Come ti chiami? 😊",
            
            interesse_appuntamento: "Ottima idea! Una chiamata è il modo migliore per capirti le esigenze. Iniziamo?",
            
            // RACCOLTA DATI
            chiedi_nome: "Come ti chiami? 😊",
            chiedi_email: "Perfetto {nome}! Qual è la tua email? 📧", 
            chiedi_data: "Ottimo! Per che giorno vorresti la chiamata? (es: lunedì, martedì, domani...)",
            chiedi_ora: "A che ora ti va meglio? (es: 10:00, 14:30...)",
            
            // RIEPILOGO E CONFERMA
            riepilogo: `Perfetto! Ecco il riepilogo:
👤 Nome: {nome}
📧 Email: {email}
📅 Data: {data}  
🕐 Ora: {ora}

Tutto giusto? Scrivi "sì" per confermare! ✅`,

            appuntamento_confermato: "🎉 Fantastico {nome}! Appuntamento confermato per {data} alle {ora}. Ti ricontatteremo presto!",
            
            // INFO BUSINESS
            info_contatti: `📍 {business_name}
📧 Email: {business_email}
📞 Tel: {business_telefono} 
🌐 Sito: {business_sito}

Ti va di fissare una chiamata per parlare dei tuoi progetti? 😊`,

            // CONVERSAZIONE GENERALE
            risposta_generica: "Interessante! Per darti il miglior supporto, ti va di organizzare una chiamata veloce? 📞",
            
            spinta_appuntamento: "Per aiutarti al meglio, organizziamo una chiamata? È il modo più veloce per capirti le esigenze! 😊",
            
            // GESTIONE PROBLEMI
            problema_tecnico: "Ops! Sembra ci sia stato un problemino 😅 Riprova o scrivimi diversamente!",
            
            non_capito: "Non ho capito bene... Puoi riformulare? O ti va di fissare direttamente una chiamata? 😊",
            
            // SALUTI FINALI
            saluto_finale: "Grazie! A presto! 👋 Se cambi idea per la chiamata, scrivimi quando vuoi! 😊",
            
            // RIFIUTO GENTILE
            rifiuto_comprensione: "Nessun problema! Se cambi idea sono sempre qui. Buona giornata! 😊"
        },

        // ===== STEP DEL PROCESSO =====
        steps: {
            START: 'start',
            CONVERSAZIONE: 'conversazione', 
            INTERESSE_APPUNTAMENTO: 'interesse_appuntamento',
            NOME: 'nome', 
            EMAIL: 'email',
            DATA: 'data',
            ORA: 'ora',
            RIEPILOGO: 'riepilogo',
            CONFERMATO: 'confermato',
            RIFIUTATO: 'rifiutato'
        }
    }
};

// ===== FUNZIONI CON INTENT =====

// Genera prompt di sistema intelligente
config.bot.generateSystemPrompt = function(conversazione = {}) {
    const step = conversazione.currentStep || this.steps.START;
    const dati = conversazione.datiCliente || {};
    const messaggi = conversazione.messaggi?.length || 0;
    
    return `Sei ${this.name}, assistente ${this.personality} di ${config.business.name}.

🎯 OBIETTIVO PRINCIPALE: Fissare appuntamenti per chiamate conoscitive

📊 STATO CONVERSAZIONE:
- Step attuale: ${step}
- Messaggi scambiati: ${messaggi}
- Nome: ${dati.nome || 'MANCANTE'}
- Email: ${dati.email || 'MANCANTE'}
- Data: ${dati.data || 'MANCANTE'}
- Ora: ${dati.ora || 'MANCANTE'}

🏢 SERVIZI BUSINESS:
${config.business.servizi.join(', ')}

⚡ STRATEGIA:
1. Rispondi naturalmente a saluti e domande
2. Descrivi brevemente i servizi se chiesti
3. SEMPRE proponi appuntamento dopo 2-3 messaggi
4. Se interessato ad appuntamento → raccogli dati in ordine
5. Quando hai tutti i dati → fai riepilogo e chiedi conferma

💬 TONO: ${this.personality}
- Usa emoji appropriate
- Risposte brevi e dirette  
- Amichevole ma professionale
- Spingi gentilmente verso l'appuntamento

🚫 NON FARE:
- Conversazioni troppo lunghe senza proporre appuntamento
- Essere insistente se rifiuta
- Chiedere più dati del necessario (solo nome, email, data, ora)`;
};

// Rileva intent dal messaggio
config.bot.detectIntent = function(message) {
    const messageLower = message.toLowerCase();
    
    // Controllo intent in ordine di priorità
    for (const [intent, keywords] of Object.entries(this.keywords)) {
        if (keywords.some(keyword => messageLower.includes(keyword))) {
            console.log(`🎯 [CONFIG] Intent rilevato: ${intent}`);
            return intent;
        }
    }
    
    console.log(`🎯 [CONFIG] Intent rilevato: generale`);
    return 'generale';
};

// Ottieni messaggio basato su intent e step
config.bot.getResponseByIntent = function(conversazione, messaggio, intent) {
    const step = conversazione.currentStep || this.steps.START;
    const dati = conversazione.datiCliente || {};
    
    // Se stiamo raccogliendo dati specifici, continua il flusso
    if (step === this.steps.NOME && !dati.nome) {
        return this.messages.chiedi_nome;
    }
    if (step === this.steps.EMAIL && !dati.email) {
        return this.processTemplate(this.messages.chiedi_email, dati);
    }
    if (step === this.steps.DATA && !dati.data) {
        return this.messages.chiedi_data;
    }
    if (step === this.steps.ORA && !dati.ora) {
        return this.messages.chiedi_ora;
    }
    if (step === this.steps.RIEPILOGO) {
        if (intent === 'conferma') {
            return this.processTemplate(this.messages.appuntamento_confermato, dati);
        } else {
            return "Cosa vuoi modificare? Dimmi il nuovo dato 😊";
        }
    }
    
    // Gestione intent specifici
    switch (intent) {
        case 'saluto':
            return conversazione.messaggi?.length > 0 ? 
                this.messages.saluto_ritorno : 
                this.processTemplate(this.messages.saluto_iniziale, {business_name: config.business.name});
                
        case 'servizi':
            return this.messages.descrizione_servizi;
            
        case 'appuntamento':
            return this.messages.proposta_appuntamento;
            
        case 'info_business':
            return this.processTemplate(this.messages.info_contatti, {
                business_name: config.business.name,
                business_email: config.business.email,
                business_telefono: config.business.telefono,
                business_sito: config.business.sito
            });
            
        case 'conferma':
            if (step === this.steps.INTERESSE_APPUNTAMENTO) {
                return this.messages.chiedi_nome;
            }
            return this.messages.interesse_appuntamento;
            
        case 'rifiuto':
            return this.messages.rifiuto_comprensione;
            
        case 'saluti_finali':
            return this.messages.saluto_finale;
            
        case 'problemi':
            return this.messages.problema_tecnico;
            
        default:
            // Per messaggi generali, dopo 2-3 scambi proponi appuntamento
            const messaggiCount = conversazione.messaggi?.length || 0;
            if (messaggiCount >= 2) {
                return this.messages.spinta_appuntamento;
            } else {
                return this.messages.risposta_generica;
            }
    }
};

// Aggiorna step basato su intent
config.bot.updateStepByIntent = function(conversazione, messaggio, intent) {
    const step = conversazione.currentStep || this.steps.START;
    const dati = conversazione.datiCliente || {};
    
    switch (step) {
        case this.steps.START:
            if (intent === 'appuntamento' || intent === 'conferma') {
                conversazione.currentStep = this.steps.NOME;
            } else {
                conversazione.currentStep = this.steps.CONVERSAZIONE;
            }
            break;
            
        case this.steps.CONVERSAZIONE:
            if (intent === 'appuntamento' || intent === 'conferma') {
                conversazione.currentStep = this.steps.NOME;
            } else if (intent === 'rifiuto') {
                conversazione.currentStep = this.steps.RIFIUTATO;
            }
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
            if (intent === 'conferma') {
                conversazione.currentStep = this.steps.CONFERMATO;
            } else if (intent === 'rifiuto') {
                conversazione.currentStep = this.steps.RIFIUTATO;
            }
            break;
    }
    
    console.log(`🔄 [CONFIG] Step aggiornato: ${step} → ${conversazione.currentStep}`);
};

// Estrai dati dal messaggio (migliorato)
config.bot.extractData = function(conversazione, messaggio) {
    const step = conversazione.currentStep || this.steps.START;
    
    if (!conversazione.datiCliente) {
        conversazione.datiCliente = {};
    }
    
    const dati = conversazione.datiCliente;
    
    switch (step) {
        case this.steps.NOME:
            if (!dati.nome && messaggio.length > 1) {
                // Pulisci il nome da parole comuni
                let nome = messaggio.trim();
                nome = nome.replace(/^(mi chiamo|sono|il mio nome è)\s+/i, '');
                nome = nome.replace(/[^\w\s\u00C0-\u017F]/g, ''); // Solo lettere e spazi
                if (nome.length > 1) {
                    dati.nome = nome;
                    console.log(`👤 [CONFIG] Nome estratto: ${dati.nome}`);
                }
            }
            break;
            
        case this.steps.EMAIL:
            if (!dati.email) {
                const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
                const emailMatch = messaggio.match(emailRegex);
                if (emailMatch) {
                    dati.email = emailMatch[0];
                    console.log(`📧 [CONFIG] Email estratta: ${dati.email}`);
                }
            }
            break;
            
        case this.steps.DATA:
            if (!dati.data) {
                const dataKeywords = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica', 'domani', 'dopodomani'];
                const dataFound = dataKeywords.find(d => messaggio.toLowerCase().includes(d));
                if (dataFound) {
                    dati.data = dataFound;
                    console.log(`📅 [CONFIG] Data estratta: ${dati.data}`);
                } else if (messaggio.match(/\d{1,2}\/\d{1,2}/) || messaggio.length > 3) {
                    // Accetta anche date numeriche o qualsiasi input ragionevole
                    dati.data = messaggio.trim();
                    console.log(`📅 [CONFIG] Data estratta: ${dati.data}`);
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
                    console.log(`🕐 [CONFIG] Ora estratta: ${dati.ora}`);
                } else if (messaggio.toLowerCase().includes('mattina')) {
                    dati.ora = '10:00';
                    console.log(`🕐 [CONFIG] Ora estratta (mattina): ${dati.ora}`);
                } else if (messaggio.toLowerCase().includes('pomeriggio')) {
                    dati.ora = '15:00';
                    console.log(`🕐 [CONFIG] Ora estratta (pomeriggio): ${dati.ora}`);
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

// Fallback intelligente
config.bot.getFallbackMessage = function() {
    return this.messages.problema_tecnico;
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
console.log('📋 [CONFIG] Bot appuntamenti con intent caricato:');
console.log(`   🤖 Nome bot: ${config.bot.name}`);
console.log(`   🎭 Personalità: ${config.bot.personality}`);
console.log(`   🏢 Business: ${config.business.name}`);
console.log(`   🎯 Intent disponibili: ${Object.keys(config.bot.keywords).length}`);
console.log(`   ⚡ Max tokens: ${config.claude.maxTokens}`);

const validation = config.validate();
if (!validation.isValid) {
    console.error('❌ [CONFIG] ERRORI:');
    validation.errors.forEach(error => console.error(`   - ${error}`));
} else {
    console.log('✅ [CONFIG] Configurazione valida!');
}

module.exports = config;