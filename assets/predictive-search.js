class PredictiveSearch extends SearchForm {
  constructor() {
    super();
    this.cachedResults = {};
    this.predictiveSearchResults = this.querySelector('[data-predictive-search]');
    this.allPredictiveSearchInstances = document.querySelectorAll('predictive-search');
    this.isOpen = false;
    this.abortController = new AbortController();
    this.searchTerm = '';

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.input.form.addEventListener('submit', this.onFormSubmit.bind(this));

    this.input.addEventListener('focus', this.onFocus.bind(this));
    this.addEventListener('focusout', this.onFocusOut.bind(this));
    this.addEventListener('keyup', this.onKeyup.bind(this));
    this.addEventListener('keydown', this.onKeydown.bind(this));
  }

  getQuery() {
    return this.input.value.trim();
  }

  // ─── Smart query helpers ────────────────────────────────────────────────────

  /**
   * Strip punctuation, collapse whitespace, lowercase.
   * "ProFX16v3" → "profx16v3"
   * "pro-fx / 16 v3" → "profx16v3"
   */
  normalizeQuery(raw) {
    return raw
      .toLowerCase()
      .replace(/[-\/\\_.,()+&]/g, '') // remove special chars
      .replace(/\s+/g, '')            // collapse all spaces
      .trim();
  }

  /**
   * Build an array of query variants from the normalized term.
   * Each variant gives Shopify a different angle to match from.
   *
   * "profx16v3" → ["profx16v3", "profx 16 v 3", "profx 16", "profx"]
   * "profx"     → ["profx"]
   */
  buildQueryVariants(normalized) {
    const variants = new Set();

    // 1. The normalized term as-is (most exact)
    variants.add(normalized);

    // 2. Split where letters meet digits: "profx16v3" → "profx 16 v 3"
    const spacedLetterDigit = normalized
      .replace(/([a-z])(\d)/g, '$1 $2')
      .replace(/(\d)([a-z])/g, '$1 $2');

    if (spacedLetterDigit !== normalized) {
      variants.add(spacedLetterDigit);

      // 3. Drop the trailing version chunk ("v3", "v2") — helps catch the series
      const withoutVersion = spacedLetterDigit.replace(/\s+v\s*\d+\s*$/i, '').trim();
      if (withoutVersion && withoutVersion !== spacedLetterDigit) {
        variants.add(withoutVersion);
      }

      // 4. Keep only the first "word" as a broad prefix (e.g. "profx")
      const prefix = spacedLetterDigit.split(/\s+/)[0];
      if (prefix && prefix.length >= 3) {
        variants.add(prefix);
      }
    }

    // 5. Re-insert a space at likely brand/model boundaries
    //    e.g. "profx" → "pro fx"  (split after 3-4 leading alpha chars)
    const brandSplit = normalized.replace(/^([a-z]{3,4})([a-z0-9]+)$/, '$1 $2');
    if (brandSplit !== normalized) {
      variants.add(brandSplit);
    }

    return [...variants];
  }

  // ─── Core lifecycle ─────────────────────────────────────────────────────────

  onChange() {
    super.onChange();
    const newSearchTerm = this.getQuery();

    if (!this.searchTerm || !newSearchTerm.startsWith(this.searchTerm)) {
      // Remove the results when they are no longer relevant for the new search term
      // so they don't show up when the dropdown opens again
      this.querySelector('#predictive-search-results-groups-wrapper')?.remove();
    }

    // Update the term asap, don't wait for the predictive search query to finish loading
    this.updateSearchForTerm(this.searchTerm, newSearchTerm);

    this.searchTerm = newSearchTerm;

    if (!this.searchTerm.length) {
      this.close(true);
      return;
    }

    this.getSearchResults(this.searchTerm);
  }

  onFormSubmit(event) {
    if (!this.getQuery().length || this.querySelector('[aria-selected="true"] a')) event.preventDefault();
  }

  onFormReset(event) {
    super.onFormReset(event);
    if (super.shouldResetForm()) {
      this.searchTerm = '';
      this.abortController.abort();
      this.abortController = new AbortController();
      this.closeResults(true);
    }
  }

  onFocus() {
    const currentSearchTerm = this.getQuery();

    if (!currentSearchTerm.length) return;

    if (this.searchTerm !== currentSearchTerm) {
      // Search term was changed from other search input, treat it as a user change
      this.onChange();
    } else if (this.getAttribute('results') === 'true') {
      this.open();
    } else {
      this.getSearchResults(this.searchTerm);
    }
  }

  onFocusOut() {
    setTimeout(() => {
      if (!this.contains(document.activeElement)) this.close();
    });
  }

  onKeyup(event) {
    if (!this.getQuery().length) this.close(true);
    event.preventDefault();

    switch (event.code) {
      case 'ArrowUp':
        this.switchOption('up');
        break;
      case 'ArrowDown':
        this.switchOption('down');
        break;
      case 'Enter':
        this.selectOption();
        break;
    }
  }

  onKeydown(event) {
    // Prevent the cursor from moving in the input when using the up and down arrow keys
    if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      event.preventDefault();
    }
  }

  updateSearchForTerm(previousTerm, newTerm) {
    const searchForTextElement = this.querySelector('[data-predictive-search-search-for-text]');
    const currentButtonText = searchForTextElement?.innerText;
    if (currentButtonText) {
      if (currentButtonText.match(new RegExp(previousTerm, 'g')).length > 1) {
        // The new term matches part of the button text and not just the search term,
        // do not replace to avoid mistakes
        return;
      }
      const newButtonText = currentButtonText.replace(previousTerm, newTerm);
      searchForTextElement.innerText = newButtonText;
    }
  }

  switchOption(direction) {
    if (!this.getAttribute('open')) return;

    const moveUp = direction === 'up';
    const selectedElement = this.querySelector('[aria-selected="true"]');

    // Filter out hidden elements (duplicated page and article resources) thanks
    // to this https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/offsetParent
    const allVisibleElements = Array.from(this.querySelectorAll('li, button.predictive-search__item')).filter(
      (element) => element.offsetParent !== null
    );
    let activeElementIndex = 0;

    if (moveUp && !selectedElement) return;

    let selectedElementIndex = -1;
    let i = 0;

    while (selectedElementIndex === -1 && i <= allVisibleElements.length) {
      if (allVisibleElements[i] === selectedElement) {
        selectedElementIndex = i;
      }
      i++;
    }

    this.statusElement.textContent = '';

    if (!moveUp && selectedElement) {
      activeElementIndex = selectedElementIndex === allVisibleElements.length - 1 ? 0 : selectedElementIndex + 1;
    } else if (moveUp) {
      activeElementIndex = selectedElementIndex === 0 ? allVisibleElements.length - 1 : selectedElementIndex - 1;
    }

    if (activeElementIndex === selectedElementIndex) return;

    const activeElement = allVisibleElements[activeElementIndex];

    activeElement.setAttribute('aria-selected', true);
    if (selectedElement) selectedElement.setAttribute('aria-selected', false);

    this.input.setAttribute('aria-activedescendant', activeElement.id);
  }

  selectOption() {
    const selectedOption = this.querySelector('[aria-selected="true"] a, button[aria-selected="true"]');

    if (selectedOption) selectedOption.click();
  }

  // ─── Smart search fetch ─────────────────────────────────────────────────────

  getSearchResults(searchTerm) {
    const normalized = this.normalizeQuery(searchTerm);
    const variants   = this.buildQueryVariants(normalized);
    const cacheKey   = 'smart:' + normalized;

    this.setLiveRegionLoadingState();

    // Serve from cache when possible
    if (this.cachedResults[cacheKey]) {
      this.renderSearchResults(this.cachedResults[cacheKey]);
      return;
    }

    // Abort any in-flight request before starting new ones
    this.abortController.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Fetch a single variant and resolve with { markup, hasResults }
    const fetchVariant = (query) =>
      fetch(
        `${routes.predictive_search_url}?q=${encodeURIComponent(query)}&section_id=predictive-search`,
        { signal }
      )
      .then((response) => {
        if (!response.ok) throw new Error(response.status);
        return response.text();
      })
      .then((text) => {
        const doc    = new DOMParser().parseFromString(text, 'text/html');
        const markup = doc.querySelector('#shopify-section-predictive-search')?.innerHTML ?? '';

        // Consider it a "hit" when the response contains visible result items
        const resultItems = doc.querySelectorAll(
          '[data-predictive-search-results] li, [data-predictive-search-results] .predictive-search__item'
        );
        const hasResults = resultItems.length > 0
          ? true
          : markup.trim().length > 100; // fallback heuristic

        return { markup, hasResults };
      });

    // Try variants in sequence; stop as soon as one returns results
    const tryNext = (index) => {
      if (signal.aborted) return;

      if (index >= variants.length) {
        // All variants exhausted — show whatever the broadest query returns
        fetchVariant(variants[0])
          .then(({ markup }) => this.cacheAndRender(cacheKey, markup))
          .catch((err)       => this.handleFetchError(err));
        return;
      }

      fetchVariant(variants[index])
        .then(({ markup, hasResults }) => {
          if (hasResults || index === variants.length - 1) {
            this.cacheAndRender(cacheKey, markup);
          } else {
            // No results yet — try the next variant
            tryNext(index + 1);
          }
        })
        .catch((err) => {
          if (err?.code === 20 || signal.aborted) return; // aborted — ignore silently
          tryNext(index + 1);                             // network error — try next variant
        });
    };

    tryNext(0);
  }

  cacheAndRender(cacheKey, markup) {
    // Keep all search instances in sync (saves bandwidth on shared caches)
    this.allPredictiveSearchInstances.forEach((instance) => {
      instance.cachedResults[cacheKey] = markup;
    });
    this.renderSearchResults(markup);
  }

  handleFetchError(error) {
    if (error?.code === 20) return; // aborted — not a real error
    this.close();
    throw error;
  }

  // ─── Render helpers ─────────────────────────────────────────────────────────

  setLiveRegionLoadingState() {
    this.statusElement = this.statusElement || this.querySelector('.predictive-search-status');
    this.loadingText   = this.loadingText   || this.getAttribute('data-loading-text');

    this.setLiveRegionText(this.loadingText);
    this.setAttribute('loading', true);
  }

  setLiveRegionText(statusText) {
    this.statusElement.setAttribute('aria-hidden', 'false');
    this.statusElement.textContent = statusText;

    setTimeout(() => {
      this.statusElement.setAttribute('aria-hidden', 'true');
    }, 1000);
  }

  renderSearchResults(resultsMarkup) {
    this.predictiveSearchResults.innerHTML = resultsMarkup;
    this.setAttribute('results', true);

    this.setLiveRegionResults();
    this.open(); // keeps dropdown visible as user types — no Enter needed
  }

  setLiveRegionResults() {
    this.removeAttribute('loading');
    this.setLiveRegionText(this.querySelector('[data-predictive-search-live-region-count-value]').textContent);
  }

  // ─── Dropdown open/close ────────────────────────────────────────────────────

  getResultsMaxHeight() {
  this.resultsMaxHeight =
    window.innerHeight - document.querySelector('.section-header')?.getBoundingClientRect().bottom;
  return this.resultsMaxHeight;
}

  open() {
    this.predictiveSearchResults.style.maxHeight = this.resultsMaxHeight || `${this.getResultsMaxHeight()}px`;
    this.setAttribute('open', true);
    this.input.setAttribute('aria-expanded', true);
    this.isOpen = true;
  }

  close(clearSearchTerm = false) {
    this.closeResults(clearSearchTerm);
    this.isOpen = false;
  }

  closeResults(clearSearchTerm = false) {
    if (clearSearchTerm) {
      this.input.value = '';
      this.removeAttribute('results');
    }
    const selected = this.querySelector('[aria-selected="true"]');

    if (selected) selected.setAttribute('aria-selected', false);

    this.input.setAttribute('aria-activedescendant', '');
    this.removeAttribute('loading');
    this.removeAttribute('open');
    this.input.setAttribute('aria-expanded', false);
    this.resultsMaxHeight = false;
    this.predictiveSearchResults.removeAttribute('style');
  }
}

customElements.define('predictive-search', PredictiveSearch);