const SITE = {
  whatsapp: '5511963882742'
};

const root = document.getElementById('propertyDetail');

const id = Number(
  new URLSearchParams(location.search).get('id')
);

const money = value =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(Number(value) || 0);

const esc = value =>
  String(value ?? '').replace(
    /[&<>'"]/g,
    ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#039;',
      '"': '&quot;'
    }[ch])
  );

function getImages(property) {
  const images = [];

  if (
    Array.isArray(property.images) &&
    property.images.length
  ) {
    property.images.forEach(item => {
      const url =
        typeof item === 'string'
          ? item
          : item.url || item.image_url || '';

      if (url && !images.includes(url)) {
        images.push(url);
      }
    });
  }

  if (
    property.image &&
    !images.includes(property.image)
  ) {
    images.unshift(property.image);
  }

  return images;
}

function selectImage(url, button) {
  const mainImage =
    document.getElementById('detailMainImage');

  if (!mainImage) return;

  mainImage.src = url;

  document
    .querySelectorAll('.detail-thumbnail')
    .forEach(item => {
      item.classList.remove('active');
    });

  if (button) {
    button.classList.add('active');
  }
}

async function submitLead(event, property) {
  event.preventDefault();

  const form = event.currentTarget;
  const status =
    form.querySelector('.form-status');

  status.textContent = 'Enviando...';

  const payload = {
    name: form.elements.name.value,
    phone: form.elements.phone.value,
    email: form.elements.email.value,
    interest: 'Interesse em imóvel',
    propertyId: property.id,
    message: form.elements.message.value
  };

  try {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let data = {};

    try {
      data = await response.json();
    } catch {}

    if (response.ok) {
      form.reset();
      status.textContent =
        'Contato enviado. Obrigado!';
    } else {
      status.textContent =
        data.error ||
        'Não foi possível enviar.';
    }
  } catch (error) {
    status.textContent =
      'Não foi possível enviar.';
  }
}

async function load() {
  if (!id) {
    root.innerHTML = `
      <div class="empty-state">
        <h2>Imóvel inválido</h2>
        <a href="/">Voltar</a>
      </div>
    `;

    return;
  }

  try {
    const response = await fetch(
      `/api/properties/${id}`,
      {
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      root.innerHTML = `
        <div class="empty-state">
          <h2>Imóvel não encontrado</h2>
          <a href="/">Voltar</a>
        </div>
      `;

      return;
    }

    const p = await response.json();

    document.title =
      `${p.title} | Brito Imóveis`;

    const message =
      `Olá, tenho interesse no imóvel: ` +
      `${p.title} (${p.neighborhood}, ${p.city}).`;

    const images = getImages(p);

    const mainImage =
      images.length
        ? images[0]
        : '';

    const gallery = images.length
      ? `
        <div class="detail-gallery">

          <div class="detail-main-image-wrap">
            <img
              id="detailMainImage"
              class="detail-image"
              src="${esc(mainImage)}"
              alt="${esc(p.title)}"
            />
          </div>

          ${
            images.length > 1
              ? `
                <div class="detail-thumbnails">
                  ${images.map((image, index) => `
                    <button
                      type="button"
                      class="detail-thumbnail ${
                        index === 0 ? 'active' : ''
                      }"
                      data-image="${esc(image)}"
                      aria-label="Ver foto ${index + 1}"
                    >
                      <img
                        src="${esc(image)}"
                        alt="Foto ${index + 1} de ${esc(p.title)}"
                      />
                    </button>
                  `).join('')}
                </div>
              `
              : ''
          }

        </div>
      `
      : `
        <div class="detail-no-image">
          Sem foto disponível
        </div>
      `;

    root.innerHTML = `
      <div class="detail-breadcrumb">
        <a href="/">Início</a>
        <span>›</span>
        <span>${esc(p.type)}</span>
      </div>

      <section class="detail-hero">
        <div>
          <span class="eyebrow">
            ${esc(p.status)} · ${esc(p.type)}
          </span>

          <h1>${esc(p.title)}</h1>

          <p class="detail-location">
            ${esc(p.neighborhood)}, ${esc(p.city)}
          </p>
        </div>

        <div class="detail-price">
          ${money(p.price)}
        </div>
      </section>

      <div class="detail-layout">

        <div>

          ${gallery}

          <div class="detail-features">

            ${
              p.bedrooms
                ? `
                  <div>
                    <strong>${p.bedrooms}</strong>
                    <span>quartos</span>
                  </div>
                `
                : ''
            }

            ${
              p.bathrooms
                ? `
                  <div>
                    <strong>${p.bathrooms}</strong>
                    <span>banheiros</span>
                  </div>
                `
                : ''
            }

            ${
              p.parking
                ? `
                  <div>
                    <strong>${p.parking}</strong>
                    <span>vagas</span>
                  </div>
                `
                : ''
            }

            <div>
              <strong>${p.area}</strong>
              <span>m²</span>
            </div>

          </div>

          <article class="detail-description">
            <h2>Sobre o imóvel</h2>
            <p>${esc(p.description)}</p>
          </article>

        </div>

        <aside class="contact-card">

          <h2>Tenho interesse</h2>

          <p>
            Envie seus dados ou fale direto
            pelo WhatsApp.
          </p>

          <a
            class="btn btn-whatsapp btn-block"
            href="https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(message)}"
            target="_blank"
            rel="noopener"
          >
            WhatsApp
          </a>

          <div class="divider">
            <span>ou</span>
          </div>

          <form id="detailLeadForm">

            <div class="field-group">
              <label>Nome</label>
              <input
                name="name"
                required
              />
            </div>

            <div class="field-group">
              <label>Telefone / WhatsApp</label>
              <input
                name="phone"
                required
              />
            </div>

            <div class="field-group">
              <label>E-mail</label>
              <input
                name="email"
                type="email"
              />
            </div>

            <div class="field-group">
              <label>Mensagem</label>
              <textarea
                name="message"
                rows="3"
              >Tenho interesse neste imóvel.</textarea>
            </div>

            <button
              class="btn btn-primary btn-block"
              type="submit"
            >
              Solicitar contato
            </button>

            <p class="form-status"></p>

          </form>

        </aside>

      </div>
    `;

    document
      .querySelectorAll('.detail-thumbnail')
      .forEach(button => {
        button.addEventListener(
          'click',
          () => {
            selectImage(
              button.dataset.image,
              button
            );
          }
        );
      });

    document
      .getElementById('detailLeadForm')
      .addEventListener(
        'submit',
        event =>
          submitLead(event, p)
      );

  } catch (error) {
    console.error(error);

    root.innerHTML = `
      <div class="empty-state">
        <h2>Não foi possível carregar o imóvel</h2>
        <a href="/">Voltar</a>
      </div>
    `;
  }
}

const year =
  document.getElementById('currentYear');

if (year) {
  year.textContent =
    new Date().getFullYear();
}

load();
// Galeria de fotos ativa
