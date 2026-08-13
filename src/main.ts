import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import * as bootstrap from 'bootstrap';
import './styles.css';
import { Chart, registerables } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { CaseMeta, Condition, ConditionType, Rule, SimulationConfig, SimulationResult, TargetType } from './types/simulator';
import { DataLoader } from './services/dataLoader';
import { RuleEvaluator } from './services/ruleEvaluator';
import { SimulationEngine } from './services/simulationEngine';
import { DEFAULT_PRESETS, PresetStore } from './services/presetStore';

// Register Chart.js modules
Chart.register(...registerables);

// App State
let allCases: CaseMeta[] = [];
let rules: Rule[] = [];
let lastResult: SimulationResult | null = null;
let performanceChart: Chart | null = null;

// Bootstrap Modal Instance
let ruleModal: any = null;

// DOM Elements
const loaderOverlay = document.getElementById('loaderOverlay') as HTMLElement;
const marketStatsBadge = document.getElementById('marketStatsBadge') as HTMLElement;
const presetDropdownMenu = document.getElementById('presetDropdownMenu') as HTMLElement;

const simConfigForm = document.getElementById('simConfigForm') as HTMLFormElement;
const initialCashInput = document.getElementById('initialCashInput') as HTMLInputElement;
const timeframePresetSelect = document.getElementById('timeframePresetSelect') as HTMLSelectElement;
const customDateRow = document.getElementById('customDateRow') as HTMLElement;
const startDateInput = document.getElementById('startDateInput') as HTMLInputElement;
const endDateInput = document.getElementById('endDateInput') as HTMLInputElement;

const feeSlider = document.getElementById('feeSlider') as HTMLInputElement;
const feeBadgeDisplay = document.getElementById('feeBadgeDisplay') as HTMLElement;

const rulesListContainer = document.getElementById('rulesListContainer') as HTMLElement;
const addRuleBtn = document.getElementById('addRuleBtn') as HTMLButtonElement;
const clearRulesBtn = document.getElementById('clearRulesBtn') as HTMLButtonElement;

// Modal Elements
const ruleForm = document.getElementById('ruleForm') as HTMLFormElement;
const ruleEditId = document.getElementById('ruleEditId') as HTMLInputElement;
const ruleNameInput = document.getElementById('ruleNameInput') as HTMLInputElement;
const ruleTargetSelect = document.getElementById('ruleTargetSelect') as HTMLSelectElement;
const ruleTargetCaseOptions = document.getElementById('ruleTargetCaseOptions') as HTMLElement;
const ruleActionSelect = document.getElementById('ruleActionSelect') as HTMLSelectElement;
const ruleBudgetModeSelect = document.getElementById('ruleBudgetModeSelect') as HTMLSelectElement;
const ruleBudgetValueInput = document.getElementById('ruleBudgetValueInput') as HTMLInputElement;
const ruleBudgetValueLabel = document.getElementById('ruleBudgetValueLabel') as HTMLElement;

const cond1TypeSelect = document.getElementById('cond1TypeSelect') as HTMLSelectElement;
const cond1ValueInput = document.getElementById('cond1ValueInput') as HTMLInputElement;
const cond1DaysInput = document.getElementById('cond1DaysInput') as HTMLInputElement;
const cond1DaysCol = document.getElementById('cond1DaysCol') as HTMLElement;

const ruleOperatorSelect = document.getElementById('ruleOperatorSelect') as HTMLSelectElement;
const cond2Group = document.getElementById('cond2Group') as HTMLElement;
const cond2TypeSelect = document.getElementById('cond2TypeSelect') as HTMLSelectElement;
const cond2ValueInput = document.getElementById('cond2ValueInput') as HTMLInputElement;
const cond2DaysInput = document.getElementById('cond2DaysInput') as HTMLInputElement;
const cond2DaysCol = document.getElementById('cond2DaysCol') as HTMLElement;

const saveRuleBtn = document.getElementById('saveRuleBtn') as HTMLButtonElement;

