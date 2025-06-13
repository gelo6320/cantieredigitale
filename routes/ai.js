// routes/ai.js - Configurazione aggiornata Claude 4 con parsing robusto
const express = require('express');
const axios = require('axios');

const router = express.Router();

// Endpoint per l'analisi AI delle performance
router.post('/analyze-performance', async (req, res) => {
  try {
    console.log('[AI Analysis] Richiesta di analisi AI ricevuta');
    
    const { monthlyData, weeklyComparisons, timeRange, additionalContext } = req.body;
    
    if (!monthlyData || monthlyData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Dati mensili mancanti per l\'analisi'
      });
    }

    // Prepara il prompt ottimizzato per Claude 4
    const analysisPrompt = generateClaudePrompt(monthlyData, weeklyComparisons, timeRange, additionalContext);
    
    try {
      // ✅ Configurazione corretta per Claude 4
      const claudeResponse = await axios.post('https://api.anthropic.com/v1/messages', {
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514', // ✅ Claude 4 Sonnet configurabile
        max_tokens: 8000, // ✅ Aumentato per risposte complete
        temperature: 0.1, // ✅ Molto basso per output JSON consistente
        // ✅ System prompt specifico per JSON
        system: `Sei un esperto analista di web analytics. Il tuo compito è analizzare i dati di performance e restituire ESCLUSIVAMENTE un oggetto JSON valido.

REGOLE CRITICHE:
1. Rispondi SOLO con JSON valido, senza markdown, commenti o testo aggiuntivo
2. Non utilizzare \`\`\`json o altri wrapper
3. Inizia direttamente con { e termina con }
4. Tutti i campi sono obbligatori
5. Gli insights devono essere array con almeno 3 elementi
6. I numeri devono essere validi (non NaN o undefined)`,
        messages: [{
          role: 'user',
          content: analysisPrompt
        }]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-12-22' // ✅ Versione più recente
        },
        timeout: 60000 // ✅ 60 secondi per Claude 4
      });

      // ✅ Parsing robusto e migliorato
      const aiResponse = claudeResponse.data.content[0].text;
      const analysisResult = parseClaudeResponseRobust(aiResponse, monthlyData, weeklyComparisons);
      
      console.log('[AI Analysis] Analisi Claude 4 completata con successo');
      res.json(analysisResult);
      
    } catch (claudeError) {
      console.warn('[AI Analysis] Errore Claude 4:', claudeError.message);
      
      // Logging dettagliato per debug
      if (claudeError.response) {
        console.error('[AI Analysis] Response status:', claudeError.response.status);
        console.error('[AI Analysis] Response data:', claudeError.response.data);
      }
      
      // Fallback intelligente
      const basicAnalysis = generateEnhancedBasicAnalysis(monthlyData, weeklyComparisons, additionalContext);
      res.json({
        ...basicAnalysis,
        _meta: {
          source: 'fallback_analysis',
          reason: 'claude_unavailable',
          timestamp: new Date().toISOString()
        }
      });
    }
    
  } catch (error) {
    console.error('[AI Analysis] Errore generale:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante l\'analisi AI',
      details: error.message
    });
  }
});

// ✅ Prompt ottimizzato per Claude 4 con output JSON strutturato
function generateClaudePrompt(monthlyData, weeklyComparisons, timeRange, additionalContext = {}) {
  const prompt = `Analizza questi dati di performance web e restituisci un'analisi dettagliata.

DATI MENSILI (${monthlyData.length} periodi):
${JSON.stringify(monthlyData, null, 2)}

CONFRONTI PERIODICI:
${JSON.stringify(weeklyComparisons, null, 2)}

CONTESTO:
- Periodo analizzato: ${timeRange}
- Fonte dati: ${additionalContext.dataSource || 'analytics_reali'}
- Landing pages totali: ${additionalContext.totalLandingPages || 'N/A'}

ANALIZZA E RESTITUISCI ESCLUSIVAMENTE QUESTO JSON (senza markdown):

{
  "overallScore": <numero 0-100>,
  "verdict": "<analisi sintetica in italiano, 2-3 frasi sui risultati principali>",
  "monthlyTrend": "<growing|declining|stable>",
  "weeklyTrend": "<improving|deteriorating|steady>",
  "insights": [
    {
      "type": "<positive|negative|warning|neutral>",
      "title": "<titolo insight>",
      "description": "<descrizione dettagliata>",
      "impact": "<high|medium|low>",
      "recommendation": "<consiglio pratico>"
    }
  ],
  "keyMetrics": {
    "bestMonth": "<nome mese migliore>",
    "worstMonth": "<nome mese peggiore>",
    "averageGrowth": <percentuale crescita>,
    "consistencyScore": <numero 0-100>
  },
  "predictions": {
    "nextMonthVisits": <numero previsto>,
    "nextMonthConversions": <numero previsto>,
    "confidence": <numero 0-100>
  }
}

Genera almeno 4 insights specifici basati sui dati reali. Concentrati su:
- Tendenze traffico e conversioni
- Variazioni bounce rate
- Performance periodi specifici
- Raccomandazioni concrete`;

  return prompt;
}

