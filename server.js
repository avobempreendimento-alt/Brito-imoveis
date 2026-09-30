const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { Pool } = require('pg');
const Busboy = require('busboy');

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || '').trim();

const SUPABASE_URL = String(
  process.env.SUPABASE_URL || ''
).replace(/\/+$/, '');

const SUPABASE_SECRET_KEY = String(
  process.env.SUPABASE_SECRET_KEY || ''
).trim();

const STORAGE_BUCKET = 'imoveis';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 2,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000
});

const schemaReady = pool.query(`
  ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS suites INTEGER NOT NULL DEFAULT 0
`).catch(error => {
  console.error('Erro ao preparar campo de suítes:', error);
  throw error;
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
  '.webp': 'image/webp',
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
  const received = String(
    req.headers['x-admin-token'] || ''
  ).trim();

  return Boolean(ADMIN_TOKEN) && received === ADMIN_TOKEN;
}

// =========================================
// UPLOAD DE FOTOS
// =========================================

function safeFileName(fileName) {
  const ext = path.extname(fileName || '').toLowerCase();

  const allowedExtensions = [
    '.jpg',
    '.jpeg',
    '.png',
    '.webp'
  ];

  const safeExt = allowedExtensions.includes(ext)
    ? ext
    : '.jpg';

  const base = path
    .basename(fileName || 'foto', ext)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return `${base || 'foto'}${safeExt}`;
}

function readMultipartImages(req) {
  return new Promise((resolve, reject) => {
    let busboy;

    try {
      busboy = Busboy({
        headers: req.headers,
        limits: {
          files: 12,
          fileSize: 4 * 1024 * 1024
        }
      });
    } catch (error) {
      reject(error);
      return;
    }

    const files = [];
    const pending = [];
    let uploadError = null;

    busboy.on(
      'file',
      (fieldname, file, info) => {
        if (fieldname !== 'images') {
          file.resume();
          return;
        }

        const mimeType = String(
          info.mimeType || ''
        ).toLowerCase();

        const allowedTypes = [
          'image/jpeg',
          'image/png',
          'image/webp'
        ];

        if (!allowedTypes.includes(mimeType)) {
          uploadError = new Error(
            'Use somente imagens JPG, PNG ou WEBP.'
          );

          file.resume();
          return;
        }

        const chunks = [];
        let tooLarge = false;

        const finished = new Promise(
          (resolveFile, rejectFile) => {
            file.on('limit', () => {
              tooLarge = true;
            });

            file.on('data', chunk => {
              chunks.push(chunk);
            });

            file.on('end', () => {
              if (tooLarge) {
                rejectFile(
                  new Error(
                    'Cada foto deve ter no máximo 4 MB.'
                  )
                );
                return;
              }

              files.push({
                filename: safeFileName(
                  info.filename
                ),
                mimeType,
                buffer: Buffer.concat(chunks)
              });

              resolveFile();
            });

            file.on('error', rejectFile);
          }
        );

        pending.push(finished);
      }
    );

    busboy.on('filesLimit', () => {
      uploadError = new Error(
        'Envie no máximo 12 fotos por vez.'
      );
    });

    busboy.on('error', reject);

    busboy.on('finish', async () => {
      try {
        await Promise.all(pending);

        if (uploadError) {
          reject(uploadError);
          return;
        }

        resolve(files);
      } catch (error) {
        reject(error);
      }
    });

    req.pipe(busboy);
  });
}

async function uploadToSupabase(
  storagePath,
  file
) {
  if (
    !SUPABASE_URL ||
    !SUPABASE_SECRET_KEY
  ) {
    throw new Error(
      'Supabase Storage não configurado no servidor.'
    );
  }

  const encodedPath = storagePath
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');

  const uploadUrl =
    `${SUPABASE_URL}/storage/v1/object/` +
    `${STORAGE_BUCKET}/${encodedPath}`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization:
        `Bearer ${SUPABASE_SECRET_KEY}`,
      apikey: SUPABASE_SECRET_KEY,
      'Content-Type': file.mimeType,
      'x-upsert': 'false'
    },
    body: file.buffer
  });

  if (!response.ok) {
    const responseText =
      await response.text();

    console.error(
      'Erro do Supabase Storage:',
      response.status,
      responseText
    );

    throw new Error(
      'Não foi possível enviar a foto para o Supabase.'
    );
  }

  const publicUrl =
    `${SUPABASE_URL}/storage/v1/object/public/` +
    `${STORAGE_BUCKET}/${encodedPath}`;

  return publicUrl;
}