// Results Tab Elements
const metricFinalValue = document.getElementById('metricFinalValue') as HTMLElement;
const metricRoiDisplay = document.getElementById('metricRoiDisplay') as HTMLElement;
const metricProfit = document.getElementById('metricProfit') as HTMLElement;
const metricInitialDisplay = document.getElementById('metricInitialDisplay') as HTMLElement;
const metricTrades = document.getElementById('metricTrades') as HTMLElement;
const metricWinRate = document.getElementById('metricWinRate') as HTMLElement;
const metricDrawdown = document.getElementById('metricDrawdown') as HTMLElement;
const metricFees = document.getElementById('metricFees') as HTMLElement;

const ruleStatsTableBody = document.getElementById('ruleStatsTableBody') as HTMLElement;
const holdingsTableBody = document.getElementById('holdingsTableBody') as HTMLElement;
const transactionsTableBody = document.getElementById('transactionsTableBody') as HTMLElement;
const txSearchInput = document.getElementById('txSearchInput') as HTMLInputElement;
const txFilterAction = document.getElementById('txFilterAction') as HTMLSelectElement;

const marketGridContainer = document.getElementById('marketGridContainer') as HTMLElement;
const marketSearchInput = document.getElementById('marketSearchInput') as HTMLInputElement;

// Initialize Application
async function initApp() {
  try {
    // 1. Load Data
    allCases = await DataLoader.loadAllCases();
    marketStatsBadge.innerHTML = `<i class="bi bi-database-fill me-1 text-info"></i> ${allCases.length} Cases geladen`;

    // Hide Loader
    loaderOverlay.style.display = 'none';

    // 2. Initialize Bootstrap Modal
    const modalEl = document.getElementById('ruleModal');
    if (modalEl) {
      ruleModal = new bootstrap.Modal(modalEl);
    }

    // 3. Populate Case options in Target dropdown
    populateCaseDropdownOptions();

    // 4. Load Saved or Preset Rules
    const saved = PresetStore.getSavedRules();
    if (saved && saved.length > 0) {
      rules = saved;
    } else {
      // Load default Dip Buyer preset
      rules = JSON.parse(JSON.stringify(DEFAULT_PRESETS[0].rules));
    }

    // 5. Populate Presets Dropdown
    renderPresetDropdown();

    // 6. Setup Date Inputs Default
    const globalTimeline = DataLoader.getGlobalTimeline(allCases);
    if (globalTimeline.length > 0) {
      startDateInput.value = globalTimeline[0];
      endDateInput.value = globalTimeline[globalTimeline.length - 1];
    }

    // 7. Render UI Components
    renderRulesList();
    renderMarketGrid();

    // 8. Attach Event Listeners
    setupEventListeners();

  } catch (err) {
    console.error('Initialization error:', err);
    loaderOverlay.innerHTML = `
      <div class="text-danger fw-bold fs-4">Fehler beim Laden der Preisdaten!</div>
      <p class="text-secondary">${err}</p>
    `;
  }
}

function populateCaseDropdownOptions() {
  ruleTargetCaseOptions.innerHTML = '';
  for (const c of allCases) {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = `${c.name} (${c.currentPrice.toFixed(2)} €)`;
    ruleTargetCaseOptions.appendChild(opt);
  }
}

function renderPresetDropdown() {
  presetDropdownMenu.innerHTML = '';
  for (const preset of DEFAULT_PRESETS) {
    const li = document.createElement('li');
    li.innerHTML = `
      <a class="dropdown-item py-2" href="#" data-preset-id="${preset.id}">
        <div class="fw-bold">${preset.title}</div>
        <div class="small text-secondary text-wrap" style="max-width: 320px;">${preset.description}</div>
      </a>
    `;
    presetDropdownMenu.appendChild(li);
  }

  presetDropdownMenu.querySelectorAll('a[data-preset-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const presetId = (el as HTMLElement).getAttribute('data-preset-id');
      const preset = DEFAULT_PRESETS.find(p => p.id === presetId);
      if (preset) {
        rules = JSON.parse(JSON.stringify(preset.rules));
        initialCashInput.value = preset.initialCash.toString();
        feeSlider.value = preset.feePercent.toString();
        feeBadgeDisplay.textContent = `${preset.feePercent} %`;
        PresetStore.saveRules(rules);
        renderRulesList();
      }
    });
  });
}

