import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { generateWorkspace } from '../ai/generate';
import crypto from 'crypto';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function generateSlug(destination: string): string {
  const base = destination.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  const suffix = crypto.randomBytes(2).toString('hex');
  return `${base}-${suffix}`;
}

router.post('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { tripType, destination, startDate, endDate, groupSize, accommodation, activities, preferences } = req.body;

  const slug = generateSlug(destination || 'trip');
  const shareToken = crypto.randomBytes(16).toString('hex');

  // Create trip with pending status
  const { data, error } = await supabase
    .from('trips')
    .insert({
      owner_id: req.user!.userId,
      title: `Trip to ${destination}`,
      slug,
      share_token: shareToken,
      status: 'generating',
      trip_type: tripType,
      destination,
      start_date: startDate || null,
      end_date: endDate || null,
      group_size: groupSize,
      workspace_json: null,
    })
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  // Return immediately so frontend can show progress
  res.json(data);

  // Generate workspace in background
  try {
    const workspace = await generateWorkspace({ tripType, destination, startDate, endDate, groupSize, accommodation, activities, preferences });
    await supabase.from('trips').update({ workspace_json: workspace, status: 'live', title: workspace.title }).eq('id', data.id);
  } catch (err) {
    console.error('AI generation failed:', err);
    await supabase.from('trips').update({ status: 'failed' }).eq('id', data.id);
  }
});

router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { data, error } = await supabase
    .from('trips')
    .select()
    .eq('owner_id', req.user!.userId)
    .order('created_at', { ascending: false });

  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json(data);
});

export default router;
