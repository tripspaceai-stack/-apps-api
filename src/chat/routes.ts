import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { AuthRequest, requireAuth } from '../middleware/auth';

const router = Router({ mergeParams: true });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.post('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { message } = req.body;

  if (!message) { res.status(400).json({ error: 'Message required' }); return; }

  // Get current trip
  const { data: trip, error } = await supabase
    .from('trips')
    .select()
    .eq('id', id)
    .eq('owner_id', req.user!.userId)
    .single();

  if (error || !trip) { res.status(404).json({ error: 'Trip not found' }); return; }
  if (!trip.workspace_json) { res.status(400).json({ error: 'Trip not generated yet' }); return; }

  // Save user message
  await supabase.from('chat_messages').insert({
    trip_id: id,
    role: 'user',
    content: message,
    status: 'sent',
  });

  const prompt = `You are a travel planner assistant. The user wants to modify their trip workspace.

Current workspace:
${JSON.stringify(trip.workspace_json, null, 2)}

User request: "${message}"

Return a JSON object with:
1. "summary": A human-readable summary of the changes you're proposing (1-2 sentences)
2. "workspace": The COMPLETE updated workspace JSON with all changes applied

Return ONLY valid JSON with this structure:
{
  "summary": "...",
  "workspace": { ...complete updated workspace... }
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== 'text') { res.status(500).json({ error: 'Unexpected response' }); return; }

  const json = content.text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
  const parsed = JSON.parse(json);

  // Save assistant message with diff
  const { data: chatMsg } = await supabase.from('chat_messages').insert({
    trip_id: id,
    role: 'assistant',
    content: parsed.summary,
    diff: parsed.workspace,
    status: 'pending',
  }).select().single();

  res.json({
    messageId: chatMsg?.id,
    summary: parsed.summary,
    workspace: parsed.workspace,
  });
});

router.post('/confirm', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { messageId, workspace } = req.body;

  const { error } = await supabase
    .from('trips')
    .update({ workspace_json: workspace })
    .eq('id', id)
    .eq('owner_id', req.user!.userId);

  if (error) { res.status(400).json({ error: error.message }); return; }

  await supabase.from('chat_messages').update({ status: 'confirmed' }).eq('id', messageId);

  res.json({ success: true });
});

router.post('/discard', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { messageId } = req.body;
  await supabase.from('chat_messages').update({ status: 'discarded' }).eq('id', messageId);
  res.json({ success: true });
});

export default router;
