// Generates js/config.js from environment variables at deploy time.
// Set GROQ_API_KEY and USDA_API_KEY in your Netlify/Vercel dashboard.
const fs = require('fs');

const groqKey  = process.env.GROQ_API_KEY  || '';
const usdaKey  = process.env.USDA_API_KEY  || 'DEMO_KEY';

fs.writeFileSync('js/config.js', `// Auto-generated at build time — do not edit
export const GROQ_API_KEY = '${groqKey}';
export const USDA_API_KEY = '${usdaKey}';
`);

console.log('config.js generated');
