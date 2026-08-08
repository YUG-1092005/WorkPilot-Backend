const { cert, getApps, initializeApp } = require('firebase-admin/app');

let firebaseApp = null;
let initializationAttempted = false;

const readServiceAccount = () => {
  const encoded = `${process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || ''}`.trim();
  if (!encoded) return null;

  const serviceAccount = JSON.parse(
    Buffer.from(encoded, 'base64').toString('utf8'),
  );

  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }
  return serviceAccount;
};

const getFirebaseApp = () => {
  if (firebaseApp) return firebaseApp;
  if (getApps().length > 0) {
    [firebaseApp] = getApps();
    return firebaseApp;
  }
  if (initializationAttempted) return null;

  initializationAttempted = true;
  try {
    const serviceAccount = readServiceAccount();
    if (!serviceAccount) {
      console.warn('Firebase push is disabled: FIREBASE_SERVICE_ACCOUNT_BASE64 is missing');
      return null;
    }
    firebaseApp = initializeApp({ credential: cert(serviceAccount) });
    return firebaseApp;
  } catch (error) {
    console.error('Firebase Admin initialization failed:', error.message);
    return null;
  }
};

module.exports = { getFirebaseApp };
