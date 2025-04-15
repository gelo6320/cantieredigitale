// CookieConsentManager.js - Versione statica per Vercel
// Versione 1.0.1

class CookieConsentManager {
    constructor(options = {}) {
        // Configurazione base
        this.config = {
            cookieName: 'user_cookie_consent',
            cookieDuration: 365,
            analyticsId: 'G-MBFTYV86P7',
            metaPixelId: '1543790469631614',
            apiBaseUrl: 'https://api.costruzionedigitale.com', // Indirizzo del tuo server OVH
            ...options
        };
        
        // Stato del consenso
        this.consent = {
            essential: true,
            analytics: false,
            marketing: false,
            configured: false
        };
    
        // Inizializza
        this.init();
    }

    async init() {
        // Carica le preferenze esistenti
        this.loadPreferences();
        
        // Collega gli eventi al banner
        this.bindExistingBanner();
        
        // Carica lo script di tracciamento dopo un piccolo ritardo
        setTimeout(() => {
            this.loadTrackingScript();
        }, 100);
    }

    loadPreferences() {
        // Inizia con i valori predefiniti
        let preferencesFound = false;
        
        // PASSO 1: Cerca prima nei cookie del browser
        const cookieValue = this.getCookie(this.config.cookieName);
        if (cookieValue) {
            try {
                const savedConsent = JSON.parse(cookieValue);
                this.consent = { ...this.consent, ...savedConsent };
                console.log('Preferenze cookie caricate dal cookie locale:', this.consent);
                preferencesFound = true;
            } catch (e) {
                console.error('Errore nel parsing delle preferenze cookie:', e);
            }
        }
        
        // PASSO 2: Se non trovate nei cookie, usa i valori predefiniti
        if (!preferencesFound) {
            console.log('Nessuna preferenza trovata, utilizzo i valori predefiniti:', this.consent);
            
            // Salva i default nei cookie
            this.setCookie(
                this.config.cookieName,
                JSON.stringify(this.consent),
                this.config.cookieDuration
            );
        }
    }

