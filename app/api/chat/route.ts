import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Funktion zum Warten (für Retry)
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(req: Request) {
  // --- FIX FÜR "BODY UNUSABLE" ---
  // Wir lesen die Daten VOR der Schleife aus.
  // So können wir sie in jedem Versuch wiederverwenden.
  let requestBody;
  try {
    requestBody = await req.json();
  } catch (e) {
    return NextResponse.json({ error: "Ungültige Anfrage-Daten" }, { status: 400 });
  }

  const { message, history } = requestBody;

  // Retry-Variablen
  let retryCount = 0;
  const maxRetries = 2;

  while (retryCount <= maxRetries) {
    try {
      // STRATEGIE: Beim ersten Versuch 2.5, bei Retries (Fallback) auf 1.5 wechseln
      // Das garantiert, dass der User eine Antwort bekommt, auch wenn 2.5 down ist.
      const currentModelName = (retryCount === 0) ? "gemini-3.0-flash" : "gemini-2.5-flash";

      console.log(`Versuch ${retryCount + 1}: Nutze Modell ${currentModelName}`);

      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      ];

      const model = genAI.getGenerativeModel({
        model: currentModelName,
        safetySettings: safetySettings
      });

      // History aufbereiten
      const conversationHistory = Array.isArray(history)
        ? history.map((entry: any) => `${entry.role === "user" ? "Kunde" : "Assistent"}: ${entry.text}`).join("\n")
        : "";

      // Begrüßung
      const isFirstMessage = !history || history.length === 0;
      const greetingInstruction = isFirstMessage
        ? "Starte deine Antwort mit einem freundlichen 'Moin'."
        : "Verzichte auf Begrüßungen wie 'Moin'. Antworte direkt.";

      // Prompt
      const prompt = `
        ROLLE:
        Du bist der "KI KFZ-Meister von Dennin Gettorf". Nenne den Namen nur bei expliziter Nachfrage.
        
        TONALITY & PSYCHOLOGIE (WICHTIG!):
        - Du bist NICHT nur eine Datenbank, sondern ein Kümmerer.
        - ${greetingInstruction}
        - **Emotional abholen:** Kunden mit Autoproblemen sind gestresst. Beginne IMMER mit einer beruhigenden oder verständnisvollen Einleitung (z.B. "Das ist ärgerlich, aber das kriegen wir hin." oder "Keine Sorge, das schauen wir uns an.").
        - **Erklären statt nur Anweisen:** Gib nicht nur Befehle ("Prüf den Ölstand"), sondern erkläre kurz, *warum* oder *was* die Ursache sein könnte (z.B. "Es könnte sein, dass einfach nur eine Sicherung durch ist oder die Pumpe klemmt.").
        
        UNSERE LEISTUNGEN (Alles im Haus, außer Lackierung!):
        - SPEZIALISTEN: Wir sind Ford-Spezialisten (Ehemaliges Autohaus, 25+ Jahre Erfahrung, Original-Diagnose).
        - WARTUNG: Inspektion nach Herstellervorgabe (alle Marken), digitaler Serviceeintrag.
        - TECHNIK: Diagnose & Elektrik (Modernste Prüftechnik), ADAS-Kalibrierung (Kameras/Sensoren einstellen).
        - MECHANIK: Bremsen, Fahrwerk, Achsvermessung, Klima, HU/AU.
        - WICHTIG: Lackierarbeiten -> Partner. Alles andere -> Wir selbst!
        
        DEINE DIAGNOSE-STRATEGIE (Die 3-Schritte-Antwort):
        1. **Beruhigung & Empathie:** Reagiere auf den Frust des Kunden.
        2. **Erste Einschätzung/Ursachen:** Nenne 1-2 mögliche Gründe für das Problem (z.B. Sicherung, Pumpe, Sensor), damit der Kunde merkt: "Der hat Ahnung".
        3. **Lösungsweg:**
           - Bei Kleinigkeiten (Wischwasser, Reifendruck): Gib einen Tipp zur Selbsthilfe + Erklärung (z.B. "Schau mal ins Handbuch, das variiert je nach Modell").
           - Bei Defekten/Unsicherheit: "Da müssen wir wohl mal genauer draufschauen. Komm am besten vorbei."
           - Bei Roter Lampe/Gefahr: "Bitte Auto stehen lassen & anrufen!"
        
        FAKTEN:
        - Öffnungszeiten: Mo-Fr 7:30 - 17:00. Tel: 04346 9955.
        - Adresse: Kieler Ch 55, 24214 Gettorf
        
        VERLAUF DES GESPRÄCHS BISHER:
        ${conversationHistory}
        
        NEUE KUNDENANFRAGE: "${message}"
        
        ANTWORT (Empathisch, erklärend, in ganzen Sätzen):
    `;

      const result = await model.generateContent(prompt);
      const response = await result.response;

      // Wenn wir hier sind, hat es geklappt! Raus aus der Schleife.
      return NextResponse.json({ reply: response.text() });

    } catch (error: any) {
      console.error(`Fehler bei Versuch ${retryCount + 1}:`, error.message);

      // Prüfen ob es ein Server-Fehler ist (503) oder Modell nicht gefunden
      const isServerIssue = error.message.includes("503") || error.message.includes("overloaded") || error.message.includes("not found");

      if (isServerIssue && retryCount < maxRetries) {
        retryCount++;
        // Kurze Pause vor dem nächsten Versuch (1 Sekunde)
        await wait(1000);
        continue; // Nächster Schleifen-Durchlauf
      }

      // Wenn es kein Server-Fehler ist ODER wir keine Versuche mehr haben: Abbruch.
      return NextResponse.json({ error: "Der Meister ist gerade schwer beschäftigt." }, { status: 500 });
    }
  }

  // Fallback (sollte eigentlich durch return oben nicht erreicht werden)
  return NextResponse.json({ error: "Server Timeout" }, { status: 504 });
}