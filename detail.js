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

/* =========================================
   FOTOS DO IMÓVEL
========================================= */

function getImages(property) {
  const images = [];

  if (Array.isArray(property.images)) {
    property.images.forEach(item => {
      let url = '';

      if (typeof item === 'string') {
        url = item;
      } else if (item && typeof item === 'object') {
        url =
          item.url ||
          item.image_url ||
          item.public_url ||
          '';
      }

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

/* =========================================
   GALERIA
========================================= */

function setupGallery(images) {
  if (!images.length) return;

  let current = 0;

  const mainImage =
    document.getElementById('propertyMainImage');

  const counter =
    document.getElementById('propertyImageCounter');

  const thumbs =
    Array.from(
      document.querySelectorAll(
        '.property-gallery-thumb'
      )
    );

  const previous =
    document.getElementById('galleryPrevious');

  const next =
    document.getElementById('galleryNext');

  function selectImage(index) {
    if (index < 0) {
      index = images.length - 1;
    }

    if (index >= images.length) {
      index = 0;
    }

    current = index;

    if (mainImage) {
      mainImage.src = images[current];
    }

    if (counter) {
      counter.textContent =
        `${current + 1} / ${images.length}`;
    }

    thumbs.forEach((thumb, thumbIndex) => {
      thumb.classList.toggle(
        'active',
        thumbIndex === current
      );
    });
  }

  thumbs.forEach((thumb, index) => {
    thumb.addEventListener('click', () => {
      selectImage(index);
    });
  });

  if (previous) {
    previous.addEventListener('click', () => {
      selectImage(current - 1);
    });
  }

  if (next) {
    next.addEventListener('click', () => {
      selectImage(current + 1);
    });
  }

  selectImage(0);
}

/* =========================================
   LEAD
========================================= */

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
      'Não foi possível enviar. Tente novamente.';
  }
}

/* =========================================
   CARREGAR IMÓVEL
========================================= */

async function load() {
  if (!id) {
    root.innerHTML = `
      <div class="empty-state">
        <h2>Imóvel inválido</h2>
        <a href="/">Voltar aos imóveis</a>
      </div>
    `;

    return;
  }

  try {
    const response =
      await fetch(
        `/api/properties/${id}`,
        { cache: 'no-store' }
      );

    if (!response.ok) {
      root.innerHTML = `
        <div class="empty-state">
          <h2>Imóvel não encontrado</h2>
          <a href="/">Voltar aos imóveis</a>
        </div>
      `;

      return;
    }

    const p = await response.json();

    document.title =
      `${p.title} | Brito Imóveis`;

    const images = getImages(p);

    const mainImage =
      images[0] || '';

    const message =
      `Olá, tenho interesse no imóvel: ${p.title} (${p.neighborhood}, ${p.city}).`;

    const whatsappUrl =
      `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(message)}`;

    const thumbsHtml =
      images.map((image, index) => `
        <button
          type="button"
          class="property-gallery-thumb ${
            index === 0 ? 'active' : ''
          }"
          aria-label="Ver foto ${index + 1}"
        >
          <img
            src="${esc(image)}"
            alt="Foto ${index + 1} de ${esc(p.title)}"
            loading="lazy"
          >
        </button>
      `).join('');

    const bedrooms =
      Number(p.bedrooms || 0);

    const bathrooms =
      Number(p.bathrooms || 0);

    const parking =
      Number(p.parking || 0);

    const area =
      Number(p.area || 0);

    root.innerHTML = `

      <div class="property-breadcrumb">
        <a href="/">Início</a>
        <span>›</span>
        <a href="/">Imóveis</a>
        <span>›</span>
        <span>${esc(p.neighborhood || '')}</span>
        <span>›</span>
        <strong>Imóvel #${esc(p.id)}</strong>
      </div>

      <div class="property-main-grid">

        <section class="property-gallery-column">

          ${
            mainImage
              ? `
                <div class="property-gallery-main">

                  <span class="property-sale-badge">
                    ${esc(p.status || 'Disponível')}
                  </span>

                  <img
                    id="propertyMainImage"
                    src="${esc(mainImage)}"
                    alt="${esc(p.title)}"
                  >

                  ${
                    images.length > 1
                      ? `
                        <button
                          type="button"
                          id="galleryPrevious"
                          class="property-gallery-arrow property-gallery-arrow-left"
                          aria-label="Foto anterior"
                        >
                          ‹
                        </button>

                        <button
                          type="button"
                          id="galleryNext"
                          class="property-gallery-arrow property-gallery-arrow-right"
                          aria-label="Próxima foto"
                        >
                          ›
                        </button>
                      `
                      : ''
                  }

                  <span
                    id="propertyImageCounter"
                    class="property-gallery-counter"
                  >
                    1 / ${images.length}
                  </span>

                </div>

                ${
                  images.length > 1
                    ? `
                      <div class="property-gallery-thumbnails">
                        ${thumbsHtml}
                      </div>
                    `
                    : ''
                }
              `
              : `
                <div class="property-no-photo">
                  Sem fotos disponíveis
                </div>
              `
          }

          <div class="property-feature-grid">

            <div class="property-feature-card">
              <span class="property-feature-icon">▰</span>
              <div>
                <strong>${bedrooms}</strong>
                <span>quartos</span>
              </div>
            </div>

            <div class="property-feature-card">
              <span class="property-feature-icon">◉</span>
              <div>
                <strong>${bathrooms}</strong>
                <span>banheiros</span>
              </div>
            </div>

            <div class="property-feature-card">
              <span class="property-feature-icon">▣</span>
              <div>
                <strong>${parking}</strong>
                <span>vagas</span>
              </div>
            </div>

            <div class="property-feature-card">
              <span class="property-feature-icon">↗</span>
              <div>
                <strong>${area}</strong>
                <span>m²</span>
              </div>
            </div>

          </div>

          <article class="property-description-card">

            <h2>Sobre o imóvel</h2>

            <div class="property-title-line"></div>

            <p>
              ${esc(p.description || 'Entre em contato para mais informações sobre este imóvel.')}
            </p>

          </article>

        </section>

        <aside class="property-contact-card">

          <span class="property-code">
            CÓD. ${esc(p.id)}
          </span>

          <h1>
            ${esc(p.title)}
          </h1>

          <p class="property-location">
            📍 ${esc(p.neighborhood || '')} – ${esc(p.city || '')}/SP
          </p>

          <div class="property-price">
            ${money(p.price)}
          </div>

          <a
            class="property-whatsapp-button"
            href="${whatsappUrl}"
            target="_blank"
            rel="noopener"
          >
            Falar no WhatsApp
          </a>

          <form id="detailLeadForm">

            <div class="property-field">
              <label for="detailName">
                Nome
              </label>

              <input
                id="detailName"
                name="name"
                type="text"
                placeholder="Seu nome"
                required
              >
            </div>

            <div class="property-field">
              <label for="detailPhone">
                Telefone
              </label>

              <input
                id="detailPhone"
                name="phone"
                type="tel"
                placeholder="(11) 9 9999-9999"
                required
              >
            </div>

            <div class="property-field">
              <label for="detailEmail">
                E-mail
              </label>

              <input
                id="detailEmail"
                name="email"
                type="email"
                placeholder="seu@email.com"
              >
            </div>

            <div class="property-field">
              <label for="detailMessage">
                Mensagem
              </label>

              <textarea
                id="detailMessage"
                name="message"
                rows="4"
              >Tenho interesse neste imóvel (cód. ${esc(p.id)}). Gostaria de mais informações.</textarea>
            </div>

            <button
              class="property-send-button"
              type="submit"
            >
              Enviar mensagem
            </button>

            <p class="form-status"></p>

          </form>

          <div class="property-safe-message">
            🔒 Seus dados estão seguros
          </div>

        </aside>

      </div>
    `;

    setupGallery(images);

    const leadForm =
      document.getElementById(
        'detailLeadForm'
      );

    if (leadForm) {
      leadForm.addEventListener(
        'submit',
        event =>
          submitLead(event, p)
      );
    }

  } catch (error) {
    console.error(error);

    root.innerHTML = `
      <div class="empty-state">
        <h2>Não foi possível carregar o imóvel</h2>
        <a href="/">Voltar aos imóveis</a>
      </div>
    `;
  }
}

/* =========================================
   ANO DO RODAPÉ
========================================= */

const year =
  document.getElementById('currentYear');

if (year) {
  year.textContent =
    new Date().getFullYear();
}

load();