// ✅ Parser robusto per Claude 4 con multiple strategie di fallback
function parseClaudeResponseRobust(response, monthlyData, weeklyComparisons) {
  console.log('[AI Analysis] Inizio parsing risposta Claude 4');
  
  try {
    // Strategia 1: Pulizia aggressiva del testo
    let cleanResponse = response.trim();
    
    // Rimuovi tutti i possibili wrapper markdown
    cleanResponse = cleanResponse
      .replace(/^```json\s*/gm, '')
      .replace(/^```\s*/gm, '')
      .replace(/```$/gm, '')
      .replace(/^\s*```.*$/gm, '')
      .trim();
    
    // Strategia 2: Estrazione JSON con regex multipli
    const jsonPatterns = [
      /\{[\s\S]*\}/,  // Pattern base
      /(\{[\s\S]*?"predictions"[\s\S]*?\})/,  // Pattern con predictions
      /(\{[\s\S]*?"insights"[\s\S]*?\})/  // Pattern con insights
    ];
    
    let parsed = null;
    
    for (const pattern of jsonPatterns) {
      const match = cleanResponse.match(pattern);
      if (match) {
        try {
          const candidate = match[0];
          parsed = JSON.parse(candidate);
          
          // Validazione struttura
          if (validateClaudeResponse(parsed)) {
            console.log('[AI Analysis] Parsing JSON riuscito con pattern:', pattern.toString());
            break;
          }
        } catch (e) {
          console.warn('[AI Analysis] Tentativo parsing fallito:', e.message);
          continue;
        }
      }
    }
    
    // Strategia 3: Se parsing fallisce, prova a riparare JSON comuni
    if (!parsed) {
      console.log('[AI Analysis] Tentativo riparazione JSON...');
      
      // Riparazione JSON malformato comune
      const repairedJson = repairCommonJsonIssues(cleanResponse);
      try {
        parsed = JSON.parse(repairedJson);
        if (validateClaudeResponse(parsed)) {
          console.log('[AI Analysis] JSON riparato con successo');
        } else {
          parsed = null;
        }
      } catch (e) {
        console.warn('[AI Analysis] Riparazione JSON fallita:', e.message);
      }
    }
    
    // Strategia 4: Se tutto fallisce, usa analisi di base ma con i dati Claude parziali
    if (!parsed) {
      console.warn('[AI Analysis] Parsing completamente fallito, uso analisi di base');
      return generateEnhancedBasicAnalysis(monthlyData, weeklyComparisons, {
        claudeRawResponse: response.substring(0, 500),
        parsingFailed: true
      });
    }
    
    // ✅ Sanitizzazione e validazione finale
    return sanitizeClaudeResponse(parsed, monthlyData, weeklyComparisons);
    
  } catch (error) {
    console.error('[AI Analysis] Errore critico nel parsing:', error);
    return generateEnhancedBasicAnalysis(monthlyData, weeklyComparisons, {
      parseError: error.message
    });
  }
}

// ✅ Validazione struttura risposta Claude
function validateClaudeResponse(parsed) {
  const requiredFields = ['overallScore', 'verdict', 'monthlyTrend', 'weeklyTrend', 'insights', 'keyMetrics', 'predictions'];
  
  // Verifica campi principali
  for (const field of requiredFields) {
    if (!parsed.hasOwnProperty(field)) {
      console.warn('[AI Analysis] Campo mancante:', field);
      return false;
    }
  }
  
  // Verifica insights array
  if (!Array.isArray(parsed.insights) || parsed.insights.length === 0) {
    console.warn('[AI Analysis] Insights non validi');
    return false;
  }
  
  // Verifica tipi numerici
  if (isNaN(parsed.overallScore) || isNaN(parsed.keyMetrics?.averageGrowth)) {
    console.warn('[AI Analysis] Valori numerici non validi');
    return false;
  }
  
  return true;
}

