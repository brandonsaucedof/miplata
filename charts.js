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
    const colors = categoryData.map(c => c.color);

    donutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: 'rgba(10, 10, 15, 0.8)',
          borderWidth: 3,
          borderRadius: 4,
          hoverBorderColor: 'rgba(255, 255, 255, 0.2)',
          hoverBorderWidth: 2,
          spacing: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(23, 27, 36, 0.97)',
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
        <span class="savings-value">${formatAmount(current)} / ${formatAmount(goal)} Bs</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${pct}%;${isComplete ? ' background: var(--gradient-primary);' : ''}"></div>
      </div>
      <div style="text-align: right; margin-top: 4px;">
        <span style="font-size: 12px; font-weight: 600; color: ${isComplete ? 'var(--accent-primary)' : 'var(--text-muted)'};">
          ${pct.toFixed(0)}%${isComplete ? ' ✅ ¡Meta alcanzada!' : ''}
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