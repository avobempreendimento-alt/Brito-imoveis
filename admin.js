const loginBox = document.getElementById('adminLogin');
const panel = document.getElementById('adminPanel');
const tokenInput = document.getElementById('adminToken');
const statusEl = document.getElementById('adminStatus');
let token = sessionStorage.getItem('britoAdminToken') || '';

function headers() { return { 'Content-Type': 'application/json', 'X-Admin-Token': token }; }
const money = value => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 }).format(value);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));

async function authenticate(candidate) {
  token = candidate;
  const response = await fetch('/api/admin/properties', { headers: headers() });
  if (!response.ok) { token = ''; statusEl.textContent = 'Token inválido.'; return false; }
  sessionStorage.setItem('britoAdminToken', token);
  loginBox.classList.add('hidden'); panel.classList.remove('hidden');
  await refreshAll(); return true;
}

document.getElementById('adminAccess').addEventListener('click', () => authenticate(tokenInput.value));
tokenInput.addEventListener('keydown', e => { if (e.key === 'Enter') authenticate(tokenInput.value); });
document.getElementById('adminLogout').addEventListener('click', () => { sessionStorage.removeItem('britoAdminToken'); location.reload(); });

async function refreshProperties() {
  const response = await fetch('/api/admin/properties', { headers: headers() });
  if (!response.ok) return;
  const list = await response.json();
  document.getElementById('adminPropertyCount').textContent = `${list.length} cadastrados`;
  document.getElementById('adminProperties').innerHTML = list.map(p => `<article class="admin-list-item"><img src="${esc(p.image)}" alt=""><div><strong>${esc(p.title)}</strong><span>${esc(p.neighborhood)}, ${esc(p.city)} · ${money(p.price)}</span></div><button class="delete-button" data-delete="${p.id}" aria-label="Excluir imóvel">Excluir</button></article>`).join('') || '<p>Nenhum imóvel cadastrado.</p>';
  document.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Excluir este imóvel?')) return;
    await fetch(`/api/admin/properties/${btn.dataset.delete}`, { method:'DELETE', headers: headers() });
    refreshProperties();
  }));
}

async function refreshLeads() {
  const response = await fetch('/api/admin/leads', { headers: headers() });
  if (!response.ok) return;
  const list = await response.json();
  document.getElementById('adminLeadCount').textContent = `${list.length} recebidos`;
  document.getElementById('adminLeads').innerHTML = list.map(l => `<article class="lead-list-item"><div><strong>${esc(l.name)}</strong><span>${esc(l.phone)}${l.email ? ` · ${esc(l.email)}` : ''}</span><span>${esc(l.interest)}${l.property_title ? ` · ${esc(l.property_title)}` : ''}</span></div><p>${esc(l.message || '')}</p><small>${new Date(l.created_at + 'Z').toLocaleString('pt-BR')}</small></article>`).join('') || '<p>Nenhum lead recebido.</p>';
}

async function refreshAll() { await Promise.all([refreshProperties(), refreshLeads()]); }

document.getElementById('propertyForm').addEventListener('submit', async e => {
  e.preventDefault();
  const status = document.getElementById('propertyFormStatus');
  const payload = {
    title: document.getElementById('pTitle').value, type: document.getElementById('pType').value, status: document.getElementById('pStatus').value,
    city: document.getElementById('pCity').value, neighborhood: document.getElementById('pNeighborhood').value, price: Number(document.getElementById('pPrice').value), area: Number(document.getElementById('pArea').value),
    bedrooms: Number(document.getElementById('pBedrooms').value), bathrooms: Number(document.getElementById('pBathrooms').value), parking: Number(document.getElementById('pParking').value),
    image: document.getElementById('pImage').value, description: document.getElementById('pDescription').value
  };
  status.textContent = 'Salvando...';
  const response = await fetch('/api/admin/properties', { method:'POST', headers: headers(), body: JSON.stringify(payload) });
  const data = await response.json();
  if (response.ok) { e.currentTarget.reset(); document.getElementById('pCity').value = 'Caieiras'; status.textContent = 'Imóvel cadastrado com sucesso.'; refreshProperties(); }
  else status.textContent = data.error || 'Não foi possível cadastrar.';
});

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active')); tab.classList.add('active');
  document.querySelectorAll('.admin-panel-section').forEach(x => x.classList.add('hidden')); document.getElementById(tab.dataset.tab).classList.remove('hidden');
}));

if (token) authenticate(token);
