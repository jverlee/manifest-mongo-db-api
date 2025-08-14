const express = require('express');
const passport = require('../config/passport');
const supabaseService = require('../services/supabaseService');
const sessionService = require('../services/sessionService');
const argon2 = require('argon2');
const router = express.Router();

// Debug endpoint - remove in production
router.get('/debug', (req, res) => {
  res.json({
    hasClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL
  });
});

router.get('/google', async (req, res, next) => {
  
  const { appId, redirectUrl } = req.query;

  // get config for appId
  const config = await supabaseService.getAppConfig(appId);

  // if config.monetization.type is not 'login_required', return error
  if (config.monetization.type !== 'login_required' && config.monetization.type !== 'payment_required') {
    return res.status(403).json({
      success: false,
      message: 'This app is not configured to allow login'
    });
  }

  // Create state parameter with appId and redirectUrl
  const state = Buffer.from(JSON.stringify({ appId, redirectUrl })).toString('base64');
  
  passport.authenticate('google', {
    session: false,
    scope: ['profile', 'email'],
    state: state
  })(req, res, next);
});

router.get('/google/callback',
  passport.authenticate('google', { 
    session: false,
    failureRedirect: 'http://localhost:3000/login?error=auth_failed'
  }),
  async (req, res, next) => {
    try {
      console.log('OAuth callback - req.user:', req.user);
      console.log('OAuth callback - req.query.state:', req.query.state);
      
      let redirectUrl = 'http://localhost:3000';
      let appId = null;
      
      // Decode state parameter to get appId and redirectUrl
      if (req.query.state) {
        try {
          const decoded = JSON.parse(Buffer.from(req.query.state, 'base64').toString());
          redirectUrl = decoded.redirectUrl || redirectUrl;
          appId = decoded.appId;
        } catch (error) {
          console.error('Error decoding state parameter:', error);
        }
      }

      if (!appId || !req.user) {
        return res.redirect(`${redirectUrl}?login=error&message=missing_app_context`);
      }

      const profile = req.user;
      const providerUserId = profile.id;
      const email = profile.email || null;
      const emailVerified = !!email;
      const name = profile.name || null;
      const avatar = profile.avatar || null;

      // First, check if this identity already exists (dedupe by identity, not email)
      const { data: existingIdentity } = await supabaseService.client
        .from('end_user_identities')
        .select('end_user_id')
        .eq('app_id', appId)
        .eq('provider', 'google')
        .eq('provider_user_id', providerUserId)
        .single();

      let endUserId;
      
      if (existingIdentity) {
        // Identity exists, use the existing user
        endUserId = existingIdentity.end_user_id;
      } else {
        // New identity, create a new user
        const { data: newUser, error: userError } = await supabaseService.client
          .from('end_users')
          .insert({
            app_id: appId,
            display_name: name,
            primary_email: email,
            email_verified: emailVerified
          })
          .select('id')
          .single();

        if (userError) {
          throw new Error(`Failed to create user: ${userError.message}`);
        }
        
        endUserId = newUser.id;
      }

      // Upsert identity using the unique constraint uq_identity_per_app (app_id, provider, provider_user_id)
      const { data: identity, error: identityError } = await supabaseService.client
        .from('end_user_identities')
        .upsert({
          app_id: appId,
          end_user_id: endUserId,
          provider: 'google',
          provider_user_id: providerUserId,
          email,
          email_verified: emailVerified,
          name,
          avatar_url: avatar,
          raw_profile: profile.profile || {},
          last_login_at: new Date().toISOString()
        }, {
          onConflict: 'app_id,provider,provider_user_id'
        })
        .select('end_user_id')
        .single();

      if (identityError) {
        console.error('Identity upsert error:', identityError);
        throw new Error(`Failed to create/update identity: ${identityError.message}`);
      }

      const finalUserId = identity.end_user_id;

      // Create session + cookie
      const { rawToken } = await sessionService.createSession(appId, finalUserId, req);
      
      // Set cookie for the API server domain, not the app domain
      // This allows the cookie to be sent when making requests to the API
      const cookieOptions = sessionService.getCookieOptions(req.hostname, appId);
      console.log('[COOKIE DEBUG] Setting cookie with options:', {
        cookieName: sessionService.cookieNameFor(appId),
        cookieValue: rawToken.substring(0, 8) + '...',
        hostname: req.hostname,
        cookieOptions
      });

      console.log('req.hostname', req.hostname);
      
      res.cookie(
        sessionService.cookieNameFor(appId), 
        rawToken, 
        cookieOptions
      );
      
      res.redirect(`${redirectUrl}?login=success`);
    } catch (error) {
      console.error('OAuth callback error:', error);
      return next(error);
    }
  }
);

