import express from "express";
import { createServer as createHttpServer } from "http";
import path from "path";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import Stripe from "stripe";
import googleTrends from "google-trends-api";
import google from "googlethis";

let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY environment variable is required");
    }
    stripeClient = new Stripe(key, { apiVersion: "2025-02-24.acacia" as any });
  }
  return stripeClient;
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);

  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  // Socket.io for Real-Time Collaboration
  const rooms: Record<string, { objects: any[]; users: Record<string, any> }> =
    {};

  io.on("connection", (socket) => {
    socket.on("join-room", (roomId: string, user: any) => {
      socket.join(roomId);
      if (!rooms[roomId]) {
        rooms[roomId] = { objects: [], users: {} };
      }
      rooms[roomId].users[socket.id] = user;

      socket.emit("room-state", rooms[roomId]);
      socket.to(roomId).emit("user-joined", { id: socket.id, user });
    });

    socket.on("canvas-update", (roomId: string, data: any) => {
      if (rooms[roomId]) {
        // simplistic overwrite for now
        rooms[roomId].objects = data;
        socket.to(roomId).emit("canvas-updated", data);
      }
    });

    socket.on("disconnect", () => {
      for (const roomId in rooms) {
        if (rooms[roomId].users[socket.id]) {
          delete rooms[roomId].users[socket.id];
          io.to(roomId).emit("user-left", socket.id);
        }
      }
    });
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/test-gemini", async (req, res) => {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: "Hello",
      });
      res.json({ success: true, text: response.text });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

let cachedTrends: { data: string[]; timestamp: number } | null = null;
const CACHE_DURATION_MS = 1000 * 60 * 60; // 1 hour

app.get("/api/trending-searches", async (req, res) => {
  if (cachedTrends && Date.now() - cachedTrends.timestamp < CACHE_DURATION_MS) {
    return res.json({ success: true, terms: cachedTrends.data, cached: true });
  }

  try {
    const results: any = await Promise.race([
      googleTrends.dailyTrends({ geo: "US" }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 2500),
      ),
    ]);

    let data;
    try {
      data = JSON.parse(results);
    } catch (parseError) {
      console.warn(
        "Google Trends returned invalid JSON (likely rate limited or blocked). Using fallback.",
      );
      const terms = [
        "drake",
        "kendrick",
        "nba",
        "gta 6",
        "ai",
        "taylor swift",
        "marvel",
        "apple",
        "doge",
        "memes",
      ];
      cachedTrends = { data: terms, timestamp: Date.now() };
      return res.json({ success: true, terms });
    }

    let terms: string[] = [];
    const days = data?.default?.trendingSearchesDays;
    if (days && days.length > 0) {
      const searches = days[0].trendingSearches;
      if (searches) {
        terms = searches.map((s: any) => s.title.query.toLowerCase());
      }
    }

    if (terms.length === 0) {
      terms = [
        "drake",
        "kendrick",
        "nba",
        "gta 6",
        "ai",
        "taylor swift",
        "marvel",
        "apple",
        "doge",
        "memes",
      ];
    }

    cachedTrends = { data: terms, timestamp: Date.now() };
    res.json({ success: true, terms });
  } catch (error: any) {
    console.warn("Google Trends Error:", error.message);
    const fallbackTerms = [
      "drake",
      "kendrick",
      "nba",
      "gta 6",
      "ai",
      "taylor swift",
      "marvel",
      "apple",
      "doge",
      "memes",
    ];
    cachedTrends = { data: fallbackTerms, timestamp: Date.now() };
    res.json({
      success: true,
      terms: fallbackTerms,
      fallback: true,
      error: error.message,
    });
  }
});

const memeSearchCache = new Map<string, { data: any[]; timestamp: number }>();

