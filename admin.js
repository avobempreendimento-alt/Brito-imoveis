const loginBox = document.getElementById('adminLogin');
const panel = document.getElementById('adminPanel');
const tokenInput = document.getElementById('adminToken');
const statusEl = document.getElementById('adminStatus');

let token = sessionStorage.getItem('britoAdminToken') || '';
let properties = [];
let csvItems = [];

const $ = id => document.getElementById(id);

const headers = () => ({
  'Content-Type': 'application/json',
  'X-Admin-Token': token
});

const money = value =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(Number(value) || 0);

const esc = value =>
  String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#039;',
    '"': '&quot;'
  }[char]));

/* =========================
   NAVEGAÇÃO
========================= */

function showTab(id) {
  document.querySelectorAll('.admin-panel-section').forEach(section => {
    section.classList.add('hidden');
  });

  const target = $(id);

  if (target) {
    target.classList.remove('hidden');
  }

  document.querySelectorAll('.side-tab').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === id);
  });
}

document.querySelectorAll('.side-tab').forEach(button => {
  button.onclick = () => showTab(button.dataset.tab);
});

/* =========================
   LOGIN
========================= */

async function authenticate(candidate) {
  token = String(candidate || '').trim();

  if (!token) {
    statusEl.textContent = 'Digite a senha do administrador.';
    return false;
  }

  statusEl.textContent = 'Verificando...';

  try {
    const response = await fetch('/api/admin/login', {
      headers: headers(),
      cache: 'no-store'
    });

    let data = {};

    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      token = '';
      sessionStorage.removeItem('britoAdminToken');
      statusEl.textContent =
        data.error || 'Não foi possível validar a senha.';
      return false;
    }

    sessionStorage.setItem('britoAdminToken', token);

    loginBox.classList.add('hidden');
    panel.classList.remove('hidden');
    statusEl.textContent = '';

    await refreshAll();

    return true;
  } catch (error) {
    token = '';
    statusEl.textContent = 'Falha de conexão. Tente novamente.';
    return false;
  }
}

$('adminAccess').onclick = () => authenticate(tokenInput.value);

tokenInput.onkeydown = event => {
  if (event.key === 'Enter') {
    authenticate(tokenInput.value);
  }
};

$('adminLogout').onclick = () => {
  sessionStorage.removeItem('britoAdminToken');
  token = '';
  location.reload();
};

/* =========================
   IMÓVEIS
========================= */

function getPropertyPrice(property) {
  return (
    property.sale_price ??
    property.rent_price ??
    property.price ??
    0
  );
}

function getPropertyImage(property) {
  if (property.image) return property.image;

  if (
    Array.isArray(property.images) &&
    property.images.length
  ) {
    const first = property.images[0];

    if (typeof first === 'string') return first;

    return first.url || first.image_url || '';
  }

  return '';
}

function renderProperties(list) {
  const container = $('adminProperties');

  if (!list.length) {
    container.innerHTML = '<p>Nenhum imóvel cadastrado.</p>';
    return;
  }

  container.innerHTML = list.map(property => {
    const image = getPropertyImage(property);

    return `
      <article class="admin-property-row">

        ${
          image
            ? `<img src="${esc(image)}" alt="${esc(property.title)}">`
            : '<div class="admin-property-no-image">Sem foto</div>'
        }

        <div class="admin-property-main">
          <strong>${esc(property.title)}</strong>
          <span>
            ${esc(property.neighborhood || '')},
            ${esc(property.city || '')}
          </span>
        </div>

        <span class="admin-type">
          ${esc(
            property.property_status ||
            property.status ||
            'Disponível'
          )}
        </span>

        <strong>
          ${money(getPropertyPrice(property))}
        </strong>

        <div class="admin-actions">
          <button data-edit="${property.id}">
            Editar
          </button>

          <button
            class="danger"
            data-delete="${property.id}"
          >
            Excluir
          </button>
        </div>

      </article>
    `;
  }).join('');

  document.querySelectorAll('[data-edit]').forEach(button => {
    button.onclick = () =>
      editProperty(Number(button.dataset.edit));
  });

  document.querySelectorAll('[data-delete]').forEach(button => {
    button.onclick = () =>
      deleteProperty(Number(button.dataset.delete));
  });
}