function setupEventListeners() {
  // Fee Slider
  feeSlider.addEventListener('input', () => {
    feeBadgeDisplay.textContent = `${feeSlider.value} %`;
  });

  document.querySelectorAll('.fee-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = (btn as HTMLElement).getAttribute('data-fee');
      if (val !== null) {
        feeSlider.value = val;
        feeBadgeDisplay.textContent = `${val} %`;
      }
    });
  });

  // Timeframe Preset Select
  timeframePresetSelect.addEventListener('change', () => {
    const val = timeframePresetSelect.value;
    if (val === 'CUSTOM') {
      customDateRow.classList.remove('d-none');
    } else {
      customDateRow.classList.add('d-none');
    }
  });

  // Add Rule Button
  addRuleBtn.addEventListener('click', () => {
    openRuleModal();
  });

  // Clear Rules Button
  clearRulesBtn.addEventListener('click', () => {
    if (confirm('Möchtest du wirklich alle Regeln löschen?')) {
      rules = [];
      PresetStore.saveRules(rules);
      renderRulesList();
    }
  });

  // Modal Operator Toggle
  ruleOperatorSelect.addEventListener('change', () => {
    if (ruleOperatorSelect.value === 'NONE') {
      cond2Group.classList.add('d-none');
    } else {
      cond2Group.classList.remove('d-none');
    }
  });

  // Condition 1 Type Change (Days toggle)
  cond1TypeSelect.addEventListener('change', () => {
    updateConditionDaysVisibility(cond1TypeSelect.value as ConditionType, cond1DaysCol);
  });

  // Condition 2 Type Change
  cond2TypeSelect.addEventListener('change', () => {
    updateConditionDaysVisibility(cond2TypeSelect.value as ConditionType, cond2DaysCol);
  });

  // Rule Budget Mode Label update
  ruleBudgetModeSelect.addEventListener('change', () => {
    const mode = ruleBudgetModeSelect.value;
    if (mode === 'FIXED_EUR') ruleBudgetValueLabel.textContent = 'Betrag in €';
    else if (mode === 'PERCENT_CASH' || mode === 'PERCENT_HOLDING') ruleBudgetValueLabel.textContent = 'Prozentwert (%)';
    else if (mode === 'FIXED_UNITS') ruleBudgetValueLabel.textContent = 'Stückzahl';
  });

  // Save Rule Form
  saveRuleBtn.addEventListener('click', () => {
    saveRuleFromModal();
  });

  // Sim Config Form Submit
  simConfigForm.addEventListener('submit', (e) => {
    e.preventDefault();
    runSimulation();
  });

  // Transaction Search / Filter
  txSearchInput.addEventListener('input', renderTransactionsTable);
  txFilterAction.addEventListener('change', renderTransactionsTable);

  // Market Search
  marketSearchInput.addEventListener('input', renderMarketGrid);

  // Chart Mode Radio Toggle
  document.querySelectorAll('input[name="chartMode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (lastResult) renderChart(lastResult);
    });
  });
}

function updateConditionDaysVisibility(type: ConditionType, daysCol: HTMLElement) {
  if (type === 'PRICE_DROP_PERCENT_N_DAYS' || type === 'PRICE_RISE_PERCENT_N_DAYS') {
    daysCol.classList.remove('d-none');
  } else {
    daysCol.classList.add('d-none');
  }
}

