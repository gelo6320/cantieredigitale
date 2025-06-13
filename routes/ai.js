// routes/ai.js - Nuovo file per gli endpoint AI
const express = require('express');
const axios = require('axios');

const router = express.Router();

// Endpoint per l'analisi AI delle performance
router.post('/analyze-performance', async (req, res) => {
  try {
    console.log('[AI Analysis] Richiesta di analisi AI ricevuta');
    
    const { monthlyData, weeklyComparisons, timeRange } = req.body;
    
    if (!monthlyData || monthlyData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Dati mensili mancanti per l\'analisi'
      });
    }

    // Prepara il prompt per Claude AI
    const analysisPrompt = generateAnalysisPrompt(monthlyData, weeklyComparisons, timeRange);
    
    try {
      // Chiama Claude AI (sostituire con la chiave API reale)
      const claudeResponse = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-3-sonnet-20240229',
        max_tokens: 2000,
        temperature: 0.7,
        messages: [{
          role: 'user',
          content: analysisPrompt
        }]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        timeout: 30000
      });

      // Parsea la risposta di Claude
      const aiResponse = claudeResponse.data.content[0].text;
      const analysisResult = parseClaudeResponse(aiResponse, monthlyData, weeklyComparisons);
      
      console.log('[AI Analysis] Analisi completata con successo');
      res.json(analysisResult);
      
    } catch (claudeError) {
      console.warn('[AI Analysis] Claude AI non disponibile, generazione analisi di base:', claudeError.message);
      
      // Fallback ad analisi di base se Claude non è disponibile
      const basicAnalysis = generateBasicAnalysis(monthlyData, weeklyComparisons);
      res.json(basicAnalysis);
    }
    
  } catch (error) {
    console.error('[AI Analysis] Errore durante l\'analisi:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante l\'analisi AI',
      details: error.message
    });
  }
});

// Funzione per generare il prompt per Claude
function generateAnalysisPrompt(monthlyData, weeklyComparisons, timeRange) {
  const dataString = JSON.stringify(monthlyData, null, 2);
  const weeklyString = JSON.stringify(weeklyComparisons, null, 2);
  
  return `Sei un esperto analista di web analytics. Analizza i seguenti dati di performance di un sito web e fornisci un'analisi dettagliata.

DATI MENSILI (ultimi ${monthlyData.length} mesi):
${dataString}

CONFRONTI SETTIMANALI:
${weeklyString}

PERIODO ANALIZZATO: ${timeRange}

Per favore, fornisci un'analisi strutturata che includa:

1. **PUNTEGGIO GENERALE** (0-100): Valuta le performance complessive
2. **VERDETTO**: Una sintesi in italiano delle performance (2-3 frasi)
3. **TREND MENSILE**: "growing", "declining", o "stable"
4. **TREND SETTIMANALE**: "improving", "deteriorating", o "steady"
5. **INSIGHTS** (3-5 punti): Osservazioni chiave con:
   - Tipo: "positive", "negative", "warning", o "neutral"
   - Titolo conciso
   - Descrizione
   - Impatto: "high", "medium", "low"
   - Raccomandazione (opzionale)

6. **METRICHE CHIAVE**:
   - Mese migliore e peggiore
   - Crescita media percentuale
   - Punteggio di consistenza (0-100)

7. **PREVISIONI**:
   - Visite previste prossimo mese
   - Conversioni previste prossimo mese
   - Livello di confidenza (0-100)

Rispondi SOLO con un oggetto JSON valido seguendo questa struttura:
{
  "overallScore": number,
  "verdict": "string",
  "monthlyTrend": "growing|declining|stable",
  "weeklyTrend": "improving|deteriorating|steady",
  "insights": [
    {
      "type": "positive|negative|warning|neutral",
      "title": "string",
      "description": "string",
      "impact": "high|medium|low",
      "recommendation": "string"
    }
  ],
  "keyMetrics": {
    "bestMonth": "string",
    "worstMonth": "string",
    "averageGrowth": number,
    "consistencyScore": number
  },
  "predictions": {
    "nextMonthVisits": number,
    "nextMonthConversions": number,
    "confidence": number
  }
}

Concentrati su:
- Tendenze nei tassi di conversione
- Variazioni del traffico
- Bounce rate e tempo di permanenza
- Stabilità delle performance
- Segnali di crescita o declino
- Consigli pratici e attuabili

Scrivi in italiano e sii specifico con i numeri dai dati forniti.`;
}

