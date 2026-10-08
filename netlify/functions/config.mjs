// Netlify Function: dă aplicației configurarea publică Firebase din variabila de mediu FIREBASE_CONFIG
// (JSON-ul "firebaseConfig" al aplicației web: apiKey, authDomain, projectId, storageBucket, appId...).
// Nu conține secrete: cheia web Firebase e publică prin natura ei; accesul îl controlează regulile Firestore/Storage.

export default async (req) => {
  if (req.method !== 'GET') return new Response('Metodă nepermisă.', { status: 405 });
  let firebaseConfig = null;
  try { firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG || ''); } catch { /* neconfigurat */ }
  return new Response(JSON.stringify({ firebaseConfig }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
};

export const config = { path: '/api/config' };
