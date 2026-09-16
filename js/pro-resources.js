/* Progressive enhancement for the resource library and trade inquiry paths. */
(function () {
  'use strict';
  const tools = document.querySelector('[data-resource-tools]');
  if (tools) {
    const cards = Array.from(document.querySelectorAll('[data-resource-card]'));
    const search = tools.querySelector('[name="search"]');
    const product = tools.querySelector('[name="product"]');
    const type = tools.querySelector('[name="type"]');
    const status = document.querySelector('[data-resource-count]');
    const empty = document.querySelector('[data-resource-empty]');
    const params = new URLSearchParams(location.search);
    [product, type].forEach(function (select) {
      const value = params.get(select.name);
      if (Array.from(select.options).some(o => o.value === value)) select.value = value;
    });
    search.value = (params.get('search') || '').slice(0, 160);
    function filter() {
      const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let count = 0;
      cards.forEach(function (card) {
        const show = (!product.value || card.dataset.product.split(' ').includes(product.value))
          && (!type.value || card.dataset.type === type.value)
          && words.every(word => card.textContent.toLowerCase().includes(word));
        card.hidden = !show;
        if (show) count++;
      });
      status.textContent = count + ' resource' + (count === 1 ? '' : 's') + ' shown';
      empty.hidden = count > 0;
    }
    function reset() {
      search.value = ''; product.value = ''; type.value = ''; filter(); search.focus();
    }
    tools.hidden = false;
    tools.addEventListener('input', filter);
    tools.addEventListener('change', filter);
    tools.addEventListener('submit', e => e.preventDefault());
    document.querySelectorAll('[data-resource-reset]').forEach(b => b.addEventListener('click', reset));
    filter();
  }

  const tradeForm = document.querySelector('[data-trade-form]');
  if (tradeForm) {
    const reason = tradeForm.elements.request_type;
    const role = tradeForm.elements.role;
    const paths = {
      contractor: ['Builder / Contractor', 'Installation support'],
      dealer: ['Dealer / Distributor', 'Dealer / distributor inquiry'],
      specifier: ['Architect / Designer', 'Technical documents'],
      samples: ['', 'Trade sample kit inquiry']
    };
    function preselect(key) {
      const path = paths[key];
      if (!path) return;
      if (path[0]) role.value = path[0];
      reason.value = path[1];
    }
    preselect(new URLSearchParams(location.search).get('inquiry'));
    document.querySelectorAll('[data-pro-inquiry]').forEach(a => a.addEventListener('click', function () {
      preselect(a.dataset.proInquiry);
    }));
  }

  const contactForm = document.querySelector('[data-contact-routing]');
  if (contactForm) {
    const params = new URLSearchParams(location.search);
    const zip = params.get('zip') || '';
    const product = params.get('product') || '';
    const interests = {
      truegrain: 'Decking', legacy: 'Decking', porch: 'Porch Flooring',
      mouldings: 'Mouldings', invisiclip: 'InvisiClip Hidden Fastener System'
    };
    if (params.get('intent') === 'dealer') {
      document.getElementById('contact-form-title').textContent = 'Find where to buy';
      document.getElementById('contact-form-description').textContent =
        'Tell us where you are building and which product you need. Our team will help you find a purchasing option for your project.';
      contactForm.elements._subject.value = 'Where to Buy inquiry';
      contactForm.elements._form_source.value = 'where-to-buy';
      contactForm.elements._next.value = './thanks.html?type=contact&src=Where%20to%20Buy';
      if (/^\d{5}(?:-\d{4})?$/.test(zip)) contactForm.elements.zip.value = zip;
      contactForm.querySelectorAll('[name="interest[]"]').forEach(input => {
        if (input.value === interests[product]) input.checked = true;
      });
      const names = { truegrain: 'TrueGrain Deck', legacy: 'Legacy PVC Decking', porch: 'Porch Flooring', mouldings: 'PVC Mouldings', invisiclip: 'InvisiClip' };
      if (names[product]) contactForm.elements.message.value = 'I am looking for ' + names[product] + '. Please help me find where to buy it.';
    }
  }

  // The shared partials resolve absolute URLs; compare parsed paths for active navigation.
  document.querySelectorAll('.nav > a, .mobile-menu > ul > li > a').forEach(function (a) {
    if (new URL(a.href, location.href).pathname === location.pathname) {
      a.classList.add('is-active'); a.setAttribute('aria-current', 'page');
    }
  });
})();
