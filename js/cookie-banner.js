document.addEventListener('DOMContentLoaded', function() {
    // Elementi
    const cookieBanner = document.getElementById('cookie-banner');
    const cookieClose = document.getElementById('cookie-close');
    const cookieSave = document.getElementById('cookie-save');
    const cookieAcceptAll = document.getElementById('cookie-accept-all');
    const analyticsCookies = document.getElementById('analytics-cookies');
    const marketingCookies = document.getElementById('marketing-cookies');
    
    // Controllo se le preferenze sono già state impostate
    checkCookieConsent();
    
    // Eventi
    if (cookieClose) {
        cookieClose.addEventListener('click', function() {
            hideCookieBanner();
        });
    }
    
    if (cookieSave) {
        cookieSave.addEventListener('click', function() {
            savePreferences();
        });
    }
    
    if (cookieAcceptAll) {
        cookieAcceptAll.addEventListener('click', function() {
            acceptAllCookies();
        });
    }
    
    // Funzioni
    function checkCookieConsent() {
        fetch('/api/cookie-consent')
            .then(response => response.json())
            .then(data => {
                if (!data.configured) {
                    // Se non ci sono preferenze, mostra il banner
                    showCookieBanner();
                } else {
                    // Altrimenti, imposta le preferenze recuperate
                    if (analyticsCookies) analyticsCookies.checked = data.analytics;
                    if (marketingCookies) marketingCookies.checked = data.marketing;
                    
                    // Applica le preferenze
                    applyPreferences(data);
                }
            })
            .catch(error => {
                console.error('Errore nel recupero delle preferenze cookie:', error);
                showCookieBanner();
            });
    }
    
    function showCookieBanner() {
        if (cookieBanner) {
            setTimeout(() => {
                cookieBanner.classList.add('show');
            }, 1000);
        }
    }
    
    function hideCookieBanner() {
        if (cookieBanner) {
            cookieBanner.classList.remove('show');
        }
    }
    
    function savePreferences() {
        const preferences = {
            essential: true, // Sempre abilitato
            analytics: analyticsCookies ? analyticsCookies.checked : false,
            marketing: marketingCookies ? marketingCookies.checked : false
        };
        
        saveCookiePreferences(preferences);
    }
    
    function acceptAllCookies() {
        const preferences = {
            essential: true,
            analytics: true,
            marketing: true
        };
        
        // Aggiorna anche i toggle nella UI
        if (analyticsCookies) analyticsCookies.checked = true;
        if (marketingCookies) marketingCookies.checked = true;
        
        saveCookiePreferences(preferences);
    }
    
    function saveCookiePreferences(preferences) {
        fetch('/api/cookie-consent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(preferences),
        })
        .then(response => response.json())
        .then(data => {
            console.log('Preferenze cookie salvate:', data);
            
            // Applica le preferenze
            applyPreferences(preferences);
            
            // Nascondi il banner
            hideCookieBanner();
        })
        .catch(error => {
            console.error('Errore nel salvataggio delle preferenze cookie:', error);
        });
    }
    
    function applyPreferences(preferences) {
        // Applica le preferenze cookie all'applicazione
        // Questo è solo un esempio, devi adattarlo alle specifiche necessità
        
        // Esempio: Google Analytics
        if (preferences.analytics) {
            enableGoogleAnalytics();
        } else {
            disableGoogleAnalytics();
        }
        
        // Esempio: Cookie di marketing
        if (preferences.marketing) {
            enableMarketingCookies();
        } else {
            disableMarketingCookies();
        }
    }
    
    // Funzioni per abilitare/disabilitare servizi specifici
    function enableGoogleAnalytics() {
        // Codice per abilitare Google Analytics
        console.log('Google Analytics abilitato');
        
        // Esempio di codice per Google Analytics (commenta se non lo utilizzi)
        /*
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'UA-XXXXXXXX-X', { 'anonymize_ip': true });
        
        const gaScript = document.createElement('script');
        gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=UA-XXXXXXXX-X';
        gaScript.async = true;
        document.head.appendChild(gaScript);
        */
    }
    
    function disableGoogleAnalytics() {
        // Codice per disabilitare Google Analytics
        console.log('Google Analytics disabilitato');
        
        // Disabilitare ogni tracciamento da Google Analytics
        // Questo richiede logiche più complesse per una vera disabilitazione
        
        // Esempio: rimuovere lo script se esiste
        /*
        const gaScript = document.querySelector('script[src*="googletagmanager.com/gtag/js"]');
        if (gaScript) {
            gaScript.remove();
        }
        
        // Sovrascrivere la funzione gtag per non fare nulla
        window.gtag = function() {
            console.log('Google Analytics è disabilitato.');
        };
        */
    }
    
    function enableMarketingCookies() {
        // Codice per abilitare cookie di marketing/pubblicità
        console.log('Cookie di marketing abilitati');
        
        // Esempio: Facebook Pixel
        /*
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', 'PIXEL-ID-HERE');
        fbq('track', 'PageView');
        */
    }
    
    function disableMarketingCookies() {
        // Codice per disabilitare cookie di marketing
        console.log('Cookie di marketing disabilitati');
        
        // Disabilitare i pixel pubblicitari, script di remarketing, ecc.
        // Esempio per Facebook:
        /*
        if (window.fbq) {
            window.fbq = function() {
                console.log('Facebook Pixel è disabilitato.');
            };
        }
        */
    }
    
    // Aggiungi pulsante per riaprire le preferenze cookie
    const cookieSettingsLinks = document.querySelectorAll('.cookie-settings-link');
    cookieSettingsLinks.forEach(link => {
        if (link) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                showCookieBanner();
            });
        }
    });
});