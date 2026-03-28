/**
 * ═══════════════════════════════════════════════════════════════
 *  Print3D Calc — script.js
 *  Calculadora de preços para peças impressas em 3D
 *  Funcionalidades:
 *    - Cálculo detalhado de custos
 *    - Dark/Light mode persistente
 *    - LocalStorage para persistência dos campos
 *    - Gráfico de composição (Chart.js)
 *    - Exportação de orçamento em PDF (jsPDF)
 *    - Atualização em tempo real (debounced)
 *    - Validação de entradas negativas
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

/* ── 1. REFERÊNCIAS AOS ELEMENTOS DO DOM ──────────────────────── */

const html            = document.documentElement;
const themeBtn        = document.getElementById('themeToggle');
const calcBtn         = document.getElementById('calcBtn');
const clearBtn        = document.getElementById('clearBtn');
const exportBtn       = document.getElementById('exportBtn');
const errorMsg        = document.getElementById('errorMsg');

// Preset UI
const savePresetBtn   = document.getElementById('savePresetBtn');
const presetList      = document.getElementById('presetList');
const presetEmpty     = document.getElementById('presetEmpty');
const lastPresetBanner= document.getElementById('lastPresetBanner');
const lastPresetName  = document.getElementById('lastPresetName');
const loadLastBtn     = document.getElementById('loadLastBtn');
const presetModal     = document.getElementById('presetModal');
const presetNameInput = document.getElementById('presetNameInput');
const confirmSaveBtn  = document.getElementById('confirmSaveBtn');
const cancelSaveBtn   = document.getElementById('cancelSaveBtn');

// Campos de entrada
const fields = {
  weight:          document.getElementById('weight'),
  filamentCost:    document.getElementById('filamentCost'),
  failRate:        document.getElementById('failRate'),
  printTime:       document.getElementById('printTime'),
  energyCost:      document.getElementById('energyCost'),
  printerCost:     document.getElementById('printerCost'),
  printerLifespan: document.getElementById('printerLifespan'),
  laborCost:       document.getElementById('laborCost'),
  extraCost:       document.getElementById('extraCost'),
  profitMargin:    document.getElementById('profitMargin'),
  quantity:        document.getElementById('quantity'),
  ecommerceTax:    document.getElementById('ecommerceTax'),
  ecommerceFee:    document.getElementById('ecommerceFee'),
};

// Elementos de resultado
const els = {
  emptyState:     document.getElementById('emptyState'),
  resultContent:  document.getElementById('resultContent'),
  chartCard:      document.getElementById('chartCard'),
  unitBadge:      document.getElementById('unitBadge'),
  resMaterial:    document.getElementById('resMaterial'),
  resEnergy:      document.getElementById('resEnergy'),
  resDepreciation:document.getElementById('resDepreciation'),
  resLabor:       document.getElementById('resLabor'),
  resExtra:       document.getElementById('resExtra'),
  resTotal:       document.getElementById('resTotal'),
  finalPriceLabel:document.getElementById('finalPriceLabel'),
  resFinal:       document.getElementById('resFinal'),
  finalPriceSub:  document.getElementById('finalPriceSub'),
  batchTotal:     document.getElementById('batchTotal'),
  resBatch:       document.getElementById('resBatch'),
  // E-commerce
  ecommerceBreakdown:   document.getElementById('ecommerceBreakdown'),
  resEcommerceFee:      document.getElementById('resEcommerceFee'),
  resEcommerceTaxLabel: document.getElementById('resEcommerceTaxLabel'),
  resEcommerceTax:      document.getElementById('resEcommerceTax'),
  resEcommerceTotal:    document.getElementById('resEcommerceTotal'),
  resEcommercePrice:    document.getElementById('resEcommercePrice'),
  resEcommerceSub:      document.getElementById('resEcommerceSub'),
};

/* ── 2. HELPERS ───────────────────────────────────────────────── */

