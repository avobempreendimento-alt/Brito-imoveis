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
    currency: 'BRL'
  }).format(Number(value) || 0);

const esc = value =>
  String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#039;',
    '"': '&quot;'
  }[char]));

function showTab(id) {
  document.querySelectorAll('.admin-panel-section').forEach(section => {
    section.classList.add('hidden');
  });

  const target = $(id);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.side-tab').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === id);
  });
}

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
  location.reload();
};

document.querySelectorAll('.side-tab').forEach(button => {
  button.onclick = () => showTab(button.dataset.tab);
});

function getMainImage(property) {
  if (property.image) return property.image;

  if (Array.isArray(property.images) && property.images.length) {
    const cover = property.images.find(image => image.is_cover);
    return cover?.image_url || property.images[0]?.image_url || '';
  }

  return '';
}

function getDisplayPrice(property) {
  if (property.purpose === 'Locação') {
    return `${money(property.rent_price)}/mês`;
  }

  if (property.purpose === 'Venda e Locação') {
    return `${money(property.sale_price)} | ${money(property.rent_price)}/mês`;
  }

  return money(property.sale_price ?? property.price);
}

function renderProperties(list) {
  const container = $('adminProperties');

  if (!list.length) {
    container.innerHTML = '<p>Nenhum imóvel cadastrado.</p>';
    return;
  }

  container.innerHTML = list.map(property => {
    const image = getMainImage(property);

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
          ${esc(property.purpose || property.status || '')}
        </span>

        <strong>${getDisplayPrice(property)}</strong>

        <div class="admin-actions">
          <button data-edit="${property.id}">Editar</button>
          <button class="danger" data-delete="${property.id}">
            Excluir
          </button>
        </div>
      </article>
    `;
  }).join('');

  document.querySelectorAll('[data-edit]').forEach(button => {
    button.onclick = () => editProperty(Number(button.dataset.edit));
  });

  document.querySelectorAll('[data-delete]').forEach(button => {
    button.onclick = () => deleteProperty(Number(button.dataset.delete));
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
      $('statProperties').textContent = '—';
      $('statAvailable').textContent = '—';
      return;
    }

    const data = await response.json();

    properties = Array.isArray(data) ? data : [];

    $('statProperties').textContent = properties.length;

    $('statAvailable').textContent = properties.filter(property => {
      const situation =
        property.property_status ||
        property.propertyStatus ||
        'Disponível';

      return situation === 'Disponível';
    }).length;

    renderProperties(properties);
  } catch (error) {
    $('statProperties').textContent = '—';
    $('statAvailable').textContent = '—';
  }
}

async function refreshLeads() {
  try {
    const response = await fetch('/api/admin/leads', {
      headers: headers(),
      cache: 'no-store'
    });

    if (!response.ok) {
      $('statLeads').textContent = '—';
      return;
    }

    const data = await response.json();
    const list = Array.isArray(data) ? data : [];

    $('statLeads').textContent = list.length;
    $('adminLeadCount').textContent = `${list.length} recebidos`;

    $('adminLeads').innerHTML = list.map(lead => `
      <article class="lead-list-item">
        <div>
          <strong>${esc(lead.name)}</strong>

          <span>
            ${esc(lead.phone || '')}
            ${lead.email ? ` · ${esc(lead.email)}` : ''}
          </span>

          <span>
            ${esc(lead.interest || '')}
            ${lead.property_title
              ? ` · ${esc(lead.property_title)}`
              : ''}
          </span>
        </div>

        <p>${esc(lead.message || '')}</p>

        <small>
          ${
            lead.created_at
              ? new Date(lead.created_at).toLocaleString('pt-BR')
              : ''
          }
        </small>
      </article>
    `).join('') || '<p>Nenhum lead recebido.</p>';

  } catch (error) {
    $('statLeads').textContent = '—';
  }
}

async function refreshAll() {
  await Promise.all([
    refreshProperties(),
    refreshLeads()
  ]);
}

$('adminSearch').oninput = event => {
  const search = event.target.value.toLowerCase().trim();

  const filtered = properties.filter(property => {
    const text = `
      ${property.title || ''}
      ${property.city || ''}
      ${property.neighborhood || ''}
    `.toLowerCase();

    return text.includes(search);
  });

  renderProperties(filtered);
};

function updatePriceFields() {
  const purpose = $('pPurpose').value;

  $('salePriceGroup').classList.toggle(
    'hidden',
    purpose === 'Locação'
  );

  $('rentPriceGroup').classList.toggle(
    'hidden',
    purpose === 'Venda'
  );
}

$('pPurpose').onchange = updatePriceFields;

function previewSelectedImages() {
  const preview = $('imagePreview');
  const files = Array.from($('pImages').files || []);

  preview.innerHTML = '';

  files.forEach((file, index) => {
    const reader = new FileReader();

    reader.onload = event => {
      const item = document.createElement('div');
      item.className = 'property-image-preview-item';

      item.innerHTML = `
        <img src="${event.target.result}" alt="Foto ${index + 1}">
        ${index === 0 ? '<span>Capa</span>' : ''}
      `;

      preview.appendChild(item);
    };

    reader.readAsDataURL(file);
  });
}

$('pImages').onchange = previewSelectedImages;

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
    status: purpose,
    area: Number($('pArea').value || 0),
    bedrooms: Number($('pBedrooms').value || 0),
    bathrooms: Number($('pBathrooms').value || 0),
    parking: Number($('pParking').value || 0),
    description: $('pDescription').value.trim()
  };
}

async function uploadPropertyImages(propertyId) {
  const files = Array.from($('pImages').files || []);

  if (!files.length) return true;

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
      data.error || 'Não foi possível enviar as fotos.'
    );
  }

  return true;
}

$('propertyForm').onsubmit = async event => {
  event.preventDefault();

  const id = $('pId').value;
  const status = $('propertyFormStatus');
  const saveButton = $('saveProperty');

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
        body: JSON.stringify(propertyPayload())
      }
    );

    let data = {};

    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      status.textContent =
        data.error || 'Não foi possível salvar o imóvel.';
      return;
    }

    const propertyId =
      id ||
      data.id ||
      data.property?.id;

    if ($('pImages').files.length && propertyId) {
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
    status.textContent =
      error.message || 'Não foi possível salvar o imóvel.';
  } finally {
    saveButton.disabled = false;
  }
};

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
    'Disponível';

  $('pCity').value = property.city || 'Caieiras';
  $('pNeighborhood').value = property.neighborhood || '';

  $('pSalePrice').value =
    property.sale_price ??
    property.price ??
    '';

  $('pRentPrice').value =
    property.rent_price ?? '';

  $('pArea').value = property.area || 0;
  $('pBedrooms').value = property.bedrooms || 0;
  $('pBathrooms').value = property.bathrooms || 0;
  $('pParking').value = property.parking || 0;
  $('pDescription').value = property.description || '';

  $('formTitle').textContent = 'Editar imóvel';
  $('saveProperty').textContent = 'Salvar alterações';
  $('cancelEdit').classList.remove('hidden');

  $('imagePreview').innerHTML = '';

  updatePriceFields();
  showTab('newPanel');
}

function resetForm() {
  $('propertyForm').reset();

  $('pId').value = '';
  $('pCity').value = 'Caieiras';
  $('pPurpose').value = 'Venda';
  $('pPropertyStatus').value = 'Disponível';

  $('formTitle').textContent = 'Adicionar novo imóvel';
  $('saveProperty').textContent = 'Publicar imóvel';
  $('cancelEdit').classList.add('hidden');
  $('imagePreview').innerHTML = '';

  updatePriceFields();
}

$('cancelEdit').onclick = () => {
  resetForm();
  showTab('propertiesPanel');
};

async function deleteProperty(id) {
  if (!confirm('Excluir este imóvel?')) return;

  const response = await fetch(
    `/api/admin/properties/${id}`,
    {
      method: 'DELETE',
      headers: headers()
    }
  );

  if (!response.ok) {
    alert('Não foi possível excluir o imóvel.');
    return;
  }

  await refreshProperties();
}

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
      if (char === '\r' && next === '\n') i++;

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
    rows.push(row);
  }

  if (rows.length < 2) return [];

  const headersRow = rows[0].map(value =>
    value.toLowerCase().trim()
  );

  return rows.slice(1).map(values =>
    Object.fromEntries(
      headersRow.map((key, index) => [
        key,
        values[index] ?? ''
      ])
    )
  );
}

$('csvFile').onchange = async () => {
  const file = $('csvFile').files[0];

  if (!file) return;

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

    const data = await response.json();

    $('importStatus').textContent = response.ok
      ? `${data.inserted} imóveis importados com sucesso.`
      : data.error || 'Falha na importação.';

    if (response.ok) {
      csvItems = [];
      $('csvFile').value = '';
      $('importPreview').textContent = '';
      await refreshProperties();
    }
  } catch (error) {
    $('importStatus').textContent =
      'Falha na importação.';
  }

  $('importCsv').disabled = false;
};

updatePriceFields();

if (token) {
  authenticate(token);
}
