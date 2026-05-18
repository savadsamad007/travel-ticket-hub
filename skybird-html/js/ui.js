function $(sel, root){ return (root||document).querySelector(sel); }
function $$(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }
function h(html){ const t=document.createElement("template"); t.innerHTML=html.trim(); return t.content.firstElementChild; }

function toast(msg, type){
  const el = h(`<div class="toast ${type||""}">${escapeHtml(msg)}</div>`);
  $("#toast-stack").appendChild(el);
  setTimeout(()=>{ el.style.opacity=0; setTimeout(()=>el.remove(),300); }, 3500);
}

function openModal(title, contentEl, opts){
  opts = opts || {};
  const back = h(`<div class="modal-back"><div class="modal"><h3>${escapeHtml(title)}</h3><div class="body"></div><div class="actions"></div></div></div>`);
  back.querySelector(".body").appendChild(contentEl);
  if (opts.onSave) {
    const save = h(`<button class="btn-primary">${escapeHtml(opts.saveLabel||"Save")}</button>`);
    save.onclick = async () => { try{ await opts.onSave(); close(); } catch(e){ toast(e.message,"error"); } };
    back.querySelector(".actions").appendChild(save);
  }
  const cancel = h(`<button class="btn-ghost">Close</button>`);
  back.querySelector(".actions").appendChild(cancel);
  function close(){ back.remove(); }
  cancel.onclick = close;
  back.addEventListener("click", e => { if (e.target===back) close(); });
  $("#modal-root").appendChild(back);
  return { close, el: back };
}

function confirmDialog(msg){
  return new Promise(res => {
    const el = h(`<div>${escapeHtml(msg)}</div>`);
    const m = openModal("Confirm", el, { saveLabel:"Confirm", onSave: () => res(true) });
    m.el.addEventListener("click", e => { if (e.target===m.el) res(false); });
  });
}

function pageHeader(title, desc, right){
  const wrap = h(`<div class="page-header"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(desc||"")}</p></div></div>`);
  if (right) wrap.appendChild(right);
  return wrap;
}

function statCard(label, value, sub, variant){
  return h(`<div class="stat-card ${variant||""}"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div>${sub?`<div class="sub">${escapeHtml(sub)}</div>`:""}<div class="stat-bar"></div></div>`);
}

function tableEl(cols, rows, opts){
  opts = opts || {};
  const wrap = h(`<div class="table-wrap"><table class="table"><thead><tr></tr></thead><tbody></tbody></table></div>`);
  const thead = wrap.querySelector("thead tr");
  cols.forEach(c => thead.appendChild(h(`<th class="${c.num?'num':''}">${escapeHtml(c.label)}</th>`)));
  const tb = wrap.querySelector("tbody");
  if (!rows.length){ tb.appendChild(h(`<tr><td colspan="${cols.length}" class="empty">No records yet.</td></tr>`)); return wrap; }
  rows.forEach(r => {
    const tr = h(`<tr></tr>`);
    cols.forEach(c => {
      const td = document.createElement("td");
      if (c.num) td.classList.add("num");
      const val = typeof c.render === "function" ? c.render(r) : r[c.key];
      if (val instanceof HTMLElement) td.appendChild(val);
      else td.innerHTML = (val==null||val==="") ? "—" : (c.html ? val : escapeHtml(String(val)));
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  return wrap;
}

function rowActions(items){
  const wrap = h(`<div style="display:flex;gap:4px;justify-content:flex-end"></div>`);
  items.filter(Boolean).forEach(it => {
    const b = h(`<button class="btn-icon" title="${escapeHtml(it.title||"")}">${it.label}</button>`);
    b.onclick = it.onClick;
    wrap.appendChild(b);
  });
  return wrap;
}

function fieldRow(label, name, opts){
  opts = opts || {};
  const id = "f_"+name+"_"+uid();
  const wrap = h(`<div><label for="${id}">${escapeHtml(label)}</label></div>`);
  let el;
  if (opts.type === "textarea") el = h(`<textarea id="${id}" name="${name}" rows="${opts.rows||2}">${escapeHtml(opts.value||"")}</textarea>`);
  else if (opts.type === "select") {
    el = h(`<select id="${id}" name="${name}"></select>`);
    (opts.options||[]).forEach(o => { const op=document.createElement("option"); op.value=o.value; op.textContent=o.label; if(String(opts.value)===String(o.value)) op.selected=true; el.appendChild(op); });
  } else {
    el = h(`<input id="${id}" name="${name}" type="${opts.type||'text'}" ${opts.required?'required':''} ${opts.step?`step="${opts.step}"`:''} value="${escapeHtml(opts.value??"")}" />`);
  }
  if (opts.placeholder) el.placeholder = opts.placeholder;
  wrap.appendChild(el);
  return { wrap, el };
}

// Form helper: build form fields, return { form, values() }
function buildForm(fields){
  const form = h(`<form></form>`);
  const refs = {};
  fields.forEach(f => {
    const { wrap, el } = fieldRow(f.label, f.name, f);
    refs[f.name] = el;
    form.appendChild(wrap);
  });
  form.addEventListener("submit", e => e.preventDefault());
  return {
    form,
    refs,
    values(){
      const o = {};
      Object.keys(refs).forEach(k => {
        let v = refs[k].value;
        const f = fields.find(x => x.name===k);
        if (f && f.type === "number") v = v===""?null:Number(v);
        o[k] = v;
      });
      return o;
    }
  };
}

// Airline autocomplete attached to an input
function airlineAutocomplete(input){
  const wrap = h(`<div class="ac-wrap"></div>`);
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const list = h(`<div class="ac-list hidden"></div>`);
  wrap.appendChild(list);
  let items = [], active = -1;
  function render(){
    if (!items.length) { list.classList.add("hidden"); return; }
    list.classList.remove("hidden");
    list.innerHTML = items.map(([c,n],i)=>`<div class="ac-item ${i===active?'active':''}" data-i="${i}"><span>${escapeHtml(n)}</span><span class="code">${c}</span></div>`).join("");
    $$(".ac-item", list).forEach(el => el.onclick = () => pick(Number(el.dataset.i)));
  }
  function pick(i){ const [c,n]=items[i]; input.value = n; list.classList.add("hidden"); input.dataset.code=c; }
  input.addEventListener("input", () => { items = searchAirlines(input.value); active = -1; render(); });
  input.addEventListener("focus", () => { items = searchAirlines(input.value); render(); });
  input.addEventListener("blur", () => setTimeout(()=>list.classList.add("hidden"),150));
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown"){ e.preventDefault(); active = Math.min(items.length-1, active+1); render(); }
    else if (e.key === "ArrowUp"){ e.preventDefault(); active = Math.max(0, active-1); render(); }
    else if (e.key === "Enter" && active >= 0){ e.preventDefault(); pick(active); }
  });
}
