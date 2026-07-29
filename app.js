/* ============================================
   MiPlata — Main Application Logic (v2)
   Multi-Account System
   ============================================ */

const App = (() => {
  /* ════════════════════════════════════════
     STATE
     ════════════════════════════════════════ */
  let state = {
    profile: null,        // { id, currency, savingsType, savingsValue }
    accounts: [],         // All accounts
    expenses: [],         // Current month transactions
    categories: [],       // All categories
    currentMonth: '',     // 'YYYY-MM'
    currentTab: 'dashboard',
    editingExpense: null,
    editingCategory: null,
    editingAccount: null,
    movementFilter: 'all' // 'all' | 'expense' | 'income'
  };

  const MONTHS_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const ACCOUNT_TYPES = {
    cash: { label: 'Efectivo', icon: '💵' },
    wallet: { label: 'Monedero', icon: '💳' },
    bank: { label: 'Banco', icon: '🏦' },
    savings: { label: 'Ahorro', icon: '💰' },
    other: { label: 'Otro', icon: '📦' }
  };

  /* ════════════════════════════════════════
     INITIALIZATION
     ════════════════════════════════════════ */
  async function init() {
    // Initialize database
    await MiPlataDB.init();

    // Load profile
    state.profile = await MiPlataDB.get('profile', 'main');
    state.categories = await MiPlataDB.getAll('categories');
    state.accounts = await MiPlataDB.getAll('accounts');

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
     ONBOARDING WIZARD (V3)
     ════════════════════════════════════════ */
  let obState = {
    accounts: [],
    categories: [],
    salary: { amount: 0, date: '', accountId: '' },
    pastExpenses: [],
    hasSpent: false
  };

  const OB_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316'];
  const OB_ACCOUNT_ICONS = { cash: '💵', bank: '🏦', wallet: '💳', savings: '💰' };
  const OB_CATEGORY_ICONS = ['🍔', '🚌', '🏠', '🎮', '🛒', '💼', '💻', '🎁', '📝', '🏥', '✈️', '🐶'];

  function showOnboarding() {
    document.getElementById('onboarding').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');

    // Initialize default if empty
    if (obState.accounts.length === 0) {
      obState.accounts.push({ id: MiPlataDB.generateId('acc-'), name: 'Efectivo', type: 'cash', color: OB_COLORS[0], balance: 0 });
    }
    if (obState.categories.length === 0) {
      obState.categories.push({ id: MiPlataDB.generateId('cat-'), name: 'Sueldo', icon: '💼', color: OB_COLORS[0], type: 'income' });
      obState.categories.push({ id: MiPlataDB.generateId('cat-'), name: 'Comida', icon: '🍔', color: OB_COLORS[3], type: 'expense' });
    }

    showOnboardingStep(1);

    // Bind step navigation
    document.getElementById('btn-onboarding-start')?.addEventListener('click', () => showOnboardingStep(2));

    document.getElementById('btn-onboarding-step2-next')?.addEventListener('click', () => {
      // Validate at least one account
      const validAccounts = obState.accounts.filter(a => a.name.trim());
      if (validAccounts.length === 0) {
        showToast('Agrega al menos una cuenta con nombre', 'error');
        return;
      }
      showOnboardingStep(3);
    });

    document.getElementById('btn-onboarding-step3-next')?.addEventListener('click', () => {
      const validCats = obState.categories.filter(c => c.name.trim());
      if (validCats.length === 0) {
        showToast('Crea al menos una categoría', 'error');
        return;
      }
      // Populate salary account selector
      const sel = document.getElementById('ob-salary-account');
      sel.innerHTML = obState.accounts.filter(a => a.name.trim()).map(a => `<option value="${a.id}">${a.name}</option>`).join('');

      showOnboardingStep(4);
    });

    document.getElementById('btn-onboarding-step4-next')?.addEventListener('click', () => {
      obState.salary.amount = parseFloat(document.getElementById('ob-salary-amount').value) || 0;
      obState.salary.date = document.getElementById('ob-salary-date').value;
      obState.salary.accountId = document.getElementById('ob-salary-account').value;

      if (!obState.salary.amount || !obState.salary.date || !obState.salary.accountId) {
        showToast('Por favor, ingresa el monto, fecha y cuenta', 'error');
        return;
      }

      document.getElementById('ob-summary-date').textContent = formatDateLabel(new Date(obState.salary.date + 'T12:00:00'));
      document.getElementById('ob-summary-balance').textContent = formatAmount(obState.salary.amount) + ' Bs';

      showOnboardingStep(5);
    });

    // Step 5 Logic
    document.getElementById('btn-ob-spent-no')?.addEventListener('click', () => {
      document.getElementById('btn-ob-spent-no').classList.add('active');
      document.getElementById('btn-ob-spent-yes').classList.remove('active');
      document.getElementById('ob-expenses-container').style.display = 'none';
      obState.hasSpent = false;
    });

    document.getElementById('btn-ob-spent-yes')?.addEventListener('click', () => {
      document.getElementById('btn-ob-spent-yes').classList.add('active');
      document.getElementById('btn-ob-spent-no').classList.remove('active');
      document.getElementById('ob-expenses-container').style.display = 'block';
      obState.hasSpent = true;
      if (obState.pastExpenses.length === 0) addObExpense();
      renderObExpenses();
    });

    document.getElementById('btn-onboarding-done')?.addEventListener('click', completeOnboarding);
  }

  function showOnboardingStep(step) {
    document.querySelectorAll('.onboarding-step').forEach(el => el.classList.remove('active'));
    const stepEl = document.getElementById(`onboarding-step-${step}`);
    if (stepEl) stepEl.classList.add('active');

    if (step === 2) renderObAccounts();
    if (step === 3) renderObCategories();
    if (step === 5 && obState.hasSpent) renderObExpenses();
  }

  // --- ACCOUNTS (Step 2) ---
  function renderObAccounts() {
    const list = document.getElementById('ob-accounts-list');
    if (!list) return;

    list.innerHTML = obState.accounts.map((acc, i) => `
      <div style="background:var(--glass-bg); border-radius:12px; padding:12px; margin-bottom:12px; border-left:4px solid ${acc.color};">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <input type="text" value="${escapeHtml(acc.name)}" placeholder="Nombre de la cuenta" onchange="App.updateObAccount(${i}, 'name', this.value)" style="flex:1; border:none; background:transparent; font-size:16px; font-weight:600; color:var(--text-primary); outline:none;">
          <button onclick="App.removeObAccount(${i})" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:18px;">✕</button>
        </div>
        <div style="display:flex; gap:8px;">
          <select onchange="App.updateObAccount(${i}, 'type', this.value)" style="padding:6px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary);">
            <option value="cash" ${acc.type === 'cash' ? 'selected' : ''}>💵 Efectivo</option>
            <option value="bank" ${acc.type === 'bank' ? 'selected' : ''}>🏦 Banco</option>
            <option value="wallet" ${acc.type === 'wallet' ? 'selected' : ''}>💳 Monedero</option>
            <option value="savings" ${acc.type === 'savings' ? 'selected' : ''}>💰 Ahorro</option>
          </select>
          <input type="color" value="${acc.color}" onchange="App.updateObAccount(${i}, 'color', this.value)" style="width:36px; height:36px; padding:0; border:none; border-radius:8px; background:transparent; cursor:pointer;">
        </div>
      </div>
    `).join('');
  }

  function addObAccount() {
    obState.accounts.push({
      id: MiPlataDB.generateId('acc-'),
      name: '',
      type: 'cash',
      color: OB_COLORS[obState.accounts.length % OB_COLORS.length],
      balance: 0
    });
    renderObAccounts();
  }

  function removeObAccount(index) {
    obState.accounts.splice(index, 1);
    renderObAccounts();
  }

  function updateObAccount(index, field, value) {
    if (obState.accounts[index]) {
      obState.accounts[index][field] = value;
      if (field === 'color') renderObAccounts(); // Re-render to update the border color
    }
  }

  // --- CATEGORIES (Step 3) ---
  function renderObCategories() {
    const list = document.getElementById('ob-categories-list');
    if (!list) return;

    list.innerHTML = obState.categories.map((cat, i) => `
      <div style="background:var(--glass-bg); border-radius:12px; padding:12px; margin-bottom:12px; border-left:4px solid ${cat.color};">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <input type="text" value="${escapeHtml(cat.name)}" placeholder="Nombre de categoría" onchange="App.updateObCategory(${i}, 'name', this.value)" style="flex:1; border:none; background:transparent; font-size:16px; font-weight:600; color:var(--text-primary); outline:none;">
          <button onclick="App.removeObCategory(${i})" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:18px;">✕</button>
        </div>
        <div style="display:flex; gap:8px;">
          <select onchange="App.updateObCategory(${i}, 'type', this.value)" style="padding:6px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary);">
            <option value="expense" ${cat.type === 'expense' ? 'selected' : ''}>Gasto</option>
            <option value="income" ${cat.type === 'income' ? 'selected' : ''}>Ingreso</option>
          </select>
          <input type="text" value="${cat.icon}" onchange="App.updateObCategory(${i}, 'icon', this.value)" maxlength="4" style="width: 40px; padding:6px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary); text-align:center;" placeholder="😀">
          <input type="color" value="${cat.color}" onchange="App.updateObCategory(${i}, 'color', this.value)" style="width:36px; height:36px; padding:0; border:none; border-radius:8px; background:transparent; cursor:pointer;">
        </div>
      </div>
    `).join('');
  }

  function addObCategory() {
    obState.categories.push({
      id: MiPlataDB.generateId('cat-'),
      name: '',
      icon: OB_CATEGORY_ICONS[0],
      type: 'expense',
      color: OB_COLORS[obState.categories.length % OB_COLORS.length]
    });
    renderObCategories();
  }

  function removeObCategory(index) {
    obState.categories.splice(index, 1);
    renderObCategories();
  }

  function updateObCategory(index, field, value) {
    if (obState.categories[index]) {
      obState.categories[index][field] = value;
      if (field === 'color') renderObCategories();
    }
  }

  // --- PAST EXPENSES (Step 5) ---
  function renderObExpenses() {
    const list = document.getElementById('ob-expenses-list');
    if (!list) return;

    // Only expense categories
    const expCats = obState.categories.filter(c => c.type === 'expense' && c.name.trim());
    const catOptions = expCats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    list.innerHTML = obState.pastExpenses.map((exp, i) => `
      <div style="background:var(--glass-bg); border-radius:12px; padding:12px; margin-bottom:12px; display:flex; gap:8px; align-items:center;">
        <div style="flex:1;">
          <input type="number" value="${exp.amount || ''}" placeholder="0.00" inputmode="decimal" step="0.01" min="0" oninput="App.updateObExpense(${i}, 'amount', this.value)" style="width:100%; border:none; border-bottom:1px solid var(--border-color); background:transparent; font-size:16px; font-weight:600; color:var(--text-primary); outline:none; margin-bottom:8px;">
          <select onchange="App.updateObExpense(${i}, 'categoryId', this.value)" style="width:100%; padding:6px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-secondary); color:var(--text-primary);">
            <option value="">Selecciona...</option>
            ${expCats.map(c => `<option value="${c.id}" ${exp.categoryId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
        </div>
        <button onclick="App.removeObExpense(${i})" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:18px; padding:8px;">✕</button>
      </div>
    `).join('');

    updateObExpensesSummary();
  }

  function addObExpense() {
    obState.pastExpenses.push({ amount: 0, categoryId: '' });
    renderObExpenses();
  }

  function removeObExpense(index) {
    obState.pastExpenses.splice(index, 1);
    renderObExpenses();
  }

  function updateObExpense(index, field, value) {
    if (obState.pastExpenses[index]) {
      if (field === 'amount') value = parseFloat(value) || 0;
      obState.pastExpenses[index][field] = value;
      updateObExpensesSummary();
    }
  }

  function updateObExpensesSummary() {
    const totalSpent = obState.pastExpenses.reduce((sum, e) => sum + e.amount, 0);
    const balance = obState.salary.amount - totalSpent;
    document.getElementById('ob-summary-spent').textContent = formatAmount(totalSpent) + ' Bs';
    document.getElementById('ob-summary-balance').textContent = formatAmount(balance) + ' Bs';
  }

  // --- FINISH ---
  async function completeOnboarding() {
    // Save profile
    state.profile = {
      id: 'main',
      currency: 'Bs',
      savingsType: 'percentage',
      savingsValue: 0,
      createdAt: new Date().toISOString()
    };
    await MiPlataDB.save('profile', state.profile);

    // Save Accounts (balance is 0 for all except the one that gets the salary, which will be updated by transactions)
    await MiPlataDB.clear('accounts');
    const validAccounts = obState.accounts.filter(a => a.name.trim());
    for (const acc of validAccounts) {
      acc.name = acc.name.trim();
      acc.icon = OB_ACCOUNT_ICONS[acc.type] || '💰';
      acc.createdAt = new Date().toISOString();
      await MiPlataDB.save('accounts', acc);
    }

    // Save Categories
    await MiPlataDB.clear('categories');
    const validCats = obState.categories.filter(c => c.name.trim());
    for (const cat of validCats) {
      cat.name = cat.name.trim();
      await MiPlataDB.save('categories', cat);
    }

    // Salary Date parsing
    const [y, m] = obState.salary.date.split('-');
    const salaryMonth = `${y}-${m}`;

    // Create Income Transaction (Salary)
    const salaryTx = {
      id: MiPlataDB.generateId('exp-'),
      type: 'income',
      amount: obState.salary.amount,
      categoryId: validCats.find(c => c.type === 'income')?.id || '',
      categoryName: validCats.find(c => c.type === 'income')?.name || 'Ingreso Inicial',
      accountId: obState.salary.accountId,
      note: 'Ingreso inicial',
      date: obState.salary.date,
      month: salaryMonth
    };
    await MiPlataDB.save('expenses', salaryTx);

    // Add amount to the account directly for calculation
    const accountIndex = validAccounts.findIndex(a => a.id === obState.salary.accountId);
    if (accountIndex !== -1) validAccounts[accountIndex].balance += obState.salary.amount;

    // Create Past Expenses Transactions
    if (obState.hasSpent) {
      for (const exp of obState.pastExpenses) {
        if (exp.amount > 0 && exp.categoryId) {
          const cat = validCats.find(c => c.id === exp.categoryId);
          const expenseTx = {
            id: MiPlataDB.generateId('exp-'),
            type: 'expense',
            amount: exp.amount,
            categoryId: exp.categoryId,
            categoryName: cat ? cat.name : 'Gasto Pasado',
            accountId: obState.salary.accountId,
            note: 'Gastos previos al registro',
            date: obState.salary.date, // Same day as salary to keep it in the same month logic
            month: salaryMonth
          };
          await MiPlataDB.save('expenses', expenseTx);

          if (accountIndex !== -1) validAccounts[accountIndex].balance -= exp.amount;
        }
      }
    }

    // Update account balances in DB
    for (const acc of validAccounts) {
      await MiPlataDB.save('accounts', acc);
    }

    state.accounts = await MiPlataDB.getAll('accounts');
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
      fab.style.display = (tabName === 'dashboard' || tabName === 'movements') ? 'flex' : 'none';
    }

    renderCurrentTab();
  }

  function renderCurrentTab() {
    switch (state.currentTab) {
      case 'dashboard': renderDashboard(); break;
      case 'movements': renderMovements(); break;
      case 'accounts': renderAccounts(); break;
      case 'analytics': renderAnalytics(); break;
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
    state.accounts = await MiPlataDB.getAll('accounts');
    // Sort expenses by date descending
    state.expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  /* ════════════════════════════════════════
     CALCULATIONS
     ════════════════════════════════════════ */
  function getMonthSummary() {
    let totalIncome = 0;
    let totalSpent = 0;

    state.expenses.forEach(e => {
      const type = e.type || 'expense';
      if (type === 'income') {
        totalIncome += e.amount;
      } else if (type === 'expense') {
        totalSpent += e.amount;
      }
    });

    const totalAccountBalance = state.accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);

    const savingsGoal = state.profile?.savingsType === 'percentage'
      ? totalIncome * (state.profile.savingsValue / 100)
      : (state.profile?.savingsValue || 0);

    const available = totalIncome - totalSpent;
    const currentSavings = Math.max(available, 0);

    return { totalIncome, totalSpent, savingsGoal, available, currentSavings, totalAccountBalance };
  }

  function getCategoryBreakdown(type = 'expense') {
    const map = {};
    for (const expense of state.expenses) {
      const expType = expense.type || 'expense';
      if (expType !== type) continue;

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
    const { totalIncome, totalSpent, savingsGoal, available, currentSavings, totalAccountBalance } = getMonthSummary();

    // Balance card — show total account balance
    const balanceAmount = document.getElementById('dashboard-balance');
    const incomeValue = document.getElementById('dashboard-income');
    const expenseValue = document.getElementById('dashboard-expenses');

    if (balanceAmount) balanceAmount.textContent = `${formatAmount(totalAccountBalance)} Bs`;
    if (incomeValue) incomeValue.textContent = `${formatAmount(totalIncome)} Bs`;
    if (expenseValue) expenseValue.textContent = `${formatAmount(totalSpent)} Bs`;

    // Account cards
    renderDashboardAccounts();

    // Savings progress
    MiPlataCharts.renderSavingsProgress('savings-progress', currentSavings, savingsGoal);

    // Recent transactions
    renderRecentExpenses();
  }

  /* ════════════════════════════════════════
     RENDER: ANALYTICS
     ════════════════════════════════════════ */
  function renderAnalytics() {
    const { totalSpent } = getMonthSummary();
    const breakdown = getCategoryBreakdown('expense');

    // Donut chart
    MiPlataCharts.renderDonut('chart-donut', breakdown, totalSpent);

    // Category bars
    MiPlataCharts.renderCategoryBars('category-bars', breakdown, breakdown[0]?.amount);
  }

  function renderDashboardAccounts() {
    const container = document.getElementById('dashboard-accounts');
    if (!container) return;

    if (state.accounts.length === 0) {
      container.innerHTML = '<div class="expense-empty"><div class="expense-empty-text">No tienes cuentas aún</div></div>';
      return;
    }

    container.innerHTML = state.accounts.map(acc => `
      <div class="account-mini-card" onclick="App.switchTab('accounts')" style="border-left: 3px solid ${acc.color};">
        <div class="account-mini-icon" style="background: ${MiPlataCharts.hexToRgba(acc.color, 0.15)}">${acc.icon}</div>
        <div class="account-mini-info">
          <div class="account-mini-name">${escapeHtml(acc.name)}</div>
          <div class="account-mini-type">${ACCOUNT_TYPES[acc.type]?.label || acc.type}</div>
        </div>
        <div class="account-mini-balance" style="color: ${acc.balance >= 0 ? 'var(--accent-primary)' : 'var(--expense-red)'};">
          ${formatAmount(acc.balance)} Bs
        </div>
      </div>
    `).join('');
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
            No hay movimientos este mes<br>
            <span style="color: var(--accent-primary);">Toca + para agregar uno</span>
          </div>
        </div>`;
      return;
    }

    container.innerHTML = recent.map(expense => renderExpenseItem(expense)).join('');
  }

  /* ════════════════════════════════════════
     RENDER: MOVEMENTS (was EXPENSES)
     ════════════════════════════════════════ */
  function renderMovements() {
    renderFilterChips();

    const container = document.getElementById('expenses-list');
    if (!container) return;

    const filterCat = document.querySelector('.filter-chip.active')?.dataset.category;
    let filtered = state.expenses;

    // Apply type filter
    if (state.movementFilter !== 'all') {
      filtered = filtered.filter(e => (e.type || 'expense') === state.movementFilter);
    }

    // Apply category filter
    if (filterCat && filterCat !== 'all') {
      filtered = filtered.filter(e => e.category === filterCat);
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="expense-empty">
          <div class="expense-empty-icon">🔍</div>
          <div class="expense-empty-text">No se encontraron movimientos</div>
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

      // Calculate day totals by type
      const dayIncome = expenses.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
      const dayExpense = expenses.filter(e => (e.type || 'expense') === 'expense').reduce((s, e) => s + e.amount, 0);

      let dayTotalHTML = '';
      if (dayIncome > 0 && dayExpense > 0) {
        dayTotalHTML = `<span style="color:var(--accent-primary);font-size:12px;font-weight:700;">+${formatAmount(dayIncome)}</span> <span style="color:var(--expense-red);font-size:12px;font-weight:700;">-${formatAmount(dayExpense)}</span>`;
      } else if (dayIncome > 0) {
        dayTotalHTML = `<span style="color:var(--accent-primary);font-size:12px;font-weight:700;">+${formatAmount(dayIncome)} Bs</span>`;
      } else {
        dayTotalHTML = `<span style="color:var(--expense-red);font-size:12px;font-weight:700;">-${formatAmount(dayExpense)} Bs</span>`;
      }

      html += `
        <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>${dayLabel}</span>
          <span>${dayTotalHTML}</span>
        </div>`;

      html += expenses.map(expense => renderExpenseItem(expense)).join('');
    }

    container.innerHTML = html;
  }

  function renderFilterChips() {
    const container = document.getElementById('expense-filters');
    if (!container) return;

    const cats = getCategoryBreakdown(state.movementFilter === 'all' ? 'expense' : state.movementFilter);
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
        renderMovements();
      });
    });
  }

  function renderExpenseItem(expense) {
    const cat = state.categories.find(c => c.id === expense.category);
    const acc = state.accounts.find(a => a.id === expense.accountId);
    const icon = cat?.icon || '💰';
    const catName = cat?.name || 'Otros';
    const color = cat?.color || '#6b7280';
    const accName = acc?.name || '';
    const accIcon = acc?.icon || '';
    const d = new Date(expense.date);
    const dateStr = `${d.getDate()}/${d.getMonth() + 1}`;

    const type = expense.type || 'expense';
    const amountSign = type === 'income' ? '+' : '-';
    const amountColor = type === 'income' ? 'var(--accent-primary)' : 'var(--expense-red)';

    return `
      <div class="expense-item" data-id="${expense.id}" onclick="App.showExpenseActions('${expense.id}')">
        <div class="expense-icon" style="background: ${MiPlataCharts.hexToRgba(color, 0.15)}">
          ${icon}
        </div>
        <div class="expense-details">
          <div class="expense-category">${catName}</div>
          ${expense.note ? `<div class="expense-note">${escapeHtml(expense.note)}</div>` : ''}
          ${accName ? `<div class="expense-account">${accIcon} ${escapeHtml(accName)}</div>` : ''}
        </div>
        <div class="expense-meta">
          <div class="expense-amount" style="color: ${amountColor}">${amountSign}${formatAmount(expense.amount)} Bs</div>
          <div class="expense-date">${dateStr}</div>
        </div>
      </div>`;
  }

  /* ════════════════════════════════════════
     RENDER: ACCOUNTS
     ════════════════════════════════════════ */
  function renderAccounts() {
    const totalContainer = document.getElementById('accounts-total-balance');
    const listContainer = document.getElementById('accounts-list');
    if (!listContainer) return;

    const totalBalance = state.accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);

    // Total balance card
    if (totalContainer) {
      totalContainer.innerHTML = `
        <div class="accounts-total-inner">
          <div class="accounts-total-label">Balance Total</div>
          <div class="accounts-total-amount" style="color: ${totalBalance >= 0 ? 'var(--accent-primary)' : 'var(--expense-red)'};">
            ${formatAmount(totalBalance)} Bs
          </div>
          <div class="accounts-total-count">${state.accounts.length} cuenta${state.accounts.length !== 1 ? 's' : ''}</div>
        </div>
      `;
    }

    if (state.accounts.length === 0) {
      listContainer.innerHTML = `
        <div class="expense-empty">
          <div class="expense-empty-icon">💳</div>
          <div class="expense-empty-text">
            No tienes cuentas aún<br>
            <span style="color: var(--accent-primary);">Crea una para empezar</span>
          </div>
        </div>`;
      return;
    }

    listContainer.innerHTML = state.accounts.map(acc => {
      // Count this month's transactions for this account
      const accExpenses = state.expenses.filter(e => e.accountId === acc.id);
      const accIncome = accExpenses.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
      const accSpent = accExpenses.filter(e => (e.type || 'expense') === 'expense').reduce((s, e) => s + e.amount, 0);
      const typeInfo = ACCOUNT_TYPES[acc.type] || ACCOUNT_TYPES.other;

      return `
        <div class="account-card" onclick="App.showAccountEdit('${acc.id}')" style="border-left: 4px solid ${acc.color};">
          <div class="account-card-header">
            <div class="account-card-icon" style="background: ${MiPlataCharts.hexToRgba(acc.color, 0.15)}">${acc.icon}</div>
            <div class="account-card-info">
              <div class="account-card-name">${escapeHtml(acc.name)}</div>
              <div class="account-card-type">${typeInfo.label}</div>
            </div>
            <div class="account-card-balance" style="color: ${acc.balance >= 0 ? 'var(--accent-primary)' : 'var(--expense-red)'};">
              ${formatAmount(acc.balance)} Bs
            </div>
          </div>
          <div class="account-card-stats">
            <div class="account-stat">
              <span class="account-stat-label">Ingresos</span>
              <span class="account-stat-value income">+${formatAmount(accIncome)}</span>
            </div>
            <div class="account-stat">
              <span class="account-stat-label">Gastos</span>
              <span class="account-stat-value expense">-${formatAmount(accSpent)}</span>
            </div>
            <div class="account-stat">
              <span class="account-stat-label">Movimientos</span>
              <span class="account-stat-value">${accExpenses.length}</span>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  /* ════════════════════════════════════════
     RENDER: SETTINGS
     ════════════════════════════════════════ */
  function renderSettings() {
    const savingsEl = document.getElementById('settings-savings-value');

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
    const typeBtns = document.querySelectorAll('#transaction-type-selector .type-btn');

    if (editId) {
      const expense = state.expenses.find(e => e.id === editId);
      if (!expense) return;

      const type = expense.type || 'expense';
      title.textContent = 'Editar Registro';
      submitBtn.textContent = 'Guardar Cambios';
      document.getElementById('input-amount').value = expense.amount;
      document.getElementById('input-note').value = expense.note || '';
      document.getElementById('input-date').value = expense.date.split('T')[0];

      typeBtns.forEach(btn => {
        if (btn.dataset.type === type) btn.classList.add('active');
        else btn.classList.remove('active');
      });

      renderAccountSelector(expense.accountId);
      renderCategorySelector(type);

      // Select category
      setTimeout(() => {
        document.querySelectorAll('#category-selector .category-option').forEach(opt => {
          opt.classList.toggle('selected', opt.dataset.id === expense.category);
        });
      }, 50);
    } else {
      title.textContent = 'Nuevo Registro';
      submitBtn.textContent = 'Guardar';
      document.getElementById('input-amount').value = '';
      document.getElementById('input-note').value = '';
      document.getElementById('input-date').value = new Date().toISOString().split('T')[0];

      typeBtns.forEach(btn => {
        if (btn.dataset.type === 'expense') btn.classList.add('active');
        else btn.classList.remove('active');
      });

      renderAccountSelector();
      renderCategorySelector('expense');
    }

    openModal('modal-expense');
  }

  function renderAccountSelector(selectedId = null) {
    const container = document.getElementById('account-selector');
    if (!container) return;

    container.innerHTML = state.accounts.map(acc => `
      <div class="account-option ${selectedId === acc.id ? 'selected' : ''}" data-id="${acc.id}" onclick="App.selectAccount(this)">
        <span class="account-option-icon" style="background: ${MiPlataCharts.hexToRgba(acc.color, 0.15)}">${acc.icon}</span>
        <span class="account-option-name">${acc.name}</span>
        <span class="account-option-balance">${formatAmount(acc.balance)} Bs</span>
      </div>
    `).join('');

    // Auto-select first if none selected
    if (!selectedId && state.accounts.length > 0) {
      const first = container.querySelector('.account-option');
      if (first) first.classList.add('selected');
    }
  }

  function selectAccount(el) {
    const container = el.closest('.account-selector');
    container.querySelectorAll('.account-option').forEach(opt => opt.classList.remove('selected'));
    el.classList.add('selected');
  }

  function renderCategorySelector(type = 'expense') {
    const container = document.getElementById('category-selector');
    if (!container) return;

    const filteredCats = state.categories.filter(cat => (cat.type || 'expense') === type);

    container.innerHTML = filteredCats.map(cat => `
      <div class="category-option" data-id="${cat.id}" onclick="App.selectCategory(this)">
        <span class="category-option-icon">${cat.icon}</span>
        <span class="category-option-name">${cat.name}</span>
      </div>
    `).join('');
  }

  function selectCategory(el) {
    document.querySelectorAll('#category-selector .category-option').forEach(opt => opt.classList.remove('selected'));
    el.classList.add('selected');
  }

  async function saveExpense() {
    const amount = parseFloat(document.getElementById('input-amount').value);
    const note = document.getElementById('input-note').value.trim();
    const date = document.getElementById('input-date').value;
    const selectedCat = document.querySelector('#category-selector .category-option.selected');
    const selectedAcc = document.querySelector('#account-selector .account-option.selected');

    if (!amount || amount <= 0) {
      showToast('Ingresa un monto válido', 'error');
      return;
    }

    if (!selectedAcc) {
      showToast('Selecciona una cuenta', 'error');
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
    const accountId = selectedAcc.dataset.id;
    const [y, m] = date.split('-');
    const month = `${y}-${m}`;

    const typeBtn = document.querySelector('#transaction-type-selector .type-btn.active');
    const type = typeBtn ? typeBtn.dataset.type : 'expense';

    // If editing, reverse the old transaction's effect on account balance
    if (state.editingExpense) {
      const oldExpense = state.expenses.find(e => e.id === state.editingExpense);
      if (oldExpense) {
        const oldAccount = await MiPlataDB.get('accounts', oldExpense.accountId);
        if (oldAccount) {
          if ((oldExpense.type || 'expense') === 'expense') {
            oldAccount.balance += oldExpense.amount; // reverse deduction
          } else {
            oldAccount.balance -= oldExpense.amount; // reverse addition
          }
          await MiPlataDB.save('accounts', oldAccount);
        }
      }
    }

    const expense = {
      id: state.editingExpense || MiPlataDB.generateId('exp-'),
      type,
      amount,
      category: categoryId,
      accountId,
      note,
      date: `${date}T${new Date().toTimeString().slice(0, 8)}`,
      month,
      createdAt: state.editingExpense
        ? (state.expenses.find(e => e.id === state.editingExpense)?.createdAt || new Date().toISOString())
        : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await MiPlataDB.save('expenses', expense);

    // Update account balance
    const account = await MiPlataDB.get('accounts', accountId);
    if (account) {
      if (type === 'expense') {
        account.balance -= amount;
      } else {
        account.balance += amount;
      }
      await MiPlataDB.save('accounts', account);
    }

    closeModal('modal-expense');
    await loadMonthData();
    renderCurrentTab();

    const cat = state.categories.find(c => c.id === categoryId);
    const actionWord = type === 'income' ? 'Ingreso registrado' : 'Gasto registrado';
    const actionEdit = type === 'income' ? 'Ingreso actualizado' : 'Gasto actualizado';
    showToast(
      state.editingExpense
        ? `${actionEdit} ✏️`
        : `${cat?.icon || '💸'} ${actionWord}: ${formatAmount(amount)} Bs`,
      'success'
    );
    state.editingExpense = null;
  }

  function showExpenseActions(expenseId) {
    state.editingExpense = expenseId;
    const expense = state.expenses.find(e => e.id === expenseId);
    if (!expense) return;

    const cat = state.categories.find(c => c.id === expense.category);
    const acc = state.accounts.find(a => a.id === expense.accountId);
    const type = expense.type || 'expense';
    const typeLabel = type === 'income' ? 'ingreso' : 'gasto';
    const actionContent = document.getElementById('action-sheet-content');

    actionContent.innerHTML = `
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:32px;margin-bottom:8px;">${cat?.icon || '💰'}</div>
        <div style="font-size:18px;font-weight:700;color:${type === 'income' ? 'var(--accent-primary)' : 'var(--expense-red)'};">
          ${type === 'income' ? '+' : '-'}${formatAmount(expense.amount)} Bs
        </div>
        <div style="font-size:13px;color:var(--text-muted);">${cat?.name || 'Otros'}${expense.note ? ' · ' + expense.note : ''}</div>
        ${acc ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${acc.icon} ${acc.name}</div>` : ''}
      </div>
      <div class="action-sheet">
        <button class="action-sheet-item" onclick="App.showExpenseModal('${expenseId}'); App.closeModal('modal-actions');">
          ✏️ Editar ${typeLabel}
        </button>
        <div class="action-sheet-divider"></div>
        <button class="action-sheet-item danger" onclick="App.confirmDeleteExpense('${expenseId}')">
          🗑️ Eliminar ${typeLabel}
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
        <div class="confirm-text">¿Estás seguro de que quieres eliminar este registro? Esta acción no se puede deshacer.</div>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="App.closeModal('modal-confirm')">Cancelar</button>
        <button class="btn-danger" style="flex:1;" onclick="App.deleteExpense('${expenseId}')">Eliminar</button>
      </div>`;
    openModal('modal-confirm');
  }

  async function deleteExpense(expenseId) {
    // Reverse balance impact
    const expense = state.expenses.find(e => e.id === expenseId);
    if (expense) {
      const account = await MiPlataDB.get('accounts', expense.accountId);
      if (account) {
        if ((expense.type || 'expense') === 'expense') {
          account.balance += expense.amount; // reverse deduction
        } else {
          account.balance -= expense.amount; // reverse addition
        }
        await MiPlataDB.save('accounts', account);
      }
    }

    await MiPlataDB.remove('expenses', expenseId);
    closeModal('modal-confirm');
    await loadMonthData();
    renderCurrentTab();
    showToast('Registro eliminado', 'info');
  }

  /* ════════════════════════════════════════
     ACCOUNT CRUD
     ════════════════════════════════════════ */
  function showAccountModal(editId = null) {
    state.editingAccount = editId;
    const title = document.getElementById('modal-account-title');
    const nameInput = document.getElementById('input-acc-name');
    const iconInput = document.getElementById('input-acc-icon');
    const colorInput = document.getElementById('input-acc-color');
    const balanceInput = document.getElementById('input-acc-balance');
    const balanceGroup = document.getElementById('account-balance-group');
    const deleteBtn = document.getElementById('btn-delete-account');
    const typeBtns = document.querySelectorAll('#account-type-selector .acc-type-btn');

    if (editId) {
      const acc = state.accounts.find(a => a.id === editId);
      if (!acc) return;

      title.textContent = 'Editar Cuenta';
      nameInput.value = acc.name;
      iconInput.value = acc.icon;
      colorInput.value = acc.color;
      balanceInput.value = acc.balance;
      deleteBtn.classList.remove('hidden');

      // Hide balance group label change for edit
      const balLabel = balanceGroup.querySelector('.form-label');
      if (balLabel) balLabel.textContent = 'Balance Actual (Bs)';

      typeBtns.forEach(btn => {
        if (btn.dataset.type === acc.type) btn.classList.add('active');
        else btn.classList.remove('active');
      });
    } else {
      title.textContent = 'Nueva Cuenta';
      nameInput.value = '';
      iconInput.value = '💳';
      colorInput.value = '#10b981';
      balanceInput.value = '';
      deleteBtn.classList.add('hidden');

      const balLabel = balanceGroup.querySelector('.form-label');
      if (balLabel) balLabel.textContent = 'Balance Inicial (Bs)';

      typeBtns.forEach(btn => {
        if (btn.dataset.type === 'wallet') btn.classList.add('active');
        else btn.classList.remove('active');
      });
    }

    openModal('modal-account');
  }

  function showAccountEdit(accId) {
    showAccountModal(accId);
  }

  async function saveAccount() {
    const name = document.getElementById('input-acc-name').value.trim();
    const icon = document.getElementById('input-acc-icon').value.trim();
    const color = document.getElementById('input-acc-color').value;
    const balance = parseFloat(document.getElementById('input-acc-balance').value) || 0;
    const typeBtn = document.querySelector('#account-type-selector .acc-type-btn.active');
    const type = typeBtn ? typeBtn.dataset.type : 'wallet';

    if (!name) {
      showToast('Ingresa un nombre', 'error');
      return;
    }

    const account = {
      id: state.editingAccount || MiPlataDB.generateId('acc-'),
      name,
      icon: icon || '💳',
      color,
      type,
      balance,
      createdAt: state.editingAccount
        ? (state.accounts.find(a => a.id === state.editingAccount)?.createdAt || new Date().toISOString())
        : new Date().toISOString()
    };

    await MiPlataDB.save('accounts', account);
    closeModal('modal-account');
    state.accounts = await MiPlataDB.getAll('accounts');
    renderCurrentTab();
    showToast(state.editingAccount ? 'Cuenta actualizada' : 'Cuenta creada ✨', 'success');
    state.editingAccount = null;
  }

  async function deleteAccount() {
    if (!state.editingAccount) return;

    // Check if account has expenses
    const expenses = state.expenses.filter(e => e.accountId === state.editingAccount);
    if (expenses.length > 0) {
      showToast(`No se puede eliminar: tiene ${expenses.length} movimiento(s)`, 'error');
      return;
    }

    // Also check all months
    const allExpenses = await MiPlataDB.getAll('expenses');
    const linkedExpenses = allExpenses.filter(e => e.accountId === state.editingAccount);
    if (linkedExpenses.length > 0) {
      showToast(`No se puede eliminar: tiene ${linkedExpenses.length} movimiento(s) asociado(s)`, 'error');
      return;
    }

    await MiPlataDB.remove('accounts', state.editingAccount);
    closeModal('modal-account');
    state.accounts = await MiPlataDB.getAll('accounts');
    renderCurrentTab();
    showToast('Cuenta eliminada', 'info');
    state.editingAccount = null;
  }

  /* ════════════════════════════════════════
     TRANSFERS
     ════════════════════════════════════════ */
  function showTransferModal() {
    if (state.accounts.length < 2) {
      showToast('Necesitas al menos 2 cuentas para transferir', 'error');
      return;
    }

    renderTransferSelectors();
    document.getElementById('input-transfer-amount').value = '';
    document.getElementById('input-transfer-note').value = '';
    openModal('modal-transfer');
  }

  function renderTransferSelectors() {
    const fromContainer = document.getElementById('transfer-from-selector');
    const toContainer = document.getElementById('transfer-to-selector');
    if (!fromContainer || !toContainer) return;

    const renderSelector = (container, selectedIdx) => {
      container.innerHTML = state.accounts.map((acc, i) => `
        <div class="account-option ${i === selectedIdx ? 'selected' : ''}" data-id="${acc.id}" onclick="App.selectAccount(this)">
          <span class="account-option-icon" style="background: ${MiPlataCharts.hexToRgba(acc.color, 0.15)}">${acc.icon}</span>
          <span class="account-option-name">${acc.name}</span>
          <span class="account-option-balance">${formatAmount(acc.balance)} Bs</span>
        </div>
      `).join('');
    };

    renderSelector(fromContainer, 0);
    renderSelector(toContainer, state.accounts.length > 1 ? 1 : 0);
  }

  async function saveTransfer() {
    const fromEl = document.querySelector('#transfer-from-selector .account-option.selected');
    const toEl = document.querySelector('#transfer-to-selector .account-option.selected');
    const amount = parseFloat(document.getElementById('input-transfer-amount').value);
    const note = document.getElementById('input-transfer-note').value.trim();

    if (!fromEl || !toEl) {
      showToast('Selecciona ambas cuentas', 'error');
      return;
    }

    if (fromEl.dataset.id === toEl.dataset.id) {
      showToast('Selecciona cuentas diferentes', 'error');
      return;
    }

    if (!amount || amount <= 0) {
      showToast('Ingresa un monto válido', 'error');
      return;
    }

    const fromId = fromEl.dataset.id;
    const toId = toEl.dataset.id;

    // Update balances
    const fromAcc = await MiPlataDB.get('accounts', fromId);
    const toAcc = await MiPlataDB.get('accounts', toId);

    if (!fromAcc || !toAcc) {
      showToast('Error: cuenta no encontrada', 'error');
      return;
    }

    fromAcc.balance -= amount;
    toAcc.balance += amount;

    await MiPlataDB.save('accounts', fromAcc);
    await MiPlataDB.save('accounts', toAcc);

    // Record transfer as two linked transactions
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const [y, m] = dateStr.split('-');
    const month = `${y}-${m}`;
    const transferId = MiPlataDB.generateId('trf-');
    const transferNote = note || `Transferencia: ${fromAcc.name} → ${toAcc.name}`;

    // Expense from source
    await MiPlataDB.save('expenses', {
      id: MiPlataDB.generateId('exp-'),
      type: 'expense',
      amount,
      category: 'cat-otros',
      accountId: fromId,
      note: `🔄 ${transferNote}`,
      date: `${dateStr}T${now.toTimeString().slice(0, 8)}`,
      month,
      transferId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });

    // Income to destination
    await MiPlataDB.save('expenses', {
      id: MiPlataDB.generateId('exp-'),
      type: 'income',
      amount,
      category: 'cat-otros-ingresos',
      accountId: toId,
      note: `🔄 ${transferNote}`,
      date: `${dateStr}T${now.toTimeString().slice(0, 8)}`,
      month,
      transferId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });

    closeModal('modal-transfer');
    await loadMonthData();
    renderCurrentTab();
    showToast(`🔄 Transferencia: ${formatAmount(amount)} Bs`, 'success');
  }

  /* ════════════════════════════════════════
     CATEGORY CRUD
     ════════════════════════════════════════ */
  function showCategoriesManager() {
    renderCategoriesManagerList('expense');
    openModal('modal-categories-manager');
  }

  function renderCategoriesManagerList(type = 'expense') {
    const container = document.getElementById('categories-manager-list');
    if (!container) return;

    const filteredCats = state.categories.filter(c => (c.type || 'expense') === type);

    if (filteredCats.length === 0) {
      container.innerHTML = `
        <div class="expense-empty" style="padding: 24px 0;">
          <div class="expense-empty-text">No hay categorías de ${type === 'expense' ? 'gastos' : 'ingresos'}</div>
        </div>`;
      return;
    }

    container.innerHTML = filteredCats.map(cat => {
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
            <div style="font-size:11px;color:var(--text-muted);">${monthExpenses.length} registros</div>
          </div>
          <span class="category-arrow">›</span>
        </div>`;
    }).join('');
  }

  function showCategoryModal(editId = null) {
    state.editingCategory = editId;
    const title = document.getElementById('modal-category-title');
    const nameInput = document.getElementById('input-cat-name');
    const iconInput = document.getElementById('input-cat-icon');
    const colorInput = document.getElementById('input-cat-color');
    const descInput = document.getElementById('input-cat-desc');
    const deleteBtn = document.getElementById('btn-delete-category');
    const typeBtns = document.querySelectorAll('#category-type-selector .type-btn');

    if (editId) {
      const cat = state.categories.find(c => c.id === editId);
      if (!cat) return;

      const type = cat.type || 'expense';
      title.textContent = 'Editar Categoría';
      nameInput.value = cat.name;
      iconInput.value = cat.icon;
      colorInput.value = cat.color;
      descInput.value = cat.description || '';
      deleteBtn.classList.remove('hidden');

      typeBtns.forEach(btn => {
        if (btn.dataset.type === type) btn.classList.add('active');
        else btn.classList.remove('active');
      });
    } else {
      title.textContent = 'Nueva Categoría';
      nameInput.value = '';
      iconInput.value = '📌';
      colorInput.value = '#10b981';
      descInput.value = '';
      deleteBtn.classList.add('hidden');

      typeBtns.forEach(btn => {
        if (btn.dataset.type === 'expense') btn.classList.add('active');
        else btn.classList.remove('active');
      });
    }

    closeModal('modal-categories-manager');
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
    const typeBtn = document.querySelector('#category-type-selector .type-btn.active');
    const type = typeBtn ? typeBtn.dataset.type : 'expense';

    if (!name) {
      showToast('Ingresa un nombre', 'error');
      return;
    }

    const category = {
      id: state.editingCategory || MiPlataDB.generateId('cat-'),
      type,
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

    // Check if category has expenses across all months
    const allExpenses = await MiPlataDB.getAll('expenses');
    const linkedExpenses = allExpenses.filter(e => e.category === state.editingCategory);
    if (linkedExpenses.length > 0) {
      showToast(`No se puede eliminar: tiene ${linkedExpenses.length} registro(s)`, 'error');
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
        const stats = `${data.expenses?.length || 0} movimientos, ${data.categories?.length || 0} categorías, ${data.accounts?.length || 0} cuentas`;
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
    await MiPlataDB.clear('accounts');
    await MiPlataDB.init(); // Re-seed defaults
    state.profile = null;
    state.expenses = [];
    state.categories = await MiPlataDB.getAll('categories');
    state.accounts = await MiPlataDB.getAll('accounts');
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

    // Transaction Type Toggles
    document.querySelectorAll('#transaction-type-selector .type-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const selector = e.target.closest('.transaction-type-selector');
        selector.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        // Re-render categories for the selected type
        if (selector.id === 'transaction-type-selector') {
          App.renderCategorySelector(e.target.dataset.type);
        }
      });
    });

    // Category Type Toggles
    document.querySelectorAll('#category-type-selector .type-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const selector = e.target.closest('.transaction-type-selector');
        selector.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
      });
    });

    // Categories Manager Type Toggle
    document.querySelectorAll('#categories-manager-type-selector .type-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const selector = e.target.closest('.transaction-type-selector');
        selector.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        renderCategoriesManagerList(e.target.dataset.type);
      });
    });

    // Movement type filter
    document.querySelectorAll('.type-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.type-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.movementFilter = btn.dataset.filter;
        renderMovements();
      });
    });

    // Account type selector
    document.querySelectorAll('#account-type-selector .acc-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#account-type-selector .acc-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
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

    // Account modal
    document.getElementById('btn-save-account')?.addEventListener('click', () => saveAccount());
    document.getElementById('btn-delete-account')?.addEventListener('click', () => deleteAccount());

    // Transfer modal
    document.getElementById('btn-save-transfer')?.addEventListener('click', () => saveTransfer());

    // OCR
    document.getElementById('ocr-upload-area')?.addEventListener('click', () => {
      document.getElementById('ocr-file-input')?.click();
    });
    document.getElementById('ocr-file-input')?.addEventListener('change', (e) => {
      handleOCRFile(e.target.files[0]);
    });
    document.getElementById('btn-ocr-confirm')?.addEventListener('click', () => confirmOCRAmount());

    // Settings
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
  function processSharedFile(file) {
    showOCRModal();
    handleOCRFile(file);
  }

  return {
    init,
    processSharedFile,
    renderCategorySelector,
    switchTab,
    showExpenseModal,
    saveExpense,
    showExpenseActions,
    confirmDeleteExpense,
    deleteExpense,
    selectCategory,
    selectAccount,
    showCategoryModal,
    showCategoryEdit,
    saveCategory,
    deleteCategory,
    showCategoriesManager,
    showAccountModal,
    showAccountEdit,
    saveAccount,
    deleteAccount,
    showTransferModal,
    saveTransfer,
    showOCRModal,
    confirmOCRAmount,
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
    changeMonth,
    updateObAccount,
    removeObAccount,
    addObAccount,
    updateObCategory,
    removeObCategory,
    addObCategory,
    updateObExpense,
    removeObExpense,
    addObExpense
  };
})();

/* ── Bootstrap ── */
document.addEventListener('DOMContentLoaded', () => {
  App.init().then(async () => {
    // Check for shared image from Web Share Target API
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('shared') === '1') {
      try {
        if ('caches' in window) {
          const cache = await caches.open('shared-data');
          const keys = await cache.keys();
          if (keys.length > 0) {
            const res = await cache.match(keys[0]);
            if (res) {
              const blob = await res.blob();
              const file = new File([blob], 'comprobante_compartido.jpg', { type: blob.type || 'image/jpeg' });

              // Open OCR Modal with the file
              if (typeof App !== 'undefined' && App.processSharedFile) {
                App.processSharedFile(file);
              }

              // Clean up the cache and URL
              await cache.delete(keys[0]);
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          }
        }
      } catch (err) {
        console.error('Error procesando imagen compartida:', err);
      }
    }
  }).catch(err => {
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