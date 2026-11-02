/* global document, setTimeout */
// Progressive enhancement for Kochi Tours
// Vanilla JS: 0 dependencies, fast on mobile 4G, strictly client-side enhancement.

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Live Theme & Duration Filter Bar (Homepage)
  // ---------------------------------------------------------------------------
  function initCatalogFilters() {
    const filterContainer = document.getElementById('catalog-filters');
    if (!filterContainer) return;

    let activeFilter = 'all';
    let activeDuration = 'all';

    const filterPills = filterContainer.querySelectorAll('[data-filter]');
    const durationPills = filterContainer.querySelectorAll('[data-duration]');
    const trips = document.querySelectorAll('.trip');
    const themeSections = document.querySelectorAll('.theme');
    const countBadge = document.querySelector('.section-head .count');

    function applyFilters() {
      let visibleCount = 0;

      trips.forEach((trip) => {
        const whatEl = trip.querySelector('.cell.what');
        const tags = (whatEl ? whatEl.textContent : '').toLowerCase();
        const lenEl = trip.querySelector('.cell.len');
        const lenMatch = (lenEl ? lenEl.textContent : '').match(/(\d+)\s*day/i);
        const days = lenMatch ? parseInt(lenMatch[1], 10) : 0;

        let matchesFilter = true;
        if (activeFilter !== 'all') {
          if (activeFilter === 'houseboat') matchesFilter = tags.includes('houseboat') || tags.includes('backwater');
          else if (activeFilter === 'tea_plantations') matchesFilter = tags.includes('tea') || tags.includes('hill') || tags.includes('wildlife');
          else if (activeFilter === 'heritage') matchesFilter = tags.includes('temple') || tags.includes('heritage') || tags.includes('culture');
          else if (activeFilter === 'beaches') matchesFilter = tags.includes('beach') || tags.includes('coast');
          else matchesFilter = tags.includes(activeFilter);
        }

        let matchesDuration = true;
        if (activeDuration === 'short') matchesDuration = days <= 5;
        else if (activeDuration === 'medium') matchesDuration = days === 6;
        else if (activeDuration === 'long') matchesDuration = days >= 7;

        if (matchesFilter && matchesDuration) {
          trip.classList.remove('is-hidden');
          visibleCount++;
        } else {
          trip.classList.add('is-hidden');
        }
      });

      // Show/hide theme sections based on whether any child trip is visible
      themeSections.forEach((sec) => {
        const hasVisible = sec.querySelectorAll('.trip:not(.is-hidden)').length > 0;
        sec.style.display = hasVisible ? '' : 'none';
      });

      if (countBadge) {
        countBadge.textContent = `${visibleCount} ${visibleCount === 1 ? 'journey' : 'journeys'} matching`;
      }
    }

    filterPills.forEach((btn) => {
      btn.addEventListener('click', () => {
        filterPills.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.getAttribute('data-filter') || 'all';
        applyFilters();
      });
    });

    durationPills.forEach((btn) => {
      btn.addEventListener('click', () => {
        durationPills.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        activeDuration = btn.getAttribute('data-duration') || 'all';
        applyFilters();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Interactive Fare & Party Calculator (Package Detail)
  // ---------------------------------------------------------------------------
  function initFareCalculator() {
    const calc = document.getElementById('fare-calculator');
    if (!calc) return;

    let seasons = [];
    try {
      seasons = JSON.parse(calc.getAttribute('data-seasons') || '[]');
    } catch {
      return;
    }
    if (seasons.length === 0) return;

    let selectedSeason = seasons[0];
    let adults = 2;
    let children = 0;

    const seasonButtons = calc.querySelectorAll('.calc-season-btn');
    const adultsEl = calc.querySelector('.calc-val-adults');
    const childrenEl = calc.querySelector('.calc-val-children');
    const totalEl = calc.querySelector('.calc-total-fare');
    const perPersonEl = calc.querySelector('.calc-per-person');
    const breakdownEl = calc.querySelector('.calc-breakdown');
    const bookAmountEl = document.querySelector('.book .amount');

    function formatRupees(num) {
      return '₹' + num.toLocaleString('en-IN');
    }

    function recalculate() {
      const pricePp = selectedSeason.pricePpTwinInr;
      const adultBase = adults * pricePp;
      const childBase = children * Math.round(pricePp * 0.75);
      const soloSupp = adults === 1 ? Math.round(pricePp * 0.35) : 0;
      const subtotal = adultBase + childBase + soloSupp;
      const gst = Math.round(subtotal * 0.05);
      const grandTotal = subtotal + gst;
      const totalParty = adults + children;
      const avgPp = totalParty > 0 ? Math.round(grandTotal / totalParty) : grandTotal;

      if (totalEl) totalEl.textContent = formatRupees(grandTotal);
      if (perPersonEl) perPersonEl.textContent = `(${formatRupees(avgPp)} / person incl. 5% GST)`;
      if (bookAmountEl) bookAmountEl.textContent = formatRupees(grandTotal);

      if (breakdownEl) {
        breakdownEl.innerHTML = `
          <div class="calc-row"><span>${adults} ${adults === 1 ? 'Adult' : 'Adults'} (${selectedSeason.name})</span><span>${formatRupees(adultBase)}</span></div>
          ${children > 0 ? `<div class="calc-row"><span>${children} ${children === 1 ? 'Child' : 'Children'} (75% rate)</span><span>${formatRupees(childBase)}</span></div>` : ''}
          ${soloSupp > 0 ? `<div class="calc-row"><span>Single room supplement</span><span>${formatRupees(soloSupp)}</span></div>` : ''}
          <div class="calc-row"><span>Estimated GST (5%)</span><span>${formatRupees(gst)}</span></div>
        `;
      }

      // Update drawer state if drawer exists
      updateDrawerDetails(selectedSeason.name, formatRupees(pricePp), formatRupees(grandTotal), adults, children);
    }

    seasonButtons.forEach((btn, index) => {
      btn.addEventListener('click', () => {
        seasonButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        selectedSeason = seasons[index];
        recalculate();
      });
    });

    const decAdults = calc.querySelector('.calc-dec-adults');
    const incAdults = calc.querySelector('.calc-inc-adults');
    if (decAdults && incAdults) {
      decAdults.addEventListener('click', () => {
        if (adults > 1) {
          adults--;
          if (adultsEl) adultsEl.textContent = adults;
          recalculate();
        }
      });
      incAdults.addEventListener('click', () => {
        if (adults < 12) {
          adults++;
          if (adultsEl) adultsEl.textContent = adults;
          recalculate();
        }
      });
    }

    const decKids = calc.querySelector('.calc-dec-kids');
    const incKids = calc.querySelector('.calc-inc-kids');
    if (decKids && incKids) {
      decKids.addEventListener('click', () => {
        if (children > 0) {
          children--;
          if (childrenEl) childrenEl.textContent = children;
          recalculate();
        }
      });
      incKids.addEventListener('click', () => {
        if (children < 8) {
          children++;
          if (childrenEl) childrenEl.textContent = children;
          recalculate();
        }
      });
    }

    recalculate();
  }

  // ---------------------------------------------------------------------------
  // 3. Interactive Route Map with Clickable Waypoint Pins (Package Detail)
  // ---------------------------------------------------------------------------
  function initRouteMap() {
    const mapContainer = document.querySelector('.route-map-visual');
    if (!mapContainer) return;

    const pins = mapContainer.querySelectorAll('.waypoint-pin');
    const card = mapContainer.querySelector('.waypoint-card');
    const cardTitle = mapContainer.querySelector('.card-dest-name');
    const cardDetails = mapContainer.querySelector('.card-dest-info');
    const cardLink = mapContainer.querySelector('.card-dest-link');
    const itineraryDays = document.querySelectorAll('.itinerary-day');

    const DEST_INFO = {
      kochi: { name: 'Kochi (Cochin)', info: 'Historic spice port, Chinese fishing nets, and colonial Fort Kochi streets.' },
      munnar: { name: 'Munnar Highlands', info: 'Rolling tea estates at 1,600m, misty waterfalls, and Eravikulam National Park.' },
      thekkady: { name: 'Thekkady & Periyar', info: 'Cardamom and pepper plantations bordering Periyar Tiger and Wildlife Sanctuary.' },
      alleppey: { name: 'Alleppey (Alappuzha)', info: 'Venice of the East: tranquil backwaters, palm canals, and private houseboats.' },
      kumarakom: { name: 'Kumarakom', info: 'Quiet village backwaters on Vembanad Lake with renowned bird sanctuary walks.' },
      kovalam: { name: 'Kovalam Beach', info: 'Crescent sandy coves, lighthouse cliff views, and gentle Arabian Sea surf.' },
      madurai: { name: 'Madurai', info: 'Ancient temple city crowned by the historic 14-tower Meenakshi Sundareswarar temple.' },
      rameswaram: { name: 'Rameswaram', info: 'Pamban sea-bridge crossing, holy waters, and the pillared Ramanathaswamy corridors.' },
      kanyakumari: { name: 'Kanyakumari', info: 'Cape Comorin: India’s southern tip where the Arabian Sea, Bay of Bengal, and Indian Ocean meet.' }
    };

    pins.forEach((pin) => {
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        pins.forEach((p) => p.classList.remove('is-active'));
        pin.classList.add('is-active');

        const key = (pin.getAttribute('data-dest') || '').toLowerCase();
        const data = DEST_INFO[key] || { name: pin.getAttribute('data-dest'), info: 'Scenic stop featured in your curated itinerary.' };

        if (card && cardTitle && cardDetails) {
          cardTitle.textContent = data.name;
          cardDetails.textContent = data.info;
          if (cardLink) cardLink.href = `https://www.openstreetmap.org/search?query=${encodeURIComponent(data.name + ', India')}`;
          card.classList.add('is-open');
        }

        // Highlight matching itinerary day
        itineraryDays.forEach((dayEl) => {
          if (dayEl.textContent.toLowerCase().includes(key)) {
            dayEl.classList.add('day-highlight');
            setTimeout(() => dayEl.classList.remove('day-highlight'), 2200);
          }
        });
      });
    });

    document.addEventListener('click', (e) => {
      if (card && !card.contains(e.target)) {
        card.classList.remove('is-open');
        pins.forEach((p) => p.classList.remove('is-active'));
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 4. Slide-Over Enquiry Drawer with Persistent Context
  // ---------------------------------------------------------------------------
  function updateDrawerDetails(season, fare, total, adults, children) {
    const drawerSeason = document.querySelector('.drawer-summary-fare');
    const drawerTotal = document.querySelector('.drawer-summary-total');
    const inputSeason = document.getElementById('drawer-input-season');
    const inputAdults = document.getElementById('drawer-input-adults');
    const inputChildren = document.getElementById('drawer-input-children');

    if (drawerSeason) drawerSeason.textContent = `${season} (${fare} pp)`;
    if (drawerTotal) drawerTotal.textContent = `${total} (${adults} Adults${children > 0 ? `, ${children} Children` : ''})`;
    if (inputSeason) inputSeason.value = season;
    if (inputAdults) inputAdults.value = adults;
    if (inputChildren) inputChildren.value = children;
  }

  function initEnquiryDrawer() {
    const drawer = document.getElementById('enquiry-drawer');
    if (!drawer) return;

    const openButtons = document.querySelectorAll('.open-drawer-btn, .book .btn');
    const closeButtons = drawer.querySelectorAll('[data-close-drawer]');

    function openDrawer(e) {
      if (e) e.preventDefault();
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      const firstInput = drawer.querySelector('input:not([type="hidden"])');
      if (firstInput) setTimeout(() => firstInput.focus(), 150);
    }

    function closeDrawer() {
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    openButtons.forEach((btn) => btn.addEventListener('click', openDrawer));
    closeButtons.forEach((btn) => btn.addEventListener('click', closeDrawer));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer();
    });
  }

  // ---------------------------------------------------------------------------
  // 5. Plain English Jargon Tooltips
  // ---------------------------------------------------------------------------
  function initTooltips() {
    const tooltipButtons = document.querySelectorAll('.tip-btn');
    tooltipButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wrap = btn.closest('.tip-wrap');
        const isOpen = wrap.classList.contains('tip-open');
        document.querySelectorAll('.tip-wrap').forEach((w) => w.classList.remove('tip-open'));
        if (!isOpen) wrap.classList.add('tip-open');
      });
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.tip-wrap').forEach((w) => w.classList.remove('tip-open'));
    });
  }

  // Initialize all interactive modules on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    initCatalogFilters();
    initFareCalculator();
    initRouteMap();
    initEnquiryDrawer();
    initTooltips();
  });
})();

