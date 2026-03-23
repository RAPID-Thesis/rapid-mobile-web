/**
 * RAPID Node.js/Express API - MongoDB backend
 * Run: npm run dev (from api/) or node api/server.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const { connectDB } = require('../lib/mongodb');

const buildingsRouter = require('./routes/buildings');
const assessmentsRouter = require('./routes/assessments');
const usersRouter = require('./routes/users');

const app = express();
const PORT = process.env.API_PORT || 3000;

const corsOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:8081,http://localhost:19006')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// Routes
app.use('/api/buildings', buildingsRouter);
app.use('/api/assessments', assessmentsRouter);
app.use('/api/users', usersRouter);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

async function start() {
  try {
    await connectDB();
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`RAPID API running at http://localhost:${PORT}`);
  });
}

start();