async function refreshProperties() {
  try {
    const response = await fetch('/api/admin/properties', {
      headers: headers(),
      cache: 'no-store'
    });

    if (response.status === 401) {
      sessionStorage.removeItem('britoAdminToken');
      location.reload();
      return;
    }

    if (!response.ok) {
      console.error('Erro ao carregar imóveis.');
      return;
    }

    properties = await response.json();

    $('statProperties').textContent = properties.length;

    $('statAvailable').textContent =
      properties.filter(property => {
        const status =
          property.property_status ||
          property.status;

        return (
          status === 'Disponível' ||
          status === 'Venda' ||
          status === 'Locação' ||
          status === 'Venda e Locação'
        );
      }).length;

    renderProperties(properties);
  } catch (error) {
    console.error(error);
  }
}

/* =========================
   LEADS
========================= */

async function refreshLeads() {
  try {
    const response = await fetch('/api/admin/leads', {
      headers: headers(),
      cache: 'no-store'
    });

    if (!response.ok) return;

    const list = await response.json();

    $('statLeads').textContent = list.length;
    $('adminLeadCount').textContent =
      `${list.length} recebidos`;

    $('adminLeads').innerHTML =
      list.map(lead => `
        <article class="lead-list-item">

          <div>
            <strong>${esc(lead.name)}</strong>

            <span>
              ${esc(lead.phone)}
              ${lead.email ? ` · ${esc(lead.email)}` : ''}
            </span>

            <span>
              ${esc(lead.interest || '')}
              ${
                lead.property_title
                  ? ` · ${esc(lead.property_title)}`
                  : ''
              }
            </span>
          </div>

          <p>${esc(lead.message || '')}</p>

          <small>
            ${
              lead.created_at
                ? new Date(lead.created_at)
                    .toLocaleString('pt-BR')
                : ''
            }
          </small>

        </article>
      `).join('') ||
      '<p>Nenhum lead recebido.</p>';

  } catch (error) {
    console.error(error);
  }
}

async function refreshAll() {
  await Promise.all([
    refreshProperties(),
    refreshLeads()
  ]);
}

/* =========================
   PESQUISA
========================= */

$('adminSearch').oninput = event => {
  const query = event.target.value
    .trim()
    .toLowerCase();

  const filtered = properties.filter(property =>
    `${property.title || ''} ${property.city || ''} ${property.neighborhood || ''}`
      .toLowerCase()
      .includes(query)
  );

  renderProperties(filtered);
};

/* =========================
   VENDA / LOCAÇÃO
========================= */

function updatePriceFields() {
  const purpose = $('pPurpose').value;

  const saleGroup = $('salePriceGroup');
  const rentGroup = $('rentPriceGroup');

  if (purpose === 'Venda') {
    saleGroup.classList.remove('hidden');
    rentGroup.classList.add('hidden');
  } else if (purpose === 'Locação') {
    saleGroup.classList.add('hidden');
    rentGroup.classList.remove('hidden');
  } else {
    saleGroup.classList.remove('hidden');
    rentGroup.classList.remove('hidden');
  }
}

$('pPurpose').onchange = updatePriceFields;

/* =========================
   FOTOS - PREVIEW
========================= */

function previewSelectedImages() {
  const files = Array.from($('pImages').files || []);
  const preview = $('imagePreview');

  preview.innerHTML = '';

  files.forEach((file, index) => {
    const reader = new FileReader();

    reader.onload = event => {
      const item = document.createElement('div');
      item.className = 'property-image-preview-item';

      item.innerHTML = `
        <img
          src="${event.target.result}"
          alt="Foto ${index + 1}"
        >
        ${index === 0 ? '<span>Capa</span>' : ''}
      `;

      preview.appendChild(item);
    };

    reader.readAsDataURL(file);
  });
}

$('pImages').onchange = previewSelectedImages;

/* =========================
   DADOS DO FORMULÁRIO
========================= */

function propertyPayload() {
  const purpose = $('pPurpose').value;

  const salePrice =
    purpose === 'Locação'
      ? null
      : Number($('pSalePrice').value || 0);

  const rentPrice =
    purpose === 'Venda'
      ? null
      : Number($('pRentPrice').value || 0);

  return {
    title: $('pTitle').value.trim(),
    type: $('pType').value,
    purpose: purpose,
    property_status: $('pPropertyStatus').value,

    city: $('pCity').value.trim(),
    neighborhood: $('pNeighborhood').value.trim(),

    sale_price: salePrice,
    rent_price: rentPrice,

    price: salePrice || rentPrice || 0,

    // Mantemos status também para compatibilidade
    // com o backend atual.
    status: purpose,

    area: Number($('pArea').value || 0),
    bedrooms: Number($('pBedrooms').value || 0),
    bathrooms: Number($('pBathrooms').value || 0),
    parking: Number($('pParking').value || 0),

    description: $('pDescription').value.trim()
  };
}

