/* ============================================
   MiPlata — Main Application Logic
   ============================================ */

const App = (() => {
  /* ════════════════════════════════════════
     STATE
     ════════════════════════════════════════ */
  let state = {
    profile: null,        // { id, salary, currency, savingsType, savingsValue }
    expenses: [],         // Current month expenses
    categories: [],       // All categories
    currentMonth: '',     // 'YYYY-MM'
    currentTab: 'dashboard',
    editingExpense: null,
    editingCategory: null
  };

  const MONTHS_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  /* ════════════════════════════════════════
     INITIALIZATION
     ════════════════════════════════════════ */
  async function init() {
    // Initialize database
    await MiPlataDB.init();

    // Load profile
    state.profile = await MiPlataDB.get('profile', 'main');
    state.categories = await MiPlataDB.getAll('categories');

    // Set current month
    const now = new Date();
    state.currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (!state.profile) {
      showOnboarding();
    } else {
      await loadMonthData();
      showApp();
    }

    bindEvents();
  }

  /* ════════════════════════════════════════
     ONBOARDING
     ════════════════════════════════════════ */
  function showOnboarding() {
    document.getElementById('onboarding').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    showOnboardingStep(1);
  }

  function showOnboardingStep(step) {
    document.querySelectorAll('.onboarding-step').forEach(el => el.classList.remove('active'));
    const stepEl = document.getElementById(`onboarding-step-${step}`);
    if (stepEl) stepEl.classList.add('active');
  }

  async function completeOnboarding() {
    const salary = parseFloat(document.getElementById('input-salary').value);
    const savingsType = document.querySelector('.savings-type-btn.active')?.dataset.type || 'percentage';
    const savingsValue = parseFloat(document.getElementById('input-savings').value);

    if (!salary || salary <= 0) {
      showToast('Ingresa tu sueldo mensual', 'error');
      return;
    }

    if (!savingsValue || savingsValue <= 0) {
      showToast('Ingresa tu meta de ahorro', 'error');
      return;
    }

    if (savingsType === 'percentage' && savingsValue > 100) {
      showToast('El porcentaje no puede ser mayor a 100%', 'error');
      return;
    }

    state.profile = {
      id: 'main',
      salary,
      currency: 'Bs',
      savingsType,
      savingsValue,
      createdAt: new Date().toISOString()
    };

    await MiPlataDB.save('profile', state.profile);
    await loadMonthData();
    showApp();
    showToast('¡Bienvenido a MiPlata! 🎉', 'success');
  }

  /* ════════════════════════════════════════
     APP DISPLAY
     ════════════════════════════════════════ */
  function showApp() {
    document.getElementById('onboarding').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    updateHeader();
    renderCurrentTab();
  }

  function updateHeader() {
    const [year, month] = state.currentMonth.split('-').map(Number);
    const label = `${MONTHS_ES[month - 1]} ${year}`;
    document.getElementById('header-month-label').textContent = label;
  }

  /* ════════════════════════════════════════
     NAVIGATION
     ════════════════════════════════════════ */
  function switchTab(tabName) {
    state.currentTab = tabName;

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === tabName);
    });

    // Update tab panels
    document.querySelectorAll('.tab-panel').forEach(el => {
      el.classList.toggle('active', el.id === `tab-${tabName}`);
    });

    // Show/hide FAB
    const fab = document.getElementById('fab-add');
    if (fab) {
      fab.style.display = (tabName === 'dashboard' || tabName === 'expenses') ? 'flex' : 'none';
    }

    renderCurrentTab();
  }

  function renderCurrentTab() {
    switch (state.currentTab) {
      case 'dashboard': renderDashboard(); break;
      case 'expenses': renderExpenses(); break;
      case 'categories': renderCategories(); break;
      case 'settings': renderSettings(); break;
    }
  }

  function changeMonth(delta) {
    const [year, month] = state.currentMonth.split('-').map(Number);
    const d = new Date(year, month - 1 + delta, 1);
    state.currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    updateHeader();
    loadMonthData().then(() => renderCurrentTab());
  }

  /* ════════════════════════════════════════
     DATA LOADING
     ════════════════════════════════════════ */
  async function loadMonthData() {
    state.expenses = await MiPlataDB.getByMonth(state.currentMonth);
    state.categories = await MiPlataDB.getAll('categories');
    // Sort expenses by date descending
    state.expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  /* ════════════════════════════════════════
     CALCULATIONS
     ════════════════════════════════════════ */
  function getMonthSummary() {
    const salary = state.profile?.salary || 0;
    const totalSpent = state.expenses.reduce((sum, e) => sum + e.amount, 0);
    const savingsGoal = state.profile?.savingsType === 'percentage'
      ? salary * (state.profile.savingsValue / 100)
      : (state.profile?.savingsValue || 0);
    const available = salary - totalSpent;
    const currentSavings = Math.max(available, 0);

    return { salary, totalSpent, savingsGoal, available, currentSavings };
  }

  function getCategoryBreakdown() {
    const map = {};
    for (const expense of state.expenses) {
      if (!map[expense.category]) {
        const cat = state.categories.find(c => c.id === expense.category);
        map[expense.category] = {
          id: expense.category,
          name: cat?.name || 'Otros',
          icon: cat?.icon || '💰',
          color: cat?.color || '#6b7280',
          amount: 0,
          count: 0
        };
      }
      map[expense.category].amount += expense.amount;
      map[expense.category].count++;
    }
    return Object.values(map).sort((a, b) => b.amount - a.amount);
  }

  /* ════════════════════════════════════════
     RENDER: DASHBOARD
     ════════════════════════════════════════ */
  function renderDashboard() {
    const { salary, totalSpent, savingsGoal, available, currentSavings } = getMonthSummary();
    const breakdown = getCategoryBreakdown();

    // Balance card
    const balanceAmount = document.getElementById('dashboard-balance');
    const incomeValue = document.getElementById('dashboard-income');
    const expenseValue = document.getElementById('dashboard-expenses');

    if (balanceAmount) balanceAmount.textContent = `${formatAmount(available)} Bs`;
    if (incomeValue) incomeValue.textContent = `${formatAmount(salary)} Bs`;
    if (expenseValue) expenseValue.textContent = `${formatAmount(totalSpent)} Bs`;

    // Savings progress
    MiPlataCharts.renderSavingsProgress('savings-progress', currentSavings, savingsGoal);

    // Donut chart
    MiPlataCharts.renderDonut('chart-donut', breakdown, totalSpent);

    // Category bars
    MiPlataCharts.renderCategoryBars('category-bars', breakdown, breakdown[0]?.amount);

    // Recent expenses
    renderRecentExpenses();
  }

  function renderRecentExpenses() {
    const container = document.getElementById('recent-expenses');
    if (!container) return;

    const recent = state.expenses.slice(0, 5);

    if (recent.length === 0) {
      container.innerHTML = `
        <div class="expense-empty">
          <div class="expense-empty-icon">📭</div>
          <div class="expense-empty-text">
            No hay gastos este mes<br>
            <span style="color: var(--accent-primary);">Toca + para agregar uno</span>
          </div>
        </div>`;
      return;
    }

    container.innerHTML = recent.map(expense => renderExpenseItem(expense)).join('');
  }

  /* ════════════════════════════════════════
     RENDER: EXPENSES
     ════════════════════════════════════════ */
  function renderExpenses() {
    // Render filter chips
    renderFilterChips();

    const container = document.getElementById('expenses-list');
    if (!container) return;

    const filterCat = document.querySelector('.filter-chip.active')?.dataset.category;
    let filtered = state.expenses;
    if (filterCat && filterCat !== 'all') {
      filtered = filtered.filter(e => e.category === filterCat);
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="expense-empty">
          <div class="expense-empty-icon">🔍</div>
          <div class="expense-empty-text">No se encontraron gastos</div>
        </div>`;
      return;
    }

    // Group by date
    const grouped = {};
    for (const exp of filtered) {
      const dateKey = exp.date.split('T')[0];
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(exp);
    }

    let html = '';
    for (const [date, expenses] of Object.entries(grouped)) {
      const d = new Date(date + 'T12:00:00');
      const dayLabel = formatDateLabel(d);
      const dayTotal = expenses.reduce((s, e) => s + e.amount, 0);

      html += `
        <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>${dayLabel}</span>
          <span style="color:var(--accent-danger);font-size:12px;font-weight:700;">-${formatAmount(dayTotal)} Bs</span>
        </div>`;

      html += expenses.map(expense => renderExpenseItem(expense)).join('');
    }

    container.innerHTML = html;
  }

  function renderFilterChips() {
    const container = document.getElementById('expense-filters');
    if (!container) return;

    const cats = getCategoryBreakdown();
    let html = `<button class="filter-chip active" data-category="all">Todos</button>`;
    html += cats.map(c =>
      `<button class="filter-chip" data-category="${c.id}">${c.icon} ${c.name}</button>`
    ).join('');

    container.innerHTML = html;

    // Bind filter clicks
    container.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderExpenses();
      });
    });
  }

  function renderExpenseItem(expense) {
    const cat = state.categories.find(c => c.id === expense.category);
    const icon = cat?.icon || '💰';
    const catName = cat?.name || 'Otros';
    const color = cat?.color || '#6b7280';
    const d = new Date(expense.date);
    const dateStr = `${d.getDate()}/${d.getMonth() + 1}`;

    return `
      <div class="expense-item" data-id="${expense.id}" onclick="App.showExpenseActions('${expense.id}')">
        <div class="expense-icon" style="background: ${MiPlataCharts.hexToRgba(color, 0.15)}">
          ${icon}
        </div>
        <div class="expense-details">
          <div class="expense-category">${catName}</div>
          ${expense.note ? `<div class="expense-note">${escapeHtml(expense.note)}</div>` : ''}
        </div>
        <div class="expense-meta">
          <div class="expense-amount">-${formatAmount(expense.amount)} Bs</div>
          <div class="expense-date">${dateStr}</div>
        </div>
      </div>`;
  }

  /* ════════════════════════════════════════
     RENDER: CATEGORIES
     ════════════════════════════════════════ */
  function renderCategories() {
    const container = document.getElementById('categories-list');
    if (!container) return;

    let html = state.categories.map(cat => {
      const monthExpenses = state.expenses.filter(e => e.category === cat.id);
      const total = monthExpenses.reduce((s, e) => s + e.amount, 0);

      return `
        <div class="category-card" onclick="App.showCategoryEdit('${cat.id}')">
          <div class="category-icon-wrapper" style="background: ${MiPlataCharts.hexToRgba(cat.color, 0.15)}">
            ${cat.icon}
          </div>
          <div class="category-info">
            <div class="category-name">${escapeHtml(cat.name)}</div>
            <div class="category-description">${escapeHtml(cat.description || '')}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:13px;font-weight:700;color:var(--text-secondary);">${formatAmount(total)} Bs</div>
            <div style="font-size:11px;color:var(--text-muted);">${monthExpenses.length} gastos</div>
          </div>
          <span class="category-arrow">›</span>
        </div>`;
    }).join('');

    html += `
      <button class="add-category-btn" onclick="App.showCategoryModal()">
        <span>＋</span> Nueva Categoría
      </button>`;

    container.innerHTML = html;
  }

  /* ════════════════════════════════════════
     RENDER: SETTINGS
     ════════════════════════════════════════ */
  function renderSettings() {
    const salaryEl = document.getElementById('settings-salary-value');
    const savingsEl = document.getElementById('settings-savings-value');

    if (salaryEl && state.profile) {
      salaryEl.textContent = `${formatAmount(state.profile.salary)} Bs`;
    }
    if (savingsEl && state.profile) {
      const val = state.profile.savingsType === 'percentage'
        ? `${state.profile.savingsValue}%`
        : `${formatAmount(state.profile.savingsValue)} Bs`;
      savingsEl.textContent = val;
    }
  }

  /* ════════════════════════════════════════
     EXPENSE CRUD
     ════════════════════════════════════════ */
  function showExpenseModal(editId = null) {
    state.editingExpense = editId;
    const modal = document.getElementById('modal-expense');
    const title = document.getElementById('modal-expense-title');
    const submitBtn = document.getElementById('btn-save-expense');

    if (editId) {
      const expense = state.expenses.find(e => e.id === editId);
      if (!expense) return;

      title.textContent = 'Editar Gasto';
      submitBtn.textContent = 'Guardar Cambios';
      document.getElementById('input-amount').value = expense.amount;
      document.getElementById('input-note').value = expense.note || '';
      document.getElementById('input-date').value = expense.date.split('T')[0];

      // Select category
      setTimeout(() => {
        document.querySelectorAll('.category-option').forEach(opt => {
          opt.classList.toggle('selected', opt.dataset.id === expense.category);
        });
      }, 50);
    } else {
      title.textContent = 'Nuevo Gasto';
      submitBtn.textContent = 'Guardar Gasto';
      document.getElementById('input-amount').value = '';
      document.getElementById('input-note').value = '';
      document.getElementById('input-date').value = new Date().toISOString().split('T')[0];

      setTimeout(() => {
        document.querySelectorAll('.category-option').forEach(opt => opt.classList.remove('selected'));
      }, 50);
    }

    // Render category selector
    renderCategorySelector();
    openModal('modal-expense');
  }

  function renderCategorySelector() {
    const container = document.getElementById('category-selector');
    if (!container) return;

    container.innerHTML = state.categories.map(cat => `
      <div class="category-option" data-id="${cat.id}" onclick="App.selectCategory(this)">
        <span class="category-option-icon">${cat.icon}</span>
        <span class="category-option-name">${cat.name}</span>
      </div>
    `).join('');
  }

  function selectCategory(el) {
    document.querySelectorAll('.category-option').forEach(opt => opt.classList.remove('selected'));
    el.classList.add('selected');
  }

  async function saveExpense() {
    const amount = parseFloat(document.getElementById('input-amount').value);
    const note = document.getElementById('input-note').value.trim();
    const date = document.getElementById('input-date').value;
    const selectedCat = document.querySelector('.category-option.selected');

    if (!amount || amount <= 0) {
      showToast('Ingresa un monto válido', 'error');
      return;
    }

    if (!selectedCat) {
      showToast('Selecciona una categoría', 'error');
      return;
    }

    if (!date) {
      showToast('Selecciona una fecha', 'error');
      return;
    }

    const categoryId = selectedCat.dataset.id;
    const [y, m] = date.split('-');
    const month = `${y}-${m}`;

    const expense = {
      id: state.editingExpense || MiPlataDB.generateId('exp-'),
      amount,
      category: categoryId,
      note,
      date: `${date}T${new Date().toTimeString().slice(0, 8)}`,
      month,
      createdAt: state.editingExpense
        ? (state.expenses.find(e => e.id === state.editingExpense)?.createdAt || new Date().toISOString())
        : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await MiPlataDB.save('expenses', expense);
    closeModal('modal-expense');
    await loadMonthData();
    renderCurrentTab();

    const cat = state.categories.find(c => c.id === categoryId);
    showToast(
      state.editingExpense
        ? 'Gasto actualizado ✏️'
        : `${cat?.icon || '💸'} Gasto registrado: ${formatAmount(amount)} Bs`,
      'success'
    );
    state.editingExpense = null;
  }

  function showExpenseActions(expenseId) {
    state.editingExpense = expenseId;
    const expense = state.expenses.find(e => e.id === expenseId);
    if (!expense) return;

    const cat = state.categories.find(c => c.id === expense.category);
    const actionContent = document.getElementById('action-sheet-content');

    actionContent.innerHTML = `
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:32px;margin-bottom:8px;">${cat?.icon || '💰'}</div>
        <div style="font-size:18px;font-weight:700;">${formatAmount(expense.amount)} Bs</div>
        <div style="font-size:13px;color:var(--text-muted);">${cat?.name || 'Otros'}${expense.note ? ' · ' + expense.note : ''}</div>
      </div>
      <div class="action-sheet">
        <button class="action-sheet-item" onclick="App.showExpenseModal('${expenseId}'); App.closeModal('modal-actions');">
          ✏️ Editar gasto
        </button>
        <div class="action-sheet-divider"></div>
        <button class="action-sheet-item danger" onclick="App.confirmDeleteExpense('${expenseId}')">
          🗑️ Eliminar gasto
        </button>
      </div>`;

    openModal('modal-actions');
  }

  function confirmDeleteExpense(expenseId) {
    closeModal('modal-actions');
    const confirmContent = document.getElementById('confirm-content');
    confirmContent.innerHTML = `
      <div class="confirm-body">
        <div class="confirm-icon">🗑️</div>
        <div class="confirm-text">¿Estás seguro de que quieres eliminar este gasto? Esta acción no se puede deshacer.</div>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="App.closeModal('modal-confirm')">Cancelar</button>
        <button class="btn-danger" style="flex:1;" onclick="App.deleteExpense('${expenseId}')">Eliminar</button>
      </div>`;
    openModal('modal-confirm');
  }

  async function deleteExpense(expenseId) {
    await MiPlataDB.remove('expenses', expenseId);
    closeModal('modal-confirm');
    await loadMonthData();
    renderCurrentTab();
    showToast('Gasto eliminado', 'info');
  }

  /* ════════════════════════════════════════
     CATEGORY CRUD
     ════════════════════════════════════════ */
  function showCategoryModal(editId = null) {
    state.editingCategory = editId;
    const title = document.getElementById('modal-category-title');
    const nameInput = document.getElementById('input-cat-name');
    const iconInput = document.getElementById('input-cat-icon');
    const colorInput = document.getElementById('input-cat-color');
    const descInput = document.getElementById('input-cat-desc');
    const deleteBtn = document.getElementById('btn-delete-category');

    if (editId) {
      const cat = state.categories.find(c => c.id === editId);
      if (!cat) return;
      title.textContent = 'Editar Categoría';
      nameInput.value = cat.name;
      iconInput.value = cat.icon;
      colorInput.value = cat.color;
      descInput.value = cat.description || '';
      deleteBtn.classList.remove('hidden');
    } else {
      title.textContent = 'Nueva Categoría';
      nameInput.value = '';
      iconInput.value = '📌';
      colorInput.value = '#10b981';
      descInput.value = '';
      deleteBtn.classList.add('hidden');
    }

    openModal('modal-category');
  }

  function showCategoryEdit(catId) {
    showCategoryModal(catId);
  }

  async function saveCategory() {
    const name = document.getElementById('input-cat-name').value.trim();
    const icon = document.getElementById('input-cat-icon').value.trim();
    const color = document.getElementById('input-cat-color').value;
    const description = document.getElementById('input-cat-desc').value.trim();

    if (!name) {
      showToast('Ingresa un nombre', 'error');
      return;
    }

    const category = {
      id: state.editingCategory || MiPlataDB.generateId('cat-'),
      name,
      icon: icon || '📌',
      color,
      description
    };

    await MiPlataDB.save('categories', category);
    closeModal('modal-category');
    state.categories = await MiPlataDB.getAll('categories');
    renderCurrentTab();
    showToast(state.editingCategory ? 'Categoría actualizada' : 'Categoría creada ✨', 'success');
    state.editingCategory = null;
  }

  async function deleteCategory() {
    if (!state.editingCategory) return;

    // Check if category has expenses
    const expenses = state.expenses.filter(e => e.category === state.editingCategory);
    if (expenses.length > 0) {
      showToast(`No se puede eliminar: tiene ${expenses.length} gasto(s)`, 'error');
      return;
    }

    await MiPlataDB.remove('categories', state.editingCategory);
    closeModal('modal-category');
    state.categories = await MiPlataDB.getAll('categories');
    renderCurrentTab();
    showToast('Categoría eliminada', 'info');
    state.editingCategory = null;
  }

  /* ════════════════════════════════════════
     OCR SCANNER
     ════════════════════════════════════════ */
  function showOCRModal() {
    const preview = document.getElementById('ocr-preview');
    const result = document.getElementById('ocr-result');
    const progress = document.getElementById('ocr-progress');
    const upload = document.getElementById('ocr-upload-area');

    preview.classList.remove('active');
    result.classList.remove('active');
    progress.classList.remove('active');
    upload.style.display = 'block';
    document.getElementById('ocr-file-input').value = '';

    openModal('modal-ocr');
  }

  async function handleOCRFile(file) {
    if (!file) return;

    const upload = document.getElementById('ocr-upload-area');
    const preview = document.getElementById('ocr-preview');
    const progress = document.getElementById('ocr-progress');
    const progressText = document.getElementById('ocr-progress-text');
    const progressFill = document.getElementById('ocr-progress-fill');
    const result = document.getElementById('ocr-result');
    const resultAmount = document.getElementById('ocr-result-amount');
    const resultEdit = document.getElementById('ocr-result-edit');
    const imgPreview = document.getElementById('ocr-image-preview');

    // Show preview
    upload.style.display = 'none';
    const dataUrl = await MiPlataOCR.createPreview(file);
    imgPreview.src = dataUrl;
    preview.classList.add('active');

    // Show progress
    progress.classList.add('active');
    progressFill.style.width = '0%';

    try {
      const ocrResult = await MiPlataOCR.processImage(file, (msg, pct) => {
        progressText.textContent = msg;
        if (pct !== undefined) {
          progressFill.style.width = `${Math.round(pct * 100)}%`;
        }
      });

      progress.classList.remove('active');
      result.classList.add('active');

      if (ocrResult.bestAmount) {
        resultAmount.textContent = `${formatAmount(ocrResult.bestAmount)} Bs`;
        resultEdit.value = ocrResult.bestAmount;
      } else {
        resultAmount.textContent = 'No detectado';
        resultEdit.value = '';
        showToast('No se pudo detectar el monto. Ingrésalo manualmente.', 'info');
      }
    } catch (err) {
      progress.classList.remove('active');
      showToast('Error al procesar la imagen', 'error');
      console.error('OCR Error:', err);
    }
  }

  function confirmOCRAmount() {
    const amount = parseFloat(document.getElementById('ocr-result-edit').value);
    if (!amount || amount <= 0) {
      showToast('Ingresa un monto válido', 'error');
      return;
    }

    closeModal('modal-ocr');

    // Open expense modal with pre-filled amount
    showExpenseModal();
    setTimeout(() => {
      document.getElementById('input-amount').value = amount;
    }, 100);
  }

  /* ════════════════════════════════════════
     SETTINGS
     ════════════════════════════════════════ */
  function showEditSalary() {
    const content = document.getElementById('confirm-content');
    content.innerHTML = `
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:32px;margin-bottom:8px;">💰</div>
        <div style="font-size:16px;font-weight:600;">Editar Sueldo Mensual</div>
      </div>
      <div class="form-group">
        <label class="form-label">Sueldo (Bs)</label>
        <input type="number" class="form-input" id="edit-salary-input" value="${state.profile?.salary || ''}" placeholder="0.00" inputmode="decimal">
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="App.closeModal('modal-confirm')">Cancelar</button>
        <button class="btn-primary" onclick="App.updateSalary()">Guardar</button>
      </div>`;
    openModal('modal-confirm');
  }

  async function updateSalary() {
    const salary = parseFloat(document.getElementById('edit-salary-input').value);
    if (!salary || salary <= 0) {
      showToast('Ingresa un sueldo válido', 'error');
      return;
    }
    state.profile.salary = salary;
    await MiPlataDB.save('profile', state.profile);
    closeModal('modal-confirm');
    renderCurrentTab();
    showToast('Sueldo actualizado', 'success');
  }

  function showEditSavings() {
    const content = document.getElementById('confirm-content');
    content.innerHTML = `
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:32px;margin-bottom:8px;">🎯</div>
        <div style="font-size:16px;font-weight:600;">Meta de Ahorro</div>
      </div>
      <div class="savings-type-toggle">
        <button class="savings-type-btn ${state.profile?.savingsType === 'percentage' ? 'active' : ''}" data-type="percentage" onclick="App.toggleSavingsType(this)">% Porcentaje</button>
        <button class="savings-type-btn ${state.profile?.savingsType === 'fixed' ? 'active' : ''}" data-type="fixed" onclick="App.toggleSavingsType(this)">Bs Fijo</button>
      </div>
      <div class="form-group">
        <label class="form-label" id="edit-savings-label">${state.profile?.savingsType === 'percentage' ? 'Porcentaje (%)' : 'Monto (Bs)'}</label>
        <input type="number" class="form-input" id="edit-savings-input" value="${state.profile?.savingsValue || ''}" placeholder="0" inputmode="decimal">
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="App.closeModal('modal-confirm')">Cancelar</button>
        <button class="btn-primary" onclick="App.updateSavings()">Guardar</button>
      </div>`;
    openModal('modal-confirm');
  }

  async function updateSavings() {
    const savingsValue = parseFloat(document.getElementById('edit-savings-input').value);
    const activeBtn = document.querySelector('#confirm-content .savings-type-btn.active');
    const savingsType = activeBtn?.dataset.type || 'percentage';

    if (!savingsValue || savingsValue <= 0) {
      showToast('Ingresa un valor válido', 'error');
      return;
    }

    if (savingsType === 'percentage' && savingsValue > 100) {
      showToast('El porcentaje no puede ser mayor a 100%', 'error');
      return;
    }

    state.profile.savingsType = savingsType;
    state.profile.savingsValue = savingsValue;
    await MiPlataDB.save('profile', state.profile);
    closeModal('modal-confirm');
    renderCurrentTab();
    showToast('Meta de ahorro actualizada', 'success');
  }

  /* ── Backup ── */
  async function exportData() {
    try {
      const data = await MiPlataDB.exportAll();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `miplata-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Datos exportados correctamente 📁', 'success');
    } catch (err) {
      showToast('Error al exportar datos', 'error');
      console.error(err);
    }
  }

  function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.appName || data.appName !== 'MiPlata') {
          showToast('Archivo no válido para MiPlata', 'error');
          return;
        }

        // Show confirmation
        const content = document.getElementById('confirm-content');
        const stats = `${data.expenses?.length || 0} gastos, ${data.categories?.length || 0} categorías`;
        content.innerHTML = `
          <div class="confirm-body">
            <div class="confirm-icon">📥</div>
            <div class="confirm-text">
              ¿Importar datos del respaldo?<br>
              <strong>${stats}</strong><br>
              <span style="color:var(--accent-warning);font-size:12px;">Esto reemplazará todos los datos actuales</span>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn-secondary" onclick="App.closeModal('modal-confirm')">Cancelar</button>
            <button class="btn-primary" onclick="App.confirmImport()">Importar</button>
          </div>`;

        // Store data temporarily
        window._pendingImport = data;
        openModal('modal-confirm');
      } catch (err) {
        showToast('Error al leer el archivo', 'error');
        console.error(err);
      }
    };
    input.click();
  }

  async function confirmImport() {
    const data = window._pendingImport;
    if (!data) return;

    try {
      await MiPlataDB.importAll(data, true);
      state.profile = await MiPlataDB.get('profile', 'main');
      await loadMonthData();
      closeModal('modal-confirm');
      renderCurrentTab();
      showToast('Datos importados correctamente ✅', 'success');
    } catch (err) {
      showToast('Error al importar datos', 'error');
      console.error(err);
    }
    delete window._pendingImport;
  }

  async function clearAllData() {
    const content = document.getElementById('confirm-content');
    content.innerHTML = `
      <div class="confirm-body">
        <div class="confirm-icon">⚠️</div>
        <div class="confirm-text">
          ¿Borrar TODOS los datos de MiPlata?<br>
          <span style="color:var(--accent-danger);">Esta acción no se puede deshacer.</span><br>
          <span style="font-size:12px;color:var(--text-muted);">Te recomendamos exportar un respaldo primero.</span>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="App.closeModal('modal-confirm')">Cancelar</button>
        <button class="btn-danger" style="flex:1;" onclick="App.confirmClearAll()">Borrar Todo</button>
      </div>`;
    openModal('modal-confirm');
  }

  async function confirmClearAll() {
    await MiPlataDB.clear('profile');
    await MiPlataDB.clear('expenses');
    await MiPlataDB.clear('categories');
    await MiPlataDB.init(); // Re-seed defaults
    state.profile = null;
    state.expenses = [];
    state.categories = await MiPlataDB.getAll('categories');
    closeModal('modal-confirm');
    showOnboarding();
    showToast('Datos eliminados', 'info');
  }

  /* ════════════════════════════════════════
     MODALS
     ════════════════════════════════════════ */
  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
  }

  /* ════════════════════════════════════════
     TOASTS
     ════════════════════════════════════════ */
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 3200);
  }

  /* ════════════════════════════════════════
     HELPERS
     ════════════════════════════════════════ */
  function formatAmount(num) {
    if (num == null || isNaN(num)) return '0,00';
    return num.toLocaleString('es-BO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatDateLabel(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Hoy';
    if (date.toDateString() === yesterday.toDateString()) return 'Ayer';

    return `${date.getDate()} de ${MONTHS_ES[date.getMonth()]}`;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function toggleSavingsType(btn) {
    document.querySelectorAll('.savings-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const label = document.getElementById('edit-savings-label') ||
                  document.getElementById('savings-label');
    if (label) {
      label.textContent = btn.dataset.type === 'percentage' ? 'Porcentaje (%)' : 'Monto (Bs)';
    }
  }

  /* ════════════════════════════════════════
     EVENT BINDINGS
     ════════════════════════════════════════ */
  function bindEvents() {
    // Bottom nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => switchTab(item.dataset.tab));
    });

    // Month navigation
    document.getElementById('btn-prev-month')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('btn-next-month')?.addEventListener('click', () => changeMonth(1));

    // FAB
    document.getElementById('fab-add')?.addEventListener('click', () => showExpenseModal());

    // Onboarding steps
    document.getElementById('btn-onboarding-start')?.addEventListener('click', () => showOnboardingStep(2));
    document.getElementById('btn-onboarding-next')?.addEventListener('click', () => showOnboardingStep(3));
    document.getElementById('btn-onboarding-back')?.addEventListener('click', () => showOnboardingStep(2));
    document.getElementById('btn-onboarding-done')?.addEventListener('click', () => completeOnboarding());

    // Savings type toggle in onboarding
    document.querySelectorAll('#onboarding .savings-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#onboarding .savings-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const label = document.getElementById('savings-label');
        if (label) label.textContent = btn.dataset.type === 'percentage' ? 'Porcentaje (%)' : 'Monto (Bs)';
      });
    });

    // Expense modal
    document.getElementById('btn-save-expense')?.addEventListener('click', () => saveExpense());
    document.getElementById('btn-scan-receipt')?.addEventListener('click', () => {
      closeModal('modal-expense');
      showOCRModal();
    });

    // Category modal
    document.getElementById('btn-save-category')?.addEventListener('click', () => saveCategory());
    document.getElementById('btn-delete-category')?.addEventListener('click', () => deleteCategory());

    // OCR
    document.getElementById('ocr-upload-area')?.addEventListener('click', () => {
      document.getElementById('ocr-file-input')?.click();
    });
    document.getElementById('ocr-file-input')?.addEventListener('change', (e) => {
      handleOCRFile(e.target.files[0]);
    });
    document.getElementById('btn-ocr-confirm')?.addEventListener('click', () => confirmOCRAmount());

    // Settings
    document.getElementById('btn-edit-salary')?.addEventListener('click', () => showEditSalary());
    document.getElementById('btn-edit-savings')?.addEventListener('click', () => showEditSavings());
    document.getElementById('btn-export')?.addEventListener('click', () => exportData());
    document.getElementById('btn-import')?.addEventListener('click', () => importData());
    document.getElementById('btn-clear-data')?.addEventListener('click', () => clearAllData());

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
        }
      });
    });

    // Close modal buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.closeModal;
        closeModal(modalId);
      });
    });
  }

  /* ════════════════════════════════════════
     PUBLIC API
     ════════════════════════════════════════ */
  return {
    init,
    switchTab,
    showExpenseModal,
    saveExpense,
    showExpenseActions,
    confirmDeleteExpense,
    deleteExpense,
    selectCategory,
    showCategoryModal,
    showCategoryEdit,
    saveCategory,
    deleteCategory,
    showOCRModal,
    confirmOCRAmount,
    showEditSalary,
    updateSalary,
    showEditSavings,
    updateSavings,
    toggleSavingsType,
    exportData,
    importData,
    confirmImport,
    clearAllData,
    confirmClearAll,
    openModal,
    closeModal,
    changeMonth
  };
})();