function openRuleModal(ruleToEdit?: Rule) {
  ruleForm.reset();
  cond2Group.classList.add('d-none');

  if (ruleToEdit) {
    (document.getElementById('ruleModalTitle') as HTMLElement).textContent = 'Regel bearbeiten';
    ruleEditId.value = ruleToEdit.id;
    ruleNameInput.value = ruleToEdit.name;
    ruleTargetSelect.value = ruleToEdit.target;
    ruleActionSelect.value = ruleToEdit.action;
    ruleBudgetModeSelect.value = ruleToEdit.budgetMode;
    ruleBudgetValueInput.value = ruleToEdit.budgetValue.toString();

    // Cond 1
    cond1TypeSelect.value = ruleToEdit.condition1.type;
    cond1ValueInput.value = ruleToEdit.condition1.value.toString();
    cond1DaysInput.value = (ruleToEdit.condition1.daysLookback || 7).toString();
    updateConditionDaysVisibility(ruleToEdit.condition1.type, cond1DaysCol);

    // Operator
    ruleOperatorSelect.value = ruleToEdit.operator;
    if (ruleToEdit.operator !== 'NONE' && ruleToEdit.condition2) {
      cond2Group.classList.remove('d-none');
      cond2TypeSelect.value = ruleToEdit.condition2.type;
      cond2ValueInput.value = ruleToEdit.condition2.value.toString();
      cond2DaysInput.value = (ruleToEdit.condition2.daysLookback || 7).toString();
      updateConditionDaysVisibility(ruleToEdit.condition2.type, cond2DaysCol);
    }
  } else {
    (document.getElementById('ruleModalTitle') as HTMLElement).textContent = 'Neue Regel erstellen';
    ruleEditId.value = '';
    ruleNameInput.value = `Regel #${rules.length + 1}`;
    ruleTargetSelect.value = 'CHEAPEST_CASE';
    ruleActionSelect.value = 'BUY';
    ruleBudgetModeSelect.value = 'FIXED_EUR';
    ruleBudgetValueInput.value = '100';

    cond1TypeSelect.value = 'PRICE_DROP_PERCENT_N_DAYS';
    cond1ValueInput.value = '20';
    cond1DaysInput.value = '7';
    updateConditionDaysVisibility('PRICE_DROP_PERCENT_N_DAYS', cond1DaysCol);
  }

  if (ruleModal) ruleModal.show();
}

function saveRuleFromModal() {
  const name = ruleNameInput.value.trim() || 'Unbenannte Regel';
  const target = ruleTargetSelect.value as TargetType;
  const action = ruleActionSelect.value as 'BUY' | 'SELL';
  const budgetMode = ruleBudgetModeSelect.value as any;
  const budgetValue = parseFloat(ruleBudgetValueInput.value) || 0;

  const cond1: Condition = {
    type: cond1TypeSelect.value as ConditionType,
    value: parseFloat(cond1ValueInput.value) || 0,
    daysLookback: parseInt(cond1DaysInput.value, 10) || 7
  };

  const operator = ruleOperatorSelect.value as 'NONE' | 'AND' | 'OR';
  let cond2: Condition | undefined = undefined;

  if (operator !== 'NONE') {
    cond2 = {
      type: cond2TypeSelect.value as ConditionType,
      value: parseFloat(cond2ValueInput.value) || 0,
      daysLookback: parseInt(cond2DaysInput.value, 10) || 7
    };
  }

  const editId = ruleEditId.value;
  if (editId) {
    // Update existing
    const idx = rules.findIndex(r => r.id === editId);
    if (idx !== -1) {
      rules[idx] = {
        id: editId,
        name,
        enabled: rules[idx].enabled,
        target,
        action,
        budgetMode,
        budgetValue,
        condition1: cond1,
        operator,
        condition2: cond2
      };
    }
  } else {
    // Create new
    const newRule: Rule = {
      id: `rule_${Date.now()}`,
      name,
      enabled: true,
      target,
      action,
      budgetMode,
      budgetValue,
      condition1: cond1,
      operator,
      condition2: cond2
    };
    rules.push(newRule);
  }

  PresetStore.saveRules(rules);
  renderRulesList();

  if (ruleModal) ruleModal.hide();
}

