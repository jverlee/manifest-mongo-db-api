const crypto = require('crypto');
const supabaseService = require('./supabaseService');

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createRawToken(bytes = Number(process.env.SESSION_TOKEN_BYTES) || 32) {
  return base64url(crypto.randomBytes(bytes));
}

function hashToken(raw) {
  const pepper = process.env.SESSION_PEPPER || '';
  return crypto.createHmac('sha256', pepper).update(raw).digest('hex');
}

function getCookieOptions(domain) {
  return {
    domain,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

async function getAppContext(req) {
  // Extract appId from request - this matches the existing pattern in the codebase
  // where appId is passed as a parameter in routes like /:appId/entities/:collection
  const appId = req.params.appId;
  
  if (!appId) {
    throw new Error('appId is required for app context');
  }
  
  // Get the cookie domain from the host
  const cookieDomain = req.hostname;
  
  return { appId, cookieDomain };
}

async function createSession(appId, endUserId, req) {
  const raw = createRawToken();
  const tokenHash = hashToken(raw);
  const hours = Number(process.env.SESSION_TTL_HOURS) || 720;
  
  const { data, error } = await supabaseService.client
    .from('end_user_sessions')
    .insert({
      app_id: appId,
      end_user_id: endUserId,
      token_hash: tokenHash,
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
      ip: req.ip,
      user_agent: req.get('user-agent') || null,
      metadata: {}
    })
    .select('id, expires_at')
    .single();
  
  if (error) {
    throw new Error(`Failed to create session: ${error.message}`);
  }
  
  return { rawToken: raw, sessionId: data.id, expiresAt: data.expires_at };
}

async function deleteSession(appId, tokenHash) {
  const { error } = await supabaseService.client
    .from('end_user_sessions')
    .delete()
    .eq('app_id', appId)
    .eq('token_hash', tokenHash);
    
  if (error) {
    console.error('Error deleting session:', error);
  }
}

async function deleteAllSessionsForUser(appId, endUserId) {
  const { error } = await supabaseService.client
    .from('end_user_sessions')
    .delete()
    .eq('app_id', appId)
    .eq('end_user_id', endUserId);
    
  if (error) {
    console.error('Error deleting all sessions for user:', error);
  }
}

async function attachUserFromSession(req, res, next) {
  try {
    // Skip if no appId in route params
    if (!req.params.appId) {
      return next();
    }
    
    const { appId } = await getAppContext(req);
    const raw = req.cookies?.[process.env.SESSION_COOKIE_NAME || 'sid'];
    
    if (!raw) {
      return next();
    }
    
    const tokenHash = hashToken(raw);
    
    const { data, error } = await supabaseService.client
      .from('end_user_sessions')
      .select('end_user_id')
      .eq('app_id', appId)
      .eq('token_hash', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .single();
    
    if (!error && data) {
      req.auth = { appId, endUserId: data.end_user_id, tokenHash };
    }
    
    return next();
  } catch (e) {
    return next(e);
  }
}

function requireAuth(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return next();
}

module.exports = {
  base64url,
  createRawToken,
  hashToken,
  getCookieOptions,
  getAppContext,
  createSession,
  deleteSession,
  deleteAllSessionsForUser,
  attachUserFromSession,
  requireAuth
};