function sanitizePropertyInput(body) {
  const purpose = String(
    body.purpose ||
    body.status ||
    'Venda'
  ).trim();

  const propertyStatus = String(
    body.property_status ||
    'Disponível'
  ).trim();

  const salePrice =
    body.sale_price === null ||
    body.sale_price === undefined ||
    body.sale_price === ''
      ? null
      : Number(body.sale_price);

  const rentPrice =
    body.rent_price === null ||
    body.rent_price === undefined ||
    body.rent_price === ''
      ? null
      : Number(body.rent_price);

  let price = Number(body.price || 0);

  if (!price || price <= 0) {
    if (salePrice && salePrice > 0) {
      price = salePrice;
    } else if (rentPrice && rentPrice > 0) {
      price = rentPrice;
    }
  }

  return {
    title: String(body.title || '').trim(),
    type: String(body.type || '').trim(),
    city: String(body.city || '').trim(),
    neighborhood: String(body.neighborhood || '').trim(),

    price,
    salePrice,
    rentPrice,

    bedrooms: Number(body.bedrooms || 0),
    bathrooms: Number(body.bathrooms || 0),
    suites: Number(body.suites || 0),
    parking: Number(body.parking || 0),
    area: Number(body.area || 0),

    image: String(body.image || '').trim(),

    description: String(body.description || '').trim(),

    status: purpose,

    purpose,
    propertyStatus,

    featured:
      body.featured === false ||
      body.featured === 0 ||
      body.featured === '0'
        ? 0
        : 1
  };
}

function validProperty(p) {
  if (!p.title) return false;
  if (!p.type) return false;
  if (!p.city) return false;
  if (!p.neighborhood) return false;

  if (
    !Number.isFinite(p.price) ||
    p.price <= 0
  ) {
    return false;
  }

  if (
    !Number.isFinite(p.area) ||
    p.area <= 0
  ) {
    return false;
  }

  return true;
}

