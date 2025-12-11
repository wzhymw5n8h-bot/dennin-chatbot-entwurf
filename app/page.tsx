"use client";

import { useState, useRef, useEffect } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<{ role: string; text: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Ref für das automatische Scrollen (wie ein Anker im HTML)
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // React Hook: Feuert jedes Mal, wenn sich 'chat' oder 'isLoading' ändert
  useEffect(() => {
    scrollToBottom();
  }, [chat, isLoading]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const newChat = [...chat, { role: "user", text: input }];
    setChat(newChat);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: input, history: newChat }),
      });

      if (!res.ok) throw new Error("Netzwerk Fehler");

      const data = await res.json();
      setChat([...newChat, { role: "bot", text: data.reply }]);
    } catch (error) {
      setChat([...newChat, { role: "bot", text: "Tut mir leid, die Verbindung zur Werkstatt ist gerade unterbrochen." }]);
    } finally {
      setIsLoading(false);
    }
  };

  // ... (Dein oberer Code mit useState, sendMessage etc. bleibt unverändert)

  return (
    // ÄNDERUNG 1: Kein grauer Hintergrund mehr, sondern volle Höhe (h-screen)
    <div className="flex flex-col h-screen bg-white font-sans">

      {/* Header - Fest oben */}
      <div className="bg-slate-800 p-4 text-white flex items-center gap-3 shadow-md z-10">
        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-xl shrink-0">
          👨‍🔧
        </div>
        <div>
          <h1 className="font-bold text-lg">Werkstatt Dennin</h1>
          <p className="text-xs text-gray-300 flex items-center gap-1">
            <span className="w-2 h-2 bg-green-500 rounded-full inline-block animate-pulse"></span>
            KI-Meister Online
          </p>
        </div>
      </div>

      {/* Chat-Bereich - Nimmt den restlichen Platz (flex-1) und scrollt */}
      <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-4">
        {chat.length === 0 && (
          <div className="text-center text-sm text-gray-500 my-8">
            <p className="mb-2">Moin! 👋</p>
            <p>Ich bin der digitale Assistent.<br />Haben Sie Fragen zu Terminen oder Warnleuchten?</p>
          </div>
        )}

        {chat.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.role === "user"
                  ? "bg-blue-600 text-white rounded-tr-none"
                  : "bg-white border border-gray-200 text-gray-800 rounded-tl-none"
                }`}
            >
              {msg.text.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  <br />
                </span>
              ))}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 p-3 rounded-2xl rounded-tl-none shadow-sm flex gap-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Eingabe-Bereich - Fest unten */}
      <div className="p-3 bg-white border-t border-gray-100">
        <div className="flex gap-2">
          <input
            className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ihre Frage..."
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-bold transition-colors disabled:opacity-50"
          >
            ➤
          </button>
        </div>
        <div className="text-center mt-1">
          <span className="text-[10px] text-gray-400">KI-Antworten ohne Gewähr.</span>
        </div>
      </div>

    </div>
  );
}