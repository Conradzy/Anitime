// Test-only preloader: never sends mail or writes photos to hosted storage.
// PowerShell: $env:NEXT_DIST_DIR='.next-build'; node -r ./scripts/store-test-server.cjs node_modules/next/dist/bin/next start -p 3100
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SECRET_KEY = '';
require('nodemailer').createTransport = () => ({
  sendMail: async () => ({ messageId: 'local-test-no-email' }),
});
