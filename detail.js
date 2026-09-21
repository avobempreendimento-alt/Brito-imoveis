const SITE = { whatsapp: '5511963882742' };
const root = document.getElementById('propertyDetail');
const id = Number(new URLSearchParams(location.search).get('id'));
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));

async function submitLead(event, property) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector('.form-status');
  status.textContent = 'Enviando...';
  const payload = {
    name: form.elements.name.value, phone: form.elements.phone.value, email: form.elements.email.value,
    interest: 'Interesse em imóvel', propertyId: property.id, message: form.elements.message.value
  };
  const response = await fetch('/api/leads', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const data = await response.json();
  if (response.ok) { form.reset(); status.textContent = 'Contato enviado. Obrigado!'; }
  else status.textContent = data.error || 'Não foi possível enviar.';
}

async function load() {
  if (!id) { root.innerHTML = '<div class="empty-state"><h2>Imóvel inválido</h2><a href="/">Voltar</a></div>'; return; }
  const response = await fetch(`/api/properties/${id}`);
  if (!response.ok) { root.innerHTML = '<div class="empty-state"><h2>Imóvel não encontrado</h2><a href="/">Voltar</a></div>'; return; }
  const p = await response.json();
  document.title = `${p.title} | Brito Imóveis`;
  const message = `Olá, tenho interesse no imóvel: ${p.title} (${p.neighborhood}, ${p.city}).`;
  root.innerHTML = `
    <div class="detail-breadcrumb"><a href="/">Início</a><span>›</span><span>${esc(p.type)}</span></div>
    <section class="detail-hero"><div><span class="eyebrow">${esc(p.status)} · ${esc(p.type)}</span><h1>${esc(p.title)}</h1><p class="detail-location">${esc(p.neighborhood)}, ${esc(p.city)}</p></div><div class="detail-price">${money(p.price)}</div></section>
    <div class="detail-layout">
      <div><img class="detail-image" src="${esc(p.image)}" alt="${esc(p.title)}" /><div class="detail-features">${p.bedrooms ? `<div><strong>${p.bedrooms}</strong><span>quartos</span></div>`:''}${p.bathrooms ? `<div><strong>${p.bathrooms}</strong><span>banheiros</span></div>`:''}${p.parking ? `<div><strong>${p.parking}</strong><span>vagas</span></div>`:''}<div><strong>${p.area}</strong><span>m²</span></div></div><article class="detail-description"><h2>Sobre o imóvel</h2><p>${esc(p.description)}</p></article></div>
      <aside class="contact-card"><h2>Tenho interesse</h2><p>Envie seus dados ou fale direto pelo WhatsApp.</p><a class="btn btn-whatsapp btn-block" href="https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(message)}" target="_blank" rel="noopener">WhatsApp</a><div class="divider"><span>ou</span></div><form id="detailLeadForm"><div class="field-group"><label>Nome</label><input name="name" required /></div><div class="field-group"><label>Telefone / WhatsApp</label><input name="phone" required /></div><div class="field-group"><label>E-mail</label><input name="email" type="email" /></div><div class="field-group"><label>Mensagem</label><textarea name="message" rows="3">Tenho interesse neste imóvel.</textarea></div><button class="btn btn-primary btn-block" type="submit">Solicitar contato</button><p class="form-status"></p></form></aside>
    </div>`;
  document.getElementById('detailLeadForm').addEventListener('submit', e => submitLead(e, p));
}

document.getElementById('currentYear').textContent = new Date().getFullYear();
load();
