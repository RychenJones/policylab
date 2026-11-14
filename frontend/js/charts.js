export function createCharts(document, numberFormatter, householdCount) {
  if (typeof globalThis.Chart !== 'function') {
    document.querySelector('.chart-wrap').hidden = true;
    if (typeof document.querySelectorAll === 'function') {
      const chartWraps = document.querySelectorAll('.chart-wrap');
      if (chartWraps[1]) chartWraps[1].hidden = true;
    }
    return { chart: null, yearlyChart: null };
  }

  let currentHouseholdCount = householdCount;
  const categoryColors = ['#2b7967', '#e59051', '#7b9db8'];
  const fadedCategoryColors = ['#b8d6cc', '#f3c6a3', '#bfd0df'];
  const chart = new globalThis.Chart(document.querySelector('#behavior-chart'), {
    type: 'bar',
    data: { labels: ['Gas vehicle', 'Electric Vehicle', 'No car'], datasets: [
      { label: 'Starting population', data: [0, 0, 0], backgroundColor: fadedCategoryColors, borderRadius: 6, maxBarThickness: 46 },
      { label: 'Policy result', data: [0, 0, 0], backgroundColor: categoryColors, borderRadius: 6, maxBarThickness: 46 }
    ] },
    options: { responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, max: 100, ticks: { callback: value => `${value}%` } } },
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: {
        label: context => `${context.dataset.label}: ${context.raw.toFixed(3)}% (about ${numberFormatter.format(Math.round(context.raw / 100 * currentHouseholdCount))} households)`
      } } }
    }
  });

  const yearlyChart = new globalThis.Chart(document.querySelector('#yearly-chart'), {
    type: 'line',
    data: { labels: [], datasets: [
      { label: 'Gas vehicle', data: [], borderColor: '#2b7967', backgroundColor: '#2b7967', tension: .25, pointRadius: 4, pointHoverRadius: 6 },
      { label: 'Electric Vehicle', data: [], borderColor: '#e59051', backgroundColor: '#e59051', tension: .25, pointRadius: 4, pointHoverRadius: 6 },
      { label: 'No car', data: [], borderColor: '#7b9db8', backgroundColor: '#7b9db8', tension: .25, pointRadius: 4, pointHoverRadius: 6 }
    ] },
    options: { responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, max: 100, ticks: { callback: value => `${value}%` } }, x: { title: { display: true, text: 'Simulation year' } } },
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: context => `${context.dataset.label}: ${context.raw.toFixed(3)}%` } } }
    }
  });

  return { chart, yearlyChart, setHouseholdCount: count => { currentHouseholdCount = count; } };
}

export function updateCharts({ chart, yearlyChart }, baseline, policy, years) {
  if (chart) {
    chart.data.datasets[0].data = baseline;
    chart.data.datasets[1].data = policy;
    chart.resize();
    chart.update();
  }

  if (yearlyChart && years.length > 0) {
    yearlyChart.data.labels = years.map(snapshot => `Year ${snapshot.year}`);
    yearlyChart.data.datasets[0].data = years.map(snapshot => snapshot.gasPct);
    yearlyChart.data.datasets[1].data = years.map(snapshot => snapshot.evPct);
    yearlyChart.data.datasets[2].data = years.map(snapshot => snapshot.noCarPct);
    yearlyChart.resize();
    yearlyChart.update();
  }
}

export function downloadChart(chart, lastResult) {
  if (!chart || !lastResult) return;
  const link = document.createElement('a');
  link.download = `policy-lab-simulation-${new Date().toISOString().slice(0, 10)}.png`;
  link.href = chart.toBase64Image('image/png', 1);
  link.click();
}