// Funzione per parsare la risposta di Claude
function parseClaudeResponse(response, monthlyData, weeklyComparisons) {
  try {
    // Cerca di estrarre il JSON dalla risposta
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Valida che contenga i campi necessari
      if (parsed.overallScore && parsed.verdict && parsed.insights) {
        return parsed;
      }
    }
    
    // Se il parsing fallisce, genera analisi di base
    console.warn('[AI Analysis] Parsing della risposta Claude fallito, usando analisi di base');
    return generateBasicAnalysis(monthlyData, weeklyComparisons);
    
  } catch (error) {
    console.error('[AI Analysis] Errore nel parsing della risposta Claude:', error);
    return generateBasicAnalysis(monthlyData, weeklyComparisons);
  }
}

// Funzione per generare analisi di base (fallback)
function generateBasicAnalysis(monthlyData, weeklyComparisons) {
  const lastMonth = monthlyData[monthlyData.length - 1];
  const firstMonth = monthlyData[0];
  
  // Calcola crescita complessiva
  const totalGrowth = ((lastMonth.visits - firstMonth.visits) / firstMonth.visits) * 100;
  const conversionGrowth = ((lastMonth.conversionRate - firstMonth.conversionRate) / firstMonth.conversionRate) * 100;
  
  // Trova il mese migliore e peggiore
  const bestMonth = monthlyData.reduce((best, month) => 
    month.visits > best.visits ? month : best, monthlyData[0]);
  const worstMonth = monthlyData.reduce((worst, month) => 
    month.visits < worst.visits ? month : worst, monthlyData[0]);
  
  // Analizza trend settimanale
  const positiveWeeks = weeklyComparisons.filter(w => w.changePercent > 0).length;
  const weeklyTrend = positiveWeeks > weeklyComparisons.length / 2 ? 'improving' : 'steady';
  
  // Genera insights automatici
  const insights = [];
  
  if (totalGrowth > 10) {
    insights.push({
      type: 'positive',
      title: 'Crescita significativa del traffico',
      description: `Il traffico è cresciuto del ${totalGrowth.toFixed(1)}% nel periodo analizzato.`,
      impact: 'high',
      recommendation: 'Continuare con la strategia attuale e considerare di aumentare gli investimenti.'
    });
  } else if (totalGrowth < -5) {
    insights.push({
      type: 'negative',
      title: 'Declino nel traffico',
      description: `Il traffico è diminuito del ${Math.abs(totalGrowth).toFixed(1)}% nel periodo.`,
      impact: 'high',
      recommendation: 'Rivedere la strategia di marketing e identificare le cause del declino.'
    });
  }
  
  if (conversionGrowth > 5) {
    insights.push({
      type: 'positive',
      title: 'Miglioramento del tasso di conversione',
      description: `Il tasso di conversione è migliorato del ${conversionGrowth.toFixed(1)}%.`,
      impact: 'medium',
      recommendation: 'Analizzare i fattori che hanno contribuito al miglioramento per replicarli.'
    });
  }
  
  if (lastMonth.bounceRate < firstMonth.bounceRate) {
    const bounceImprovement = ((firstMonth.bounceRate - lastMonth.bounceRate) / firstMonth.bounceRate) * 100;
    insights.push({
      type: 'positive',
      title: 'Riduzione del bounce rate',
      description: `Il bounce rate è migliorato del ${bounceImprovement.toFixed(1)}%.`,
      impact: 'medium',
      recommendation: 'Continuare a ottimizzare il contenuto per mantenere gli utenti coinvolti.'
    });
  }
  
  // Calcola score generale
  let overallScore = 70; // Base score
  if (totalGrowth > 0) overallScore += Math.min(20, totalGrowth);
  if (conversionGrowth > 0) overallScore += Math.min(10, conversionGrowth);
  if (lastMonth.bounceRate < firstMonth.bounceRate) overallScore += 5;
  
  overallScore = Math.min(95, Math.max(30, Math.round(overallScore)));
  
  return {
    overallScore,
    verdict: totalGrowth > 0 
      ? `Le performance mostrano un trend positivo con una crescita del ${totalGrowth.toFixed(1)}% nel periodo analizzato.`
      : `Le performance necessitano di attenzione, con variazioni del ${totalGrowth.toFixed(1)}% da monitorare.`,
    monthlyTrend: totalGrowth > 5 ? 'growing' : totalGrowth < -5 ? 'declining' : 'stable',
    weeklyTrend,
    insights,
    keyMetrics: {
      bestMonth: bestMonth.month,
      worstMonth: worstMonth.month,
      averageGrowth: totalGrowth,
      consistencyScore: Math.max(50, 100 - (Math.abs(totalGrowth) > 20 ? 30 : 10))
    },
    predictions: {
      nextMonthVisits: Math.round(lastMonth.visits * (1 + (totalGrowth / 100))),
      nextMonthConversions: Math.round(lastMonth.conversions * (1 + (conversionGrowth / 100))),
      confidence: totalGrowth !== 0 ? Math.min(90, 60 + Math.abs(totalGrowth)) : 50
    }
  };
}

module.exports = router;