async function handleApi(req, res, url) {
  await schemaReady;
  const pathname = url.pathname;

  // =========================================
  // LISTAR IMÓVEIS PÚBLICOS
  // =========================================

  if (
    req.method === 'GET' &&
    pathname === '/api/properties'
  ) {
    const type = (url.searchParams.get('type') || '').trim();
    const city = (url.searchParams.get('city') || '').trim();
    const purpose = (url.searchParams.get('purpose') || '').trim();
    const minPrice = Number(url.searchParams.get('minPrice') || 0);
    const maxPrice = Number(url.searchParams.get('maxPrice') || 0);
    const minArea = Number(url.searchParams.get('minArea') || 0);
    const maxArea = Number(url.searchParams.get('maxArea') || 0);
    const bedrooms = Number(url.searchParams.get('bedrooms') || 0);
    const suites = Number(url.searchParams.get('suites') || 0);
    const parking = Number(url.searchParams.get('parking') || 0);
    const status = (url.searchParams.get('status') || '').trim();

    let sql = 'SELECT * FROM properties WHERE 1=1';
    const params = [];
    let index = 1;

    if (purpose) {
      sql += ` AND (purpose = $${index} OR purpose = 'Venda e Locação' OR status = $${index})`;
      params.push(purpose);
      index++;
    }

    if (type) {
      sql += ` AND type = $${index}`;
      params.push(type);
      index++;
    }

    if (city) {
      sql += ` AND (LOWER(city) LIKE LOWER($${index}) OR LOWER(neighborhood) LIKE LOWER($${index}))`;
      params.push(`%${city}%`);
      index++;
    }

    const priceExpression = purpose === 'Locação'
      ? 'COALESCE(rent_price, price)'
      : 'COALESCE(sale_price, price)';

    if (minPrice) {
      sql += ` AND ${priceExpression} >= $${index}`;
      params.push(minPrice);
      index++;
    }
    if (maxPrice) {
      sql += ` AND ${priceExpression} <= $${index}`;
      params.push(maxPrice);
      index++;
    }
    if (minArea) {
      sql += ` AND area >= $${index}`;
      params.push(minArea);
      index++;
    }
    if (maxArea) {
      sql += ` AND area <= $${index}`;
      params.push(maxArea);
      index++;
    }
    if (bedrooms) {
      sql += ` AND bedrooms >= $${index}`;
      params.push(bedrooms);
      index++;
    }
    if (suites) {
      sql += ` AND suites >= $${index}`;
      params.push(suites);
      index++;
    }
    if (parking) {
      sql += ` AND parking >= $${index}`;
      params.push(parking);
      index++;
    }
    if (status) {
      sql += ` AND status = $${index}`;
      params.push(status);
      index++;
    }

    sql += ' ORDER BY featured DESC, id DESC';

    const result =
      await pool.query(sql, params);

    return json(res, 200, result.rows);
  }

  // =========================================
  // ABRIR UM IMÓVEL
  // =========================================

  const propertyMatch =
    pathname.match(/^\/api\/properties\/(\d+)$/);

  if (
    req.method === 'GET' &&
    propertyMatch
  ) {
    const propertyId =
      Number(propertyMatch[1]);

    const result = await pool.query(
      'SELECT * FROM properties WHERE id = $1',
      [propertyId]
    );

    if (!result.rows.length) {
      return json(res, 404, {
        error: 'Imóvel não encontrado.'
      });
    }

    const property = result.rows[0];

    try {
      const imagesResult = await pool.query(
        `
        SELECT
          id,
          image_url,
          storage_path,
          position,
          is_cover
        FROM property_images
        WHERE property_id = $1
        ORDER BY position ASC, id ASC
        `,
        [propertyId]
      );

      property.images =
        imagesResult.rows.map(item => ({
          id: item.id,
          url: item.image_url,
          image_url: item.image_url,
          storage_path: item.storage_path,
          position: item.position,
          is_cover: item.is_cover
        }));

    } catch (error) {
      console.error(
        'Erro ao carregar fotos do imóvel:',
        error
      );

      property.images = property.image
        ? [property.image]
        : [];
    }

    return json(
      res,
      200,
      property
    );
  }

  // =========================================
  // CADASTRAR LEAD
  // =========================================

  if (
    req.method === 'POST' &&
    pathname === '/api/leads'
  ) {
    try {
      const body = await readJson(req);

      const name =
        String(body.name || '').trim();

      const phone =
        String(body.phone || '').trim();

      const email =
        String(body.email || '').trim();

      const interest =
        String(
          body.interest || 'Contato'
        ).trim();

      const propertyId =
        body.propertyId
          ? Number(body.propertyId)
          : null;

      const message =
        String(body.message || '').trim();

      if (!name || !phone) {
        return json(res, 400, {
          error:
            'Nome e telefone são obrigatórios.'
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
      console.error(
        'Erro ao cadastrar lead:',
        error
      );

      return json(res, 400, {
        error: 'Dados inválidos.'
      });
    }
  }

  // =========================================
  // ADMIN - LOGIN
  // =========================================

  if (
    pathname === '/api/admin/login' &&
    req.method === 'GET'
  ) {
    if (!ADMIN_TOKEN) {
      return json(res, 503, {
        error:
          'ADMIN_TOKEN não configurado no Vercel.'
      });
    }

    if (!isAdmin(req)) {
      return json(res, 401, {
        error: 'Senha inválida.'
      });
    }

    return json(res, 200, {
      ok: true
    });
  }

  // =========================================
  // ADMIN - LEADS
  // =========================================

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

    return json(
      res,
      200,
      result.rows
    );
  }

  // =========================================
  // ADMIN - LISTAR IMÓVEIS
  // =========================================

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

    return json(
      res,
      200,
      result.rows
    );
  }

  // =========================================
  // ADMIN - CADASTRAR IMÓVEL
  // =========================================

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

      const p =
        sanitizePropertyInput(body);

      if (!validProperty(p)) {
        return json(res, 400, {
          error:
            'Verifique título, tipo, cidade, bairro, preço e área.'
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
          suites,
          parking,
          area,
          image,
          description,
          status,
          featured
        )
        VALUES
        (
          $1,$2,$3,$4,$5,$6,$7,$8,
          $9,$10,$11,$12,$13,$14
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
          p.suites,
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
        id: Number(
          result.rows[0].id
        )
      });

    } catch (error) {
      console.error(
        'Erro ao cadastrar imóvel:',
        error
      );

      return json(res, 400, {
        error:
          'Não foi possível cadastrar o imóvel.'
      });
    }
  }

  // =========================================
  // ADMIN - IMPORTAÇÃO EM MASSA
  // =========================================

  if (
    pathname === '/api/admin/properties/bulk' &&
    req.method === 'POST'
  ) {
    if (!isAdmin(req)) {
      return json(res, 401, {
        error: 'Não autorizado.'
      });
    }

    try {
      const body =
        await readJson(req);

      const items =
        Array.isArray(body.properties)
          ? body.properties.slice(0, 1000)
          : [];

      if (!items.length) {
        return json(res, 400, {
          error:
            'A planilha não contém imóveis.'
        });
      }

      const client =
        await pool.connect();

      let inserted = 0;

      try {
        await client.query('BEGIN');

        for (const raw of items) {
          const p =
            sanitizePropertyInput(raw);

          if (!validProperty(p)) {
            throw new Error(
              `Linha inválida: ${
                p.title || 'sem título'
              }`
            );
          }

          await client.query(
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
              suites,
              parking,
              area,
              image,
              description,
              status,
              featured
            )
            VALUES
            (
              $1,$2,$3,$4,$5,$6,$7,$8,
              $9,$10,$11,$12,$13,$14
            )
            `,
            [
              p.title,
              p.type,
              p.city,
              p.neighborhood,
              p.price,
              p.bedrooms,
              p.bathrooms,
              p.suites,
              p.parking,
              p.area,
              p.image,
              p.description,
              p.status,
              p.featured
            ]
          );

          inserted++;
        }

        await client.query('COMMIT');

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;

      } finally {
        client.release();
      }

      return json(res, 201, {
        ok: true,
        inserted
      });

    } catch (error) {
      console.error(
        'Erro na importação em massa:',
        error
      );

      return json(res, 400, {
        error:
          error.message ||
          'Falha na importação.'
      });
    }
  }

  // =========================================
  // ADMIN - EDITAR IMÓVEL
  // =========================================

  const editPropertyMatch =
    pathname.match(
      /^\/api\/admin\/properties\/(\d+)$/
    );

  if (
    editPropertyMatch &&
    req.method === 'PUT'
  ) {
    if (!isAdmin(req)) {
      return json(res, 401, {
        error: 'Não autorizado.'
      });
    }

    try {
      const body =
        await readJson(req);

      const p =
        sanitizePropertyInput(body);

      if (!validProperty(p)) {
        return json(res, 400, {
          error:
            'Verifique título, tipo, cidade, bairro, preço e área.'
        });
      }

      /*
        Não apagamos a foto já existente quando o
        formulário de edição não envia uma nova URL.
      */
      const result = await pool.query(
        `
        UPDATE properties
        SET
          title = $1,
          type = $2,
          city = $3,
          neighborhood = $4,
          price = $5,
          bedrooms = $6,
          bathrooms = $7,
          suites = $8,
          parking = $9,
          area = $10,
          image = CASE
            WHEN $11 <> '' THEN $11
            ELSE image
          END,
          description = $12,
          status = $13,
          featured = $14
        WHERE id = $15
        `,
        [
          p.title,
          p.type,
          p.city,
          p.neighborhood,
          p.price,
          p.bedrooms,
          p.bathrooms,
          p.suites,
          p.parking,
          p.area,
          p.image,
          p.description,
          p.status,
          p.featured,
          Number(
            editPropertyMatch[1]
          )
        ]
      );

      if (!result.rowCount) {
        return json(res, 404, {
          error:
            'Imóvel não encontrado.'
        });
      }

      return json(res, 200, {
        ok: true
      });

    } catch (error) {
      console.error(
        'Erro ao editar imóvel:',
        error
      );

      return json(res, 400, {
        error:
          'Não foi possível atualizar o imóvel.'
      });
    }
  }

  // =========================================
  // ADMIN - ENVIAR FOTOS DO IMÓVEL
  // =========================================

  const imagesMatch =
    pathname.match(
      /^\/api\/admin\/properties\/(\d+)\/images$/
    );

  if (
    imagesMatch &&
    req.method === 'POST'
  ) {
    if (!isAdmin(req)) {
      return json(res, 401, {
        error: 'Não autorizado.'
      });
    }

    const propertyId =
      Number(imagesMatch[1]);

    try {
      if (
        !SUPABASE_URL ||
        !SUPABASE_SECRET_KEY
      ) {
        return json(res, 503, {
          error:
            'Supabase Storage não configurado.'
        });
      }

      const propertyResult =
        await pool.query(
          `
          SELECT id, image
          FROM properties
          WHERE id = $1
          `,
          [propertyId]
        );

      if (!propertyResult.rows.length) {
        return json(res, 404, {
          error: 'Imóvel não encontrado.'
        });
      }

      const files =
        await readMultipartImages(req);

      if (!files.length) {
        return json(res, 400, {
          error:
            'Selecione pelo menos uma foto.'
        });
      }

      const existingResult =
        await pool.query(
          `
          SELECT COUNT(*)::int AS total
          FROM property_images
          WHERE property_id = $1
          `,
          [propertyId]
        );

      const existingCount =
        Number(
          existingResult.rows[0]?.total || 0
        );

      const uploadedImages = [];

      for (
        let index = 0;
        index < files.length;
        index++
      ) {
        const file = files[index];

        const uniqueName =
          `${Date.now()}-${index}-` +
          `${file.filename}`;

        const storagePath =
          `${propertyId}/${uniqueName}`;

        const publicUrl =
          await uploadToSupabase(
            storagePath,
            file
          );

        const position =
          existingCount + index;

        const isCover =
          existingCount === 0 &&
          index === 0;

        const insertResult =
          await pool.query(
            `
            INSERT INTO property_images
            (
              property_id,
              image_url,
              storage_path,
              position,
              is_cover
            )
            VALUES ($1,$2,$3,$4,$5)
            RETURNING
              id,
              image_url,
              storage_path,
              position,
              is_cover
            `,
            [
              propertyId,
              publicUrl,
              storagePath,
              position,
              isCover
            ]
          );

        uploadedImages.push(
          insertResult.rows[0]
        );

        /*
          A primeira foto cadastrada vira a capa
          usada pela listagem atual do site.
        */
        if (isCover) {
          await pool.query(
            `
            UPDATE properties
            SET image = $1
            WHERE id = $2
            `,
            [
              publicUrl,
              propertyId
            ]
          );
        }
      }

      /*
        Caso existam registros antigos de fotos mas
        properties.image esteja vazio, usamos a primeira
        imagem disponível como capa.
      */
      const currentImage =
        String(
          propertyResult.rows[0].image || ''
        ).trim();

      if (
        !currentImage &&
        uploadedImages.length &&
        existingCount > 0
      ) {
        const firstImage =
          await pool.query(
            `
            SELECT image_url
            FROM property_images
            WHERE property_id = $1
            ORDER BY
              is_cover DESC,
              position ASC,
              id ASC
            LIMIT 1
            `,
            [propertyId]
          );

        if (firstImage.rows.length) {
          await pool.query(
            `
            UPDATE properties
            SET image = $1
            WHERE id = $2
            `,
            [
              firstImage.rows[0].image_url,
              propertyId
            ]
          );
        }
      }

      return json(res, 201, {
        ok: true,
        images: uploadedImages
      });

    } catch (error) {
      console.error(
        'Erro ao enviar fotos:',
        error
      );

      return json(res, 400, {
        error:
          error.message ||
          'Não foi possível enviar as fotos.'
      });
    }
  }

  // =========================================
  // ADMIN - EXCLUIR IMÓVEL
  // =========================================

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

    const id =
      Number(adminPropertyMatch[1]);

    try {
      /*
        Apagamos primeiro os registros das fotos.
        Os arquivos do Storage podem ser tratados
        separadamente depois, se necessário.
      */
      await pool.query(
        `
        DELETE FROM property_images
        WHERE property_id = $1
        `,
        [id]
      );

      const result = await pool.query(
        'DELETE FROM properties WHERE id = $1',
        [id]
      );

      if (!result.rowCount) {
        return json(res, 404, {
          error:
            'Imóvel não encontrado.'
        });
      }

      return json(res, 200, {
        ok: true
      });

    } catch (error) {
      console.error(
        'Erro ao excluir imóvel:',
        error
      );

      return json(res, 400, {
        error:
          'Não foi possível excluir o imóvel.'
      });
    }
  }

  return json(res, 404, {
    error: 'Rota não encontrada.'
  });
}

// =========================================
// ARQUIVOS ESTÁTICOS
// =========================================

function findStaticFile(requestPath) {
  const relativePath =
    requestPath.replace(/^\/+/, '');

  const possibleRoots = [
    process.cwd(),
    __dirname,
    path.join(
      process.cwd(),
      'public'
    ),
    path.join(
      __dirname,
      'public'
    )
  ];

  for (const root of possibleRoots) {
    const candidate =
      path.resolve(
        root,
        relativePath
      );

    const safeRoot =
      path.resolve(root);

    if (
      candidate !== safeRoot &&
      !candidate.startsWith(
        safeRoot + path.sep
      )
    ) {
      continue;
    }

    try {
      if (
        fs.existsSync(candidate) &&
        fs.statSync(candidate).isFile()
      ) {
        return candidate;
      }
    } catch (error) {
      // continua procurando
    }
  }

  return null;
}

function serveStatic(req, res, url) {
  const aliases = {
    '/': '/index.html',
    '/imovel': '/imovel.html',
    '/admin': '/admin.html'
  };

  const requestPath =
    aliases[url.pathname] ||
    url.pathname;

  const filePath =
    findStaticFile(requestPath);

  if (!filePath) {
    console.error(
      'Arquivo não encontrado:',
      requestPath
    );

    res.writeHead(404, {
      'Content-Type':
        'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    });

    return res.end(
      'Arquivo não encontrado.'
    );
  }

  const ext =
    path.extname(
      filePath
    ).toLowerCase();

  res.writeHead(200, {
    'Content-Type':
      mimeTypes[ext] ||
      'application/octet-stream',
    'Cache-Control': 'no-store'
  });

  fs.createReadStream(
    filePath
  ).pipe(res);
}

// =========================================
// SERVIDOR
// =========================================

const server = http.createServer(
  async (req, res) => {
    const url = new URL(
      req.url,
      `http://${
        req.headers.host ||
        `${HOST}:${PORT}`
      }`
    );

    try {
      if (
        url.pathname.startsWith('/api/')
      ) {
        return await handleApi(
          req,
          res,
          url
        );
      }

      return serveStatic(
        req,
        res,
        url
      );

    } catch (error) {
      console.error(
        'Erro interno do servidor:',
        error
      );

      return json(res, 500, {
        error:
          'Erro interno do servidor.'
      });
    }
  }
);

server.listen(
  PORT,
  HOST,
  () => {
    console.log(
      `Brito Imóveis rodando na porta ${PORT}`
    );

    console.log(
      'Diretório atual:',
      process.cwd()
    );

    console.log(
      'Diretório do servidor:',
      __dirname
    );

    if (!process.env.DATABASE_URL) {
      console.error(
        'ERRO: DATABASE_URL não configurada.'
      );
    }

    if (!ADMIN_TOKEN) {
      console.error(
        'ERRO: ADMIN_TOKEN não configurado.'
      );
    }

    if (!SUPABASE_URL) {
      console.error(
        'ERRO: SUPABASE_URL não configurada.'
      );
    }

    if (!SUPABASE_SECRET_KEY) {
      console.error(
        'ERRO: SUPABASE_SECRET_KEY não configurada.'
      );
    }
  }
);
