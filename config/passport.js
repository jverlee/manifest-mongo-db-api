const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback",
  passReqToCallback: true
}, async (req, accessToken, refreshToken, profile, done) => {
  try {
    const user = {
      id: profile.id,
      email: profile.emails[0].value,
      name: profile.displayName,
      avatar: profile.photos[0].value,
      provider: 'google',
      accessToken,
      refreshToken,
      appId: req.session?.appId
    };
    
    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}));

passport.serializeUser((user, done) => {
  console.log('Serializing user:', user);
  done(null, user);
});

passport.deserializeUser((user, done) => {
  console.log('Deserializing user:', user);
  done(null, user);
});

module.exports = passport;