app.get("/api/search-memes", async (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q) return res.json({ success: true, memes: [] });

    if (memeSearchCache.has(q) && Date.now() - memeSearchCache.get(q)!.timestamp < CACHE_DURATION_MS) {
      return res.json({ success: true, memes: memeSearchCache.get(q)!.data, cached: true });
    }

    const response = await fetch(
      `https://imgflip.com/search?q=${encodeURIComponent(q)}`,
    );
    if (!response.ok) {
      throw new Error("Failed to search Imgflip");
    }

    const text = await response.text();
    const memes: any[] = [];

    // Simple regex to extract search results from Imgflip
    const itemRegex =
      /<img class="base-img" src="(\/\/i\.imgflip\.com\/[^"]+)" alt="([^"]+)"/g;
    let match;
    let count = 0;
    while ((match = itemRegex.exec(text)) !== null && count < 20) {
      const url = "https:" + match[1];
      const name = match[2].replace(/ \w+ meme$/, "").trim(); // Remove " meme" or "blank meme"
      // Generate pseudo ID
      const id =
        url.split("/").pop()?.split(".")[0] || Math.random().toString();
      memes.push({
        id: `search_${id}`,
        name: name,
        url: url,
        width: 500,
        height: 500,
        box_count: 2, // arbitrary
        dateAdded: new Date().toISOString(),
      });
      count++;
    }

    memeSearchCache.set(q, { data: memes, timestamp: Date.now() });
    res.json({ success: true, memes });
  } catch (error: any) {
    console.error("Search error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const googleGifCache = new Map<string, { data: any[]; timestamp: number }>();

app.get("/api/search-google-gifs", async (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q) return res.json({ success: true, gifs: [] });

    if (googleGifCache.has(q) && Date.now() - googleGifCache.get(q)!.timestamp < CACHE_DURATION_MS) {
      return res.json({ success: true, gifs: googleGifCache.get(q)!.data, cached: true });
    }

    // We explicitly append "gif" to ensure we get animated images
    const searchQuery = q.toLowerCase().includes("gif") ? q : `${q} gif`;
    const images = await google.image(searchQuery, { safe: false });

    const gifs = images.map((item: any, i: number) => ({
      id: `google_gif_${item.id || Date.now() + i}`,
      name: item.origin?.title || "Google GIF",
      url: item.url,
      previewUrl: item.preview?.url,
      width: item.width || 400,
      height: item.height || 400,
      box_count: 1,
      dateAdded: new Date(
        Date.now() - Math.random() * 100000000,
      ).toISOString(),
      is_video: true,
    }));

    googleGifCache.set(q, { data: gifs, timestamp: Date.now() });
    res.json({ success: true, gifs });
  } catch (error: any) {
    console.error("Google GIF Search error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const tenorGifCache = new Map<string, { data: any; timestamp: number }>();

app.get("/api/search-gifs", async (req, res) => {
  try {
    const q = req.query.q as string;
    const pos = req.query.pos as string;
    if (!q) return res.json({ success: true, gifs: [], next: "" });

    const cacheKey = `${q}_${pos || ""}`;
    if (tenorGifCache.has(cacheKey) && Date.now() - tenorGifCache.get(cacheKey)!.timestamp < CACHE_DURATION_MS) {
      const cached = tenorGifCache.get(cacheKey)!.data;
      return res.json({ success: true, ...cached, cached: true });
    }

    const posParam = pos ? `&pos=${encodeURIComponent(pos)}` : "";
    const response = await fetch(
      `https://g.tenor.com/v1/search?q=${encodeURIComponent(q)}&key=LIVDSRZULELA&limit=20${posParam}`,
    );
    if (!response.ok) {
      throw new Error("Failed to search Tenor");
    }

    const data = await response.json();
    const gifs = (data.results || []).map((item: any) => ({
      id: `gif_${item.id}`,
      name: item.content_description || "Animated GIF",
      url: item.media[0].gif.url,
      width: item.media[0].gif.dims[0],
      height: item.media[0].gif.dims[1],
      box_count: 1, // gifs usually have 1 text box if any
      dateAdded: new Date(
        Date.now() - Math.random() * 10000000000,
      ).toISOString(),
      is_video: true,
    }));

    tenorGifCache.set(cacheKey, { data: { gifs, next: data.next }, timestamp: Date.now() });
    res.json({ success: true, gifs, next: data.next });
  } catch (error: any) {
    console.error("GIF Search error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

  app.post("/api/chat-to-meme", express.json(), async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) return res.status(400).json({ error: "Text is required" });

      const { GoogleGenAI, Type, ThinkingLevel } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `You are an expert meme creator. The user wants a meme about: ${text}. 
        Provide a concise visual description for an image generator (no text in the image) and the text overlay boxes for the meme canvas. Always provide reasonable x, y positions (assume canvas is 600x600 but keep text within 50-550 bounds, e.g. top and bottom text).
        Make it very funny.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              backgroundPrompt: {
                type: Type.STRING,
                description: "Visual description of the background image for a meme. Emphasize that there should be NO TEXT in the generated image.",
              },
              texts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING, description: "The meme text overlay" },
                    x: { type: Type.NUMBER, description: "X coordinate, typically between 50 and 150 depending on text width" },
                    y: { type: Type.NUMBER, description: "Y coordinate, e.g. 50 for top text, 500 for bottom text" },
                  },
                },
              },
            },
            required: ["backgroundPrompt", "texts"],
          },
        },
      });

      const jsonStr = response.text?.trim() || "{}";
      const data = JSON.parse(jsonStr);

      res.json({ success: true, memeDraft: data });
    } catch (error: any) {
      console.error("AI Chat-to-Meme error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/generate-meme", express.json(), async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) return res.status(400).json({ error: "Text is required" });

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: {
          parts: [
            {
              text: `A meme template about: ${text}. High quality, typical meme format, blank ready for text.`,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      });

      let imageUrl = "";
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (imageUrl) {
        res.json({ success: true, imageUrl });
      } else {
        res
          .status(500)
          .json({ success: false, error: "Failed to generate image" });
      }
    } catch (error: any) {
      console.error("AI Generation error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/create-checkout-session", express.json(), async (req, res) => {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "Memeforge Pro Subscription",
                description: "Unlock premium templates, AI features, and more.",
              },
              unit_amount: 999, // $9.99
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${process.env.APP_URL || "http://localhost:3000"}/profile?payment=success`,
        cancel_url: `${process.env.APP_URL || "http://localhost:3000"}/profile?payment=cancelled`,
      });
      res.json({ id: session.id, url: session.url });
    } catch (error: any) {
      console.error("Stripe error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(__dirname));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
