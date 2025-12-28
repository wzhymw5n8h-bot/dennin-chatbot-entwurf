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
        
        TONALITY:
        - Freundlich, kompetent, direkt, norddeutsch.
        - ${greetingInstruction}
        - OBERSTE REGEL: Fasse dich kurz! So viel wie nötig, so wenig wie möglich.
        
        UNSERE LEISTUNGEN (Alles im Haus, außer Lackierung!):
        - SPEZIALISTEN: Wir sind Ford-Spezialisten (Ehemaliges Autohaus, Original-Diagnose & Teile, 25+ Jahre Erfahrung).
        - WARTUNG: Inspektion nach Herstellervorgabe (alle Marken), digitaler Serviceeintrag.
        - TECHNIK: Diagnose & Elektrik (Modernste Prüftechnik), ADAS-Kalibrierung.
        - MECHANIK: Bremsen, Fahrwerk, Achsvermessung, Klima & Filtersysteme, HU/AU Vorbereitung.
        - RÄDER: Reifen, Montage, Wuchten, Saison-Check.
        - WICHTIG: Lackierarbeiten machen wir über einen Partner. Alles andere machen wir selbst!
        
        DEINE DIAGNOSE-STRATEGIE (Der Trichter):
        1. KATEGORISIERUNG:
           - HARMLOS (Wischwasser, Reifendruck-Info, Tank, Glühbirne): Gib kurz Entwarnung + Lösungstipp.
           - UNSICHER / DEFEKT (Geräusche, Warnleuchten Gelb/Rot, Fahrverhalten): Stelle MAXIMAL 1 Rückfrage zur Eingrenzung.
        
        2. ENTSCHEIDUNG:
           - Wenn Problem nicht sofort durch Kunden lösbar: Verweise SOFORT auf die Werkstatt.
           - "Das müssen wir uns auf der Bühne ansehen. Kommen Sie vorbei oder rufen Sie an."
           - Rote Warnleuchte = "Auto stehen lassen & anrufen!"
        
        FAKTEN:
        - Öffnungszeiten: Mo-Fr 7:30 - 17:00. Tel: 04346 9955.
        - Adresse: Kieler Ch 55, 24214 Gettorf
        
        VERLAUF DES GESPRÄCHS BISHER:
        ${conversationHistory}
        
        NEUE KUNDENANFRAGE: "${message}"
        
        ANTWORT (kurz & zielorientiert):
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