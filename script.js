const SITE = {
  // Troque pelo WhatsApp real da Brito Imóveis antes de publicar.
  whatsapp: '5511963882742'
};

const grid = document.getElementById('propertiesGrid');
const resultCount = document.getElementById('resultCount');
const emptyState = document.getElementById('emptyState');
const searchForm = document.getElementById('searchForm');
const purposeFilter = document.getElementById('finalidade');
const typeFilter = document.getElementById('tipo');
const cityFilter = document.getElementById('cidade');
const priceFilter = document.getElementById('preco');
const areaFilter = document.getElementById('area');
const bedroomFilter = document.getElementById('quartos');
const suitesFilter = document.getElementById('suites');
const parkingFilter = document.getElementById('vagas');
const clearFilters = document.getElementById('clearFilters');
const menuToggle = document.getElementById('menuToggle');
const mainNav = document.getElementById('mainNav');

const formatCurrency = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));

function configureWhatsApp() {
  document.querySelectorAll('[data-whatsapp]').forEach(link => {
    const message = link.dataset.message || 'Olá, quero falar com a Brito Imóveis.';
    link.href = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(message)}`;
    link.target = '_blank'; link.rel = 'noopener noreferrer';
  });
}

function propertyCard(p) {
  const tags = [p.bedrooms ? `${p.bedrooms} qto${p.bedrooms > 1 ? 's' : ''}` : '', p.bathrooms ? `${p.bathrooms} banh.` : '', p.parking ? `${p.parking} vaga${p.parking > 1 ? 's' : ''}` : '', `${p.area} m²`].filter(Boolean);
  return `<article class="property-card">
    <a class="property-image-wrap" href="/imovel?id=${p.id}"><img class="property-image" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" loading="lazy" /><span class="property-type">${escapeHtml(p.status)} · ${escapeHtml(p.type)}</span></a>
    <div class="property-body"><div class="property-price">${formatCurrency(p.price)}</div><h3 class="property-title"><a href="/imovel?id=${p.id}">${escapeHtml(p.title)}</a></h3><p class="property-location">${escapeHtml(p.neighborhood)}, ${escapeHtml(p.city)}</p><div class="property-tags">${tags.map(t => `<span class="property-tag">${escapeHtml(t)}</span>`).join('')}</div><a class="card-link" href="/imovel?id=${p.id}">Ver detalhes →</a></div>
  </article>`;
}

function addRange(params, value, minName, maxName) {
  if (!value) return;
  const [min, max] = value.split('-');
  if (min && Number(min) > 0) params.set(minName, min);
  if (max && Number(max) > 0) params.set(maxName, max);
}

function updatePriceLabel() {
  const label = document.querySelector('label[for="preco"]');
  if (label) label.textContent = purposeFilter.value === 'Locação' ? 'Preço do aluguel' : 'Preço de venda';
}

async function loadProperties() {
  const params = new URLSearchParams();
  if (purposeFilter.value) params.set('purpose', purposeFilter.value);
  if (typeFilter.value) params.set('type', typeFilter.value);
  if (cityFilter.value.trim()) params.set('city', cityFilter.value.trim());
  addRange(params, priceFilter.value, 'minPrice', 'maxPrice');
  addRange(params, areaFilter.value, 'minArea', 'maxArea');
  if (bedroomFilter.value) params.set('bedrooms', bedroomFilter.value);
  if (suitesFilter.value) params.set('suites', suitesFilter.value);
  if (parkingFilter.value) params.set('parking', parkingFilter.value);
  grid.innerHTML = '<div class="loading-card">Buscando imóveis...</div>';
  try {
    const response = await fetch(`/api/properties?${params}`);
    const list = await response.json();
    grid.innerHTML = list.map(propertyCard).join('');
    const total = list.length;
    resultCount.textContent = `${total} ${total === 1 ? 'imóvel encontrado' : 'imóveis encontrados'}`;
    emptyState.classList.toggle('hidden', total !== 0);
  } catch {
    grid.innerHTML = '';
    resultCount.textContent = 'Não foi possível carregar os imóveis.';
  }
}

searchForm.addEventListener('submit', e => { e.preventDefault(); loadProperties(); });
[purposeFilter, typeFilter, priceFilter, areaFilter, bedroomFilter, suitesFilter, parkingFilter].forEach(el => el.addEventListener('change', () => { updatePriceLabel(); loadProperties(); }));
let cityTimer; cityFilter.addEventListener('input', () => { clearTimeout(cityTimer); cityTimer = setTimeout(loadProperties, 300); });
clearFilters.addEventListener('click', () => { searchForm.reset(); purposeFilter.value = 'Venda'; updatePriceLabel(); loadProperties(); });

menuToggle.addEventListener('click', () => { const open = mainNav.classList.toggle('open'); menuToggle.setAttribute('aria-expanded', String(open)); });
mainNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { mainNav.classList.remove('open'); menuToggle.setAttribute('aria-expanded', 'false'); }));

const ownerLeadForm = document.getElementById('ownerLeadForm');
ownerLeadForm.addEventListener('submit', async e => {
  e.preventDefault();
  const status = document.getElementById('ownerFormStatus');
  status.textContent = 'Enviando...';
  const payload = {
    name: document.getElementById('ownerName').value,
    phone: document.getElementById('ownerPhone').value,
    email: document.getElementById('ownerEmail').value,
    interest: document.getElementById('ownerInterest').value,
    message: document.getElementById('ownerMessage').value
  };
  const response = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (response.ok) { ownerLeadForm.reset(); status.textContent = 'Dados enviados com sucesso. Obrigado!'; }
  else status.textContent = data.error || 'Não foi possível enviar.';
});

document.getElementById('currentYear').textContent = new Date().getFullYear();
configureWhatsApp();
updatePriceLabel();
loadProperties();
