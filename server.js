const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'troque-esta-senha';
const ROOT = __dirname;

if (!process.env.DATABASE_URL) {
  console.error('ERRO: DATABASE_URL não foi configurada.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 2,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000
});

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
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });

  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', chunk => {
      body += chunk;

      if (body.length > 1_000_000) {
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
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
    featured:
      body.featured === false ||
      body.featured === 0 ||
      body.featured === '0'
        ? 0
        : 1
  };
}

function validProperty(p) {
  return (
    p.title &&
    p.type &&
    p.city &&
    p.neighborhood &&
    p.price >= 0 &&
    p.area >= 0 &&
    /^https?:\/\//i.test(p.image)
  );
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;

  // LISTAR IMÓVEIS
  if (req.method === 'GET' && pathname === '/api/properties') {
    const type = (url.searchParams.get('type') || '').trim();
    const city = (url.searchParams.get('city') || '').trim();
    const maxPrice = Number(url.searchParams.get('maxPrice') || 0);
    const bedrooms = Number(url.searchParams.get('bedrooms') || 0);
    const status = (url.searchParams.get('status') || '').trim();

    let sql = 'SELECT * FROM properties WHERE 1=1';
    const params = [];
    let index = 1;

    if (type) {
      sql += ` AND type = $${index}`;
      params.push(type);
      index++;
    }

    if (city) {
      sql += ` AND (
        LOWER(city) LIKE LOWER($${index})
        OR LOWER(neighborhood) LIKE LOWER($${index + 1})
      )`;

      params.push(`%${city}%`, `%${city}%`);
      index += 2;
    }

    if (maxPrice) {
      sql += ` AND price <= $${index}`;
      params.push(maxPrice);
      index++;
    }

    if (bedrooms) {
      sql += ` AND bedrooms >= $${index}`;
      params.push(bedrooms);
      index++;
    }

    if (status) {
      sql += ` AND status = $${index}`;
      params.push(status);
      index++;
    }

    sql += ' ORDER BY featured DESC, id DESC';

    const result = await pool.query(sql, params);

    return json(res, 200, result.rows);
  }

  // ABRIR UM IMÓVEL
  const propertyMatch = pathname.match(/^\/api\/properties\/(\d+)$/);

  if (req.method === 'GET' && propertyMatch) {
    const result = await pool.query(
      'SELECT * FROM properties WHERE id = $1',
      [Number(propertyMatch[1])]
    );

    if (!result.rows.length) {
      return json(res, 404, {
        error: 'Imóvel não encontrado.'
      });
    }

    return json(res, 200, result.rows[0]);
  }

  // RECEBER CONTATO / LEAD
  if (req.method === 'POST' && pathname === '/api/leads') {
    try {
      const body = await readJson(req);

      const name = String(body.name || '').trim();
      const phone = String(body.phone || '').trim();
      const email = String(body.email || '').trim();
      const interest = String(body.interest || 'Contato').trim();
      const propertyId = body.propertyId
        ? Number(body.propertyId)
        : null;
      const message = String(body.message || '').trim();

      if (!name || !phone) {
        return json(res, 400, {
          error: 'Nome e telefone são obrigatórios.'
        });
      }

      const result = await pool.query(
        `
        INSERT INTO leads
        (
          name,
          phone,
          email,
          interest,
          property_id,
          message
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING id
        `,
        [
          name,
          phone,
          email,
          interest,
          propertyId,
          message
        ]
      );

      return json(res, 201, {
        ok: true,
        id: Number(result.rows[0].id)
      });

    } catch (error) {
      console.error(error);

      return json(res, 400, {
        error: 'Dados inválidos.'
      });
    }
  }

  // ADMIN - LISTAR LEADS
  if (
    pathname === '/api/admin/leads' &&
    req.method === 'GET'
  ) {
    if (!isAdmin(req)) {
      return json(res, 401, {
        error: 'Não autorizado.'
      });
    }

    const result = await pool.query(`
      SELECT
        leads.*,
        properties.title AS property_title
      FROM leads
      LEFT JOIN properties
        ON properties.id = leads.property_id
      ORDER BY leads.id DESC
    `);

    return json(res, 200, result.rows);
  }

  // ADMIN - LISTAR IMÓVEIS
  if (
    pathname === '/api/admin/properties' &&
    req.method === 'GET'
  ) {
    if (!isAdmin(req)) {
      return json(res, 401, {
        error: 'Não autorizado.'
      });
    }

    const result = await pool.query(
      'SELECT * FROM properties ORDER BY id DESC'
    );

    return json(res, 200, result.rows);
  }

  // ADMIN - CADASTRAR IMÓVEL
  if (
    pathname === '/api/admin/properties' &&
    req.method === 'POST'
  ) {
    if (!isAdmin(req)) {
      return json(res, 401, {
        error: 'Não autorizado.'
      });
    }

    try {
      const body = await readJson(req);
      const p = sanitizePropertyInput(body);

      if (!validProperty(p)) {
        return json(res, 400, {
          error:
            'Preencha os campos obrigatórios corretamente.'
        });
      }

      const result = await pool.query(
        `
        INSERT INTO properties
        (
          title,
          type,
          city,
          neighborhood,
          price,
          bedrooms,
          bathrooms,
          parking,
          area,
          image,
          description,
          status,
          featured
        )
        VALUES
        (
          $1,$2,$3,$4,$5,$6,$7,
          $8,$9,$10,$11,$12,$13
        )
        RETURNING id
        `,
        [
          p.title,
          p.type,
          p.city,
          p.neighborhood,
          p.price,
          p.bedrooms,
          p.bathrooms,
          p.parking,
          p.area,
          p.image,
          p.description,
          p.status,
          p.featured
        ]
      );

      return json(res, 201, {
        ok: true,
        id: Number(result.rows[0].id)
      });

    } catch (error) {
      console.error(error);

      return json(res, 400, {
        error: 'Dados inválidos.'
      });
    }
  }

  // ADMIN - EXCLUIR IMÓVEL
  const adminPropertyMatch =
    pathname.match(
      /^\/api\/admin\/properties\/(\d+)$/
    );

  if (
    adminPropertyMatch &&
    req.method === 'DELETE'
  ) {
    if (!isAdmin(req)) {
      return json(res, 401, {
        error: 'Não autorizado.'
      });
    }

    const id = Number(adminPropertyMatch[1]);

    const result = await pool.query(
      'DELETE FROM properties WHERE id = $1',
      [id]
    );

    if (!result.rowCount) {
      return json(res, 404, {
        error: 'Imóvel não encontrado.'
      });
    }

    return json(res, 200, {
      ok: true
    });
  }

  return json(res, 404, {
    error: 'Rota não encontrada.'
  });
}

