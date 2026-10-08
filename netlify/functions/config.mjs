// Netlify Function: dă aplicației configurarea publică (Google Client ID + ID folder Drive)
// din variabilele de mediu GOOGLE_CLIENT_ID și DRIVE_FOLDER_ID (Netlify > Site settings > Environment variables).
// Nu conține secrete: Client ID-ul OAuth e public prin natura lui; aici doar nu mai e scris în cod.

export default async (req) => {
  if (req.method !== 'GET') return new Response('Metodă nepermisă.', { status: 405 });
  const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
  const driveFolderId = process.env.DRIVE_FOLDER_ID || '';
  return new Response(JSON.stringify({ googleClientId, driveFolderId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
};

export const config = { path: '/api/config' };