/**
 * Formata um número como moeda brasileira (R$)
 * @param {number} value
 * @returns {string}
 */
function formatBRL(value) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

/**
 * Lê o valor numérico de um input, retornando 0 se vazio
 * @param {HTMLInputElement} el
 * @returns {number}
 */
function getVal(el) {
  return parseFloat(el.value) || 0;
}

/* ── 3. DARK / LIGHT MODE ─────────────────────────────────────── */

/**
 * Aplica o tema salvo no localStorage (ou dark por padrão)
 */
function applyTheme(theme) {
  html.setAttribute('data-theme', theme);
  localStorage.setItem('p3d_theme', theme);
}

// Inicializa com o tema salvo
applyTheme(localStorage.getItem('p3d_theme') || 'dark');

// Alterna ao clicar no botão
themeBtn.addEventListener('click', () => {
  const current = html.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
  // Atualiza as cores do gráfico se ele existir
  if (chartInstance) updateChart(lastResult);
});

/* ── 4. PERSISTÊNCIA DE CAMPOS (localStorage) ─────────────────── */

const STORAGE_KEY = 'p3d_fields';

/**
 * Salva todos os valores dos campos no localStorage
 */
function saveFields() {
  const data = {};
  for (const [key, el] of Object.entries(fields)) {
    data[key] = el.value;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * Restaura os valores dos campos do localStorage
 */
function loadFields() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    for (const [key, el] of Object.entries(fields)) {
      if (data[key] !== undefined) el.value = data[key];
    }
  } catch {
    // ignora JSON inválido
  }
}

// Salva a cada alteração
Object.values(fields).forEach(el => {
  el.addEventListener('input', saveFields);
});

// Restaura ao carregar a página
loadFields();

/* ── 5. VALIDAÇÃO ─────────────────────────────────────────────── */

/**
 * Valida os campos obrigatórios.
 * @returns {string|null} Mensagem de erro ou null se válido
 */
function validate() {
  const required = [
    { el: fields.weight,       label: 'Peso da peça' },
    { el: fields.filamentCost, label: 'Custo do filamento' },
    { el: fields.printTime,    label: 'Tempo de impressão' },
    { el: fields.energyCost,   label: 'Custo de energia' },
  ];

  for (const { el, label } of required) {
    const v = getVal(el);
    if (!el.value.trim()) return `O campo "${label}" é obrigatório.`;
    if (v < 0) return `"${label}" não pode ser negativo.`;
  }

  // Outros campos não podem ser negativos
  const nonNeg = [
    { el: fields.failRate,        label: 'Taxa de falha' },
    { el: fields.laborCost,       label: 'Mão de obra' },
    { el: fields.extraCost,       label: 'Custos adicionais' },
    { el: fields.profitMargin,    label: 'Margem de lucro' },
    { el: fields.printerCost,     label: 'Valor da impressora' },
    { el: fields.printerLifespan, label: 'Vida útil da impressora' },
  ];

  for (const { el, label } of nonNeg) {
    const v = getVal(el);
    if (v < 0) return `"${label}" não pode ser negativo.`;
  }

  if (getVal(fields.quantity) < 1) return 'A quantidade deve ser pelo menos 1.';

  return null; // tudo ok
}

/* ── 6. LÓGICA DE CÁLCULO ─────────────────────────────────────── */

/**
 * Executa todos os cálculos e retorna um objeto com os resultados.
 * @returns {object}
 */
