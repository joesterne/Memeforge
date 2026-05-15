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
