// ============================================
// 📁 whatsapp/config.js - BOT APPUNTAMENTI CON INTENT CORRETTO
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
        maxTokens: 80,
        timeout: 10000
    },
    
    server: {
        port: process.env.PORT || 3000,
        environment: process.env.NODE_ENV || 'development'
    },

    // ===== BUSINESS =====
    business: {
        name: process.env.BUSINESS_NAME || "Edil Marketing Pro",
        settore: "Marketing specializzato per imprese edili",
        servizi: [
            "Siti web professionali per imprese edili",
            "Campagne pubblicitarie Google e Facebook",
            "Gestione social media per cantieri",
            "Lead generation qualificati",
            "Branding e immagine aziendale",
            "Foto/video professionali di cantieri"
        ],
        telefono: process.env.BUSINESS_PHONE || "+39 123 456 7890",
        email: process.env.BUSINESS_EMAIL || "info@edilmarketingpro.it",
        sito: process.env.BUSINESS_WEBSITE || "https://edilmarketingpro.it"
    },

    // ===== BOT CON INTENT =====
    bot: {
        name: "Marco",
        personality: "professionale, competente nel settore edile, amichevole e diretto",
        
        // ===== KEYWORDS PER INTENT (AGGIORNATE) =====
        keywords: {
            saluto: ["ciao", "salve", "buongiorno", "buonasera", "hey", "hello", "salut"],
            
            appuntamento: ["appuntamento", "incontro", "chiamata", "call", "meeting", "prenotare", "fissare", "quando", "disponibile", "consulenza", "consultazione"],
            
            servizi: ["servizi", "cosa fate", "cosa offrite", "lavori", "progetti", "web", "sito", "marketing", "prezzi", "costi", "pubblicità", "social", "cantieri", "clienti", "visibilità"],
            
            info_business: ["chi siete", "dove siete", "contatti", "telefono", "email", "indirizzo", "info", "informazioni", "azienda"],
            
            conferma: ["sì", "si", "ok", "va bene", "perfetto", "confermo", "esatto", "giusto", "certo", "certamente", "conferma"],
            
            rifiuto: ["no", "non", "annulla", "cancella", "stop", "forse", "ci penso"],
            
            // 🆕 NUOVI INTENT PER MODIFICHE
            modifica_nome: ["nome", "cambia nome", "modifica nome", "sbagliato nome", "nome è sbagliato", "il nome"],
            modifica_email: ["email", "mail", "cambia email", "modifica email", "sbagliata email", "email sbagliata", "la mail", "l'email"],
            modifica_data: ["data", "giorno", "cambia data", "modifica data", "sbagliata data", "data sbagliata", "la data", "il giorno"],
            modifica_ora: ["ora", "orario", "cambia ora", "modifica ora", "sbagliata ora", "ora sbagliata", "l'ora", "l'orario"],
            
            ricomincia: ["ricomincia", "restart", "ricominciamo", "riparti", "ricomincio", "da capo", "rifare"],
            
            saluti_finali: ["grazie", "ciao", "arrivederci", "a presto", "buona giornata", "buon lavoro"],
            
            problemi: ["problema", "errore", "non funziona", "aiuto", "help", "assistenza"]
        },

        // ===== MESSAGGI PER INTENT (AGGIORNATI) =====
        messages: {
            // SALUTI
            saluto_iniziale: "Buongiorno! 👷‍♂️ Sono Marco di {business_name}, il tuo assistente specializzato in marketing per imprese edili. Sono qui per fissare un appuntamento con uno dei nostri consulenti esperti. Posso aiutarti a far crescere la tua impresa edile con strategie di marketing mirate! Come posso esserti utile?",
            
            saluto_ritorno: "Bentornato! 👋 Sono Marco di {business_name}. Sei interessato a scoprire come possiamo aiutare la tua impresa edile a trovare nuovi clienti?",
            
            // SERVIZI  
            descrizione_servizi: `Siamo specializzati in marketing per imprese edili:
🏗️ Siti web professionali per imprese edili
📱 Campagne Google e Facebook per trovare clienti
📸 Foto/video professionali dei tuoi cantieri
🎯 Lead generation: clienti qualificati per i tuoi servizi
💼 Branding e immagine aziendale
📊 Gestione social media

Vuoi fissare una consulenza gratuita per capire come possiamo far crescere la tua impresa? 📞`,

            // APPUNTAMENTI
            proposta_appuntamento: "Ottimo! Fissiamo subito una consulenza gratuita per analizzare le esigenze della tua impresa edile. Iniziamo con il tuo nome e cognome 👷‍♂️",
            
            interesse_appuntamento: "Perfetto! Una consulenza personalizzata è il modo migliore per capire come possiamo aiutarti a trovare nuovi clienti. Procediamo?",
            
            // RACCOLTA DATI
            chiedi_nome: "Per iniziare, mi puoi dire il tuo nome e cognome? 📝",
            chiedi_email: "Grazie {nome}! Ora mi serve la tua email aziendale per inviarti il promemoria dell'appuntamento 📧", 
            chiedi_data: "Perfetto! In che giorno preferisci fare la consulenza? (es: lunedì, martedì, domani...)",
            chiedi_ora: "Ottimo! A che ora ti va meglio? I nostri consulenti sono disponibili dalle 9:00 alle 18:00 🕐",
            
            // 🆕 RIEPILOGO E CONFERMA MIGLIORATI
            riepilogo: `Eccellente! Ecco il riepilogo della tua consulenza gratuita:
👷‍♂️ Nome: {nome}
📧 Email: {email}
📅 Data: {data}  
🕐 Ora: {ora}

Ti chiameremo per analizzare le esigenze di marketing della tua impresa edile.

✅ Scrivi "sì" per confermare
✏️ Oppure dimmi cosa vuoi modificare (es: "cambia email", "modifica data")`,

            appuntamento_confermato: "🎉 Perfetto {nome}! Consulenza confermata per {data} alle {ora}. Un nostro esperto di marketing per l'edilizia ti contatterà per aiutarti a far crescere la tua impresa. A presto! 🏗️",
            
            // 🆕 MESSAGGI PER MODIFICHE SPECIFICHE
            quale_modifica: `Cosa vuoi modificare? Puoi dirmi:
✏️ "Nome" - per cambiare il nome
✏️ "Email" - per cambiare l'email  
✏️ "Data" - per cambiare il giorno
✏️ "Ora" - per cambiare l'orario
🔄 "Ricomincia" - per ripartire da capo`,

            modifica_confermata_nome: "Perfetto! Dimmi il nuovo nome e cognome: ",
            modifica_confermata_email: "Perfetto! Dimmi la nuova email: ",
            modifica_confermata_data: "Perfetto! Dimmi il nuovo giorno: ",
            modifica_confermata_ora: "Perfetto! Dimmi la nuova ora: ",
            
            modifica_completata: "✅ Aggiornato! Ecco il nuovo riepilogo:",
            
            // INFO BUSINESS
            info_contatti: `📍 {business_name}
📧 Email: {business_email}
📞 Tel: {business_telefono} 
🌐 Sito: {business_sito}

Siamo esperti in marketing per imprese edili. Vuoi fissare una consulenza gratuita? 🏗️`,

            // CONVERSAZIONE GENERALE
            risposta_generica: "Interessante! Per darti il supporto migliore per la tua impresa edile, ti consiglio di fissare una consulenza gratuita con i nostri esperti 📞",
            
            spinta_appuntamento: "Per capire al meglio come possiamo aiutare la tua impresa edile a trovare nuovi clienti, organizziamo una consulenza gratuita? È il modo più efficace! 🏗️",
            
            // GESTIONE PROBLEMI
            problema_tecnico: "Mi scusi, c'è stato un piccolo problema tecnico 🔧 Può riprovare o scrivermi in modo diverso?",
            
            non_capito: "Non ho capito bene... Può riformulare? O preferisce fissare direttamente una consulenza gratuita per la sua impresa edile? 📞",
            
            non_capito_riepilogo: `Non ho capito cosa vuoi modificare. Puoi essere più specifico?
✏️ Scrivi "nome", "email", "data" o "ora"
✅ Oppure "sì" per confermare tutto`,
            
            // SALUTI FINALI
            saluto_finale: "Grazie per averci contattato! 👷‍♂️ Se cambia idea, siamo sempre qui per aiutare la sua impresa edile a crescere! Buon lavoro! 🏗️",
            
            // RIFIUTO GENTILE
            rifiuto_comprensione: "Capisco perfettamente! Se in futuro avrà bisogno di supporto marketing per la sua impresa edile, saremo qui. Buon lavoro! 🏗️",
            
            // 🆕 MESSAGGI AGGIUNTIVI
            dati_incompleti: "Mancano ancora alcuni dati. Continuiamo la raccolta dati per completare l'appuntamento! 📝",
            
            ricomincia_messaggio: "Ricominciamo da capo! 🔄 "
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

// ===== FUNZIONI CON INTENT (AGGIORNATE) =====

// Genera prompt di sistema intelligente
config.bot.generateSystemPrompt = function(conversazione = {}) {
    const step = conversazione.currentStep || this.steps.START;
    const dati = conversazione.datiCliente || {};
    const messaggi = conversazione.messaggi?.length || 0;
    
    return `Sei ${this.name}, assistente ${this.personality} di ${config.business.name}.

🎯 OBIETTIVO PRINCIPALE: Fissare appuntamenti per consulenze di marketing per imprese edili

📊 STATO CONVERSAZIONE:
- Step attuale: ${step}
- Messaggi scambiati: ${messaggi}
- Nome: ${dati.nome || 'MANCANTE'}
- Email: ${dati.email || 'MANCANTE'}
- Data: ${dati.data || 'MANCANTE'}
- Ora: ${dati.ora || 'MANCANTE'}

🏢 SERVIZI SPECIALIZZATI:
${config.business.servizi.join(', ')}

🎯 TARGET: Imprenditori edili, geometri, architetti, titolari di imprese di costruzioni

⚡ STRATEGIA:
1. Saluta sempre presentandoti come assistente specializzato in marketing per imprese edili
2. Spiega che sei qui per fissare consulenze gratuite di marketing
3. Evidenzia brevemente i vantaggi (trovare nuovi clienti, aumentare la visibilità)
4. Raccogli i dati in ordine: nome, email, data, ora
5. Quando hai tutti i dati → fai riepilogo e chiedi conferma finale
6. Dopo la conferma → salva l'appuntamento nel database

💬 TONO: ${this.personality}
- Usa termini del settore edile quando appropriato
- Sii professionale ma accessibile
- Enfatizza il valore della consulenza gratuita
- Mostra competenza nel settore

🚫 NON FARE:
- Non dilungarti troppo sui servizi prima di proporre l'appuntamento
- Non usare gergo tecnico troppo complesso
- Non chiedere informazioni sull'azienda prima di aver raccolto i dati base`;
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

// 🆕 OTTIENI MESSAGGIO BASATO SU INTENT E STEP (AGGIORNATO)
config.bot.getResponseByIntent = function(conversazione, messaggio, intent) {
    const step = conversazione.currentStep || this.steps.START;
    const dati = conversazione.datiCliente || {};
    
    // 🆕 GESTIONE SPECIALE PER STEP RIEPILOGO
    if (step === this.steps.RIEPILOGO) {
        
        // Conferma definitiva
        if (intent === 'conferma') {
            return this.processTemplate(this.messages.appuntamento_confermato, dati);
        }
        
        // 🆕 Richieste di modifica specifiche
        if (intent === 'modifica_nome') {
            conversazione.currentStep = this.steps.NOME;
            conversazione.datiCliente.nome = null; // Reset dato
            return this.messages.modifica_confermata_nome;
        }
        
        if (intent === 'modifica_email') {
            conversazione.currentStep = this.steps.EMAIL;
            conversazione.datiCliente.email = null; // Reset dato
            return this.messages.modifica_confermata_email;
        }
        
        if (intent === 'modifica_data') {
            conversazione.currentStep = this.steps.DATA;
            conversazione.datiCliente.data = null; // Reset dato
            return this.messages.modifica_confermata_data;
        }
        
        if (intent === 'modifica_ora') {
            conversazione.currentStep = this.steps.ORA;
            conversazione.datiCliente.ora = null; // Reset dato
            return this.messages.modifica_confermata_ora;
        }
        
        // 🆕 Ricomincia da capo
        if (intent === 'ricomincia') {
            conversazione.currentStep = this.steps.NOME;
            conversazione.datiCliente = {}; // Reset tutti i dati
            return this.messages.ricomincia_messaggio + this.messages.chiedi_nome;
        }
        
        // 🆕 Gestione rifiuto con opzioni
        if (intent === 'rifiuto') {
            return this.messages.rifiuto_comprensione;
        }
        
        // 🆕 Se non capisce, offri opzioni specifiche
        return this.messages.quale_modifica;
    }
    
    // ===== RESTO DELLA LOGICA ESISTENTE =====
    
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
    
    // Gestione intent specifici...
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
            
        // 🆕 Gestione modifiche durante la raccolta dati
        case 'ricomincia':
            conversazione.currentStep = this.steps.NOME;
            conversazione.datiCliente = {};
            return this.messages.ricomincia_messaggio + this.messages.chiedi_nome;
            
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

// 🆕 AGGIORNA STEP BASATO SU INTENT (AGGIORNATO)
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
            // 🆕 GESTIONE MIGLIORATA PER RIEPILOGO
            if (intent === 'conferma') {
                conversazione.currentStep = this.steps.CONFERMATO;
            } else if (intent === 'rifiuto') {
                conversazione.currentStep = this.steps.RIFIUTATO;
            }
            // Le modifiche specifiche sono gestite in getResponseByIntent
            // Non cambiamo step qui per le modifiche
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

// 🆕 NUOVA FUNZIONE PER VALIDARE DATI PRIMA DEL RIEPILOGO
config.bot.canShowRiepilogo = function(conversazione) {
    const dati = conversazione.datiCliente || {};
    const hasAllData = dati.nome && dati.email && dati.data && dati.ora;
    
    if (!hasAllData) {
        console.log('⚠️ [CONFIG] Dati incompleti per riepilogo:', dati);
        return false;
    }
    
    return true;
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

// 🆕 FUNZIONE DI DEBUG PER STATO CONVERSAZIONE
config.bot.debugConversationState = function(conversazione) {
    console.log(`🔍 [CONFIG] DEBUG STATO CONVERSAZIONE:`);
    console.log(`   🔄 Step: ${conversazione.currentStep}`);
    console.log(`   📋 Dati: ${JSON.stringify(conversazione.datiCliente)}`);
    console.log(`   💬 Messaggi: ${conversazione.messaggi?.length || 0}`);
    console.log(`   ✅ Completo: ${this.isAppointmentComplete(conversazione)}`);
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
console.log('📋 [CONFIG] Bot appuntamenti per marketing edile caricato:');
console.log(`   🤖 Nome bot: ${config.bot.name}`);
console.log(`   🎭 Personalità: ${config.bot.personality}`);
console.log(`   🏢 Business: ${config.business.name}`);
console.log(`   🏗️ Settore: ${config.business.settore}`);
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