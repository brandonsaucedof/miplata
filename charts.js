/* ============================================
   MiPlata — Charts Module (Chart.js)
   ============================================ */

const MiPlataCharts = (() => {
  let donutChart = null;

  /* ── Render donut chart: expenses by category ── */
  function renderDonut(canvasId, categoryData, totalSpent) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Destroy existing chart
    if (donutChart) {
      donutChart.destroy();
      donutChart = null;
    }

    if (!categoryData || categoryData.length === 0) {
      canvas.style.display = 'none';
      return;
    }

    canvas.style.display = 'block';

    const ctx = canvas.getContext('2d');
    const labels = categoryData.map(c => c.name);
    const data = categoryData.map(c => c.amount);
    
    // Instead of category colors, create a purple-to-blue gradient
    // Chart.js can't easily do a sweeping conic gradient without plugins,
    // so we'll just use the category colors but maybe override them in app.js.
    // The user's screenshot has one big stroke, but we are grouping by category.
    const colors = categoryData.map(c => {
      // Return their default color, or maybe force a gradient palette
      // For now, keep the category colors but make the donut thicker
      return c.color;
    });

    donutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: 'rgba(16, 17, 30, 0.8)', // Match new background
          borderWidth: 4,
          borderRadius: 24, // Rounded caps
          hoverBorderColor: 'rgba(255, 255, 255, 0.2)',
          hoverBorderWidth: 2,
          spacing: -5 // Negative spacing for overlap effect
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '65%', // Thicker donut
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(29, 30, 52, 0.97)',
            titleColor: '#f4f6f8',
            bodyColor: '#99a3b0',
            borderColor: 'rgba(255, 255, 255, 0.08)',
            borderWidth: 1,
            cornerRadius: 12,
            padding: 12,
            titleFont: { family: 'Inter', weight: '600', size: 13 },
            bodyFont: { family: 'Inter', size: 12 },
            callbacks: {
              label: (ctx) => {
                const value = ctx.parsed;
                const pct = totalSpent > 0 ? ((value / totalSpent) * 100).toFixed(1) : 0;
                return ` ${formatAmount(value)} Bs (${pct}%)`;
              }
            }
          }
        },
        animation: {
          animateRotate: true,
          animateScale: true,
          duration: 800,
          easing: 'easeOutQuart'
        }
      }
    });

    // Update center text
    const centerLabel = document.getElementById('chart-center-label');
    const centerValue = document.getElementById('chart-center-value');
    if (centerLabel) centerLabel.textContent = 'TOTAL';
    if (centerValue) centerValue.textContent = formatAmount(totalSpent);
  }

  /* ── Render horizontal category bars ── */
  function renderCategoryBars(containerId, categoryData, maxAmount) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!categoryData || categoryData.length === 0) {
      container.innerHTML = `
        <div class="expense-empty" style="padding: 24px 0;">
          <div class="expense-empty-text">Sin gastos este mes</div>
        </div>`;
      return;
    }

    // Sort by amount descending
    const sorted = [...categoryData].sort((a, b) => b.amount - a.amount);
    const max = maxAmount || sorted[0].amount;

    container.innerHTML = sorted.map(cat => {
      const pct = max > 0 ? Math.min((cat.amount / max) * 100, 100) : 0;
      return `
        <div class="category-budget-item">
          <div class="category-budget-icon" style="background: ${hexToRgba(cat.color, 0.15)}">
            ${cat.icon}
          </div>
          <div class="category-budget-info">
            <div class="category-budget-header">
              <span class="category-budget-name">${cat.name}</span>
              <span class="category-budget-amount">${formatAmount(cat.amount)} Bs</span>
            </div>
            <div class="category-bar">
              <div class="category-bar-fill" style="width: ${pct}%; background: ${cat.color};"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ── Render savings progress bar ── */
  function renderSavingsProgress(containerId, current, goal) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
    const isComplete = pct >= 100;

    container.innerHTML = `
      <div class="savings-header">
        <span class="savings-title">🎯 Meta de Ahorro</span>
        <span class="savings-value" style="color:var(--text-primary); font-weight:700;">${formatAmount(current)} / ${formatAmount(goal)} Bs</span>
      </div>
      <div class="progress-bar" style="height: 12px; border-radius: 12px; background: rgba(255,255,255,0.05); margin-top: 8px;">
        <div class="progress-fill" style="height: 100%; border-radius: 12px; width: ${pct}%; background: var(--gradient-primary); box-shadow: 0 0 10px rgba(168, 85, 247, 0.4);"></div>
      </div>
      <div style="text-align: right; margin-top: 6px;">
        <span style="font-size: 13px; font-weight: 700; color: var(--text-secondary);">
          ${pct.toFixed(0)}% disponible
        </span>
      </div>
    `;
  }

  /* ── Helpers ── */
  function formatAmount(num) {
    if (num == null || isNaN(num)) return '0,00';
    return num.toLocaleString('es-BO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /* ── Public API ── */
  return {
    renderDonut,
    renderCategoryBars,
    renderSavingsProgress,
    formatAmount,
    hexToRgba
  };
})();