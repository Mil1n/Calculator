const $ = (id) => document.getElementById(id);
const state = {
  history: JSON.parse(localStorage.getItem('calc_history') || '[]'),
  locale: localStorage.getItem('calc_locale') || 'ru-RU',
  theme: localStorage.getItem('calc_theme') || 'light'
};

const functionMap = {
  sin: 'Math.sin',
  cos: 'Math.cos',
  tan: 'Math.tan',
  sqrt: 'Math.sqrt',
  log: 'Math.log10',
  ln: 'Math.log',
  abs: 'Math.abs'
};

const unitFactors = {
  mm: { factor: 0.001, label: 'm', group: 'distance' },
  cm: { factor: 0.01, label: 'm', group: 'distance' },
  m: { factor: 1, label: 'm', group: 'distance' },
  km: { factor: 1000, label: 'm', group: 'distance' },
  mg: { factor: 0.001, label: 'g', group: 'weight' },
  g: { factor: 1, label: 'g', group: 'weight' },
  kg: { factor: 1000, label: 'g', group: 'weight' },
  s: { factor: 1, label: 's', group: 'time' },
  min: { factor: 60, label: 's', group: 'time' },
  h: { factor: 3600, label: 's', group: 'time' }
};

function fmt(n){ return new Intl.NumberFormat(state.locale, { maximumFractionDigits: 12 }).format(n); }
function saveHistory(){ localStorage.setItem('calc_history', JSON.stringify(state.history.slice(0, 30))); }
function escapeHtml(value){
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
function renderHistory(){
  $('history').innerHTML = state.history.map(h => `<li><strong>${escapeHtml(h.expr)}</strong><span>${escapeHtml(h.result)}</span></li>`).join('');
}

function parseLocaleInput(expr){
  const normalized = expr
    .trim()
    .replace(/,/g, '.')
    .replace(/[×х]/gi, '*')
    .replace(/[÷:]/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, ' ');
  const notes = [];
  if (/,/.test(expr)) notes.push('Запятые заменены на точки.');
  if (normalized !== expr.trim()) notes.push('Символы операций нормализованы.');
  return { expr: normalized, notes };
}

function convertPercentOf(expr, steps){
  return expr.replace(/(\d+(?:\.\d+)?)%\s*(?:от|of)\s*(\d+(?:\.\d+)?)/gi, (_, percent, base) => {
    steps.push(`${percent}% от ${base} = ${Number(percent) / 100 * Number(base)}`);
    return `((${percent})/100*(${base}))`;
  });
}

function convertStandalonePercent(expr, steps){
  return expr.replace(/(\d+(?:\.\d+)?)%/g, (_, percent) => {
    steps.push(`${percent}% = ${Number(percent) / 100}`);
    return `((${percent})/100)`;
  });
}

function convertRoots(expr, steps){
  let js = expr.replace(/√\s*\(([^()]+)\)/g, (_, value) => {
    steps.push(`√(${value}) = sqrt(${value})`);
    return `sqrt(${value})`;
  });
  js = js.replace(/√\s*(\d+(?:\.\d+)?)/g, (_, value) => {
    steps.push(`√${value} = sqrt(${value})`);
    return `sqrt(${value})`;
  });
  return js;
}

function convertUnits(expr, steps){
  const used = new Set();
  const js = expr.replace(/(\d+(?:\.\d+)?)\s*(mm|cm|km|m|mg|kg|g|min|h|s)\b/gi, (_, value, rawUnit) => {
    const unit = rawUnit.toLowerCase();
    const meta = unitFactors[unit];
    used.add(meta.group);
    steps.push(`${value} ${unit} = ${Number(value) * meta.factor} ${meta.label}`);
    return `(${value}*${meta.factor})`;
  });
  if (used.size > 1) throw new Error('Нельзя смешивать разные типы единиц в одном выражении.');
  const group = [...used][0];
  if (!group) return { js, unitLabel: '' };
  const unitLabel = Object.values(unitFactors).find(unit => unit.group === group).label;
  return { js, unitLabel };
}

function replaceMathTokens(expr){
  let js = expr
    .replace(/\bpi\b/gi, 'Math.PI')
    .replace(/π/g, 'Math.PI')
    .replace(/\be\b/g, 'Math.E')
    .replace(/\^/g, '**');

  for (const [name, fn] of Object.entries(functionMap)) {
    js = js.replace(new RegExp(`\\b${name}\\s*\\(`, 'gi'), `${fn}(`);
  }
  return js;
}

function assertSafeExpression(js, options = {}){
  const allowedChars = options.allowX ? /[^0-9+\-*/().%*x]/ : /[^0-9+\-*/().%*]/;
  const compact = js.replace(/Math\.(sin|cos|tan|sqrt|log10|log|abs|PI|E)/g, '').replace(/\s+/g, '');
  if (allowedChars.test(compact)) throw new Error('Недопустимые символы или неизвестная функция.');
  if (/\*\*\*/.test(compact)) throw new Error('Некорректная степень.');
}

function prepareExpression(expr){
  const steps = [];
  let prepared = convertPercentOf(expr, steps);
  prepared = convertRoots(prepared, steps);
  prepared = convertStandalonePercent(prepared, steps);
  const unitConversion = convertUnits(prepared, steps);
  return { prepared: unitConversion.js, steps, unitLabel: unitConversion.unitLabel };
}

function toJS(expr){
  const { prepared, steps, unitLabel } = prepareExpression(expr);
  const js = replaceMathTokens(prepared);
  assertSafeExpression(js);
  return { js, steps, unitLabel };
}

function toEquationJS(expr){
  const { prepared, steps, unitLabel } = prepareExpression(expr);
  if (unitLabel) throw new Error('Уравнения с единицами пока не поддерживаются.');
  const js = replaceMathTokens(prepared)
    .replace(/(\d|\))\s*x\b/gi, '$1*x')
    .replace(/\bx\s*(\d|\()/gi, 'x*$1')
    .replace(/\bX\b/g, 'x');
  assertSafeExpression(js, { allowX: true });
  return { js, steps };
}

function evaluateExpressionAt(js, x){
  const value = Function('x', `\"use strict\"; return (${js})`)(x);
  if (!Number.isFinite(value)) throw new Error('Уравнение даёт некорректное значение.');
  return value;
}

function solveLinearEquation(expr){
  const parts = expr.split('=');
  if (parts.length !== 2) throw new Error('Уравнение должно содержать один знак =.');
  if (!/x/i.test(expr)) throw new Error('Для уравнения укажите переменную x.');
  const left = toEquationJS(parts[0]);
  const right = toEquationJS(parts[1]);
  const f0 = evaluateExpressionAt(left.js, 0) - evaluateExpressionAt(right.js, 0);
  const f1 = evaluateExpressionAt(left.js, 1) - evaluateExpressionAt(right.js, 1);
  const a = f1 - f0;
  if (Math.abs(a) < Number.EPSILON) throw new Error(Math.abs(f0) < Number.EPSILON ? 'Бесконечно много решений.' : 'Нет решения.');
  const x = -f0 / a;
  return { result: x, steps: [...left.steps, ...right.steps, `Приведение к ax + b = 0: a = ${a}, b = ${f0}`, `x = -b / a = ${x}`] };
}

function buildExplanation(raw, normalized, steps, result){
  const lines = ['🧮 Ход решения:'];
  if (raw.trim() !== normalized) lines.push(`Ввод: ${raw.trim() || '—'}`);
  lines.push(`Формула: ${normalized}`);
  if (steps.length) lines.push(...steps);
  lines.push(`Итог: ${result}`);
  return lines.join('\n');
}

function evaluate(){
  $('error').textContent = '';
  try {
    const raw = $('expr').value;
    if (!raw.trim()) throw new Error('Введите выражение.');
    const {expr, notes} = parseLocaleInput(raw);
    const solved = expr.includes('=') ? solveLinearEquation(expr) : null;
    const {js, steps, unitLabel} = solved ? { js: '', steps: solved.steps, unitLabel: '' } : toJS(expr);
    const result = solved ? solved.result : Function(`"use strict"; return (${js})`)();
    if (!Number.isFinite(result)) throw new Error('Результат не является конечным числом.');
    const rendered = `${solved ? 'x = ' : ''}${fmt(result)}${unitLabel ? ` ${unitLabel}` : ''}`;
    $('result').textContent = `📌 Результат: ${rendered}`;
    $('result').animate([{transform:'scale(1)'},{transform:'scale(1.04)'},{transform:'scale(1)'}],{duration:260,easing:'ease-out'});
    $('explain').textContent = [...notes, buildExplanation(raw, expr, steps, rendered)].filter(Boolean).join('\n');
    state.history.unshift({expr: raw, result: rendered});
    saveHistory(); renderHistory();
  } catch (e){ $('error').textContent = `Ошибка: ${e.message}`; }
}

function setMode(mode){
  $('scientificPanel').classList.toggle('hidden', mode !== 'scientific');
  $('financePanel').classList.toggle('hidden', mode !== 'finance');
  $('householdPanel').classList.toggle('hidden', mode !== 'household');
}

function fillSci(){
  const keys = ['sin(', 'cos(', 'tan(', 'sqrt(', 'log(', 'ln(', 'abs(', 'π', 'e', '^', '√', '%'];
  $('sciButtons').innerHTML = keys.map(k => `<button data-k="${k}">${k}</button>`).join('');
  $('sciButtons').onclick = (e)=>{
    if (e.target.dataset.k) $('expr').value += e.target.dataset.k;
  };
}

$('evalBtn').onclick = evaluate;
function clearAll(){ $('expr').value=''; $('result').textContent='📌 Результат: —'; $('explain').textContent=''; $('error').textContent=''; }

$('clearBtn').onclick = clearAll;
$('mode').onchange = (e)=> setMode(e.target.value);
$('locale').value = state.locale;
$('locale').onchange = (e)=>{ state.locale = e.target.value; localStorage.setItem('calc_locale', state.locale); };
$('themeBtn').onclick = ()=>{ state.theme = state.theme === 'dark' ? 'light':'dark'; document.documentElement.classList.toggle('dark', state.theme==='dark'); localStorage.setItem('calc_theme', state.theme); };

$('calcButtons').onclick = (e)=>{
  const key = e.target.dataset.k;
  if (!key) return;
  if (key === '=') return evaluate();
  if (key === 'C') return clearAll();
  $('expr').value += key;
  $('expr').focus();
};

$('expr').addEventListener('keydown', (e)=>{
  if (e.key === 'Enter') evaluate();
});

$('shareBtn').onclick = async ()=>{
  const url = new URL(location.href); url.searchParams.set('expr', $('expr').value);
  await navigator.clipboard.writeText(url.toString()); alert('Ссылка скопирована в буфер обмена');
};
$('exportBtn').onclick = ()=>{
  const csv = 'expr,result\n' + state.history.map(h => `${JSON.stringify(h.expr)},${JSON.stringify(h.result)}`).join('\n');
  const blob = new Blob([csv], {type:'text/csv'}); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'calculator-history.csv'; a.click();
};

$('loanCalc').onclick = ()=>{
  const P = Number($('loanAmount').value), annual = Number($('loanRate').value)/100, n = Number($('loanMonths').value);
  const r = annual/12;
  if (!P || !n) return $('loanResult').textContent = 'Введите корректные параметры.';
  const pay = r === 0 ? P/n : (P*r)/(1-Math.pow(1+r,-n));
  $('loanResult').textContent = `📌 Платёж: ${fmt(pay)} / мес`;
};

$('vatCalc').onclick = ()=>{
  const base = Number($('vatBase').value), rate = Number($('vatRate').value)/100;
  $('vatResult').textContent = `📌 С НДС: ${fmt(base*(1+rate))}`;
};

(function init(){
  document.documentElement.classList.toggle('dark', state.theme==='dark');
  renderHistory(); fillSci();
  const qExpr = new URLSearchParams(location.search).get('expr');
  if (qExpr) $('expr').value = qExpr;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
