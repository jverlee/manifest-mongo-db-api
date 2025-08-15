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

function getCookieOptions(domain, appId) {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    domain,
    httpOnly: true,
    // For cross-site (app domain -> db.madewithmanifest.com), cookie must be third-party:
    // SameSite=None; Secure is required by modern browsers in production
    secure: isProduction,         // only true in production
    sameSite: isProduction ? 'none' : 'lax', // 'none' only in production
    path: `/apps/${appId}`,
  };
}

function cookieNameFor(appId) {
  return `sid_${appId}`;
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

async function createSession(appId, appUserId, req) {
  const raw = createRawToken();
  const tokenHash = hashToken(raw);
  const hours = Number(process.env.SESSION_TTL_HOURS) || 720;
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  
  
  const { data, error } = await supabaseService.client
    .from('app_user_sessions')
    .insert({
      app_id: appId,
      app_user_id: appUserId,
      token_hash: tokenHash,
      issued_at: new Date().toISOString(),
      expires_at: expiresAt,
      ip: req.ip,
      user_agent: req.get('user-agent') || null,
      metadata: {}
    })
    .select('id, expires_at')
    .single();
  
  if (error) {
    console.error('Failed to create session:', error);
    throw new Error(`Failed to create session: ${error.message}`);
  }
  
  
  return { rawToken: raw, sessionId: data.id, expiresAt: data.expires_at };
}

async function deleteSession(appId, tokenHash) {
  const { error } = await supabaseService.client
    .from('app_user_sessions')
    .delete()
    .eq('app_id', appId)
    .eq('token_hash', tokenHash);
    
  if (error) {
    console.error('Error deleting session:', error);
  }
}

async function deleteAllSessionsForUser(appId, appUserId) {
  const { error } = await supabaseService.client
    .from('app_user_sessions')
    .delete()
    .eq('app_id', appId)
    .eq('app_user_id', appUserId);
    
  if (error) {
    console.error('Error deleting all sessions for user:', error);
  }
}

async function attachUserFromSession(req, res, next) {
  try {
    const routeAppId = req.params.appId;

    
    // If route has appId, only check that specific app's cookie
    if (routeAppId) {
      const name = cookieNameFor(routeAppId);
      const fallbackName = process.env.SESSION_COOKIE_NAME || 'sid';
      
      
      const raw = req.cookies?.[name] || req.cookies?.[fallbackName];
      
      if (!raw) {
        return next();
      }
      
      return await validateSessionForApp(req, res, next, routeAppId, raw, name, fallbackName);
    }
    
    // If no route appId, check all possible app cookies to find a valid session
    // This is secure because we validate the session belongs to the discovered appId
    const cookies = req.cookies || {};
    const fallbackName = process.env.SESSION_COOKIE_NAME || 'sid';
    
    
    // First try the fallback cookie (old global sessions)
    if (cookies[fallbackName]) {
      const sessionData = await findSessionByToken(cookies[fallbackName]);
      if (sessionData) {
        req.auth = { 
          appId: sessionData.app_id, 
          appUserId: sessionData.app_user_id, 
          tokenHash: hashToken(cookies[fallbackName]),
          cookieName: fallbackName 
        };
        return next();
      }
    }
    
    // Then try all per-app cookies (sid_<appId> pattern)
    for (const [cookieName, cookieValue] of Object.entries(cookies)) {
      if (cookieName.startsWith('sid_')) {
        const sessionData = await findSessionByToken(cookieValue);
        if (sessionData) {
          req.auth = { 
            appId: sessionData.app_id, 
            appUserId: sessionData.app_user_id, 
            tokenHash: hashToken(cookieValue),
            cookieName 
          };
          return next();
        }
      }
    }
    
    return next();
  } catch (e) {
    console.error('Exception in attachUserFromSession:', e);
    return next(e);
  }
}

async function validateSessionForApp(req, res, next, appId, rawToken, cookieName, fallbackName) {
  try {
    
    const tokenHash = hashToken(rawToken);
    const now = new Date().toISOString();
    
    const { data, error } = await supabaseService.client
      .from('app_user_sessions')
      .select('app_user_id, expires_at, issued_at, app_id')
      .eq('app_id', appId)
      .eq('token_hash', tokenHash)
      .gt('expires_at', now)
      .limit(1)
      .single();
    
    if (!error && data) {
      
      // Security: Verify the session actually belongs to the requested app
      if (data.app_id !== appId) {
        return next();
      }
      
      req.auth = { appId, appUserId: data.app_user_id, tokenHash, cookieName };
    } else if (error) {
    }
    
    return next();
  } catch (e) {
    console.error('Exception in validateSessionForApp:', e);
    return next(e);
  }
}

async function findSessionByToken(rawToken) {
  try {
    const tokenHash = hashToken(rawToken);
    const now = new Date().toISOString();
    
    const { data, error } = await supabaseService.client
      .from('app_user_sessions')
      .select('app_id, app_user_id, expires_at')
      .eq('token_hash', tokenHash)
      .gt('expires_at', now)
      .limit(1)
      .single();
    
    return (!error && data) ? data : null;
  } catch (e) {
    console.error('Error in findSessionByToken:', e);
    return null;
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
  cookieNameFor,
  getAppContext,
  createSession,
  deleteSession,
  deleteAllSessionsForUser,
  attachUserFromSession,
  requireAuth
};