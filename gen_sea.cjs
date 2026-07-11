const fs = require('fs');
const path = require('path');

// ── bundle ──
const bundlePath = path.join(__dirname, 'dist', 'zzz-bundle-full.mjs');
const bundle = fs.readFileSync(bundlePath);
const b64Bundle = bundle.toString('base64');

// ── client assets ──
const clientDir = path.join(__dirname, 'build', 'client');
const clientFiles = {};
function collectDir(dir, prefix) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) {
      collectDir(path.join(dir, entry.name), rel);
    } else {
      const content = fs.readFileSync(path.join(dir, entry.name));
      clientFiles[rel] = content.toString('base64');
    }
  }
}
collectDir(clientDir, '');
const b64ClientIndex = Buffer.from(JSON.stringify(clientFiles)).toString('base64');

// ── generate entry ──
const out = `// SEA entry — self-contained CJS
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const http = require('http');

const PORT = process.env.PORT || '3000';
const HOST = process.env.HOST || '0.0.0.0';
process.env.PORT = PORT;
process.env.HOST = HOST;
process.env.ORIGIN = process.env.ORIGIN || 'http://localhost:' + PORT;

(async () => {
  try {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zzz-'));
    
    // Write bundle
    const bundleFile = path.join(tmp, 'zzz-bundle-full.mjs');
    fs.writeFileSync(bundleFile, Buffer.from('${b64Bundle}', 'base64'));

    // Write client assets
    const clientIndex = JSON.parse(Buffer.from('${b64ClientIndex}', 'base64').toString());
    for (const [rel, b64] of Object.entries(clientIndex)) {
      const fp = path.join(tmp, 'client', rel);
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, Buffer.from(b64, 'base64'));
    }

    // Import bundle
    await import(pathToFileURL(bundleFile).href);

    // Verify server is listening, then open browser
    const url = 'http://localhost:' + PORT;
    console.log('\\n' + url);
    
    // Poll until server is up, then open browser
    function checkServer(tries) {
      if (tries <= 0) return;
      const req = http.get(url, (res) => {
        try { require('child_process').execSync('start "" "' + url + '"', { timeout: 3000 }); } catch {}
      });
      req.on('error', () => {
        setTimeout(() => checkServer(tries - 1), 300);
      });
      req.end();
    }
    checkServer(20);
  } catch (err) {
    console.error('Launcher error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();`;

const outPath = path.join(__dirname, 'sea-entry.cjs');
fs.writeFileSync(outPath, out, 'utf8');
const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
console.log('sea-entry.cjs generated (' + kb + ' KB, ' + Object.keys(clientFiles).length + ' client assets)');