function validateProperty(data) {
  if (!data.title) {
    return 'Preencha o título do imóvel.';
  }

  if (!data.city) {
    return 'Preencha a cidade.';
  }

  if (!data.neighborhood) {
    return 'Preencha o bairro.';
  }

  if (!data.area || data.area <= 0) {
    return 'Preencha uma área válida.';
  }

  if (
    data.purpose === 'Venda' &&
    (!data.sale_price || data.sale_price <= 0)
  ) {
    return 'Preencha o preço de venda.';
  }

  if (
    data.purpose === 'Locação' &&
    (!data.rent_price || data.rent_price <= 0)
  ) {
    return 'Preencha o valor do aluguel.';
  }

  if (
    data.purpose === 'Venda e Locação' &&
    (
      !data.sale_price ||
      data.sale_price <= 0 ||
      !data.rent_price ||
      data.rent_price <= 0
    )
  ) {
    return 'Preencha o preço de venda e o valor do aluguel.';
  }

  return '';
}

/* =========================
   ENVIO DE FOTOS
========================= */

async function uploadPropertyImages(propertyId) {
  const files = Array.from($('pImages').files || []);

  if (!files.length) {
    return true;
  }

  const formData = new FormData();

  files.forEach(file => {
    formData.append('images', file);
  });

  const response = await fetch(
    `/api/admin/properties/${propertyId}/images`,
    {
      method: 'POST',
      headers: {
        'X-Admin-Token': token
      },
      body: formData
    }
  );

  if (!response.ok) {
    let data = {};

    try {
      data = await response.json();
    } catch {}

    throw new Error(
      data.error ||
      'Não foi possível enviar as fotos.'
    );
  }

  return true;
}

/* =========================
   CADASTRAR / EDITAR
========================= */

$('propertyForm').onsubmit = async event => {
  event.preventDefault();

  const id = $('pId').value;
  const status = $('propertyFormStatus');
  const saveButton = $('saveProperty');

  const dataToSend = propertyPayload();

  const validationError =
    validateProperty(dataToSend);

  if (validationError) {
    status.textContent = validationError;
    return;
  }

  status.textContent = id
    ? 'Salvando alterações...'
    : 'Cadastrando imóvel...';

  saveButton.disabled = true;

  try {
    const response = await fetch(
      id
        ? `/api/admin/properties/${id}`
        : '/api/admin/properties',
      {
        method: id ? 'PUT' : 'POST',
        headers: headers(),
        body: JSON.stringify(dataToSend)
      }
    );

    let data = {};

    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      status.textContent =
        data.error ||
        'Não foi possível salvar o imóvel.';
      return;
    }

    const propertyId =
      id ||
      data.id ||
      (data.property && data.property.id);

    if (
      $('pImages').files.length &&
      propertyId
    ) {
      status.textContent = 'Enviando fotos...';

      await uploadPropertyImages(propertyId);
    }

    status.textContent = id
      ? 'Imóvel atualizado com sucesso.'
      : 'Imóvel cadastrado com sucesso.';

    resetForm();
    await refreshProperties();
    showTab('propertiesPanel');

  } catch (error) {
    console.error(error);

    status.textContent =
      error.message ||
      'Falha ao salvar o imóvel.';
  } finally {
    saveButton.disabled = false;
  }
};

/* =========================
   EDITAR IMÓVEL
========================= */

function editProperty(id) {
  const property = properties.find(
    item => Number(item.id) === Number(id)
  );

  if (!property) return;

  $('pId').value = property.id;
  $('pTitle').value = property.title || '';
  $('pType').value = property.type || 'Apartamento';

  $('pPurpose').value =
    property.purpose ||
    property.status ||
    'Venda';

  $('pPropertyStatus').value =
    property.property_status ||
    (
      ['Disponível', 'Reservado', 'Vendido', 'Alugado']
        .includes(property.status)
        ? property.status
        : 'Disponível'
    );

  $('pCity').value = property.city || '';
  $('pNeighborhood').value =
    property.neighborhood || '';

  $('pSalePrice').value =
    property.sale_price ??
    (
      (property.purpose || property.status) === 'Venda'
        ? property.price || ''
        : ''
    );

  $('pRentPrice').value =
    property.rent_price ??
    (
      (property.purpose || property.status) === 'Locação'
        ? property.price || ''
        : ''
    );

  $('pArea').value = property.area || 0;
  $('pBedrooms').value = property.bedrooms || 0;
  $('pBathrooms').value = property.bathrooms || 0;
  $('pParking').value = property.parking || 0;
  $('pDescription').value =
    property.description || '';

  $('formTitle').textContent = 'Editar imóvel';
  $('saveProperty').textContent = 'Salvar alterações';
  $('cancelEdit').classList.remove('hidden');

  $('imagePreview').innerHTML = '';

  updatePriceFields();
  showTab('newPanel');
}

