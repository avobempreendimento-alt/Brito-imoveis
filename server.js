const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '127.0.0.1';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'troque-esta-senha';
const ROOT = __dirname;
const db = new DatabaseSync(path.join(ROOT, 'brito-imoveis.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    city TEXT NOT NULL,
    neighborhood TEXT NOT NULL,
    price INTEGER NOT NULL,
    bedrooms INTEGER NOT NULL DEFAULT 0,
    bathrooms INTEGER NOT NULL DEFAULT 0,
    parking INTEGER NOT NULL DEFAULT 0,
    area INTEGER NOT NULL DEFAULT 0,
    image TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Venda',
    featured INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT DEFAULT '',
    interest TEXT NOT NULL DEFAULT 'Contato',
    property_id INTEGER,
    message TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const count = db.prepare('SELECT COUNT(*) AS total FROM properties').get().total;
if (count === 0) {
  const insert = db.prepare(`
    INSERT INTO properties
    (title,type,city,neighborhood,price,bedrooms,bathrooms,parking,area,image,description,status,featured)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const seed = [
    ['Apartamento moderno com varanda','Apartamento','Caieiras','Centro',420000,2,2,1,72,'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1400&q=82','Apartamento bem iluminado, com varanda, integração entre sala e cozinha e localização prática para o dia a dia.','Venda',1],
    ['Casa ampla com quintal','Casa','Caieiras','Laranjeiras',680000,3,3,2,165,'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1400&q=82','Casa espaçosa para família, com quintal, garagem e ambientes amplos.','Venda',1],
    ['Sobrado contemporâneo','Sobrado','Franco da Rocha','Vila Ramos',590000,3,2,2,142,'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=82','Sobrado com planta funcional, dormitórios confortáveis e duas vagas.','Venda',1],
    ['Apartamento compacto e funcional','Apartamento','São Paulo','Pirituba',315000,2,1,1,54,'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1400&q=82','Apartamento compacto com ótimo aproveitamento dos espaços e vaga de garagem.','Venda',1],
    ['Terreno em região residencial','Terreno','Caieiras','Serpa',240000,0,0,0,280,'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1400&q=82','Terreno residencial com 280 m², indicado para projeto residencial sob medida.','Venda',1],
    ['Sala comercial pronta para uso','Comercial','Caieiras','Centro',350000,0,1,1,48,'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=82','Sala comercial com boa apresentação, banheiro privativo e uma vaga.','Venda',1]
  ];
  for (const row of seed) insert.run(...row);
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function isAdmin(req) {
  return req.headers['x-admin-token'] === ADMIN_TOKEN;
}

function sanitizePropertyInput(body) {
  return {
    title: String(body.title || '').trim(),
    type: String(body.type || '').trim(),
    city: String(body.city || '').trim(),
    neighborhood: String(body.neighborhood || '').trim(),
    price: Number(body.price || 0),
    bedrooms: Number(body.bedrooms || 0),
    bathrooms: Number(body.bathrooms || 0),
    parking: Number(body.parking || 0),
    area: Number(body.area || 0),
    image: String(body.image || '').trim(),
    description: String(body.description || '').trim(),
    status: String(body.status || 'Venda').trim(),
    featured: body.featured === false || body.featured === 0 ? 0 : 1
  };
}

function validProperty(p) {
  return p.title && p.type && p.city && p.neighborhood && p.price >= 0 && p.area >= 0 && /^https?:\/\//i.test(p.image);
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/api/properties') {
    const type = (url.searchParams.get('type') || '').trim();
    const city = (url.searchParams.get('city') || '').trim();
    const maxPrice = Number(url.searchParams.get('maxPrice') || 0);
    const bedrooms = Number(url.searchParams.get('bedrooms') || 0);
    const status = (url.searchParams.get('status') || '').trim();
    let sql = 'SELECT * FROM properties WHERE 1=1';
    const params = [];
    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (city) { sql += ' AND (LOWER(city) LIKE LOWER(?) OR LOWER(neighborhood) LIKE LOWER(?))'; params.push(`%${city}%`, `%${city}%`); }
    if (maxPrice) { sql += ' AND price <= ?'; params.push(maxPrice); }
    if (bedrooms) { sql += ' AND bedrooms >= ?'; params.push(bedrooms); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY featured DESC, id DESC';
    return json(res, 200, db.prepare(sql).all(...params));
  }

  const propertyMatch = pathname.match(/^\/api\/properties\/(\d+)$/);
  if (req.method === 'GET' && propertyMatch) {
    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(Number(propertyMatch[1]));
    return property ? json(res, 200, property) : json(res, 404, { error: 'Imóvel não encontrado.' });
  }

  if (req.method === 'POST' && pathname === '/api/leads') {
    try {
      const body = await readJson(req);
      const name = String(body.name || '').trim();
      const phone = String(body.phone || '').trim();
      const email = String(body.email || '').trim();
      const interest = String(body.interest || 'Contato').trim();
      const propertyId = body.propertyId ? Number(body.propertyId) : null;
      const message = String(body.message || '').trim();
      if (!name || !phone) return json(res, 400, { error: 'Nome e telefone são obrigatórios.' });
      const result = db.prepare('INSERT INTO leads (name,phone,email,interest,property_id,message) VALUES (?,?,?,?,?,?)')
        .run(name, phone, email, interest, propertyId, message);
      return json(res, 201, { ok: true, id: Number(result.lastInsertRowid) });
    } catch {
      return json(res, 400, { error: 'Dados inválidos.' });
    }
  }

  if (pathname === '/api/admin/leads' && req.method === 'GET') {
    if (!isAdmin(req)) return json(res, 401, { error: 'Não autorizado.' });
    return json(res, 200, db.prepare(`
      SELECT leads.*, properties.title AS property_title
      FROM leads LEFT JOIN properties ON properties.id = leads.property_id
      ORDER BY leads.id DESC
    `).all());
  }

  if (pathname === '/api/admin/properties' && req.method === 'GET') {
    if (!isAdmin(req)) return json(res, 401, { error: 'Não autorizado.' });
    return json(res, 200, db.prepare('SELECT * FROM properties ORDER BY id DESC').all());
  }

  if (pathname === '/api/admin/properties' && req.method === 'POST') {
    if (!isAdmin(req)) return json(res, 401, { error: 'Não autorizado.' });
    try {
      const p = sanitizePropertyInput(await readJson(req));
      if (!validProperty(p)) return json(res, 400, { error: 'Preencha os campos obrigatórios corretamente.' });
      const result = db.prepare(`
        INSERT INTO properties (title,type,city,neighborhood,price,bedrooms,bathrooms,parking,area,image,description,status,featured)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(p.title,p.type,p.city,p.neighborhood,p.price,p.bedrooms,p.bathrooms,p.parking,p.area,p.image,p.description,p.status,p.featured);
      return json(res, 201, { ok: true, id: Number(result.lastInsertRowid) });
    } catch {
      return json(res, 400, { error: 'Dados inválidos.' });
    }
  }

  const adminPropertyMatch = pathname.match(/^\/api\/admin\/properties\/(\d+)$/);
  if (adminPropertyMatch && req.method === 'DELETE') {
    if (!isAdmin(req)) return json(res, 401, { error: 'Não autorizado.' });
    const id = Number(adminPropertyMatch[1]);
    const result = db.prepare('DELETE FROM properties WHERE id = ?').run(id);
    return result.changes ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Imóvel não encontrado.' });
  }

  return json(res, 404, { error: 'Rota não encontrada.' });
}

function serveStatic(req, res, url) {
  const aliases = { '/': '/index.html', '/imovel': '/imovel.html', '/admin': '/admin.html' };
  const requestPath = aliases[url.pathname] || url.pathname;
  const safePath = path.normalize(requestPath).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(ROOT, safePath);
  if (!filePath.startsWith(ROOT)) return json(res, 403, { error: 'Acesso negado.' });
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Arquivo não encontrado.');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'Erro interno do servidor.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Brito Imóveis rodando em http://${HOST}:${PORT}`);
  if (ADMIN_TOKEN === 'troque-esta-senha') console.log('AVISO: defina ADMIN_TOKEN antes de publicar em produção.');
});
