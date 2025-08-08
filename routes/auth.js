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
  
  const { appId } = req.query;

  // get config for appId
  const config = await supabaseService.getProjectConfig(appId);

  // if config.monetization.type is not 'login_required', return error
  if (config.monetization.type !== 'login_required') {
    return res.status(403).json({
      success: false,
      message: 'This app is not configured to allow login'
    });
  }

  // Store appId in session
  req.session.appId = appId;
  
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })(req, res, next);
});

router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: process.env.CLIENT_URL || 'http://localhost:3000/login?error=auth_failed'
  }),
  (req, res) => {
    console.log('OAuth callback - req.user:', req.user);
    console.log('OAuth callback - req.isAuthenticated():', req.isAuthenticated());
    console.log('OAuth callback - req.session:', req.session);
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/dashboard?auth=success`);
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