function renderRulesList() {
  rulesListContainer.innerHTML = '';

  if (rules.length === 0) {
    rulesListContainer.innerHTML = `
      <div class="text-center py-5 text-secondary">
        <i class="bi bi-inbox fs-1 mb-2 d-block"></i>
        <h5>Noch keine Regeln definiert</h5>
        <p class="small">Klicke oben auf "Neue Regel erstellen" oder waehle ein Strategie-Preset aus.</p>
      </div>
    `;
    return;
  }

  rules.forEach((rule, index) => {
    const card = document.createElement('div');
    card.className = `rule-item-card action-${rule.action}`;

    const actionBadge = rule.action === 'BUY'
      ? `<span class="badge rule-badge-buy"><i class="bi bi-cart-plus me-1"></i> KAUFEN</span>`
      : `<span class="badge rule-badge-sell"><i class="bi bi-currency-euro me-1"></i> VERKAUFEN</span>`;

    let targetLabel = rule.target;
    if (rule.target === 'CHEAPEST_CASE') targetLabel = 'Günstigste Kiste';
    else if (rule.target === 'MOST_EXPENSIVE_CASE') targetLabel = 'Teuerste Kiste';
    else if (rule.target === 'TOP_GAINER_7D') targetLabel = 'Top Gewinner (7 Tage)';
    else if (rule.target === 'TOP_LOSER_7D') targetLabel = 'Top Verlierer (7 Tage)';
    else if (rule.target === 'ALL_CASES') targetLabel = 'Alle Kisten';

    let budgetStr = `${rule.budgetValue} €`;
    if (rule.budgetMode === 'PERCENT_CASH') budgetStr = `${rule.budgetValue}% des Cash-Bestands`;
    else if (rule.budgetMode === 'PERCENT_HOLDING') budgetStr = `${rule.budgetValue}% des Kisten-Bestands`;
    else if (rule.budgetMode === 'FIXED_UNITS') budgetStr = `${rule.budgetValue} Stück`;

    const cond1Str = formatConditionString(rule.condition1);
    let cond2Str = '';
    if (rule.operator !== 'NONE' && rule.condition2) {
      cond2Str = `<span class="badge bg-warning text-dark mx-1 fw-bold">${rule.operator}</span> ${formatConditionString(rule.condition2)}`;
    }

    card.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <div class="d-flex align-items-center gap-2">
          <div class="form-check form-switch me-2">
            <input class="form-check-input rule-toggle" type="checkbox" data-rule-id="${rule.id}" ${rule.enabled ? 'checked' : ''} />
          </div>
          ${actionBadge}
          <h5 class="fw-bold text-light mb-0">${rule.name}</h5>
        </div>

        <div class="d-flex align-items-center gap-2">
          <button class="btn btn-cs-outline btn-sm py-1 rule-edit-btn" data-rule-id="${rule.id}" title="Bearbeiten">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-cs-outline btn-sm py-1 text-danger rule-delete-btn" data-rule-id="${rule.id}" title="Löschen">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>

      <div class="row g-2 align-items-center text-secondary small">
        <div class="col-md-4">
          <i class="bi bi-bullseye me-1 text-info"></i> <strong>Ziel:</strong> <span class="text-light">${targetLabel}</span>
        </div>
        <div class="col-md-4">
          <i class="bi bi-wallet2 me-1 text-info"></i> <strong>Einsatz:</strong> <span class="text-light">${budgetStr}</span>
        </div>
        <div class="col-md-12 mt-2">
          <i class="bi bi-funnel me-1 text-info"></i> <strong>Bedingung:</strong>
          <span class="condition-pill ms-1">${cond1Str}</span> ${cond2Str}
        </div>
      </div>
    `;

    rulesListContainer.appendChild(card);
  });

  // Attach Event Listeners to generated rule card buttons
  document.querySelectorAll('.rule-toggle').forEach(el => {
    el.addEventListener('change', (e) => {
      const id = (e.target as HTMLElement).getAttribute('data-rule-id');
      const r = rules.find(x => x.id === id);
      if (r) {
        r.enabled = (e.target as HTMLInputElement).checked;
        PresetStore.saveRules(rules);
      }
    });
  });

  document.querySelectorAll('.rule-edit-btn').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = (el as HTMLElement).getAttribute('data-rule-id');
      const r = rules.find(x => x.id === id);
      if (r) openRuleModal(r);
    });
  });

  document.querySelectorAll('.rule-delete-btn').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = (el as HTMLElement).getAttribute('data-rule-id');
      rules = rules.filter(x => x.id !== id);
      PresetStore.saveRules(rules);
      renderRulesList();
    });
  });
}

function formatConditionString(c: Condition): string {
  switch (c.type) {
    case 'ALWAYS': return 'Immer ausführen';
    case 'PRICE_LESS_THAN': return `Preis <= ${c.value} €`;
    case 'PRICE_GREATER_THAN': return `Preis >= ${c.value} €`;
    case 'PRICE_DROP_PERCENT_N_DAYS': return `Preis-Dip >= ${c.value}% in ${c.daysLookback || 7} Tagen`;
    case 'PRICE_RISE_PERCENT_N_DAYS': return `Preis-Anstieg >= ${c.value}% in ${c.daysLookback || 7} Tagen`;
    case 'HOLDING_TIME_DAYS': return `Haltedauer >= ${c.value} Tage`;
    case 'PROFIT_PERCENT_GREATER': return `Gewinn >= ${c.value}%`;
    case 'PROFIT_PERCENT_LESS': return `Positions-P/L <= ${c.value}%`;
    case 'CALENDAR_MONTHLY': return `Tag ${c.value} im Monat (DCA)`;
    case 'PORTFOLIO_CASH_GREATER': return `Freies Cash >= ${c.value} €`;
    case 'PORTFOLIO_UNITS_LESS': return `Bestand < ${c.value} Stk`;
    default: return 'Bedingung';
  }
}

// Run Backtest Simulation
function runSimulation() {
  const initialCash = parseFloat(initialCashInput.value) || 500;
  const feePercent = parseFloat(feeSlider.value) || 15;

  // Resolve Dates based on Timeframe Preset
  const globalTimeline = DataLoader.getGlobalTimeline(allCases);
  if (globalTimeline.length === 0) return;

  let startDate = globalTimeline[0];
  let endDate = globalTimeline[globalTimeline.length - 1];

  const preset = timeframePresetSelect.value;
  if (preset === 'CUSTOM') {
    if (startDateInput.value) startDate = startDateInput.value;
    if (endDateInput.value) endDate = endDateInput.value;
  } else if (preset === '1Y' || preset === '3Y' || preset === '5Y') {
    const years = parseInt(preset.replace('Y', ''), 10);
    const endT = new Date(endDate).getTime();
    const startT = endT - (years * 365 * 86400 * 1000);
    const closestDate = globalTimeline.find(d => new Date(d).getTime() >= startT);
    if (closestDate) startDate = closestDate;
  }

  const config: SimulationConfig = {
    initialCash,
    startDate,
    endDate,
    feePercent,
    rules
  };

  const result = SimulationEngine.runSimulation(allCases, config);
  lastResult = result;

  // Switch to Results Tab
  const resultsTab = document.getElementById('results-tab');
  if (resultsTab) resultsTab.click();

  // Render Results
  renderResultsDashboard(result);
}

function renderResultsDashboard(res: SimulationResult) {
  // Metrics
  metricFinalValue.textContent = `${res.finalTotalValue.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`;
  
  const roiSign = res.totalRoiPercent >= 0 ? '+' : '';
  metricRoiDisplay.className = `small mt-1 fw-bold ${res.totalRoiPercent >= 0 ? 'text-success' : 'text-danger'}`;
  metricRoiDisplay.textContent = `${roiSign}${res.totalRoiPercent.toFixed(2)} % Rendite`;

  const profitSign = res.totalProfit >= 0 ? '+' : '';
  metricProfit.className = `metric-value ${res.totalProfit >= 0 ? 'text-success' : 'text-danger'}`;
  metricProfit.textContent = `${profitSign}${res.totalProfit.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`;
  metricInitialDisplay.textContent = `Startkapital: ${res.initialCash.toLocaleString('de-DE')} €`;

  metricTrades.textContent = res.totalTransactions.toString();
  const totalClosed = res.winningTrades + res.losingTrades;
  const winRate = totalClosed > 0 ? ((res.winningTrades / totalClosed) * 100).toFixed(1) : '0.0';
  metricWinRate.textContent = `Gewinn-Trades: ${res.winningTrades} / ${totalClosed} (${winRate}%)`;

  metricDrawdown.textContent = `-${res.maxDrawdownPercent.toFixed(2)} %`;
  metricFees.textContent = `Gezahlte Gebühren: ${res.totalFeesPaid.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`;

  // Render Chart
  renderChart(res);

  // Render Rule Stats Table
  renderRuleStatsTable(res);

  // Render Holdings Table
  renderHoldingsTable(res);

  // Render Transactions Table
  renderTransactionsTable();
}

function renderChart(res: SimulationResult) {
  const ctx = document.getElementById('performanceChart') as HTMLCanvasElement;
  if (!ctx) return;

  if (performanceChart) {
    performanceChart.destroy();
  }

  const isSplitMode = (document.getElementById('chartModeSplit') as HTMLInputElement)?.checked;

  const labels = res.history.map(h => h.dateStr);

  let datasets = [];

  if (isSplitMode) {
    datasets = [
      {
        label: 'Verfügbares Cash (€)',
        data: res.history.map(h => h.cash),
        borderColor: '#00bcff',
        backgroundColor: 'rgba(0, 188, 255, 0.1)',
        fill: true,
        tension: 0.1,
        pointRadius: 0
      },
      {
        label: 'Kisten-Wert (€)',
        data: res.history.map(h => h.assetValue),
        borderColor: '#e4ae39',
        backgroundColor: 'rgba(228, 174, 57, 0.1)',
        fill: true,
        tension: 0.1,
        pointRadius: 0
      }
    ];
  } else {
    datasets = [
      {
        label: 'Gesamter Portfolio-Wert (€)',
        data: res.history.map(h => h.totalValue),
        borderColor: res.totalProfit >= 0 ? '#00e676' : '#ff3344',
        backgroundColor: res.totalProfit >= 0 ? 'rgba(0, 230, 118, 0.08)' : 'rgba(255, 51, 68, 0.08)',
        fill: true,
        tension: 0.1,
        pointRadius: 0
      }
    ];
  }

  performanceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: '#c0cbd8',
            font: { family: 'Segoe UI' }
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${Number(context.raw).toFixed(2)} €`
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'month' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#8b98a5' }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#8b98a5',
            callback: (val) => `${val} €`
          }
        }
      }
    }
  });
}

