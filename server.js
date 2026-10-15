import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env file manually without external dependencies
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '.env');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  });
}

// Import Vercel API handlers
import configHandler from './api/config.js';
import statusHandler from './api/status.js';
import controlHandler from './api/control.js';

const PORT = process.env.PORT || 8080;

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const cleanPath = pathname.replace(/\/+$/, '') || '/';

  // Global CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  // Parse query parameters
  req.query = Object.fromEntries(parsedUrl.searchParams.entries());

  // Parse JSON/URL-encoded bodies for POST/PUT
  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString('utf8');
      if (rawBody) {
        try {
          req.body = JSON.parse(rawBody);
        } catch {
          req.body = Object.fromEntries(new URLSearchParams(rawBody));
        }
      } else {
        req.body = {};
      }
    } catch {
      req.body = {};
    }
  }

  // Mock res.status().json()
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data, null, 2));
  };

  // API Routes
  if (cleanPath === '/api/config') {
    try {
      return await configHandler(req, res);
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
  if (cleanPath === '/api/status') {
    try {
      return await statusHandler(req, res);
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
  if (cleanPath === '/api/control') {
    try {
      return await controlHandler(req, res);
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // Strict API 404 - Never return HTML index.html fallback for /api/ routes
  if (cleanPath.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: `API endpoint '${cleanPath}' not found.`
    });
  }

  // Serve static files
  let filePath = path.join(__dirname, cleanPath === '/' ? 'index.html' : cleanPath);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
  };

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('File not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`  Pal-Craft Minecraft Azure Dashboard Local Server`);
  console.log(`  Running at: http://localhost:${PORT}`);
  console.log(`              http://127.0.0.1:${PORT}`);
  console.log(`  API Status: http://localhost:${PORT}/api/status`);
  console.log(`  API Config: http://localhost:${PORT}/api/config`);
  console.log(`  API Control: http://localhost:${PORT}/api/control`);
  console.log(`======================================================\n`);
});