function calculate() {
  // Lê os valores dos campos
  const weightG        = getVal(fields.weight);          // gramas
  const filamentPerKg  = getVal(fields.filamentCost);    // R$/kg
  const failRate       = getVal(fields.failRate) / 100;  // fração
  const printTime      = getVal(fields.printTime);       // horas
  const energyPerHour  = getVal(fields.energyCost);      // R$/h
  const printerValue   = getVal(fields.printerCost);     // R$
  const printerLife    = getVal(fields.printerLifespan); // horas
  const laborCost      = getVal(fields.laborCost);       // R$
  const extraCost      = getVal(fields.extraCost);       // R$
  const profitMargin   = getVal(fields.profitMargin) / 100; // fração
  const quantity       = Math.max(1, Math.round(getVal(fields.quantity)));
  const ecommerceTax   = getVal(fields.ecommerceTax) / 100; // fração (% sobre preço final)
  const ecommerceFee   = getVal(fields.ecommerceFee);       // R$ fixo por item

  // ── Custo do material (por peça, sem considerar lote)
  // (peso em kg) × (custo por kg) × (1 + taxa de falha)
  const materialCost = (weightG / 1000) * filamentPerKg * (1 + failRate);

  // ── Custo de energia (por peça)
  // tempo de impressão × custo por hora
  const energyCostTotal = printTime * energyPerHour;

  // ── Depreciação da impressora (por peça)
  // (valor da impressora / horas de vida útil) × tempo de impressão
  const depreciationCost = printerLife > 0
    ? (printerValue / printerLife) * printTime
    : 0;

  // ── Soma de todos os custos de produção (por peça)
  const totalCost = materialCost + energyCostTotal + depreciationCost + laborCost + extraCost;

  // ── Preço final com margem de lucro (por peça)
  const finalPrice = totalCost * (1 + profitMargin);

  // ── Custos de e-commerce (sobre o preço final)
  // - Taxa percentual (imposto/comissão): calculada sobre o preço de venda
  // - Taxa fixa por item (frete mínimo, tarifa da plataforma, etc.)
  const ecommerceTaxAmount = finalPrice * ecommerceTax;  // R$ do imposto/comissão
  const ecommerceTotalCost = ecommerceTaxAmount + ecommerceFee; // total e-commerce por peça

  // ── Preço sugerido para venda em e-commerce
  // = preço final + todos os custos de plataforma
  const ecommercePrice = finalPrice + ecommerceTotalCost;

  // ── Total para o lote (usando preço com e-commerce se houver, senão preço final)
  const hasEcommerce = ecommerceTax > 0 || ecommerceFee > 0;
  const pricePerUnit = hasEcommerce ? ecommercePrice : finalPrice;
  const batchTotal   = pricePerUnit * quantity;

  return {
    materialCost,
    energyCostTotal,
    depreciationCost,
    laborCost,
    extraCost,
    totalCost,
    finalPrice,
    // E-commerce
    ecommerceTax,
    ecommerceFee,
    ecommerceTaxAmount,
    ecommerceTotalCost,
    ecommercePrice,
    hasEcommerce,
    // Lote
    batchTotal,
    pricePerUnit,
    profitMargin,
    quantity,
  };
}

/* ── 7. GRÁFICO (Chart.js) ────────────────────────────────────── */

let chartInstance = null; // referência ao gráfico atual
let lastResult    = null; // último resultado calculado (para redesenho no toggle de tema)

/**
 * Cria ou atualiza o gráfico de rosca (doughnut)
 * com a composição dos custos.
 * @param {object} result - Resultado do cálculo
 */
