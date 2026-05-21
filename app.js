const $ = (id) => document.getElementById(id);
const state = {
  history: JSON.parse(localStorage.getItem('calc_history') || '[]'),
  locale: localStorage.getItem('calc_locale') || 'ru-RU',
  theme: localStorage.getItem('calc_theme') || 'light'
};

const allowed = {
  'sin(': 'Math.sin(', 'cos(': 'Math.cos(', 'tan(': 'Math.tan(', 'sqrt(': 'Math.sqrt(',
  'log(': 'Math.log10(', 'ln(': 'Math.log(', 'π': 'Math.PI', 'e': 'Math.E', '^': '**'
};

function fmt(n){ return new Intl.NumberFormat(state.locale, { maximumFractionDigits: 12 }).format(n); }
function saveHistory(){ localStorage.setItem('calc_history', JSON.stringify(state.history.slice(0, 30))); }
function renderHistory(){ $('history').innerHTML = state.history.map(h => `<li>${h.expr} = ${h.result}</li>`).join(''); }

function parseLocaleInput(expr){
  const normalized = expr.replace(/,/g, '.').replace(/\s+/g, '');
  if (/,/.test(expr)) return { expr: normalized, note: 'Запятые автоматически заменены на точки.' };
  return { expr: normalized, note: '' };
}

function toJS(expr){
  let js = expr;
  for (const [k,v] of Object.entries(allowed)) js = js.split(k).join(v);
  if (/[^0-9+\-*/().,%^a-zA-Z]/.test(expr)) throw new Error('Недопустимые символы.');
  return js;
}

function explain(expr){
  return `Формула: ${expr}\nШаг 1: нормализация локали\nШаг 2: парсинг математических функций\nШаг 3: вычисление выражения`;
}

function evaluate(){
  $('error').textContent = '';
  try {
    const raw = $('expr').value;
    const {expr, note} = parseLocaleInput(raw);
    const js = toJS(expr);
    const result = Function(`"use strict"; return (${js})`)();
    if (!Number.isFinite(result)) throw new Error('Результат не является конечным числом.');
    const rendered = fmt(result);
    $('result').textContent = `Результат: ${rendered}`;
    $('result').animate([{transform:'scale(1)'},{transform:'scale(1.06)'},{transform:'scale(1)'}],{duration:320,easing:'ease-out'});
    $('explain').textContent = `${note}\n${explain(raw)}`.trim();
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
  const keys = ['sin(', 'cos(', 'tan(', 'sqrt(', 'log(', 'ln(', 'π', 'e', '^', '(', ')'];
  $('sciButtons').innerHTML = keys.map(k => `<button data-k="${k}">${k}</button>`).join('');
  $('sciButtons').onclick = (e)=>{
    if (e.target.dataset.k) $('expr').value += e.target.dataset.k;
  };
}

$('evalBtn').onclick = evaluate;
function clearAll(){ $('expr').value=''; $('result').textContent='Результат: —'; $('error').textContent=''; }

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
  $('loanResult').textContent = `Платёж: ${fmt(pay)} / мес`;
};

$('vatCalc').onclick = ()=>{
  const base = Number($('vatBase').value), rate = Number($('vatRate').value)/100;
  $('vatResult').textContent = `С НДС: ${fmt(base*(1+rate))}`;
};

(function init(){
  document.documentElement.classList.toggle('dark', state.theme==='dark');
  renderHistory(); fillSci();
  const qExpr = new URLSearchParams(location.search).get('expr');
  if (qExpr) $('expr').value = qExpr;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