/* =========================
   LIMPAR FORMULÁRIO
========================= */

function resetForm() {
  $('propertyForm').reset();

  $('pId').value = '';
  $('pCity').value = 'Caieiras';

  $('pBedrooms').value = 0;
  $('pBathrooms').value = 0;
  $('pParking').value = 0;

  $('pPurpose').value = 'Venda';
  $('pPropertyStatus').value = 'Disponível';

  $('formTitle').textContent =
    'Adicionar novo imóvel';

  $('saveProperty').textContent =
    'Publicar imóvel';

  $('cancelEdit').classList.add('hidden');

  $('imagePreview').innerHTML = '';
  $('propertyFormStatus').textContent = '';

  updatePriceFields();
}

$('cancelEdit').onclick = () => {
  resetForm();
  showTab('propertiesPanel');
};

/* =========================
   EXCLUIR
========================= */

async function deleteProperty(id) {
  if (!confirm('Excluir este imóvel?')) {
    return;
  }

  try {
    const response = await fetch(
      `/api/admin/properties/${id}`,
      {
        method: 'DELETE',
        headers: headers()
      }
    );

    if (!response.ok) {
      let data = {};

      try {
        data = await response.json();
      } catch {}

      alert(
        data.error ||
        'Não foi possível excluir o imóvel.'
      );

      return;
    }

    await refreshProperties();

  } catch (error) {
    alert('Falha ao excluir o imóvel.');
  }
}

/* =========================
   CSV
========================= */

function parseCSV(text) {
  const rows = [];

  let row = [];
  let cell = '';
  let quote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quote && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      quote = !quote;
    } else if (char === ',' && !quote) {
      row.push(cell.trim());
      cell = '';
    } else if (
      (char === '\n' || char === '\r') &&
      !quote
    ) {
      if (char === '\r' && next === '\n') {
        i++;
      }

      row.push(cell.trim());

      if (row.some(Boolean)) {
        rows.push(row);
      }

      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell.trim());

    if (row.some(Boolean)) {
      rows.push(row);
    }
  }

  if (rows.length < 2) {
    return [];
  }

  const headings = rows[0].map(item =>
    item.trim().toLowerCase()
  );

  return rows.slice(1).map(values =>
    Object.fromEntries(
      headings.map((heading, index) => [
        heading,
        values[index] ?? ''
      ])
    )
  );
}

$('csvFile').onchange = async () => {
  const file = $('csvFile').files[0];

  if (!file) {
    csvItems = [];
    $('importCsv').disabled = true;
    $('importPreview').textContent = '';
    return;
  }

  csvItems = parseCSV(await file.text());

  $('importCsv').disabled = !csvItems.length;

  $('importPreview').textContent =
    csvItems.length
      ? `${csvItems.length} imóveis encontrados na planilha.`
      : 'Nenhuma linha válida encontrada.';
};

$('importCsv').onclick = async () => {
  if (!csvItems.length) return;

  $('importCsv').disabled = true;
  $('importStatus').textContent = 'Importando...';

  try {
    const response = await fetch(
      '/api/admin/properties/bulk',
      {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          properties: csvItems
        })
      }
    );

    let data = {};

    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      $('importStatus').textContent =
        data.error ||
        'Falha na importação.';

      return;
    }

    $('importStatus').textContent =
      `${data.inserted || csvItems.length} imóveis importados com sucesso.`;

    csvItems = [];
    $('csvFile').value = '';
    $('importPreview').textContent = '';

    await refreshProperties();

  } catch (error) {
    $('importStatus').textContent =
      'Falha na importação.';
  } finally {
    $('importCsv').disabled =
      !csvItems.length;
  }
};

/* =========================
   INICIALIZAÇÃO
========================= */

updatePriceFields();

if (token) {
  authenticate(token);
}
