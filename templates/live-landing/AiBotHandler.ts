export interface BotConfig {
  enabled: boolean;
  name: string;
  avatar: string;
  geminiApiKey?: string;
  groqApiKey?: string;
  systemPrompt?: string;
  faq?: Array<{ keywords: string[]; answer: string }>;
}

export class AiBotHandler {
  private config: BotConfig;
  private productName: string;

  constructor(config: BotConfig, productName: string) {
    this.config = config;
    this.productName = productName;
  }

  async answerQuestion(userQuestion: string): Promise<string> {
    const q = userQuestion.toLowerCase().trim();

    // 1. Chequeo ultra-rápido por FAQ local (Latencia < 10ms, costo $0)
    if (this.config.faq && this.config.faq.length > 0) {
      for (const item of this.config.faq) {
        if (item.keywords.some((k) => q.includes(k.toLowerCase()))) {
          return item.answer;
        }
      }
    }

    // 2. Si hay Groq API Key configurada (Llama-3-8B gratis en Groq, latencia ~400ms)
    if (this.config.groqApiKey) {
      try {
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.groqApiKey}`,
          },
          body: JSON.stringify({
            model: "llama3-8b-8192",
            messages: [
              {
                role: "system",
                content: `${this.config.systemPrompt || "Eres el asesor del live."} Producto: ${this.productName}. Responde en máximo 2 líneas en tono chileno/amigable y enfocado en que compren con Pago Contra Entrega.`,
              },
              { role: "user", content: userQuestion },
            ],
            max_tokens: 120,
            temperature: 0.6,
          }),
        });
        if (groqRes.ok) {
          const data = await groqRes.json();
          const reply = data.choices?.[0]?.message?.content?.trim();
          if (reply) return reply;
        }
      } catch (err) {
        console.warn("Error en Groq API, usando fallback:", err);
      }
    }

    // 3. Si hay Gemini API Key configurada (Gemini Flash gratis)
    if (this.config.geminiApiKey) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.config.geminiApiKey}`;
        const geminiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `${this.config.systemPrompt || "Asesor del live."}\nProducto: ${this.productName}\nPregunta del cliente: "${userQuestion}"\nResponde en máximo 2 líneas invitando a pedir con pago contra entrega:`,
                  },
                ],
              },
            ],
          }),
        });
        if (geminiRes.ok) {
          const data = await geminiRes.json();
          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (reply) return reply;
        }
      } catch (err) {
        console.warn("Error en Gemini API, usando fallback:", err);
      }
    }

    // 4. Fallback inteligente de cierre de venta
    return `¡Hola! Sí, el ${this.productName} incluye garantía total de 30 días, envío gratis a todo Chile y PAGO CONTRA ENTREGA. ¡Pídelo tocando el botón verde abajo antes de que se agote el stock! 🔥`;
  }
}
