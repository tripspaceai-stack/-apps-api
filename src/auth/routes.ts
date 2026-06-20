import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { OAuth2Client } from 'google-auth-library';
import { signAccessToken, signRefreshToken, verifyToken } from './jwt';
import { requireAuth, AuthRequest } from '../middleware/auth';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

router.post('/signup', async (req: Request, res: Response): Promise<void> => {
  const { email, password, name } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const { data, error } = await supabase
    .from('users')
    .insert({ email, password_hash: passwordHash, name })
    .select()
    .single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  const payload = { userId: data.id, email: data.email };
  res.json({
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    user: { id: data.id, email: data.email, name: data.name },
  });
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const { data, error } = await supabase
    .from('users')
    .select()
    .eq('email', email)
    .single();

  if (error || !data) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, data.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const payload = { userId: data.id, email: data.email };
  res.json({
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    user: { id: data.id, email: data.email, name: data.name },
  });
});

router.post('/google', async (req: Request, res: Response): Promise<void> => {
  const { credential } = req.body;
  if (!credential) { res.status(400).json({ error: 'Google credential required' }); return; }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) { res.status(400).json({ error: 'Invalid Google token' }); return; }

    const { email, name, sub: googleId } = payload;

    // Upsert user by google_id or email
    const { data: existing } = await supabase
      .from('users')
      .select()
      .or(`google_id.eq.${googleId},email.eq.${email}`)
      .single();

    let user = existing;
    if (!user) {
      const { data, error } = await supabase
        .from('users')
        .insert({ email, name, google_id: googleId, password_hash: '' })
        .select()
        .single();
      if (error) { res.status(400).json({ error: error.message }); return; }
      user = data;
    } else if (!user.google_id) {
      // Link Google to existing email account
      await supabase.from('users').update({ google_id: googleId }).eq('id', user.id);
    }

    const tokenPayload = { userId: user.id, email: user.email };
    res.json({
      accessToken: signAccessToken(tokenPayload),
      refreshToken: signRefreshToken(tokenPayload),
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch {
    res.status(401).json({ error: 'Failed to verify Google token' });
  }
});

router.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, created_at')
    .eq('id', req.user!.userId)
    .single();

  if (error || !data) { res.status(404).json({ error: 'User not found' }); return; }
  res.json({ ...data, account_type: 'Admin' });
});

router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token required' });
    return;
  }

  try {
    const payload = verifyToken(refreshToken);
    res.json({ accessToken: signAccessToken({ userId: payload.userId, email: payload.email }) });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

export default router;