function serveStatic(req, res, url) {
  const aliases = {
    '/': '/index.html',
    '/imovel': '/imovel.html',
    '/admin': '/admin.html'
  };

  const requestPath =
    aliases[url.pathname] || url.pathname;

  const relativePath = requestPath
    .replace(/^\/+/, '');

  const safePath = path.normalize(relativePath);

  const filePath = path.join(ROOT, safePath);

  if (
    !filePath.startsWith(ROOT + path.sep) &&
    filePath !== ROOT
  ) {
    return json(res, 403, {
      error: 'Acesso negado.'
    });
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, {
        'Content-Type':
          'text/plain; charset=utf-8'
      });

      return res.end(
        'Arquivo não encontrado.'
      );
    }

    const ext =
      path.extname(filePath).toLowerCase();

    res.writeHead(200, {
      'Content-Type':
        mimeTypes[ext] ||
        'application/octet-stream'
    });

    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(
  async (req, res) => {
    const url = new URL(
      req.url,
      `http://${req.headers.host || `${HOST}:${PORT}`}`
    );

    try {
      if (url.pathname.startsWith('/api/')) {
        return await handleApi(
          req,
          res,
          url
        );
      }

      return serveStatic(req, res, url);

    } catch (error) {
      console.error(
        'Erro interno:',
        error
      );

      return json(res, 500, {
        error: 'Erro interno do servidor.'
      });
    }
  }
);

server.listen(PORT, HOST, () => {
  console.log(
    `Brito Imóveis rodando na porta ${PORT}`
  );

  if (
    ADMIN_TOKEN ===
    'troque-esta-senha'
  ) {
    console.log(
      'AVISO: configure ADMIN_TOKEN em produção.'
    );
  }
});
