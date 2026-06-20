import { Router, Request, Response } from 'express';
import { parseTicketImage } from './parse-ticket';

const router = Router();

// Accepts base64 image, returns parsed trip info
router.post('/parse-ticket', async (req: Request, res: Response): Promise<void> => {
  const { base64, mediaType } = req.body;

  if (!base64 || !mediaType) {
    res.status(400).json({ error: 'base64 and mediaType required' });
    return;
  }

  const result = await parseTicketImage(base64, mediaType);
  res.json(result);
});

export default router;