// ✅ Riparazione JSON comuni (virgole extra, quote mancanti, etc.)
function repairCommonJsonIssues(jsonString) {
  return jsonString
    // Rimuovi virgole prima di }
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']')
    // Ripara quote mancanti su chiavi
    .replace(/(\w+):/g, '"$1":')
    // Ripara virgole multiple
    .replace(/,{2,}/g, ',')
    // Rimuovi caratteri non printabili
    .replace(/[\x00-\x1F\x7F]/g, '');
}

// ✅ Sanitizzazione risposta Claude
function sanitizeClaudeResponse(parsed, monthlyData, weeklyComparisons) {
  // Sanitizza valori numerici
  parsed.overallScore = Math.max(0, Math.min(100, parseInt(parsed.overallScore) || 70));
  
  if (parsed.keyMetrics) {
    parsed.keyMetrics.averageGrowth = parseFloat(parsed.keyMetrics.averageGrowth) || 0;
    parsed.keyMetrics.consistencyScore = Math.max(0, Math.min(100, parseInt(parsed.keyMetrics.consistencyScore) || 70));
  }
  
  if (parsed.predictions) {
    parsed.predictions.nextMonthVisits = Math.max(0, parseInt(parsed.predictions.nextMonthVisits) || 0);
    parsed.predictions.nextMonthConversions = Math.max(0, parseInt(parsed.predictions.nextMonthConversions) || 0);
    parsed.predictions.confidence = Math.max(0, Math.min(100, parseInt(parsed.predictions.confidence) || 50));
  }
  
  // Assicura insights validi
  if (!Array.isArray(parsed.insights) || parsed.insights.length === 0) {
    parsed.insights = generateBasicInsights(monthlyData, weeklyComparisons);
  }
  
  // Valida trend values
  const validMonthlyTrends = ['growing', 'declining', 'stable'];
  const validWeeklyTrends = ['improving', 'deteriorating', 'steady'];
  
  if (!validMonthlyTrends.includes(parsed.monthlyTrend)) {
    parsed.monthlyTrend = 'stable';
  }
  
  if (!validWeeklyTrends.includes(parsed.weeklyTrend)) {
    parsed.weeklyTrend = 'steady';
  }
  
  return {
    ...parsed,
    _meta: {
      source: 'claude_4_analysis',
      model: 'claude-sonnet-4',
      timestamp: new Date().toISOString(),
      dataPoints: monthlyData.length
    }
  };
}

