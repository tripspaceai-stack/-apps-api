import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { AuthRequest, requireAuth } from '../middleware/auth';

const router = Router({ mergeParams: true });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Admin: save modules (flights + group) ──
router.put('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { modules } = req.body;

  const { error } = await supabase
    .from('trips')
    .update({ modules_json: modules })
    .eq('id', id)
    .eq('owner_id', req.user!.userId);

  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json({ success: true });
});

// ── Public: get expenses ──
router.get('/expenses', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.query;
  const { id } = req.params;
  if (!token) { res.status(401).json({ error: 'Token required' }); return; }

  const { data: trip } = await supabase.from('trips').select('id').eq('id', id).eq('share_token', token as string).single();
  if (!trip) { res.status(404).json({ error: 'Not found' }); return; }

  const { data } = await supabase.from('expenses').select().eq('trip_id', id).order('created_at', { ascending: false });
  res.json(data || []);
});

// ── Public: add expense ──
router.post('/expenses', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.query;
  const { id } = req.params;
  if (!token) { res.status(401).json({ error: 'Token required' }); return; }

  const { data: trip } = await supabase.from('trips').select('id').eq('id', id).eq('share_token', token as string).single();
  if (!trip) { res.status(404).json({ error: 'Not found' }); return; }

  const { amount, currency, description, reporter_name, date } = req.body;
  const { data, error } = await supabase.from('expenses').insert({
    trip_id: id, amount, currency, description, reporter_name, date, paid: false,
  }).select().single();

  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json(data);
});

// ── Admin: mark expense paid/unpaid ──
router.patch('/expenses/:expId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id, expId } = req.params;
  const { paid } = req.body;

  const { data: trip } = await supabase.from('trips').select('id').eq('id', id).eq('owner_id', req.user!.userId).single();
  if (!trip) { res.status(404).json({ error: 'Not found' }); return; }

  await supabase.from('expenses').update({ paid }).eq('id', expId);
  res.json({ success: true });
});

// ── Admin: delete expense ──
router.delete('/expenses/:expId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id, expId } = req.params;
  const { data: trip } = await supabase.from('trips').select('id').eq('id', id).eq('owner_id', req.user!.userId).single();
  if (!trip) { res.status(404).json({ error: 'Not found' }); return; }

  await supabase.from('expenses').delete().eq('id', expId);
  res.json({ success: true });
});

// ── Public: get suggestions ──
router.get('/suggestions', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.query;
  const { id } = req.params;
  if (!token) { res.status(401).json({ error: 'Token required' }); return; }

  const { data: trip } = await supabase.from('trips').select('id').eq('id', id).eq('share_token', token as string).single();
  if (!trip) { res.status(404).json({ error: 'Not found' }); return; }

  const { data } = await supabase.from('suggestions').select().eq('trip_id', id).order('created_at', { ascending: false });
  res.json(data || []);
});

// ── Public: add suggestion ──
router.post('/suggestions', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.query;
  const { id } = req.params;
  if (!token) { res.status(401).json({ error: 'Token required' }); return; }

  const { data: trip } = await supabase.from('trips').select('id').eq('id', id).eq('share_token', token as string).single();
  if (!trip) { res.status(404).json({ error: 'Not found' }); return; }

  const { content, author_name } = req.body;
  const { data, error } = await supabase.from('suggestions').insert({
    trip_id: id, content, author_name, votes: [],
  }).select().single();

  if (error) { res.status(400).json({ error: error.message }); return; }
  res.json(data);
});

// ── Public: toggle vote on suggestion ──
router.post('/suggestions/:sugId/vote', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.query;
  const { id, sugId } = req.params;
  const { voter_name } = req.body;
  if (!token) { res.status(401).json({ error: 'Token required' }); return; }

  const { data: trip } = await supabase.from('trips').select('id').eq('id', id).eq('share_token', token as string).single();
  if (!trip) { res.status(404).json({ error: 'Not found' }); return; }

  const { data: sug } = await supabase.from('suggestions').select('votes').eq('id', sugId).single();
  if (!sug) { res.status(404).json({ error: 'Not found' }); return; }

  const votes: string[] = sug.votes || [];
  const newVotes = votes.includes(voter_name)
    ? votes.filter((v: string) => v !== voter_name)
    : [...votes, voter_name];

  await supabase.from('suggestions').update({ votes: newVotes }).eq('id', sugId);
  res.json({ votes: newVotes });
});

// ── Admin: delete suggestion ──
router.delete('/suggestions/:sugId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id, sugId } = req.params;
  const { data: trip } = await supabase.from('trips').select('id').eq('id', id).eq('owner_id', req.user!.userId).single();
  if (!trip) { res.status(404).json({ error: 'Not found' }); return; }

  await supabase.from('suggestions').delete().eq('id', sugId);
  res.json({ success: true });
});

export default router;
