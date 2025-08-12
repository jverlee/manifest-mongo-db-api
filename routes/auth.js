const express = require('express');
const passport = require('../config/passport');
const supabaseService = require('../services/supabaseService');
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
  if (config.monetization.type !== 'login_required') {
    return res.status(403).json({
      success: false,
      message: 'This app is not configured to allow login'
    });
  }

  // Create state parameter with appId and redirectUrl
  const state = Buffer.from(JSON.stringify({ appId, redirectUrl })).toString('base64');
  
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: state
  })(req, res, next);
});

router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: 'http://localhost:3000/login?error=auth_failed'
  }),
  (req, res) => {
    console.log('OAuth callback - req.user:', req.user);
    console.log('OAuth callback - req.isAuthenticated():', req.isAuthenticated());
    console.log('OAuth callback - req.query.state:', req.query.state);
    
    let redirectUrl = 'http://localhost:3000';
    let appId = null;
    
    // Decode state parameter to get appId and redirectUrl
    if (req.query.state) {
      try {
        const decoded = JSON.parse(Buffer.from(req.query.state, 'base64').toString());
        redirectUrl = decoded.redirectUrl || redirectUrl;
        appId = decoded.appId;
        
        // Store appId in user object
        if (req.user && appId) {
          req.user.appId = appId;
        }
      } catch (error) {
        console.error('Error decoding state parameter:', error);
      }
    }
    
    res.redirect(`${redirectUrl}?login=success`);
  }
);

router.get('/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({
      success: false,
      message: 'Not authenticated'
    });
  }
});

router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Logout failed'
      });
    }
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Session destruction failed'
        });
      }
      res.clearCookie('connect.sid');
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    });
  });
});

module.exports = router;