// ✅ Analisi di base potenziata con più logica
function generateEnhancedBasicAnalysis(monthlyData, weeklyComparisons, context = {}) {
  if (!monthlyData || monthlyData.length === 0) {
    return getEmptyAnalysis();
  }
  
  const lastMonth = monthlyData[monthlyData.length - 1];
  const firstMonth = monthlyData[0];
  
  // Calcoli avanzati
  const totalGrowth = firstMonth.visits > 0 ? ((lastMonth.visits - firstMonth.visits) / firstMonth.visits) * 100 : 0;
  const conversionGrowth = firstMonth.conversionRate > 0 ? ((lastMonth.conversionRate - firstMonth.conversionRate) / firstMonth.conversionRate) * 100 : 0;
  
  // Trova trend e variazioni
  const bestMonth = monthlyData.reduce((best, month) => month.visits > best.visits ? month : best, monthlyData[0]);
  const worstMonth = monthlyData.reduce((worst, month) => month.visits < worst.visits ? month : worst, monthlyData[0]);
  
  // Analisi stabilità
  const avgVisits = monthlyData.reduce((sum, m) => sum + m.visits, 0) / monthlyData.length;
  const varianceVisits = monthlyData.reduce((sum, m) => sum + Math.pow(m.visits - avgVisits, 2), 0) / monthlyData.length;
  const cvVisits = Math.sqrt(varianceVisits) / avgVisits;
  const consistencyScore = Math.max(0, Math.min(100, Math.round((1 - cvVisits) * 100)));
  
  // Genera insights intelligenti
  const insights = generateAdvancedInsights(monthlyData, weeklyComparisons, {
    totalGrowth,
    conversionGrowth,
    bestMonth,
    worstMonth,
    consistencyScore
  });
  
  // Score compositivo
  let overallScore = 50; // Base score
  if (totalGrowth > 0) overallScore += Math.min(25, totalGrowth * 2);
  if (conversionGrowth > 0) overallScore += Math.min(15, conversionGrowth);
  if (consistencyScore > 70) overallScore += 10;
  overallScore = Math.min(95, Math.max(20, Math.round(overallScore)));
  
  // Trend analysis
  const monthlyTrend = totalGrowth > 10 ? 'growing' : totalGrowth < -10 ? 'declining' : 'stable';
  const positiveWeeks = weeklyComparisons?.filter(w => w.changePercent > 0).length || 0;
  const weeklyTrend = positiveWeeks > (weeklyComparisons?.length || 1) / 2 ? 'improving' : 'steady';
  
  return {
    overallScore,
    verdict: generateIntelligentVerdict(totalGrowth, conversionGrowth, consistencyScore, monthlyData.length),
    monthlyTrend,
    weeklyTrend,
    insights,
    keyMetrics: {
      bestMonth: bestMonth.month,
      worstMonth: worstMonth.month,
      averageGrowth: Math.round(totalGrowth * 10) / 10,
      consistencyScore
    },
    predictions: {
      nextMonthVisits: Math.round(lastMonth.visits * (1 + (totalGrowth / 100) * 0.5)),
      nextMonthConversions: Math.round(lastMonth.conversions * (1 + (conversionGrowth / 100) * 0.3)),
      confidence: Math.min(85, 40 + consistencyScore * 0.5)
    },
    _meta: {
      source: 'enhanced_basic_analysis',
      reason: context.claudeRawResponse ? 'claude_parsing_failed' : 'claude_unavailable',
      timestamp: new Date().toISOString(),
      fallbackUsed: true
    }
  };
}

// ✅ Generazione insights avanzati
function generateAdvancedInsights(monthlyData, weeklyComparisons, metrics) {
  const insights = [];
  
  // Insight crescita traffico
  if (metrics.totalGrowth > 15) {
    insights.push({
      type: 'positive',
      title: 'Crescita significativa del traffico',
      description: `Il traffico è cresciuto del ${metrics.totalGrowth.toFixed(1)}% nel periodo analizzato, superando la media del settore.`,
      impact: 'high',
      recommendation: 'Analizzare i canali di acquisizione più performanti e investire maggiori risorse nelle strategie che stanno funzionando.'
    });
  } else if (metrics.totalGrowth < -10) {
    insights.push({
      type: 'negative',
      title: 'Declino del traffico preoccupante',
      description: `Il traffico è diminuito del ${Math.abs(metrics.totalGrowth).toFixed(1)}% nel periodo, richiedendo interventi immediati.`,
      impact: 'high',
      recommendation: 'Rivedere la strategia SEO e marketing, verificare problemi tecnici e analizzare la concorrenza.'
    });
  }
  
  // Insight conversioni
  if (metrics.conversionGrowth > 10) {
    insights.push({
      type: 'positive',
      title: 'Ottimizzazione conversioni efficace',
      description: `Il tasso di conversione è migliorato del ${metrics.conversionGrowth.toFixed(1)}%, indicando un'esperienza utente ottimizzata.`,
      impact: 'medium',
      recommendation: 'Documentare le modifiche che hanno portato al miglioramento e replicarle su altre pagine.'
    });
  } else if (metrics.conversionGrowth < -5) {
    insights.push({
      type: 'warning',
      title: 'Calo nelle conversioni',
      description: `Il tasso di conversione è peggiorato del ${Math.abs(metrics.conversionGrowth).toFixed(1)}%, richiedendo analisi approfondita.`,
      impact: 'medium',
      recommendation: 'Testare A/B le pagine di conversione e verificare eventuali problemi nel funnel di acquisto.'
    });
  }
  
  // Insight consistenza
  if (metrics.consistencyScore > 80) {
    insights.push({
      type: 'positive',
      title: 'Performance stabile e affidabile',
      description: `Il punteggio di consistenza del ${metrics.consistencyScore}% indica performance molto stabili nel tempo.`,
      impact: 'medium',
      recommendation: 'Mantenere la strategia attuale e pianificare crescita graduale senza compromettere la stabilità.'
    });
  } else if (metrics.consistencyScore < 50) {
    insights.push({
      type: 'warning',
      title: 'Variabilità elevata nelle performance',
      description: `La consistenza del ${metrics.consistencyScore}% suggerisce fattori esterni che influenzano le performance.`,
      impact: 'medium',
      recommendation: 'Identificare i fattori che causano variabilità e implementare strategie per stabilizzare le performance.'
    });
  }
  
  // Insight stagionalità/pattern
  const recentMonths = monthlyData.slice(-3);
  const isUpwardTrend = recentMonths.every((month, i) => i === 0 || month.visits >= recentMonths[i-1].visits);
  
  if (isUpwardTrend && recentMonths.length >= 3) {
    insights.push({
      type: 'positive',
      title: 'Trend crescente consolidato',
      description: 'Gli ultimi tre periodi mostrano una crescita costante, indicando momentum positivo.',
      impact: 'medium',
      recommendation: 'Accelerare gli investimenti marketing per capitalizzare sul momentum positivo.'
    });
  }
  
  // Assicura almeno 3 insights
  while (insights.length < 3) {
    insights.push({
      type: 'neutral',
      title: 'Monitoraggio continuo necessario',
      description: 'Continuare a monitorare le metriche per identificare trend emergenti e opportunità di ottimizzazione.',
      impact: 'low',
      recommendation: 'Implementare dashboard automatizzati per tracciare KPI chiave in tempo reale.'
    });
  }
  
  return insights.slice(0, 5); // Massimo 5 insights
}

