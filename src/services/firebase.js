const admin = require('firebase-admin');

let serviceAccount = null;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  try {
    serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  } catch (e) {
    console.error('Erro ao parsear GOOGLE_APPLICATION_CREDENTIALS_JSON:', e);
  }
}

if (serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
  console.log('? Firebase Admin inicializado com credenciais da conta de serviço.');
} else {
  admin.initializeApp({
    projectId: 'torne-se-cristao',
  });
  console.log('?? Firebase Admin inicializado sem credenciais.');
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
