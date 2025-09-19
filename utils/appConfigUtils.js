function detectEnvironment(req) {
  // Check if running in local development
  if (process.env.NODE_ENV === 'development') {
    return 'local';
  }
  
  // Check if request is from fly.dev (editing environment)
  if (req.headers['referer'] && req.headers['referer'].includes('fly.dev')) {
    return 'editing';
  }
  
  // Default to production
  return 'production';
}

async function getAppConfig(appId, req) {
  const environment = detectEnvironment(req);
  
  let url = '';
  switch (environment) {
    case 'local':
      url = 'http://localhost:3100/preview/manifest-config.json';
      break;
    case 'editing':
      url = `https://manifest-app-${appId}.fly.dev/preview/manifest-config.json`;
      break;
    case 'production':
      url = `https://${appId}.sites.madewithmanifest.com/manifest-config.json`;
      break;
  }
  
  const response = await fetch(url);
  const data = await response.json();

  return data;
}

module.exports = {
  getAppConfig,
  detectEnvironment
};