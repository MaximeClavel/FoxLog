// src/ui/filter-manager.js
(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;

  class FilterManager {
    constructor() {
      this.activeFilters = this._loadFilters();
      this.logger = window.FoxLog.logger;
      this.onFilterChange = null; // Callback to notify about changes
    }

    _loadFilters() {
      const saved = localStorage.getItem('foxlog_filters');
      return saved ? JSON.parse(saved) : {
        eventTypes: {
          methods: true,
          database: true,
          debug: true,
          exceptions: true,
          variables: true,
          system: true
        },
        minDuration: 0,
        namespace: 'all', // 'all', 'user', 'system'
        searchText: ''
      };
    }

    _saveFilters() {
      localStorage.setItem('foxlog_filters', JSON.stringify(this.activeFilters));
      this.logger.log('Filters saved', this.activeFilters);
    }

    getFilters() {
      return { ...this.activeFilters };
    }

    updateFilter(filterType, value) {
      if (filterType === 'eventTypes') {
        this.activeFilters.eventTypes = { ...this.activeFilters.eventTypes, ...value };
      } else {
        this.activeFilters[filterType] = value;
      }
      this._saveFilters();
      
      if (this.onFilterChange) {
        this.onFilterChange(this.activeFilters);
      }
    }

    resetFilters() {
      this.activeFilters = {
        eventTypes: {
          methods: true,
          database: true,
          debug: true,
          exceptions: true,
          variables: true,
          system: true
        },
        minDuration: 0,
        namespace: 'all',
        searchText: ''
      };
      this._saveFilters();
      
      if (this.onFilterChange) {
        this.onFilterChange(this.activeFilters);
      }
    }

    applyFilters(lines) {
      return lines.filter(line => {
        // Filter by event type
        if (!this._matchesEventType(line)) return false;
        
        // Filter by duration
        if (line.duration < this.activeFilters.minDuration) return false;
        
        // Filter by namespace
        if (!this._matchesNamespace(line)) return false;
        
        // Filter by text search
        if (!this._matchesSearch(line)) return false;
        
        return true;
      });
    }

    _matchesEventType(line) {
      const { eventTypes } = this.activeFilters;
      const typeMap = {
        methods: ['METHOD_ENTRY', 'METHOD_EXIT'],
        database: ['SOQL_EXECUTE_BEGIN', 'SOQL_EXECUTE_END', 'DML_BEGIN', 'DML_END'],
        debug: ['USER_DEBUG'],
        exceptions: ['EXCEPTION_THROWN', 'FATAL_ERROR'],
        variables: ['VARIABLE_SCOPE_BEGIN', 'VARIABLE_ASSIGNMENT'],
        system: ['CODE_UNIT_STARTED', 'CODE_UNIT_FINISHED', 'HEAP_ALLOCATE', 'STATEMENT_EXECUTE']
      };

      for (const [category, enabled] of Object.entries(eventTypes)) {
        if (enabled && typeMap[category]?.includes(line.type)) {
          return true;
        }
      }
      
      return false;
    }

    _matchesNamespace(line) {
      const { namespace } = this.activeFilters;
      if (namespace === 'all') return true;
      
      const isUserCode = line.details.class && !line.details.class.startsWith('System.');
      
      return namespace === 'user' ? isUserCode : !isUserCode;
    }

    _matchesSearch(line) {
      const { searchText } = this.activeFilters;
      if (!searchText) return true;
      
      const searchLower = searchText.toLowerCase();
      const searchableContent = [
        line.content,
        line.details.class,
        line.details.method,
        line.details.message,
        line.details.query
      ].filter(Boolean).join(' ').toLowerCase();
      
      return searchableContent.includes(searchLower);
    }

    createFilterBar() {
      const filterBar = document.createElement('div');
      filterBar.className = 'sf-filter-bar';
      filterBar.innerHTML = `
        <div class="sf-filter-section">
          <div class="sf-filter-group">
            <label class="sf-filter-label">${i18n.eventTypesLabel || 'Event types:'}</label>
            <div class="sf-filter-checkboxes">
              ${this._createCheckbox('methods', 'Methods')}
              ${this._createCheckbox('database', 'Database')}
              ${this._createCheckbox('debug', 'Debug')}
              ${this._createCheckbox('exceptions', 'Exceptions')}
              ${this._createCheckbox('variables', 'Variables')}
              ${this._createCheckbox('system', 'System')}
            </div>
          </div>
          
          <div class="sf-filter-group">
            <label class="sf-filter-label">${i18n.minDurationLabel || 'Minimum duration (ms):'}</label>
            <input type="number" class="sf-filter-duration" min="0" value="${this.activeFilters.minDuration}" />
          </div>
          
          <div class="sf-filter-group">
            <label class="sf-filter-label">${i18n.namespaceLabel || 'Namespace:'}</label>
            <select class="sf-filter-namespace">
              <option value="all" ${this.activeFilters.namespace === 'all' ? 'selected' : ''}>${i18n.namespaceAll || 'All'}</option>
              <option value="user" ${this.activeFilters.namespace === 'user' ? 'selected' : ''}>${i18n.namespaceUser || 'User code'}</option>
              <option value="system" ${this.activeFilters.namespace === 'system' ? 'selected' : ''}>${i18n.namespaceSystem || 'System code'}</option>
            </select>
          </div>
          <div class="sf-filter-group">
            <button class="sf-filter-reset">${i18n.reset || 'Reset'}</button>
          </div>
        </div>
      `;
      
      this._attachFilterEvents(filterBar);
      return filterBar;
    }

    _createCheckbox(name, label) {
      const checked = this.activeFilters.eventTypes[name] ? 'checked' : '';
      return `
        <label class="sf-filter-checkbox">
          <input type="checkbox" data-filter="${name}" ${checked} />
          <span>${label}</span>
        </label>
      `;
    }

    _attachFilterEvents(filterBar) {
      // Event type checkboxes
      filterBar.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
          const filterName = e.target.dataset.filter;
          this.updateFilter('eventTypes', {
            [filterName]: e.target.checked
          });
        });
      });

      // Duration input
      const durationInput = filterBar.querySelector('.sf-filter-duration');
      let debounceTimer;
      durationInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.updateFilter('minDuration', parseInt(e.target.value) || 0);
        }, 500);
      });

      // Namespace select
      filterBar.querySelector('.sf-filter-namespace').addEventListener('change', (e) => {
        this.updateFilter('namespace', e.target.value);
      });

      // Reset button
      filterBar.querySelector('.sf-filter-reset').addEventListener('click', () => {
        this.resetFilters();
        // Refresh the filter bar
        const parent = filterBar.parentElement;
        const newFilterBar = this.createFilterBar();
        parent.replaceChild(newFilterBar, filterBar);
      });
    }

    createSearchBar() {
        const searchBar = document.createElement('div');
        searchBar.className = 'sf-search-bar';
        searchBar.innerHTML = `
            <div class="sf-search-container">
                <div class="sf-search-container">
                    <svg class="sf-search-icon" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
                    </svg>
                    <input type="text" class="sf-search-input" placeholder="${i18n.searchLogsPlaceholder || 'Search in logs...'}" value="${this.activeFilters.searchText}" />
                    <button class="sf-search-clear" style="display: none;">
                        <svg viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                        </svg>
                    </button>
                </div>
                <div class="sf-search-results" style="display: none;">
                    <span class="sf-search-count">0 ${i18n.results || 'results'}</span>
                    <button class="sf-search-nav sf-search-prev" disabled>
                    <svg viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                    </button>
                    <button class="sf-search-nav sf-search-next" disabled>
                    <svg viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                    </svg>
                    </button>
                </div>
            </div>
        `;
        
        this._attachSearchEvents(searchBar);
        return searchBar;
    }

    _attachSearchEvents(searchBar) {
        const input = searchBar.querySelector('.sf-search-input');
        const resultsDiv = searchBar.querySelector('.sf-search-results');
        const countSpan = searchBar.querySelector('.sf-search-count');
        const prevBtn = searchBar.querySelector('.sf-search-prev');
        const nextBtn = searchBar.querySelector('.sf-search-next');
        const clearBtn = searchBar.querySelector('.sf-search-clear');
        
        let currentIndex = 0;
        let matches = [];
        let debounceTimer;

        if (this.activeFilters.searchText) {
            clearBtn.style.display = 'block';
            // Wait for the DOM to render
            setTimeout(() => {
            matches = this.findMatches(this.activeFilters.searchText);
            if (matches.length > 0) {
                this.updateSearchUI(matches, 0, resultsDiv, countSpan, prevBtn, nextBtn);
            }
            }, 300);
        }

        input.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            const searchText = e.target.value;
            
            clearBtn.style.display = searchText ? 'block' : 'none';
            
            debounceTimer = setTimeout(() => {
            this.updateFilter('searchText', searchText);
            
            if (searchText) {
                matches = this._findMatches(searchText);
                this._updateSearchUI(matches, 0, resultsDiv, countSpan, prevBtn, nextBtn);
            } else {
                resultsDiv.style.display = 'none';
                this._clearHighlights();
            }
            }, 300);
        });

        clearBtn.addEventListener('click', () => {
            input.value = '';
            this.updateFilter('searchText', '');
            clearBtn.style.display = 'none';
            resultsDiv.style.display = 'none';
            this._clearHighlights();
        });

        prevBtn.addEventListener('click', () => {
            if (currentIndex > 0) {
            currentIndex--;
            this._updateSearchUI(matches, currentIndex, resultsDiv, countSpan, prevBtn, nextBtn);
            this._scrollToMatch(matches[currentIndex]);
            }
        });

        nextBtn.addEventListener('click', () => {
            if (currentIndex < matches.length - 1) {
            currentIndex++;
            this._updateSearchUI(matches, currentIndex, resultsDiv, countSpan, prevBtn, nextBtn);
            this._scrollToMatch(matches[currentIndex]);
            }
        });
    }

    _findMatches(searchText) {
        const timeline = document.querySelector('.sf-timeline-container');
        if (!timeline) return [];
        
        const items = timeline.querySelectorAll('.sf-timeline-item');
        const matches = [];
        
        items.forEach((item, index) => {
            const content = item.textContent.toLowerCase();
            if (content.includes(searchText.toLowerCase())) {
            matches.push({ element: item, index });
            }
        });
        
        return matches;
    }

    _updateSearchUI(matches, currentIndex, resultsDiv, countSpan, prevBtn, nextBtn) {
        if (matches.length > 0) {
            resultsDiv.style.display = 'flex';
            countSpan.textContent = `${currentIndex + 1}/${matches.length}`;
            prevBtn.disabled = currentIndex === 0;
            nextBtn.disabled = currentIndex === matches.length - 1;
            
            this._highlightMatches(matches, currentIndex);
        } else {
            resultsDiv.style.display = 'none';
        }
    }

    _highlightMatches(matches, currentIndex) {
        matches.forEach((match, index) => {
            match.element.classList.remove('sf-search-highlight', 'sf-search-current');
            if (index === currentIndex) {
            match.element.classList.add('sf-search-current');
            } else {
            match.element.classList.add('sf-search-highlight');
            }
        });
    }

    _scrollToMatch(match) {
        if (match && match.element) {
            match.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    _clearHighlights() {
        document.querySelectorAll('.sf-search-highlight, .sf-search-current').forEach(el => {
            el.classList.remove('sf-search-highlight', 'sf-search-current');
        });
    }

    createMethodFilter(parsedLog) {
        const methods = this._extractMethods(parsedLog);
        
        const dropdown = document.createElement('div');
        dropdown.className = 'sf-method-filter';
        dropdown.innerHTML = `
            <div class="sf-filter-group">
            <label class="sf-filter-label">${i18n.methodFilterLabel || 'Filter by class/method:'}</label>
            <div class="sf-method-dropdown">
                <button class="sf-method-dropdown-btn">
                <span>${i18n.allMethods || 'All methods'}</span>
                <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
                </button>
                <div class="sf-method-dropdown-menu" style="display: none;">
                <div class="sf-method-search">
                    <input type="text" placeholder="${i18n.searchPlaceholder || 'Search...'}" class="sf-method-search-input" />
                </div>
                <div class="sf-method-list">
                    ${this._renderMethodOptions(methods)}
                </div>
                </div>
            </div>
            <div class="sf-selected-methods"></div>
            </div>
        `;
        
        this._attachMethodFilterEvents(dropdown);
        return dropdown;
    }

    _extractMethods(parsedLog) {
        const methodMap = new Map();
        
        parsedLog.lines.forEach(line => {
            if (line.type === 'METHOD_ENTRY' && line.details.class) {
            const key = `${line.details.class}.${line.details.method}`;
            if (!methodMap.has(key)) {
                methodMap.set(key, {
                class: line.details.class,
                method: line.details.method,
                fullName: key
                });
            }
            }
        });
        
        return Array.from(methodMap.values()).sort((a, b) => 
            a.fullName.localeCompare(b.fullName)
        );
    }

    _renderMethodOptions(methods) {
        return methods.map(method => `
            <label class="sf-method-option">
            <input type="checkbox" value="${method.fullName}" />
            <span class="sf-method-class">${method.class}</span>
            <span class="sf-method-name">.${method.method}</span>
            </label>
        `).join('');
    }

    _attachMethodFilterEvents(dropdown) {
        const btn = dropdown.querySelector('.sf-method-dropdown-btn');
        const menu = dropdown.querySelector('.sf-method-dropdown-menu');
        const searchInput = dropdown.querySelector('.sf-method-search-input');
        const selectedContainer = dropdown.querySelector('.sf-selected-methods');
        
        // Toggle dropdown
        btn.addEventListener('click', () => {
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        });
        
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) {
            menu.style.display = 'none';
            }
        });
        
        // Search methods
        searchInput.addEventListener('input', (e) => {
            const searchText = e.target.value.toLowerCase();
            const options = dropdown.querySelectorAll('.sf-method-option');
            
            options.forEach(option => {
            const text = option.textContent.toLowerCase();
            option.style.display = text.includes(searchText) ? 'flex' : 'none';
            });
        });
        
        // Handle selection
        dropdown.querySelectorAll('.sf-method-option input').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
            this._updateSelectedMethods(dropdown);
            });
        });
    }

    _updateSelectedMethods(dropdown) {
        const selected = Array.from(
            dropdown.querySelectorAll('.sf-method-option input:checked')
        ).map(cb => cb.value);
        
        const selectedContainer = dropdown.querySelector('.sf-selected-methods');
        const btn = dropdown.querySelector('.sf-method-dropdown-btn span');
        
        if (selected.length === 0) {
            btn.textContent = i18n.allMethods || 'All methods';
            selectedContainer.innerHTML = '';
            this.updateFilter('selectedMethods', []);
        } else {
            btn.textContent = `${selected.length} ${i18n.methodsSelected || 'method(s) selected'}`;
            selectedContainer.innerHTML = selected.map(method => `
            <span class="sf-selected-tag">
                ${method}
                <button class="sf-tag-remove" data-method="${method}">×</button>
            </span>
            `).join('');
            
            // Remove tags
            selectedContainer.querySelectorAll('.sf-tag-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const method = e.target.dataset.method;
                const checkbox = dropdown.querySelector(`input[value="${method}"]`);
                if (checkbox) checkbox.checked = false;
                this._updateSelectedMethods(dropdown);
            });
            });
            
            this.updateFilter('selectedMethods', selected);
        }
    }

  }

  window.FoxLog.FilterManager = FilterManager;
  window.FoxLog.filterManager = new FilterManager();
  logger.log('[FoxLog] Filter Manager loaded');
})();
