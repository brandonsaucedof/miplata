/* ============================================
   MiPlata — IndexedDB Data Layer (v2)
   ============================================ */

const MiPlataDB = (() => {
  const DB_NAME = 'miplata';
  const DB_VERSION = 2;
  let db = null;

  /* ── Default categories ── */
  const DEFAULT_CATEGORIES = [
    // Gastos
    { id: 'cat-comida',          name: 'Comida',          icon: '🍔', color: '#f97316', description: 'Alimentación y mercado', type: 'expense' },
    { id: 'cat-transporte',      name: 'Transporte',      icon: '🚌', color: '#3b82f6', description: 'Pasajes, gasolina', type: 'expense' },
    { id: 'cat-vivienda',        name: 'Vivienda',        icon: '🏠', color: '#8b5cf6', description: 'Alquiler, servicios', type: 'expense' },
    { id: 'cat-salud',           name: 'Salud',           icon: '💊', color: '#ef4444', description: 'Medicinas, consultas', type: 'expense' },
    { id: 'cat-entretenimiento', name: 'Entretenimiento', icon: '🎮', color: '#ec4899', description: 'Ocio, suscripciones', type: 'expense' },
    { id: 'cat-servicios',       name: 'Servicios',       icon: '📱', color: '#06b6d4', description: 'Internet, teléfono', type: 'expense' },
    { id: 'cat-ropa',            name: 'Ropa',            icon: '👕', color: '#f59e0b', description: 'Vestimenta', type: 'expense' },
    { id: 'cat-educacion',       name: 'Educación',       icon: '📚', color: '#10b981', description: 'Cursos, materiales', type: 'expense' },
    { id: 'cat-otros',           name: 'Otros',           icon: '🛍️', color: '#6b7280', description: 'Gasto sin categoría', type: 'expense' },
    
    // Ingresos
    { id: 'cat-sueldo',          name: 'Sueldo',          icon: '💰', color: '#10b981', description: 'Ingreso principal', type: 'income' },
    { id: 'cat-ventas',          name: 'Ventas',          icon: '🏷️', color: '#8b5cf6', description: 'Venta de artículos', type: 'income' },
    { id: 'cat-freelance',       name: 'Freelance',       icon: '💻', color: '#3b82f6', description: 'Trabajos independientes', type: 'income' },
    { id: 'cat-regalo',          name: 'Regalo',          icon: '🎁', color: '#ec4899', description: 'Dinero regalado', type: 'income' },
    { id: 'cat-otros-ingresos',  name: 'Otros Ingresos',  icon: '💵', color: '#06b6d4', description: 'Ingreso extra', type: 'income' }
  ];

  /* ── Default accounts ── */
  const DEFAULT_ACCOUNTS = [
    { id: 'acc-monedero', name: 'Monedero',  icon: '💳', color: '#10b981', type: 'wallet',  balance: 0, createdAt: new Date().toISOString() },
    { id: 'acc-banco',    name: 'Banco',     icon: '🏦', color: '#3b82f6', type: 'bank',    balance: 0, createdAt: new Date().toISOString() }
  ];

  /* ── Open / upgrade DB ── */
  function open() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const database = e.target.result;
        const oldVersion = e.oldVersion;

        // --- v1 stores (create if fresh install) ---
        if (!database.objectStoreNames.contains('profile')) {
          database.createObjectStore('profile', { keyPath: 'id' });
        }

        if (!database.objectStoreNames.contains('expenses')) {
          const store = database.createObjectStore('expenses', { keyPath: 'id' });
          store.createIndex('month', 'month', { unique: false });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('date', 'date', { unique: false });
        }

        if (!database.objectStoreNames.contains('categories')) {
          database.createObjectStore('categories', { keyPath: 'id' });
        }

        // --- v2: Add accounts store ---
        if (!database.objectStoreNames.contains('accounts')) {
          database.createObjectStore('accounts', { keyPath: 'id' });
        }

        // Add accountId index to expenses if upgrading from v1
        if (oldVersion < 2 && database.objectStoreNames.contains('expenses')) {
          const tx = e.target.transaction;
          const expStore = tx.objectStore('expenses');
          if (!expStore.indexNames.contains('accountId')) {
            expStore.createIndex('accountId', 'accountId', { unique: false });
          }
        }
      };

      request.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  /* ── Initialize: open DB + seed defaults + migrate ── */
  async function init() {
    await open();

    // Seed default categories
    const cats = await getAll('categories');
    if (cats.length === 0) {
      const tx = db.transaction('categories', 'readwrite');
      const store = tx.objectStore('categories');
      for (const cat of DEFAULT_CATEGORIES) {
        store.put(cat);
      }
      await txComplete(tx);
    }

    // Seed default accounts
    const accounts = await getAll('accounts');
    if (accounts.length === 0) {
      const tx = db.transaction('accounts', 'readwrite');
      const store = tx.objectStore('accounts');
      for (const acc of DEFAULT_ACCOUNTS) {
        store.put(acc);
      }
      await txComplete(tx);
    }

    // Migration: assign existing expenses without accountId to a default account
    await migrateExpensesToAccounts();
  }

  /* ── Migrate v1 expenses (no accountId) to default account ── */
  async function migrateExpensesToAccounts() {
    const expenses = await getAll('expenses');
    const needsMigration = expenses.filter(e => !e.accountId);
    
    if (needsMigration.length === 0) return;

    // Get or create a "General" account for legacy data
    const accounts = await getAll('accounts');
    let defaultAccount = accounts.find(a => a.id === 'acc-monedero') || accounts[0];
    
    if (!defaultAccount) {
      defaultAccount = {
        id: 'acc-general',
        name: 'General',
        icon: '💰',
        color: '#6b7280',
        type: 'wallet',
        balance: 0,
        createdAt: new Date().toISOString()
      };
      await save('accounts', defaultAccount);
    }

    // Assign all unlinked expenses to the default account
    const tx = db.transaction('expenses', 'readwrite');
    const store = tx.objectStore('expenses');
    for (const exp of needsMigration) {
      exp.accountId = defaultAccount.id;
      store.put(exp);
    }
    await txComplete(tx);

    console.log(`[MiPlata] Migrated ${needsMigration.length} transactions to account: ${defaultAccount.name}`);
  }

  /* ── Helper: wait for transaction to complete ── */
  function txComplete(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /* ── Save (put) a single record ── */
  async function save(storeName, data) {
    await open();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(data);
    await txComplete(tx);
    return data;
  }

  /* ── Get a single record by key ── */
  async function get(storeName, id) {
    await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /* ── Get all records from a store ── */
  async function getAll(storeName) {
    await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /* ── Get records by index value ── */
  async function getByIndex(storeName, indexName, value) {
    await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const index = tx.objectStore(storeName).index(indexName);
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /* ── Get expenses for a specific month (YYYY-MM) ── */
  function getByMonth(yearMonth) {
    return getByIndex('expenses', 'month', yearMonth);
  }

  /* ── Delete a record by key ── */
  async function remove(storeName, id) {
    await open();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    await txComplete(tx);
  }

  /* ── Update a record (merge fields) ── */
  async function update(storeName, id, updates) {
    const existing = await get(storeName, id);
    if (!existing) throw new Error(`Record ${id} not found in ${storeName}`);
    const merged = { ...existing, ...updates };
    return save(storeName, merged);
  }

  /* ── Clear an entire store ── */
  async function clear(storeName) {
    await open();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    await txComplete(tx);
  }

  /* ── Export entire database as JSON ── */
  async function exportAll() {
    const [profile, expenses, categories, accounts] = await Promise.all([
      getAll('profile'),
      getAll('expenses'),
      getAll('categories'),
      getAll('accounts')
    ]);
    return {
      appName: 'MiPlata',
      version: DB_VERSION,
      exportDate: new Date().toISOString(),
      profile,
      expenses,
      categories,
      accounts
    };
  }

  /* ── Import data from JSON ── */
  async function importAll(data, replace = true) {
    if (replace) {
      await Promise.all([
        clear('profile'),
        clear('expenses'),
        clear('categories'),
        clear('accounts')
      ]);
    }

    const stores = ['profile', 'expenses', 'categories', 'accounts'];
    for (const storeName of stores) {
      const items = data[storeName] || [];
      for (const item of items) {
        await save(storeName, item);
      }
    }
  }

  /* ── Generate unique ID ── */
  function generateId(prefix = '') {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 8);
    return `${prefix}${ts}-${rand}`;
  }

  /* ── Public API ── */
  return {
    init,
    save,
    get,
    getAll,
    getByIndex,
    getByMonth,
    remove,
    update,
    clear,
    exportAll,
    importAll,
    generateId,
    DEFAULT_CATEGORIES,
    DEFAULT_ACCOUNTS
  };
})();
