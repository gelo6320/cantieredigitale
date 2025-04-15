export default function handler(req, res) {
    // Leggi i cookie dalla richiesta
    const cookies = req.headers.cookie || '';
    const consentCookieName = 'user_cookie_consent';
    
    // Estrai il cookie di consenso
    let consent = { essential: true, analytics: false, marketing: false, configured: false };
    const consentCookie = cookies.split(';').find(c => c.trim().startsWith(`${consentCookieName}=`));
    
    if (consentCookie) {
      try {
        const consentValue = consentCookie.split('=')[1].trim();
        const parsedConsent = JSON.parse(decodeURIComponent(consentValue));
        consent = { ...consent, ...parsedConsent };
      } catch (e) {
        console.error('Errore nel parsing del cookie di consenso');
      }
    }
    
    console.log('Generando tracking.js con preferenze:', consent);
    
    // Genera il codice JavaScript in base alle preferenze
    let trackingCode = `
      console.log("Consenso utente:", ${JSON.stringify(consent)});
      console.log("Fonte consenso:", "cookie browser");
      window.userConsent = ${JSON.stringify(consent)};
    `;
    
    // Google Analytics - solo se il consenso analytics è true
    if (consent.analytics) {
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
    if (consent.marketing) {
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
    
    // Imposta l'header content-type e ritorna il codice
    res.setHeader('Content-Type', 'application/javascript');
    res.status(200).send(trackingCode);
  }