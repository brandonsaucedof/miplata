/* ============================================
   MiPlata — IndexedDB Data Layer
   ============================================ */

const MiPlataDB = (() => {
  const DB_NAME = 'miplata';
  const DB_VERSION = 1;
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
    { id: 'cat-regalo',          name: 'Regalo',          icon: '🎁', color: '#ec4899', description: 'Dinero regalado', type: 'income' },
    { id: 'cat-otros-ingresos',  name: 'Otros Ingresos',  icon: '💵', color: '#3b82f6', description: 'Ingreso extra', type: 'income' }
  ];

  /* ── Open / upgrade DB ── */
  function open() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const database = e.target.result;

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
      };

      request.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  /* ── Initialize: open DB + seed defaults ── */
  async function init() {
    await open();
    const cats = await getAll('categories');
    if (cats.length === 0) {
      const tx = db.transaction('categories', 'readwrite');
      const store = tx.objectStore('categories');
      for (const cat of DEFAULT_CATEGORIES) {
        store.put(cat);
      }
      await txComplete(tx);
    }
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
    const [profile, expenses, categories] = await Promise.all([
      getAll('profile'),
      getAll('expenses'),
      getAll('categories')
    ]);
    return {
      appName: 'MiPlata',
      version: DB_VERSION,
      exportDate: new Date().toISOString(),
      profile,
      expenses,
      categories
    };
  }

  /* ── Import data from JSON ── */
  async function importAll(data, replace = true) {
    if (replace) {
      await Promise.all([
        clear('profile'),
        clear('expenses'),
        clear('categories')
      ]);
    }

    const stores = ['profile', 'expenses', 'categories'];
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
    DEFAULT_CATEGORIES
  };
})();