function updateChart(result) {
  if (!result) return;

  const isDark = html.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#7b8098' : '#5a607a';

  // Dados para o gráfico (exclui itens zerados para não poluir)
  const labels  = [];
  const data    = [];
  const colors  = [];

  const items = [
    { label: 'Material',        value: result.materialCost,      color: '#f97316' },
    { label: 'Energia',         value: result.energyCostTotal,   color: '#06b6d4' },
    { label: 'Depreciação',     value: result.depreciationCost,  color: '#a78bfa' },
    { label: 'Mão de obra',     value: result.laborCost,         color: '#34d399' },
    { label: 'Adicionais',      value: result.extraCost,         color: '#fb923c' },
    { label: 'E-commerce',      value: result.ecommerceTotalCost,color: '#f472b6' },
  ];

  items.forEach(({ label, value, color }) => {
    if (value > 0) {
      labels.push(label);
      data.push(parseFloat(value.toFixed(2)));
      colors.push(color);
    }
  });

  // Nenhum dado: esconde o gráfico
  if (data.length === 0) {
    els.chartCard.hidden = true;
    return;
  }

  els.chartCard.hidden = false;

  const ctx = document.getElementById('costChart').getContext('2d');

  if (chartInstance) {
    // Atualiza o gráfico existente (mais performático que recriar)
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = data;
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.options.plugins.legend.labels.color = textColor;
    chartInstance.update('active');
    return;
  }

  // Cria o gráfico pela primeira vez
  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: isDark ? '#13161e' : '#ffffff',
        borderWidth: 3,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      cutout: '65%',
      animation: { animateScale: true, duration: 600 },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: textColor,
            font: { family: 'DM Sans', size: 12 },
            padding: 14,
            usePointStyle: true,
            pointStyleWidth: 8,
          },
        },
        tooltip: {
          callbacks: {
            // Formata o tooltip como R$
            label: (ctx) => {
              const val = ctx.parsed;
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((val / total) * 100).toFixed(1);
              return ` ${formatBRL(val)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/* ── 8. EXIBIÇÃO DOS RESULTADOS ───────────────────────────────── */

/**
 * Preenche a seção de resultados com os valores calculados.
 * @param {object} result
 */
function displayResults(result) {
  // Esconde estado vazio, mostra resultados
  els.emptyState.hidden = true;
  els.resultContent.hidden = false;

  // Badge de unidade
  els.unitBadge.textContent = result.quantity > 1
    ? `Resultado por peça (lote de ${result.quantity})`
    : 'Resultado por peça';

  // Preenche métricas
  els.resMaterial.textContent     = formatBRL(result.materialCost);
  els.resEnergy.textContent       = formatBRL(result.energyCostTotal);
  els.resDepreciation.textContent = formatBRL(result.depreciationCost);
  els.resLabor.textContent        = formatBRL(result.laborCost);
  els.resExtra.textContent        = formatBRL(result.extraCost);
  els.resTotal.textContent        = formatBRL(result.totalCost);

  // Preço final
  const marginPct = (result.profitMargin * 100).toFixed(0);
  els.finalPriceLabel.textContent = `Preço final (margem ${marginPct}%)`;
  els.resFinal.textContent        = formatBRL(result.finalPrice);
  els.finalPriceSub.textContent   = result.totalCost > 0
    ? `Lucro: ${formatBRL(result.finalPrice - result.totalCost)}`
    : '';

  // Total do lote (visível apenas quando quantidade > 1)
  if (result.quantity > 1) {
    els.batchTotal.hidden = false;
    els.resBatch.textContent = formatBRL(result.batchTotal);
  } else {
    els.batchTotal.hidden = true;
  }

  // ── Custos de e-commerce
  if (result.hasEcommerce) {
    els.ecommerceBreakdown.hidden = false;

    els.resEcommerceFee.textContent = formatBRL(result.ecommerceFee);

    const taxPct = (result.ecommerceTax * 100).toFixed(1);
    els.resEcommerceTaxLabel.textContent = `Imposto / comissão (${taxPct}%)`;
    els.resEcommerceTax.textContent      = formatBRL(result.ecommerceTaxAmount);
    els.resEcommerceTotal.textContent    = formatBRL(result.ecommerceTotalCost);

    els.resEcommercePrice.textContent = formatBRL(result.ecommercePrice);
    els.resEcommerceSub.textContent   =
      `Lucro líquido após e-commerce: ${formatBRL(result.ecommercePrice - result.totalCost - result.ecommerceTotalCost)}`;
  } else {
    els.ecommerceBreakdown.hidden = true;
  }

  // Atualiza o gráfico
  updateChart(result);
}

/* ── 9. EVENTO: CALCULAR ─────────────────────────────────────── */

function runCalculation() {
  // Limpa erro anterior
  errorMsg.textContent = '';

  // Valida
  const err = validate();
  if (err) {
    errorMsg.textContent = err;
    return;
  }

  // Calcula e exibe
  const result = calculate();
  lastResult = result;
  displayResults(result);
}

calcBtn.addEventListener('click', runCalculation);

/* ── 10. ATUALIZAÇÃO EM TEMPO REAL (debounce) ─────────────────── */

let debounceTimer = null;

/**
 * Dispara o cálculo automaticamente 600ms após o usuário
 * parar de digitar — evita cálculos a cada tecla.
 */
function onInput() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    // Só recalcula automaticamente se já houve um cálculo anterior
    if (!els.resultContent.hidden) {
      runCalculation();
    }
  }, 600);
}

Object.values(fields).forEach(el => {
  el.addEventListener('input', onInput);
});

/* ── 11. EVENTO: LIMPAR ───────────────────────────────────────── */

clearBtn.addEventListener('click', () => {
  // Limpa todos os inputs
  Object.values(fields).forEach(el => {
    // Mantém o valor padrão de quantity = 1
    if (el.id === 'quantity') el.value = '1';
    else el.value = '';
  });

  // Limpa localStorage
  localStorage.removeItem(STORAGE_KEY);

  // Volta ao estado vazio
  errorMsg.textContent = '';
  els.emptyState.hidden = false;
  els.resultContent.hidden = true;
  els.chartCard.hidden = true;
  lastResult = null;

  // Destroi o gráfico
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
});

/* ── 12. GERENCIADOR DE PRESETS ───────────────────────────────── */

/**
 * Chave no localStorage onde a lista de presets é armazenada.
 * Cada preset é um objeto:
 *   { id, name, savedAt, fields: { weight, filamentCost, ... } }
 */
const PRESETS_KEY = 'p3d_presets';

/** Toast singleton — elemento criado sob demanda */
let toastEl = null;

/**
 * Exibe uma mensagem "toast" temporária na parte inferior da tela.
 * @param {string} msg   Texto da mensagem
 * @param {string} [color='#facc15']  Cor do dot decorativo
 */
function showToast(msg, color = '#facc15') {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.innerHTML = `<span style="color:${color};margin-right:.5rem">◆</span>${msg}`;
  toastEl.classList.add('show');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), 2800);
}

/**
 * Lê a lista de presets do localStorage.
 * @returns {Array}
 */
function getPresets() {
  try {
    return JSON.parse(localStorage.getItem(PRESETS_KEY)) || [];
  } catch {
    return [];
  }
}

/**
 * Persiste a lista de presets no localStorage.
 * @param {Array} list
 */
function setPresets(list) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
}

/**
 * Coleta os valores atuais dos campos do formulário num objeto simples.
 * @returns {object}
 */
function captureFieldValues() {
  const snapshot = {};
  for (const [key, el] of Object.entries(fields)) {
    snapshot[key] = el.value;
  }
  return snapshot;
}

/**
 * Aplica um objeto de valores nos campos do formulário.
 * @param {object} snapshot
 */
function applyFieldValues(snapshot) {
  for (const [key, el] of Object.entries(fields)) {
    if (snapshot[key] !== undefined) el.value = snapshot[key];
  }
  // Persiste no STORAGE_KEY também (campos em tempo real)
  saveFields();
}

/**
 * Formata um timestamp (ms) como string legível em pt-BR.
 * @param {number} ts
 * @returns {string}
 */
function formatDate(ts) {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Re-renderiza a lista de presets na UI.
 */
function renderPresets() {
  const list = getPresets();

  // Mostra/esconde o aviso de lista vazia
  presetEmpty.hidden = list.length > 0;

  // Remove itens antigos (exceto o parágrafo de vazio)
  presetList.querySelectorAll('.preset-item').forEach(el => el.remove());

  // Renderiza cada preset (mais recente primeiro)
  const sorted = [...list].sort((a, b) => b.savedAt - a.savedAt);

  sorted.forEach((preset, idx) => {
    const item = document.createElement('div');
    item.className = 'preset-item' + (idx === 0 ? ' is-latest' : '');
    item.dataset.id = preset.id;

    item.innerHTML = `
      <span class="preset-dot"></span>
      <span class="preset-name" title="${preset.name}">${preset.name}</span>
      <span class="preset-date">${formatDate(preset.savedAt)}</span>
      <button class="btn-preset-load" data-id="${preset.id}" title="Carregar este preset">↩ Usar</button>
      <button class="btn-preset-delete" data-id="${preset.id}" title="Excluir preset">✕</button>
    `;

    presetList.appendChild(item);
  });

  // Atualiza o banner "último salvo"
  if (list.length > 0) {
    const latest = sorted[0];
    lastPresetBanner.hidden = false;
    lastPresetName.textContent = latest.name;
    lastPresetName.title = latest.name;
    // Guarda o ID do último no banner para o botão "Usar este"
    lastPresetBanner.dataset.latestId = latest.id;
  } else {
    lastPresetBanner.hidden = true;
  }
}

/**
 * Carrega um preset pelo ID: aplica os campos e recalcula.
 * @param {string} id
 */
function loadPreset(id) {
  const list = getPresets();
  const preset = list.find(p => p.id === id);
  if (!preset) return;

  applyFieldValues(preset.fields);

  // Recalcula automaticamente se os campos forem válidos
  const err = validate();
  if (!err) runCalculation();

  showToast(`"${preset.name}" carregado com sucesso`, '#34d399');
}

/**
 * Salva um novo preset com o nome informado.
 * @param {string} name
 */
function savePreset(name) {
  const trimmed = name.trim();
  if (!trimmed) return;

  const list = getPresets();

  const newPreset = {
    id: `preset_${Date.now()}`,
    name: trimmed,
    savedAt: Date.now(),
    fields: captureFieldValues(),
  };

  // Limita a 10 presets (remove o mais antigo se necessário)
  if (list.length >= 10) {
    list.sort((a, b) => a.savedAt - b.savedAt);
    list.shift();
  }

  list.push(newPreset);
  setPresets(list);
  renderPresets();
  showToast(`"${trimmed}" salvo!`, '#facc15');
}

/**
 * Exclui um preset pelo ID.
 * @param {string} id
 */
function deletePreset(id) {
  const list = getPresets().filter(p => p.id !== id);
  setPresets(list);
  renderPresets();
  showToast('Parâmetro excluído', '#f87171');
}

// ─── Eventos do modal ───────────────────────────────────────────

/** Abre o modal de nomeação */
function openModal() {
  presetNameInput.value = '';
  presetModal.hidden = false;
  // Foca o input após a animação
  setTimeout(() => presetNameInput.focus(), 60);
}

/** Fecha o modal de nomeação */
function closeModal() {
  presetModal.hidden = true;
}

savePresetBtn.addEventListener('click', openModal);
cancelSaveBtn.addEventListener('click', closeModal);

// Fechar clicando fora do modal
presetModal.addEventListener('click', (e) => {
  if (e.target === presetModal) closeModal();
});

// Confirmar com Enter
presetNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmSaveBtn.click();
  if (e.key === 'Escape') closeModal();
});

confirmSaveBtn.addEventListener('click', () => {
  const name = presetNameInput.value.trim();
  if (!name) {
    presetNameInput.style.borderColor = 'var(--error-color)';
    presetNameInput.focus();
    setTimeout(() => presetNameInput.style.borderColor = '', 1200);
    return;
  }
  savePreset(name);
  closeModal();
});

// ─── Delegação de eventos na lista de presets ───────────────────

presetList.addEventListener('click', (e) => {
  const loadBtn   = e.target.closest('.btn-preset-load');
  const deleteBtn = e.target.closest('.btn-preset-delete');

  if (loadBtn)   loadPreset(loadBtn.dataset.id);
  if (deleteBtn) deletePreset(deleteBtn.dataset.id);
});

// ─── Botão "Usar este" (banner do último salvo) ─────────────────

loadLastBtn.addEventListener('click', () => {
  const id = lastPresetBanner.dataset.latestId;
  if (id) loadPreset(id);
});

// ─── Render inicial ao carregar a página ────────────────────────
renderPresets();

/* ── 13. EXPORTAR PDF (jsPDF) ─────────────────────────────────── */

exportBtn.addEventListener('click', exportPDF);

function exportPDF() {
  if (!lastResult) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const margin  = 20;
  const pageW   = 210;
  const contentW = pageW - margin * 2;
  let y = margin;

  // ── Paleta de cores do PDF
  const C = {
    primary:  [79, 110, 247],  // azul
    dark:     [18, 22, 34],    // fundo escuro (títulos)
    text:     [40, 45, 65],    // texto principal
    muted:    [120, 130, 160], // texto secundário
    accent:   [167, 139, 250], // roxo (preço final)
    green:    [52, 211, 153],
    white:    [255, 255, 255],
    border:   [220, 225, 240],
  };

  // ─── Cabeçalho
  doc.setFillColor(...C.dark);
  doc.rect(0, 0, pageW, 38, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...C.white);
  doc.text('Print3D Calc', margin, 18);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.muted);
  doc.text('Orçamento de Peça Impressa em 3D', margin, 26);

  // Data
  const now = new Date().toLocaleString('pt-BR');
  doc.text(`Emitido em: ${now}`, pageW - margin, 26, { align: 'right' });

  y = 50;

  // ─── Subtítulo de seção
  function sectionTitle(text) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.primary);
    doc.text(text.toUpperCase(), margin, y);
    doc.setDrawColor(...C.primary);
    doc.setLineWidth(.3);
    doc.line(margin, y + 1.5, pageW - margin, y + 1.5);
    y += 8;
  }

  // ─── Linha de dado
  function dataRow(label, value, highlight = false) {
    doc.setFillColor(...C.border);
    if (highlight) doc.setFillColor(235, 230, 254);
    doc.roundedRect(margin, y - 4.5, contentW, 8, 1, 1, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C.text);
    doc.text(label, margin + 3, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(highlight ? C.accent[0] : C.text[0], highlight ? C.accent[1] : C.text[1], highlight ? C.accent[2] : C.text[2]);
    doc.text(value, pageW - margin - 3, y, { align: 'right' });

    y += 10;
  }

  // ─── Parâmetros de entrada
  sectionTitle('Parâmetros da Impressão');

  const {
    materialCost, energyCostTotal, depreciationCost,
    laborCost, extraCost, totalCost, finalPrice,
    batchTotal, profitMargin, quantity,
    hasEcommerce, ecommerceFee, ecommerceTax,
    ecommerceTaxAmount, ecommerceTotalCost, ecommercePrice,
  } = lastResult;

  const f = fields; // atalho

  dataRow('Peso da peça',          `${getVal(f.weight)} g`);
  dataRow('Custo do filamento',    `${formatBRL(getVal(f.filamentCost))} / kg`);
  dataRow('Taxa de falha',         `${getVal(f.failRate)} %`);
  dataRow('Tempo de impressão',    `${getVal(f.printTime)} h`);
  dataRow('Custo de energia',      `${formatBRL(getVal(f.energyCost))} / h`);
  dataRow('Valor da impressora',   formatBRL(getVal(f.printerCost)));
  dataRow('Vida útil estimada',    `${getVal(f.printerLifespan)} h`);
  dataRow('Mão de obra',           formatBRL(getVal(f.laborCost)));
  dataRow('Custos adicionais',     formatBRL(getVal(f.extraCost)));
  dataRow('Margem de lucro',       `${getVal(f.profitMargin)} %`);
  dataRow('Quantidade (lote)',     `${quantity} un`);

  y += 4;

  // ─── Composição de custos
  sectionTitle('Composição dos Custos (por peça)');
  dataRow('Custo do material',     formatBRL(materialCost));
  dataRow('Custo de energia',      formatBRL(energyCostTotal));
  dataRow('Depreciação do equip.', formatBRL(depreciationCost));
  dataRow('Mão de obra',           formatBRL(laborCost));
  dataRow('Custos adicionais',     formatBRL(extraCost));

  y += 2;

  // ─── Totais
  // Custo total (destaque verde sutil)
  doc.setFillColor(220, 252, 231);
  doc.roundedRect(margin, y - 4.5, contentW, 8, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.text);
  doc.text('Custo total', margin + 3, y);
  doc.setTextColor(...C.green);
  doc.text(formatBRL(totalCost), pageW - margin - 3, y, { align: 'right' });
  y += 14;

  // Preço final — caixa de destaque
  doc.setFillColor(235, 230, 254);
  doc.roundedRect(margin, y - 6, contentW, 16, 3, 3, 'F');
  doc.setDrawColor(...C.accent);
  doc.setLineWidth(.5);
  doc.roundedRect(margin, y - 6, contentW, 16, 3, 3, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.muted);
  doc.text(`PREÇO FINAL (margem ${(profitMargin*100).toFixed(0)}%)`, margin + 4, y + 0.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...C.accent);
  doc.text(formatBRL(finalPrice), pageW - margin - 4, y + 7, { align: 'right' });
  y += 22;

  // ─── E-commerce (se aplicável)
  if (hasEcommerce) {
    const pink = [244, 114, 182];
    sectionTitle('Custos de E-commerce');

    dataRow(`Taxa por item`, formatBRL(ecommerceFee));
    dataRow(`Imposto / comissão (${(ecommerceTax*100).toFixed(1)}%)`, formatBRL(ecommerceTaxAmount));
    dataRow('Total e-commerce', formatBRL(ecommerceTotalCost));

    y += 2;

    // Preço para e-commerce — destaque rosa
    doc.setFillColor(254, 226, 239);
    doc.roundedRect(margin, y - 6, contentW, 16, 3, 3, 'F');
    doc.setDrawColor(...pink);
    doc.setLineWidth(.5);
    doc.roundedRect(margin, y - 6, contentW, 16, 3, 3, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C.muted);
    doc.text('PREÇO PARA E-COMMERCE', margin + 4, y + 0.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...pink);
    doc.text(formatBRL(ecommercePrice), pageW - margin - 4, y + 7, { align: 'right' });
    y += 22;
  }

  // Total do lote
  if (quantity > 1) {
    doc.setFillColor(...C.dark);
    doc.roundedRect(margin, y - 5, contentW, 11, 2, 2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C.muted);
    doc.text(`TOTAL DO LOTE (${quantity} peças)`, margin + 4, y + 1.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...C.white);
    doc.text(formatBRL(batchTotal), pageW - margin - 4, y + 2, { align: 'right' });
    y += 16;
  }

  // ─── Rodapé
  y = 287;
  doc.setFillColor(...C.border);
  doc.rect(0, y - 3, pageW, 10, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C.muted);
  doc.text('Gerado por Print3D Calc  •  Os valores são estimativas baseadas nos dados inseridos.', pageW / 2, y + 3, { align: 'center' });

  // ─── Salva o arquivo
  doc.save(`orcamento_3d_${Date.now()}.pdf`);
}

/* ── 14. INICIALIZAÇÃO ────────────────────────────────────────── */

/**
 * Se houver dados salvos no localStorage, recalcula automaticamente
 * para que o usuário veja os resultados ao recarregar a página.
 */
(function init() {
  if (localStorage.getItem(STORAGE_KEY)) {
    // Pequeno delay para garantir que o DOM está pronto
    setTimeout(() => {
      const err = validate();
      if (!err) {
        runCalculation();
      }
    }, 100);
  }
})();
