// Unity .mat dosyalarindan malzeme -> doku/renk eslemesi cikarir
const fs = require('fs'), path = require('path');
const [ham, cikti, out] = process.argv.slice(2);
const g2p = {};
for (const g of fs.readdirSync(ham)) {
  const pn = path.join(ham, g, 'pathname');
  if (fs.existsSync(pn)) g2p[g] = path.join(cikti, fs.readFileSync(pn, 'utf8').split('\n')[0].trim());
}
const res = {};
for (const g in g2p) {
  const p = g2p[g];
  if (!p.endsWith('.mat')) continue;
  const t = fs.readFileSync(path.join(ham, g, 'asset'), 'utf8').split('\r').join('');
  const name = path.basename(p, '.mat');
  const tex = {};
  const re = /- (_\w+):\s*\n\s*m_Texture: \{fileID: \d+(?:, guid: (\w+))?/g;
  let m;
  while ((m = re.exec(t))) { if (m[2] && g2p[m[2]]) tex[m[1]] = g2p[m[2]]; }
  const col = (n) => {
    const x = t.match(new RegExp('- ' + n + ': \\{r: ([0-9.eE-]+), g: ([0-9.eE-]+), b: ([0-9.eE-]+), a: ([0-9.eE-]+)\\}'));
    return x ? x.slice(1, 5).map(Number) : null;
  };
  const fl = (n) => { const x = t.match(new RegExp('- ' + n + ': ([0-9.eE-]+)\\n')); return x ? Number(x[1]) : null; };
  const smooth = fl('_Smoothness');
  res[name] = { tex, color: col('_BaseColor') || col('_Color'), metal: fl('_Metallic'),
    smooth: smooth != null ? smooth : fl('_Glossiness'), surface: fl('_Surface'), mode: fl('_Mode') };
}
fs.writeFileSync(out, JSON.stringify(res, null, 1));
console.log(Object.keys(res).length + ' malzeme');
for (const k in res) {
  const r = res[k];
  console.log(k.padEnd(12), JSON.stringify(Object.fromEntries(Object.entries(r.tex).map(([a, b]) => [a, path.basename(b)]))),
    r.color && r.color.map((v) => v.toFixed(2)).join(','), 'met', r.metal, 'sm', r.smooth, 'srf', r.surface, 'mode', r.mode);
}
