require('dotenv').config();
const http = require('http');
const { google } = require('googleapis');
const { URL } = require('url');

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET');
  process.exit(1);
}

const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
];

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

console.log('\nOpen this URL in your browser:\n');
console.log(authUrl);
console.log('\nWaiting for Google authorization...\n');

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, REDIRECT_URI);

    if (url.pathname !== '/oauth2callback') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const code = url.searchParams.get('code');

    if (!code) {
      res.writeHead(400);
      res.end('Authorization code missing');
      return;
    }

    const { tokens } = await oauth2Client.getToken(code);

    console.log('\n==============================');
    console.log('SUCCESS');
    console.log('==============================\n');

    console.log('Refresh Token:\n');
    console.log(tokens.refresh_token);

    console.log('\nCopy that value into your .env file:');
    console.log('\nGMAIL_REFRESH_TOKEN=YOUR_NEW_TOKEN\n');

    res.writeHead(200, {
      'Content-Type': 'text/html',
    });

    res.end(`
      <h2>Authorization successful!</h2>
      <p>You can close this window and return to the terminal.</p>
    `);

    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 1000);

  } catch (error) {
    console.error('\nOAuth error:');
    console.error(error.response?.data || error.message);

    res.writeHead(500);
    res.end('Authorization failed. Check your terminal.');
  }
});

server.listen(3000, () => {
  console.log('OAuth callback server running on http://localhost:3000');
});