function renderRuleStatsTable(res: SimulationResult) {
  ruleStatsTableBody.innerHTML = '';
  const names = Object.keys(res.ruleStats);

  if (names.length === 0) {
    ruleStatsTableBody.innerHTML = `<tr><td colspan="4" class="text-center text-secondary">Keine Auslösungen</td></tr>`;
    return;
  }

  for (const name of names) {
    const st = res.ruleStats[name];
    const tr = document.createElement('tr');
    const pSign = st.profitEur >= 0 ? '+' : '';
    const pClass = st.profitEur >= 0 ? 'text-success' : 'text-danger';

    tr.innerHTML = `
      <td class="fw-bold text-light">${name}</td>
      <td><span class="badge bg-dark border border-secondary">${st.triggers} Trades</span></td>
      <td>${st.totalVolumeEur.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</td>
      <td class="fw-bold ${pClass}">${pSign}${st.profitEur.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</td>
    `;
    ruleStatsTableBody.appendChild(tr);
  }
}

function renderHoldingsTable(res: SimulationResult) {
  holdingsTableBody.innerHTML = '';

  if (res.finalHoldings.length === 0) {
    holdingsTableBody.innerHTML = `<tr><td colspan="4" class="text-center text-secondary">Keine Kisten im Bestand (100% Cash)</td></tr>`;
    return;
  }

  for (const h of res.finalHoldings) {
    const meta = allCases.find(c => c.name === h.caseName);
    const curP = meta ? meta.currentPrice : 0;
    const curVal = h.quantity * curP;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="fw-bold text-light">${h.caseName}</td>
      <td><span class="badge bg-primary text-dark fw-bold">${h.quantity} Stk</span></td>
      <td>${h.avgBuyPrice.toFixed(2)} €</td>
      <td class="fw-bold text-warning">${curVal.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</td>
    `;
    holdingsTableBody.appendChild(tr);
  }
}

function renderTransactionsTable() {
  transactionsTableBody.innerHTML = '';
  if (!lastResult || lastResult.transactions.length === 0) {
    transactionsTableBody.innerHTML = `<tr><td colspan="9" class="text-center text-secondary">Keine Trades in diesem Zeitraum</td></tr>`;
    return;
  }

  const query = txSearchInput.value.toLowerCase().trim();
  const filterAction = txFilterAction.value;

  const filtered = lastResult.transactions.filter(tx => {
    if (filterAction !== 'ALL' && tx.action !== filterAction) return false;
    if (query && !tx.caseName.toLowerCase().includes(query) && !tx.ruleName.toLowerCase().includes(query)) return false;
    return true;
  });

  if (filtered.length === 0) {
    transactionsTableBody.innerHTML = `<tr><td colspan="9" class="text-center text-secondary">Keine Suchergebnisse gefunden.</td></tr>`;
    return;
  }

  filtered.forEach(tx => {
    const tr = document.createElement('tr');
    const actionBadge = tx.action === 'BUY'
      ? `<span class="badge rule-badge-buy">KAUF</span>`
      : `<span class="badge rule-badge-sell">VERKAUF</span>`;

    tr.innerHTML = `
      <td class="small font-monospace text-secondary">${tx.dateStr}</td>
      <td>${actionBadge}</td>
      <td class="fw-bold text-light">${tx.caseName}</td>
      <td>${tx.units} Stk</td>
      <td>${tx.pricePerUnit.toFixed(2)} €</td>
      <td>${tx.grossTotal.toFixed(2)} €</td>
      <td class="text-warning">${tx.feePaid.toFixed(2)} €</td>
      <td class="fw-bold text-info">${tx.netTotal.toFixed(2)} €</td>
      <td class="small text-secondary text-truncate" style="max-width: 150px;">${tx.ruleName}</td>
    `;
    transactionsTableBody.appendChild(tr);
  });
}

function renderMarketGrid() {
  marketGridContainer.innerHTML = '';
  const query = marketSearchInput.value.toLowerCase().trim();

  const filtered = allCases.filter(c => !query || c.name.toLowerCase().includes(query));

  filtered.forEach(c => {
    const col = document.createElement('div');
    col.className = 'col-md-6 col-lg-4 col-xl-3';

    col.innerHTML = `
      <div class="case-grid-item h-100 d-flex flex-column justify-content-between">
        <div>
          <div class="d-flex justify-content-between align-items-start mb-2">
            <h6 class="fw-bold text-light mb-0">${c.name}</h6>
            <span class="badge bg-dark border border-secondary text-info font-monospace">${c.currentPrice.toFixed(2)} €</span>
          </div>
          <div class="small text-secondary mb-2">
            <div><i class="bi bi-graph-down text-danger me-1"></i> Tiefstpreis: ${c.minPrice.toFixed(2)} €</div>
            <div><i class="bi bi-graph-up text-success me-1"></i> Höchstpreis: ${c.maxPrice.toFixed(2)} €</div>
            <div><i class="bi bi-calendar3 me-1"></i> Datenpunkte: ${c.dailyPrices.length} Tage</div>
          </div>
        </div>
        <div class="small text-muted font-monospace border-top border-secondary pt-2 mt-2">
          ${c.firstDateStr} bis ${c.lastDateStr}
        </div>
      </div>
    `;

    marketGridContainer.appendChild(col);
  });
}

// Start Application on DOM Ready
document.addEventListener('DOMContentLoaded', initApp);
