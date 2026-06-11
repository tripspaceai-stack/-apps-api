import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './auth/routes';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://apps-web-five.vercel.app',
    /\.vercel\.app$/,
  ],
  credentials: true,
}));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRoutes);

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
