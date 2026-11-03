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
  // 3. Interactive Route Map & In-Page Stop Inspector (Package Detail)
  // ---------------------------------------------------------------------------
  function initRouteMap() {
    const routeSection = document.querySelector('.route-map');
    if (!routeSection) return;

    const pins = routeSection.querySelectorAll('.waypoint-pin');
    const timelineSteps = routeSection.querySelectorAll('.timeline-step');
    const inspector = document.getElementById('stop-inspector');
    if (!inspector) return;

    const imgEl = inspector.querySelector('.inspector-img');
    const badgeEl = inspector.querySelector('.inspector-badge');
    const regionEl = inspector.querySelector('.inspector-region');
    const titleEl = inspector.querySelector('.inspector-title');
    const driveEl = inspector.querySelector('.inspector-drive');
    const highlightsList = inspector.querySelector('.highlights-list');
    const jumpBtn = inspector.querySelector('.btn-jump-day');
    const itineraryDays = document.querySelectorAll('.itinerary-day');

    const DEST_REGISTRY = {
      kochi: {
        name: 'Kochi (Cochin) — Historic Spice Port',
        img: '/assets/images/fort-kochi-nets-900.jpg',
        region: 'Central Kerala Coast',
        drive: 'Starting & ending hub · Kochi International Airport (COK)',
        highlights: [
          'Historic Chinese fishing nets at Fort Kochi waterfront',
          'Mattancherry Dutch Palace & Jewish Synagogue heritage quarter',
          'Evening Kathakali classical dance drama performance'
        ]
      },
      munnar: {
        name: 'Munnar — Tea Estates & Mist Valleys',
        img: '/assets/images/munnar-tea-900.jpg',
        region: 'Idukki District Highlands (1,600m)',
        drive: 'From Kochi: 130 km · ~4.5 hrs scenic hill climb past Cheeyappara Waterfalls',
        highlights: [
          'Rolling tea plantations across Kannan Devan Hills',
          'Eravikulam National Park (habitat of endangered Nilgiri Tahr)',
          'Tata Tea Museum & private artisanal tasting session'
        ]
      },
      thekkady: {
        name: 'Thekkady & Periyar — Spices & Wildlife',
        img: '/assets/images/periyar-lake-900.jpg',
        region: 'Cardamom Hills Wildlife Reserve (1,000m)',
        drive: 'From Munnar: 95 km · ~3 hrs winding mountain drive via Anakkara',
        highlights: [
          'Boat safari on Periyar Lake inside the Tiger Reserve',
          'Guided spice garden walk (cardamom, pepper, cinnamon)',
          'Kalaripayattu ancient martial arts evening demonstration'
        ]
      },
      alleppey: {
        name: 'Alleppey (Alappuzha) — Backwaters & Houseboat',
        img: '/assets/images/alleppey-houseboat-900.jpg',
        region: 'Vembanad Backwaters, Kerala',
        drive: 'From Thekkady: 140 km · ~4 hrs scenic descent through rubber plantations',
        highlights: [
          'Private overnight traditional Kettuvallam wooden houseboat',
          'Cruising palm-shaded canals, emerald paddy fields & village shores',
          'Freshly prepared Kerala backwater cuisine by onboard private chef'
        ]
      },
      kumarakom: {
        name: 'Kumarakom — Lakeside Sanctuary',
        img: '/assets/images/alleppey-sunset-900.jpg',
        region: 'East Vembanad Lake, Kottayam',
        drive: 'From Kochi: 50 km · ~1.5 hrs smooth coastal highway drive',
        highlights: [
          'Dawn guided walk through Kumarakom Bird Sanctuary',
          'Sunset shikara boat ride along quiet coconut canals',
          'Ayurvedic wellness rejuvenation therapies'
        ]
      },
      kovalam: {
        name: 'Kovalam Beach — Crescent Coast',
        img: '/assets/images/kovalam-lighthouse-900.jpg',
        region: 'Trivandrum Coast, Kerala',
        drive: 'From Alleppey: 160 km · ~4.5 hrs southern coastal highway',
        highlights: [
          'Crescent sandy beaches overlooking Lighthouse Point',
          'Arabian Sea sunset walks & fresh coastal seafood',
          'Convenient departure via Trivandrum International Airport (TRV)'
        ]
      },
      goa: {
        name: 'Goa — Sun, Sand & Portuguese Heritage',
        img: '/assets/images/goa-vagator-900.jpg',
        region: 'Konkan Coast',
        drive: 'Direct access via Dabolim (GOI) or Mopa (GOX) airports',
        highlights: [
          'Vagator, Anjuna and Palolem golden beaches',
          'UNESCO World Heritage churches of Old Goa',
          'Authentic Goan spice plantation tour and lunch'
        ]
      },
      madurai: {
        name: 'Madurai — Ancient Temple Heritage',
        img: '/assets/images/fort-kochi-nets-900.jpg',
        region: 'Tamil Nadu Heartland',
        drive: 'Inland cultural gateway with dedicated airport (IXM)',
        highlights: [
          'Meenakshi Sundareswarar Temple with 14 towering gopurams',
          'Thirumalai Nayakkar Palace evening light show',
          'Bustling flower and banana markets'
        ]
      },
      rameswaram: {
        name: 'Rameswaram — Island & Sea Bridge',
        img: '/assets/images/alleppey-sunset-900.jpg',
        region: 'Pamban Island, Tamil Nadu',
        drive: 'From Madurai: 170 km · ~3.5 hrs across Pamban Sea Bridge',
        highlights: [
          'Pamban cantilever railway and sea-bridge crossing',
          'Ramanathaswamy Temple 1,200 pillared outer corridor',
          'Dhanushkodi ghost town & Adam’s Bridge lookout'
        ]
      },
      kanyakumari: {
        name: 'Kanyakumari — Cape Comorin',
        img: '/assets/images/kovalam-lighthouse-900.jpg',
        region: 'Southernmost Tip of India',
        drive: 'From Rameswaram: 310 km · ~6 hrs southern drive',
        highlights: [
          'Confluence of Arabian Sea, Bay of Bengal & Indian Ocean',
          'Vivekananda Rock Memorial & Thiruvalluvar Statue ferry',
          'Spectacular sunrise and sunset from the same promontory'
        ]
      }
    };

    function updateInspector(destName, index, total) {
      const key = (destName || '').trim().toLowerCase();
      const data = DEST_REGISTRY[key] || {
        name: destName,
        img: '/assets/images/munnar-tea-900.jpg',
        region: 'Curated Itinerary Stop',
        drive: 'Private vehicle transfer included in package',
        highlights: ['Scenic sightseeing and cultural experiences']
      };

      if (imgEl) {
        imgEl.src = data.img;
        imgEl.alt = data.name;
      }
      if (badgeEl) badgeEl.textContent = `Stop ${index + 1} of ${total}`;
      if (regionEl) regionEl.textContent = data.region;
      if (titleEl) titleEl.textContent = data.name;
      if (driveEl) driveEl.textContent = data.drive;

      if (highlightsList) {
        highlightsList.innerHTML = data.highlights.map((h) => `<li>${h}</li>`).join('');
      }

      if (jumpBtn) {
        jumpBtn.setAttribute('data-dest', key);
        jumpBtn.textContent = `View Itinerary Details for ${destName} ↓`;
      }

      pins.forEach((p) => p.classList.toggle('is-active', (p.getAttribute('data-dest') || '').toLowerCase() === key));
      timelineSteps.forEach((s) => s.classList.toggle('is-active', (s.getAttribute('data-dest') || '').toLowerCase() === key));
    }

    pins.forEach((pin, idx) => {
      pin.addEventListener('click', () => {
        const dest = pin.getAttribute('data-dest') || '';
        updateInspector(dest, idx, pins.length);
      });
      pin.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const dest = pin.getAttribute('data-dest') || '';
          updateInspector(dest, idx, pins.length);
        }
      });
    });

    timelineSteps.forEach((step, idx) => {
      step.addEventListener('click', () => {
        const dest = step.getAttribute('data-dest') || '';
        updateInspector(dest, idx, timelineSteps.length);
      });
    });

    if (jumpBtn) {
      jumpBtn.addEventListener('click', () => {
        const key = (jumpBtn.getAttribute('data-dest') || '').toLowerCase();
        let targetEl = null;
        itineraryDays.forEach((dayEl) => {
          if (!targetEl && dayEl.textContent.toLowerCase().includes(key)) {
            targetEl = dayEl;
          }
        });
        if (!targetEl && itineraryDays.length > 0) targetEl = itineraryDays[0];

        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetEl.classList.add('day-highlight');
          setTimeout(() => targetEl.classList.remove('day-highlight'), 2500);
        }
      });
    }

    if (pins.length > 0) {
      const firstDest = pins[0].getAttribute('data-dest') || '';
      updateInspector(firstDest, 0, pins.length);
    }
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

