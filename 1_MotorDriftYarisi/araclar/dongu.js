// node dongu.js ham.raw bas_sn uzunluk_sn out.wav  -> kesintisiz dongu (sonu basa capraz gecis), RMS normalize
const fs=require('fs');const [,,src,b,u,out]=process.argv;const R=44100;
const d=fs.readFileSync(src);const all=new Int16Array(d.buffer,d.byteOffset,d.length/2);
const s0=Math.round(b*R),L=Math.round(u*R),X=Math.round(0.25*R);
const seg=Float32Array.from(all.slice(s0,s0+L+X),v=>v/32768);
const o=new Float32Array(L);
for(let i=0;i<L;i++)o[i]=seg[i];
for(let i=0;i<X;i++){const t=i/X;o[i]=seg[i]*Math.sin(t*Math.PI/2)+seg[L+i]*Math.cos(t*Math.PI/2);}
let rms=Math.sqrt(o.reduce((a,v)=>a+v*v,0)/L);const k=0.22/rms;let pk=0;
for(let i=0;i<L;i++){o[i]*=k;pk=Math.max(pk,Math.abs(o[i]));}
const lim=pk>0.98?0.98/pk:1;
const buf=Buffer.alloc(44+L*2);buf.write('RIFF',0);buf.writeUInt32LE(36+L*2,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(R,24);buf.writeUInt32LE(R*2,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(L*2,40);
for(let i=0;i<L;i++)buf.writeInt16LE(Math.round(o[i]*lim*32767),44+i*2);
fs.writeFileSync(out,buf);console.log(out,'rms0',rms.toFixed(3),'pk',pk.toFixed(2));
