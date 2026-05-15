import express from "express";
import { createServer as createHttpServer } from "http";
import path from "path";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import Stripe from "stripe";

let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }
    stripeClient = new Stripe(key, { apiVersion: '2025-02-24.acacia' as any });
  }
  return stripeClient;
}

const PORT = 3000;

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  // Socket.io for Real-Time Collaboration
  const rooms: Record<string, { objects: any[], users: Record<string, any> }> = {};

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

  app.get("/api/trending-searches", async (req, res) => {
    try {
      const response = await fetch("https://trends.google.com/trends/trendingsearches/daily/rss?geo=US");
      if (!response.ok) {
        throw new Error("Failed to fetch Google Trends");
      }
      const text = await response.text();
      // Simple regex to extract <title> tags inside <item>
      const itemTitleRegex = /<item>\s*<title>([^<]+)<\/title>/g;
      let match;
      const terms: string[] = [];
      while ((match = itemTitleRegex.exec(text)) !== null) {
        // Unescape some html entities if needed, though usually simple text
        terms.push(match[1].toLowerCase());
      }
      res.json({ success: true, terms });
    } catch (error: any) {
      console.error('Trends error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/search-memes", async (req, res) => {
    try {
      const q = req.query.q as string;
      if (!q) return res.json({ success: true, memes: [] });
      
      const response = await fetch(`https://imgflip.com/search?q=${encodeURIComponent(q)}`);
      if (!response.ok) {
        throw new Error("Failed to search Imgflip");
      }
      
      const text = await response.text();
      const memes: any[] = [];
      
      // Simple regex to extract search results from Imgflip
      const itemRegex = /<img class="base-img" src="(\/\/i\.imgflip\.com\/[^"]+)" alt="([^"]+)"/g;
      let match;
      let count = 0;
      while ((match = itemRegex.exec(text)) !== null && count < 20) {
        const url = "https:" + match[1];
        const name = match[2].replace(/ \w+ meme$/, "").trim(); // Remove " meme" or "blank meme"
        // Generate pseudo ID
        const id = url.split("/").pop()?.split(".")[0] || Math.random().toString();
        memes.push({
          id: `search_${id}`,
          name: name,
          url: url,
          width: 500,
          height: 500,
          box_count: 2, // arbitrary
          dateAdded: new Date().toISOString()
        });
        count++;
      }
      
      res.json({ success: true, memes });
    } catch (error: any) {
      console.error('Search error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/create-checkout-session", express.json(), async (req, res) => {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Memeforge Pro Subscription',
                description: 'Unlock premium templates, AI features, and more.',
              },
              unit_amount: 999, // $9.99
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${process.env.APP_URL || 'http://localhost:3000'}/profile?payment=success`,
        cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/profile?payment=cancelled`,
      });
      res.json({ id: session.id, url: session.url });
    } catch (error: any) {
      console.error('Stripe error:', error);
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
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
