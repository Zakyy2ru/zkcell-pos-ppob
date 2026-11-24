import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/authRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import integrationRoutes from './routes/integrationRoutes.js';
import productRoutes from './routes/productRoutes.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Izinkan akses dari localhost maupun perangkat satu jaringan Wi-Fi (HP/Tablet)
const corsOptions = {
  origin: (origin, callback) => {
    if (
      !origin ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith('http://192.168.') ||
      origin === process.env.CLIENT_URL
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
};

// Setup Socket.io untuk update status QRIS & Agen secara real-time
const io = new Server(server, {
  cors: corsOptions,
});

app.set('io', io);

app.use(cors(corsOptions));
app.use(express.json());

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/products', productRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'online', service: 'ZKCELL API', timestamp: new Date() });
});

io.on('connection', (socket) => {
  console.log(`Client terhubung ke Socket.io: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`Client terputus: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server ZKCELL berjalan di http://localhost:${PORT} dan jaringan lokal`);
});