    async savePreferences() {
        // Imposta il flag configured su true
        this.consent.configured = true;
        
        // PASSO 1: Salva nei cookie locali
        this.setCookie(
            this.config.cookieName,
            JSON.stringify(this.consent),
            this.config.cookieDuration
        );
        console.log('Preferenze salvate nei cookie locali:', this.consent);
        
        // PASSO 2: Salva le preferenze sul server tramite API (se disponibile)
        try {
            const response = await fetch(`${this.config.apiBaseUrl}/api/cookie-consent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.consent),
                credentials: 'include'
            });
            
            if (response.ok) {
                console.log('Preferenze cookie salvate anche sul server');
            } else {
                console.error('Errore nella risposta del server:', await response.text());
                // Non bloccare in caso di errore API - abbiamo già salvato nei cookie
            }
        } catch (error) {
            console.error('Errore nel salvataggio delle preferenze sul server:', error);
            // Non bloccare in caso di errore API - abbiamo già salvato nei cookie
        }
        
        // PASSO 3: Ricarica lo script di tracciamento per applicare le nuove preferenze
        this.loadTrackingScript(true);
        
        // Nascondi il banner
        this.hideBanner();
    }
    
    loadTrackingScript(reload = false) {
        // In una versione statica, invece di caricare lo script dal server,
        // genera il contenuto dello script basato sulle preferenze
        
        // Rimuovi script precedente se necessario
        if (reload) {
            const existingScript = document.getElementById('tracking-script');
            if (existingScript) {
                existingScript.remove();
            }
        }
        
        // Crea un nuovo script in-line
        const script = document.createElement('script');
        script.id = 'tracking-script';
        script.type = 'text/javascript';
        
        // Genera il contenuto dello script basato sulle preferenze
        let trackingCode = `
            console.log("Consenso utente:", ${JSON.stringify(this.consent)});
            console.log("Fonte consenso:", "cookie locale");
            window.userConsent = ${JSON.stringify(this.consent)};
        `;
        
        // Google Analytics - solo se il consenso analytics è true
        if (this.consent.analytics) {
            trackingCode += `
                // Google Analytics
                (function() {
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    gtag('js', new Date());
                    gtag('config', 'G-MBFTYV86P7');
                    
                    // Carica lo script GA
                    var gaScript = document.createElement('script');
                    gaScript.async = true;
                    gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-MBFTYV86P7';
                    document.head.appendChild(gaScript);
                    
                    console.log('Google Analytics attivato basato sul consenso utente');
                })();
            `;
        }
        
        // Meta Pixel - solo se il consenso marketing è true
        if (this.consent.marketing) {
            trackingCode += `
                // Meta Pixel
                (function() {
                    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
                    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
                    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
                    document,'script','https://connect.facebook.net/en_US/fbevents.js');
                    
                    // Inizializza pixel e invia PageView
                    window.fbEventId = 'event_' + new Date().getTime() + '_' + Math.random().toString(36).substring(2, 15);
                    fbq('init', '1543790469631614');
                    fbq('track', 'PageView', {}, {eventID: window.fbEventId});
                    
                    console.log('Meta Pixel attivato basato sul consenso utente, eventID:', window.fbEventId);
                })();
            `;
        }
        
        script.textContent = trackingCode;
        document.head.appendChild(script);
    }
    
    bindExistingBanner() {
        // Verifica se il banner esiste già
        const banner = document.getElementById('cookie-banner');
        
        if (banner) {
            // Se l'utente ha già configurato le preferenze, nascondi il banner
            if (this.consent.configured) {
                banner.classList.remove('show');
                return;
            }
            
            // Altrimenti, mostra il banner
            setTimeout(() => {
                banner.classList.add('show');
            }, 1000);
            
            // Collega gli eventi ai pulsanti
            const closeBtn = document.getElementById('cookie-close');
            const acceptBtn = document.getElementById('cookie-accept-all');
            const rejectBtn = document.getElementById('cookie-reject-all');
            
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.hideBanner());
            }
            
            if (acceptBtn) {
                acceptBtn.addEventListener('click', () => this.acceptAllCookies());
            }
            
            if (rejectBtn) {
                rejectBtn.addEventListener('click', () => this.rejectAllCookies());
            }
        } else {
            console.warn('Banner dei cookie non trovato nel DOM');
        }
    }

    /**
     * Accetta tutti i cookie
     */
    acceptAllCookies() {
        this.consent.essential = true;
        this.consent.analytics = true;
        this.consent.marketing = true;
        
        this.savePreferences();
    }

    /**
     * Rifiuta tutti i cookie eccetto quelli essenziali
     */
    rejectAllCookies() {
        this.consent.essential = true; // Sempre necessari
        this.consent.analytics = false;
        this.consent.marketing = false;
        
        this.savePreferences();
    }

    /**
     * Nasconde il banner dei cookie
     */
    hideBanner() {
        const banner = document.getElementById('cookie-banner');
        if (banner) {
            banner.classList.remove('show');
        }
    }

    /**
     * Ottiene il valore di un cookie
     */
    getCookie(name) {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.startsWith(name + '=')) {
                return cookie.substring(name.length + 1);
            }
        }
        return null;
    }

    /**
     * Imposta un cookie
     */
    setCookie(name, value, days) {
        let expires = '';
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = '; expires=' + date.toUTCString();
        }
        document.cookie = name + '=' + value + expires + '; path=/; SameSite=Lax';
    }

    /**
     * Cancella un cookie
     */
    deleteCookie(name) {
        this.setCookie(name, '', -1);
    }

    /**
     * Reset completo delle preferenze
     */
    async resetPreferences() {
        this.deleteCookie(this.config.cookieName);
        this.consent = {
            essential: true,
            analytics: false,
            marketing: false,
            configured: false
        };
        console.log('Preferenze cookie resettate');
        
        // Opzionale: Sincronizza con il server se disponibile
        try {
            await fetch(`${this.config.apiBaseUrl}/api/cookie-consent/reset`, {
                method: 'POST',
                credentials: 'include'
            });
        } catch (error) {
            console.error('Errore nella comunicazione con il server durante il reset:', error);
        }
        
        // Ricarica la pagina per mostrare il banner
        window.location.reload();
    }
}

// Handler per link di reset delle preferenze
function initCookieSettingsLinks() {
    document.querySelectorAll('.cookie-settings-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            if (window.cookieManager) {
                window.cookieManager.resetPreferences();
            } else {
                // Se il cookieManager non è inizializzato, elimina manualmente il cookie
                document.cookie = "user_cookie_consent=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                window.location.reload();
            }
        });
    });
}

// Inizializza il gestore dei cookie
function initCookieManager() {
    console.log('Inizializzazione Cookie Manager (Versione Statica)...');
    
    // Crea l'istanza del gestore
    window.cookieManager = new CookieConsentManager({
        // Puoi configurare l'URL dell'API qui se necessario
        apiBaseUrl: window.location.hostname === 'localhost' 
            ? 'http://localhost:3000' 
            : 'https://api.costruzionedigitale.com'
    });
    
    // Inizializza i link per reimpostare le preferenze
    initCookieSettingsLinks();
}

// Inizializza quando il DOM è caricato
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCookieManager);
} else {
    initCookieManager();
}