// ✅ Verdetto intelligente basato sui dati
function generateIntelligentVerdict(totalGrowth, conversionGrowth, consistencyScore, dataPoints) {
  if (totalGrowth > 15 && conversionGrowth > 5) {
    return `Performance eccellenti con crescita del traffico del ${totalGrowth.toFixed(1)}% e miglioramento conversioni del ${conversionGrowth.toFixed(1)}%. La strategia attuale sta dando risultati ottimi.`;
  } else if (totalGrowth > 5) {
    return `Crescita positiva del ${totalGrowth.toFixed(1)}% nel traffico. Le performance sono in miglioramento con buone prospettive future.`;
  } else if (totalGrowth < -10) {
    return `Declino significativo del ${Math.abs(totalGrowth).toFixed(1)}% richiede interventi immediati per invertire il trend negativo.`;
  } else if (consistencyScore > 80) {
    return `Performance stabili e consistenti su ${dataPoints} periodi analizzati. Base solida per crescita futura.`;
  } else {
    return `Performance variabili nel periodo analizzato. Necessario monitoraggio continuo per identificare pattern e ottimizzazioni.`;
  }
}

// ✅ Insights di base per fallback
function generateBasicInsights(monthlyData, weeklyComparisons) {
  return [
    {
      type: 'neutral',
      title: 'Analisi automatica in corso',
      description: 'I dati sono stati elaborati automaticamente. Potrebbero essere necessarie analisi più approfondite.',
      impact: 'medium',
      recommendation: 'Verificare la configurazione dell\'AI e ripetere l\'analisi con dati aggiornati.'
    }
  ];
}

// ✅ Analisi vuota per casi estremi
function getEmptyAnalysis() {
  return {
    overallScore: 0,
    verdict: 'Dati insufficienti per generare un\'analisi significativa.',
    monthlyTrend: 'stable',
    weeklyTrend: 'steady',
    insights: [{
      type: 'warning',
      title: 'Dati insufficienti',
      description: 'Non ci sono abbastanza dati per generare un\'analisi affidabile.',
      impact: 'high',
      recommendation: 'Verificare la raccolta dati e attendere più periodi per un\'analisi completa.'
    }],
    keyMetrics: {
      bestMonth: 'N/A',
      worstMonth: 'N/A',
      averageGrowth: 0,
      consistencyScore: 0
    },
    predictions: {
      nextMonthVisits: 0,
      nextMonthConversions: 0,
      confidence: 0
    },
    _meta: {
      source: 'empty_analysis',
      reason: 'no_data',
      timestamp: new Date().toISOString()
    }
  };
}

module.exports = router;