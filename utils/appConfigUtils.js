async function getAppConfig(appId, req) {
  // determine url based on NODE_ENV is production or development
  let url = '';
  if (process.env.NODE_ENV == 'development') {
    url = 'http://localhost:3100/preview/manifest-config.json';
  // if req.headers['referer'] includes fly.dev, use https://manifest-app-[appId].fly.dev/preview/manifest-config.json
  } else if (req.headers['referer'] && req.headers['referer'].includes('fly.dev')) {
    url = `https://manifest-app-${appId}.fly.dev/preview/manifest-config.json`;
  // else assume production and use https://[appId].sites.madewithmanifest.com/manifest-config.json
  } else {
    url = `https://${appId}.sites.madewithmanifest.com/manifest-config.json`;
  }
  
  const response = await fetch(url);
  const data = await response.json();

  return data;
}

module.exports = {
  getAppConfig
};