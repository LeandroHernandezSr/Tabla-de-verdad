const $ = id => document.getElementById(id);
// ---- Tokenizer ----
function tokenize(s) {
    const toks = []; let i = 0;
    const syms = [["<->", "iff"], ["<=>", "iff"], ["↔", "iff"], ["->", "imp"], ["=>", "imp"], ["→", "imp"], ["&&", "and"], ["||", "or"],
    ["&", "and"], ["∧", "and"], ["|", "or"], ["∨", "or"], ["^", "xor"], ["⊕", "xor"], ["!", "not"], ["~", "not"], ["¬", "not"], ["(", "("], [")", ")"], ["[", "("], ["]", ")"], ["{", "("], ["}", ")"],
    ["⇒", "imp"], ["⇔", "iff"], ["’", "prime"], ["'", "prime"], ["′", "prime"]];
    const words = { and: "and", or: "or", not: "not", no: "not", xor: "xor", true: "1", false: "0" };
    while (i < s.length) {
        const c = s[i];
        if (/\s/.test(c)) { i++; continue }
        const m = syms.find(([k]) => s.startsWith(k, i));
        if (m) { toks.push({ t: m[1], pos: i, ch: m[0] }); i += m[0].length; continue }
        if (c === "0" || c === "1") { toks.push({ t: "const", v: c === "1", pos: i }); i++; continue }
        const w = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
        if (w) {
            const lw = w[0].toLowerCase();
            if (words[lw]) { const x = words[lw]; toks.push(x === "1" || x === "0" ? { t: "const", v: x === "1", pos: i } : { t: x, pos: i }) }
            else toks.push({ t: "var", n: w[0], pos: i });
            i += w[0].length; continue;
        }
        throw new Error(`Carácter no reconocido «${c}» en la posición ${i + 1}`);
    }
    // "v" entre dos operandos se lee como O (p v q); en otro caso es una variable
    const ends = k => k && (k.t === "var" || k.t === "const" || k.t === ")" || k.t === "prime");
    const starts = k => k && (k.t === "var" || k.t === "const" || k.t === "not" || k.t === "(");
    toks.forEach((k, j) => { if (k.t === "var" && k.n === "v" && ends(toks[j - 1]) && starts(toks[j + 1])) k.t = "or" });
    return toks;
}
// ---- Parser (precedencia: not > and > xor > or > imp (der.) > iff) ----
function parse(toks) {
    let p = 0; const peek = () => toks[p];
    const eat = t => { if (peek() && peek().t === t) { return toks[p++] } return null };
    function iff() { let l = imp(); while (eat("iff")) { l = { t: "bin", op: "iff", a: l, b: imp() } } return l }
    function imp() { const l = or(); if (eat("imp")) return { t: "bin", op: "imp", a: l, b: imp() }; return l }
    function or() { let l = xor(); while (eat("or")) { l = { t: "bin", op: "or", a: l, b: xor() } } return l }
    function xor() { let l = and(); while (eat("xor")) { l = { t: "bin", op: "xor", a: l, b: and() } } return l }
    function and() { let l = not(); while (eat("and")) { l = { t: "bin", op: "and", a: l, b: not() } } return l }
    function not() { if (eat("not")) return { t: "not", a: not() }; return atom() }
    function atom() { let e = atom0(); while (eat("prime")) e = { t: "not", a: e }; return e }
    const PAIR = { "(": ")", "[": "]", "{": "}" };
    function atom0() {
        const k = peek();
        if (!k) throw new Error("La expresión está incompleta");
        if (k.t === "var") { p++; return { t: "var", n: k.n } }
        if (k.t === "const") { p++; return { t: "const", v: k.v } }
        if (k.t !== "(") throw new Error(`Símbolo inesperado en la posición ${k.pos + 1}`);
        p++;
        const e = iff();
        const c = eat(")");
        if (!c) throw new Error(`Falta cerrar «${k.ch}» (abierto en la posición ${k.pos + 1})`);
        if (PAIR[k.ch] !== c.ch) throw new Error(`«${k.ch}» no coincide con «${c.ch}» en la posición ${c.pos + 1}`);
        return e;
    }
    const e = iff();
    if (p < toks.length) throw new Error(`Símbolo inesperado en la posición ${toks[p].pos + 1}`);
    return e;
}
// ---- Utilities ----
const SYM = { and: "∧", or: "∨", xor: "⊕", imp: "→", iff: "↔" };
function str(n, top = true) {
    if (n.t === "var") return n.n;
    if (n.t === "const") return n.v ? "1" : "0";
    if (n.t === "not") return "¬" + str(n.a, false);
    const s = `${str(n.a, false)} ${SYM[n.op]} ${str(n.b, false)}`;
    return top ? s : `(${s})`;
}
function ev(n, env) {
    switch (n.t) {
        case "var": return env[n.n];
        case "const": return n.v;
        case "not": return !ev(n.a, env);
        default: {
            const a = ev(n.a, env), b = ev(n.b, env);
            return n.op === "and" ? a && b : n.op === "or" ? a || b : n.op === "xor" ? a !== b : n.op === "imp" ? (!a || b) : a === b
        }
    }
}
function collect(n, vars, subs) {
    if (n.t === "var") { if (!vars.includes(n.n)) vars.push(n.n); return }
    if (n.t === "const") return;
    collect(n.a, vars, subs);
    if (n.t === "bin") collect(n.b, vars, subs);
    if (!subs.some(s => str(s) === str(n))) subs.push(n);
}
// ---- Render ----
function build() {
    const err = $("err"), out = $("out"); err.style.display = "none";
    try {
        const src = $("expr").value.trim();
        if (!src) throw new Error("Escribí una expresión");
        const ast = parse(tokenize(src));
        const vars = [], subs = []; collect(ast, vars, subs);
        vars.sort((a, b) => a.localeCompare(b));
        if (vars.length > 8) throw new Error("Máximo 8 variables (256 filas)");
        const cols = subs.filter(s => str(s) !== str(ast));
        const rows = 1 << vars.length;
        let html = "<thead><tr>" + vars.map(v => `<th>${v}</th>`).join("") + cols.map(c => `<th>${str(c)}</th>`).join("") + `<th class="res">${str(ast)}</th></tr></thead><tbody>`;
        let trues = 0;
        for (let r = 0; r < rows; r++) {
            const env = {};
            vars.forEach((v, i) => env[v] = !((r >> (vars.length - 1 - i)) & 1));
            const cell = (val, cls = "") => `<td class="${val ? "T" : "F"} ${cls}">${val ? 1 : 0}</td>`;
            html += "<tr>" + vars.map(v => `<td class="v">${env[v] ? 1 : 0}</td>`).join("") + cols.map(c => cell(ev(c, env))).join("");
            const res = ev(ast, env); if (res) trues++;
            html += cell(res, "res") + "</tr>";
        }
        $("tbl").innerHTML = html + "</tbody>";
        $("badge").textContent = trues === rows ? "Tautología (siempre verdadera)" : trues === 0 ? "Contradicción (siempre falsa)" : `Contingencia (${trues} de ${rows} filas verdaderas)`;
        out.style.display = "block";
    } catch (e) {
        out.style.display = "none"; err.textContent = "⚠ " + e.message; err.style.display = "block";
    }
}
// ---- UI ----
const inp = $("expr");
["¬", "’", "∧", "∨", "⊕", "→", "↔", "(", ")", "[", "]"].forEach(s => {
    const b = document.createElement("button"); b.className = "op"; b.textContent = s;
    b.onclick = () => { const a = inp.selectionStart, z = inp.selectionEnd; inp.setRangeText(s, a, z, "end"); inp.focus() };
    $("ops").appendChild(b);
});
["[ (p v q’) ⇒ p’] ∧ q", "p & q", "p -> q", "(p -> q) & !q -> !p", "p | (q & r)", "!(p & q) <-> (!p | !q)", "p ^ q", "(p -> q) & (q -> r) -> (p -> r)"].forEach(s => {
    const b = document.createElement("button"); b.textContent = s; b.onclick = () => { inp.value = s; build() }; $("ex").appendChild(b);
});
$("go").onclick = build;
$("clear").onclick = () => { inp.value = ""; $("out").style.display = "none"; $("err").style.display = "none"; inp.focus() };
inp.addEventListener("keydown", e => { if (e.key === "Enter") build() });
build();