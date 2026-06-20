import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { generateWorkspace } from '../ai/generate';
import chatRoutes from '../chat/routes';
import moduleRoutes from '../modules/routes';
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

router.get('/public/:slug', async (req, res: Response): Promise<void> => {
  const { token } = req.query;
  if (!token) { res.status(401).json({ error: 'Token required' }); return; }

  const { data, error } = await supabase
    .from('trips')
    .select()
    .eq('slug', req.params.slug)
    .eq('share_token', token as string)
    .single();

  if (error || !data) { res.status(404).json({ error: 'Trip not found' }); return; }
  res.json(data);
});

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

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { data, error } = await supabase
    .from('trips')
    .select()
    .eq('id', req.params.id)
    .eq('owner_id', req.user!.userId)
    .single();

  if (error || !data) { res.status(404).json({ error: 'Trip not found' }); return; }
  res.json(data);
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

router.post('/:id/retry', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { data: trip, error } = await supabase
    .from('trips')
    .select()
    .eq('id', req.params.id)
    .eq('owner_id', req.user!.userId)
    .single();

  if (error || !trip) { res.status(404).json({ error: 'Trip not found' }); return; }

  await supabase.from('trips').update({ status: 'generating', workspace_json: null }).eq('id', trip.id);
  res.json({ success: true });

  try {
    const workspace = await generateWorkspace({
      tripType: trip.trip_type,
      destination: trip.destination,
      startDate: trip.start_date,
      endDate: trip.end_date,
      groupSize: trip.group_size,
      accommodation: '',
      activities: [],
      preferences: '',
    });
    await supabase.from('trips').update({ workspace_json: workspace, status: 'live', title: workspace.title }).eq('id', trip.id);
  } catch (err) {
    console.error('AI retry failed:', err);
    await supabase.from('trips').update({ status: 'failed' }).eq('id', trip.id);
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { error } = await supabase
    .from('trips')
    .delete()
    .eq('id', req.params.id)
    .eq('owner_id', req.user!.userId);
  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json({ success: true });
});

router.patch('/:id/archive', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { archived } = req.body;
  const { error } = await supabase
    .from('trips')
    .update({ archived: !!archived })
    .eq('id', req.params.id)
    .eq('owner_id', req.user!.userId);
  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json({ success: true });
});

router.use('/:id/chat', chatRoutes);
router.use('/:id/modules', moduleRoutes);

export default router;
