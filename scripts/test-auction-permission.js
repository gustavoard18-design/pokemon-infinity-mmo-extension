const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Bus {
    constructor() { this.listeners = new Map(); this.location = { href:'https://infinitymmo.net/' }; }
    addEventListener(type, fn) { const list=this.listeners.get(type)||[]; list.push(fn); this.listeners.set(type,list); }
    dispatchEvent(event) { (this.listeners.get(event.type)||[]).forEach((fn)=>fn(event)); return true; }
}
class CustomEvent { constructor(type, init={}) { this.type=type; this.detail=init.detail; } }
const window = new Bus();
let fetchCalls = 0;
window.fetch = async () => { fetchCalls += 1; return { ok:true, status:200, clone(){return this;}, async json(){return { ok:true, listings:[] };} }; };
const sandbox = { window, globalThis:window, CustomEvent, Headers, URL, URLSearchParams, Request, Response, console, setTimeout, clearTimeout };
vm.runInNewContext(fs.readFileSync('interceptor.js','utf8'), sandbox, { filename:'interceptor.js' });

const results=[];
window.addEventListener('pkmn-helper-auction-result', (event)=>results.push(event.detail));
window.dispatchEvent(new CustomEvent('pkmn-helper-auction-command', { detail:{ action:'browse', requestId:'off', params:{} } }));
(async () => {
    await new Promise((resolve)=>setImmediate(resolve));
    assert.equal(fetchCalls, 0);
    assert.equal(results.at(-1).error.code, 'auction_requests_disabled');
    window.dispatchEvent(new CustomEvent('pkmn-helper-auction-permission', { detail:{ enabled:true } }));
    window.__pkmnHelperAuctionAuth='Bearer test';
    window.dispatchEvent(new CustomEvent('pkmn-helper-auction-command', { detail:{ action:'browse', requestId:'on', params:{} } }));
    await new Promise((resolve)=>setImmediate(resolve));
    assert.equal(fetchCalls, 1);
    window.dispatchEvent(new CustomEvent('pkmn-helper-auction-permission', { detail:{ enabled:false } }));
    assert.equal(window.__pkmnHelperAuctionAuth, undefined);
    process.stdout.write('PASS permissão bloqueia rede e limpa credencial em memória\n');
})().catch((error)=>{ console.error(error); process.exitCode=1; });