/* ── Bootstrap ── */
document.addEventListener('DOMContentLoaded', () => {
  App.init().catch(err => {
    console.error('App init failed:', err);
  });
});

/* ── Register Service Worker + Auto-Update ── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => {
        console.log('[SW] Registered:', reg.scope);

        // Check for updates every 60 minutes
        setInterval(() => reg.update(), 60 * 60 * 1000);

        // Notify user when a new version is available
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
              // New version installed — show update toast
              if (typeof App !== 'undefined') {
                const container = document.getElementById('toast-container');
                if (container) {
                  const toast = document.createElement('div');
                  toast.className = 'toast success';
                  toast.innerHTML = '🔄 Nueva versión disponible. <b>Toca para actualizar</b>';
                  toast.style.cursor = 'pointer';
                  toast.addEventListener('click', () => window.location.reload());
                  container.appendChild(toast);
                  setTimeout(() => toast.remove(), 8000);
                }
              }
            }
          });
        });
      })
      .catch((err) => console.warn('[SW] Registration failed:', err));
  });
}

/* ── Request Persistent Storage (data NEVER gets deleted) ── */
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then((granted) => {
    if (granted) {
      console.log('[Storage] Persistent storage granted ✅ — data will NOT be evicted');
    } else {
      console.log('[Storage] Persistent storage denied — data may be evicted under pressure');
    }
  });
}
