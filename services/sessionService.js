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
    // For cross-site (app domain -> db.madewithmanifest.com), cookie must be third-party:
    // SameSite=None; Secure is required by modern browsers.
    secure: true,                 // keep true in prod; for local dev, proxy through app domain instead
    sameSite: 'none',
    path: '/',
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

async function createSession(appId, endUserId, req) {
  const raw = createRawToken();
  const tokenHash = hashToken(raw);
  const hours = Number(process.env.SESSION_TTL_HOURS) || 720;
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  
  console.log('[SESSION DEBUG] Creating new session:', {
    appId,
    endUserId,
    tokenPreview: raw.substring(0, 8) + '...',
    tokenHashPreview: tokenHash.substring(0, 8) + '...',
    ttlHours: hours,
    expiresAt,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  
  const { data, error } = await supabaseService.client
    .from('end_user_sessions')
    .insert({
      app_id: appId,
      end_user_id: endUserId,
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
    console.error('[SESSION DEBUG] Failed to create session:', error);
    throw new Error(`Failed to create session: ${error.message}`);
  }
  
  console.log('[SESSION DEBUG] Session created successfully:', {
    sessionId: data.id,
    cookieName: cookieNameFor(appId)
  });
  
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
    const routeAppId = req.params.appId;

    console.log('req.params', req.params);
    console.log('req.auth', req.auth);
    
    // If route has appId, only check that specific app's cookie
    if (routeAppId) {
      const name = cookieNameFor(routeAppId);
      const fallbackName = process.env.SESSION_COOKIE_NAME || 'sid';
      
      console.log('[SESSION DEBUG] Route has appId, checking specific cookie:', {
        routeAppId,
        expectedCookieName: name,
        fallbackCookieName: fallbackName,
        availableCookies: Object.keys(req.cookies || {}),
        path: req.path
      });
      
      const raw = req.cookies?.[name] || req.cookies?.[fallbackName];
      
      if (!raw) {
        console.log('[SESSION DEBUG] No session cookie found for route appId');
        return next();
      }
      
      return await validateSessionForApp(req, res, next, routeAppId, raw, name, fallbackName);
    }
    
    // If no route appId, check all possible app cookies to find a valid session
    // This is secure because we validate the session belongs to the discovered appId
    const cookies = req.cookies || {};
    const fallbackName = process.env.SESSION_COOKIE_NAME || 'sid';
    
    console.log('[SESSION DEBUG] No route appId, checking all possible app cookies:', {
      availableCookies: Object.keys(cookies),
      path: req.path
    });
    
    // First try the fallback cookie (old global sessions)
    if (cookies[fallbackName]) {
      const sessionData = await findSessionByToken(cookies[fallbackName]);
      if (sessionData) {
        console.log('[SESSION DEBUG] Found valid session using fallback cookie');
        req.auth = { 
          appId: sessionData.app_id, 
          endUserId: sessionData.end_user_id, 
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
          console.log('[SESSION DEBUG] Found valid session using per-app cookie:', cookieName);
          req.auth = { 
            appId: sessionData.app_id, 
            endUserId: sessionData.end_user_id, 
            tokenHash: hashToken(cookieValue),
            cookieName 
          };
          return next();
        }
      }
    }
    
    console.log('[SESSION DEBUG] No valid session found in any cookie');
    return next();
  } catch (e) {
    console.error('[SESSION DEBUG] Exception in attachUserFromSession:', e);
    return next(e);
  }
}

async function validateSessionForApp(req, res, next, appId, rawToken, cookieName, fallbackName) {
  try {
    console.log('[SESSION DEBUG] Validating session for specific app:', {
      appId,
      cookieUsed: req.cookies?.[cookieName] ? cookieName : fallbackName,
      tokenLength: rawToken.length,
      tokenPreview: rawToken.substring(0, 8) + '...'
    });
    
    const tokenHash = hashToken(rawToken);
    const now = new Date().toISOString();
    
    const { data, error } = await supabaseService.client
      .from('end_user_sessions')
      .select('end_user_id, expires_at, issued_at, app_id')
      .eq('app_id', appId)
      .eq('token_hash', tokenHash)
      .gt('expires_at', now)
      .limit(1)
      .single();
    
    if (!error && data) {
      console.log('[SESSION DEBUG] Session found and valid for app:', {
        appId: data.app_id,
        endUserId: data.end_user_id,
        expiresAt: data.expires_at,
        issuedAt: data.issued_at
      });
      
      // Security: Verify the session actually belongs to the requested app
      if (data.app_id !== appId) {
        console.log('[SESSION DEBUG] Security violation: session app_id does not match route appId');
        return next();
      }
      
      req.auth = { appId, endUserId: data.end_user_id, tokenHash, cookieName };
    } else if (error) {
      console.log('[SESSION DEBUG] Session lookup failed:', {
        error: error.message,
        code: error.code,
        details: error.details
      });
    }
    
    return next();
  } catch (e) {
    console.error('[SESSION DEBUG] Exception in validateSessionForApp:', e);
    return next(e);
  }
}

async function findSessionByToken(rawToken) {
  try {
    const tokenHash = hashToken(rawToken);
    const now = new Date().toISOString();
    
    const { data, error } = await supabaseService.client
      .from('end_user_sessions')
      .select('app_id, end_user_id, expires_at')
      .eq('token_hash', tokenHash)
      .gt('expires_at', now)
      .limit(1)
      .single();
    
    return (!error && data) ? data : null;
  } catch (e) {
    console.error('[SESSION DEBUG] Error in findSessionByToken:', e);
    return null;
  }
}

function requireAuth(req, res, next) {
  console.log('[SESSION DEBUG] Auth check:', {
    hasAuth: !!req.auth,
    authDetails: req.auth ? {
      appId: req.auth.appId,
      endUserId: req.auth.endUserId,
      cookieName: req.auth.cookieName
    } : null,
    url: req.url,
    method: req.method
  });
  
  if (!req.auth) {
    console.log('[SESSION DEBUG] Auth required but not found - returning 401');
    return res.status(401).json({ error: 'unauthorized' });
  }
  
  console.log('[SESSION DEBUG] Auth check passed');
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