// Password signup
router.post('/:appId/password/signup', async (req, res, next) => {
  try {
    const { appId } = req.params;
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Create/ensure end_user
    const { data: endUser, error: userError } = await supabaseService.client
      .from('end_users')
      .insert({
        app_id: appId,
        display_name: displayName || null,
        primary_email: email.toLowerCase(),
        email_verified: false
      })
      .select('id')
      .single();

    let endUserId;
    if (userError) {
      if (userError.code === '23505') {
        // User already exists, get their ID
        const { data: existingUser } = await supabaseService.client
          .from('end_users')
          .select('id')
          .eq('app_id', appId)
          .eq('primary_email', email.toLowerCase())
          .single();
        endUserId = existingUser?.id;
      } else {
        throw new Error(`Failed to create user: ${userError.message}`);
      }
    } else {
      endUserId = endUser.id;
    }

    if (!endUserId) {
      throw new Error('Failed to create or find user');
    }

    // Create identity
    const { data: identity, error: identityError } = await supabaseService.client
      .from('end_user_identities')
      .insert({
        app_id: appId,
        end_user_id: endUserId,
        provider: 'password',
        provider_user_id: null,
        email: email.toLowerCase(),
        email_verified: false,
        last_login_at: new Date().toISOString()
      })
      .select('id, end_user_id')
      .single();

    if (identityError) {
      if (identityError.code === '23505') {
        return res.status(409).json({ error: 'User already exists with this email' });
      }
      throw new Error(`Failed to create identity: ${identityError.message}`);
    }

    // Store password hash
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const { error: passwordError } = await supabaseService.client
      .from('end_user_password_credentials')
      .insert({
        identity_id: identity.id,
        password_hash: hash
      });

    if (passwordError) {
      throw new Error(`Failed to store password: ${passwordError.message}`);
    }

    // Create session + cookie
    const { rawToken } = await sessionService.createSession(appId, endUserId, req);
    res.cookie(
      sessionService.cookieNameFor(appId), 
      rawToken, 
      sessionService.getCookieOptions(req.hostname, appId)
    );

    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Signup error:', error);
    return next(error);
  }
});

// Password login
router.post('/:appId/password/login', async (req, res, next) => {
  try {
    const { appId } = req.params;
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data, error } = await supabaseService.client
      .from('end_user_identities')
      .select(`
        id,
        end_user_id,
        end_user_password_credentials (
          password_hash
        )
      `)
      .eq('app_id', appId)
      .eq('provider', 'password')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !data || !data.end_user_password_credentials?.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { end_user_id, end_user_password_credentials } = data;
    const passwordHash = end_user_password_credentials.password_hash;
    
    const validPassword = await argon2.verify(passwordHash, password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    await supabaseService.client
      .from('end_user_identities')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', data.id);

    // Create session + cookie
    const { rawToken } = await sessionService.createSession(appId, end_user_id, req);
    res.cookie(
      sessionService.cookieNameFor(appId), 
      rawToken, 
      sessionService.getCookieOptions(req.hostname, appId)
    );

    return res.json({ ok: true });
  } catch (error) {
    console.error('Login error:', error);
    return next(error);
  }
});

router.get('/apps/:appId/me', sessionService.requireAuth, async (req, res, next) => {
  try {
    const requestedAppId = req.params.appId;
    const { appId: sessionAppId, endUserId } = req.auth;
    
    // Validate that the session is for the requested app
    if (requestedAppId !== sessionAppId) {
      return res.status(403).json({ 
        error: 'forbidden',
        message: 'Session does not belong to this app'
      });
    }
    
    // Verify the app exists
    const appConfig = await supabaseService.getAppConfig(requestedAppId);
    if (!appConfig) {
      return res.status(404).json({
        error: 'not_found',
        message: 'App not found'
      });
    }
    
    const { data, error } = await supabaseService.client
      .from('end_users')
      .select('id, app_id, display_name, primary_email, email_verified, created_at')
      .eq('app_id', requestedAppId)
      .eq('id', endUserId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch user: ${error.message}`);
    }

    return res.json(data);
  } catch (error) {
    console.error('Get user error:', error);
    return next(error);
  }
});


module.exports = router;