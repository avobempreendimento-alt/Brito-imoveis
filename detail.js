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

  // Galeria ampliada em tela cheia
  const lightbox = document.createElement('div');
  lightbox.className = 'property-lightbox';
  lightbox.setAttribute('aria-hidden', 'true');
  lightbox.innerHTML = `
    <div class="property-lightbox-backdrop"></div>
    <div class="property-lightbox-dialog" role="dialog" aria-modal="true" aria-label="Galeria de fotos do imóvel">
      <button type="button" class="property-lightbox-close" aria-label="Fechar galeria">×</button>
      <div class="property-lightbox-counter"></div>
      <button type="button" class="property-lightbox-arrow property-lightbox-arrow-left" aria-label="Foto anterior">‹</button>
      <img class="property-lightbox-image" alt="Foto ampliada do imóvel">
      <button type="button" class="property-lightbox-arrow property-lightbox-arrow-right" aria-label="Próxima foto">›</button>
      <div class="property-lightbox-thumbs"></div>
    </div>
  `;
  document.body.appendChild(lightbox);

  const lightboxImage = lightbox.querySelector('.property-lightbox-image');
  const lightboxCounter = lightbox.querySelector('.property-lightbox-counter');
  const lightboxThumbs = lightbox.querySelector('.property-lightbox-thumbs');

  lightboxThumbs.innerHTML = images.map((image, index) => `
    <button type="button" class="property-lightbox-thumb" data-index="${index}" aria-label="Ver foto ${index + 1}">
      <img src="${image}" alt="Foto ${index + 1}" loading="lazy">
    </button>
  `).join('');

  function updateLightbox() {
    lightboxImage.src = images[current];
    lightboxCounter.textContent = `${current + 1} / ${images.length}`;
    lightbox.querySelectorAll('.property-lightbox-thumb').forEach((thumb, index) => {
      thumb.classList.toggle('active', index === current);
      if (index === current) thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  }

  function openLightbox() {
    updateLightbox();
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.classList.add('lightbox-open');
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('lightbox-open');
  }

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

  if (mainImage) {
    mainImage.classList.add('property-gallery-main-clickable');
    mainImage.title = 'Clique para ampliar';
    mainImage.addEventListener('click', openLightbox);
  }

  lightbox.querySelector('.property-lightbox-close').addEventListener('click', closeLightbox);
  lightbox.querySelector('.property-lightbox-backdrop').addEventListener('click', closeLightbox);
  lightbox.querySelector('.property-lightbox-arrow-left').addEventListener('click', () => {
    selectImage(current - 1);
    updateLightbox();
  });
  lightbox.querySelector('.property-lightbox-arrow-right').addEventListener('click', () => {
    selectImage(current + 1);
    updateLightbox();
  });
  lightboxThumbs.addEventListener('click', (event) => {
    const button = event.target.closest('.property-lightbox-thumb');
    if (!button) return;
    selectImage(Number(button.dataset.index));
    updateLightbox();
  });
  document.addEventListener('keydown', (event) => {
    if (!lightbox.classList.contains('open')) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') { selectImage(current - 1); updateLightbox(); }
    if (event.key === 'ArrowRight') { selectImage(current + 1); updateLightbox(); }
  });

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

    const suites =
      Number(p.suites || 0);

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
              <span class="property-feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 7v10M21 17V10a2 2 0 0 0-2-2h-7v9M3 13h18M5 10h5v3H5z"/></svg></span>
              <div><strong>${bedrooms}</strong><span>quartos</span></div>
            </div>
            <div class="property-feature-card">
              <span class="property-feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM7 12V7a3 3 0 0 1 6 0M4 19l-1 2M20 19l1 2"/></svg></span>
              <div><strong>${bathrooms}</strong><span>banheiros</span></div>
            </div>
            <div class="property-feature-card">
              <span class="property-feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 8v9M21 17v-6a2 2 0 0 0-2-2h-7v8M3 13h18M5 10h5v3H5zM17 3l.8 1.7 1.9.3-1.4 1.3.4 1.9L17 7.3l-1.7.9.4-1.9L14.3 5l1.9-.3z"/></svg></span>
              <div><strong>${suites}</strong><span>suítes</span></div>
            </div>
            <div class="property-feature-card">
              <span class="property-feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 17h14l-1-6-2-3H8l-2 3zM7 17v2M17 17v2M7 13h10M8 8l1-2h6l1 2"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/></svg></span>
              <div><strong>${parking}</strong><span>vagas</span></div>
            </div>
            <div class="property-feature-card">
              <span class="property-feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 18 18 6M12 6h6v6M6 12v6h6"/></svg></span>
              <div><strong>${area}</strong><span>m²</span></div>
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

          <button class="property-share-button" id="sharePropertyButton" type="button">
            <span aria-hidden="true">↗</span> Compartilhar imóvel
          </button>
          <p class="property-share-status" id="sharePropertyStatus" aria-live="polite"></p>

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

    const shareButton = document.getElementById('sharePropertyButton');
    const shareStatus = document.getElementById('sharePropertyStatus');

    if (shareButton) {
      shareButton.addEventListener('click', async () => {
        const shareData = { title: p.title, text: `Confira este imóvel: ${p.title}`, url: window.location.href };
        try {
          if (navigator.share) { await navigator.share(shareData); return; }
          await navigator.clipboard.writeText(window.location.href);
          shareStatus.textContent = 'Link copiado!';
          setTimeout(() => { shareStatus.textContent = ''; }, 2500);
        } catch (error) {
          if (error && error.name === 'AbortError') return;
          shareStatus.textContent = 'Copie o endereço desta página para compartilhar.';
        }
      });
    }

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
