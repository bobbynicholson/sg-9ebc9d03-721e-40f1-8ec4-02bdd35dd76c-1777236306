// Test-only stand-in for the browser speech engine.
window.__speech = null;
window.SpeechRecognition = class {
  constructor(){ this.onresult=null; this.onend=null; this.onstart=null; this.onerror=null; window.__speech=this; }
  start(){ setTimeout(()=>this.onstart&&this.onstart(),300);
    const words=["Show me","Show me unpaid invoices","Show me unpaid invoices for this month"];
    words.forEach((w,i)=>setTimeout(()=>{ if(!this._stopped) this.onresult&&this.onresult({resultIndex:0,results:[Object.assign([{transcript:w}],{isFinal:i===words.length-1})]}); },800+i*600)); }
  stop(){ this._stopped=true; setTimeout(()=>this.onend&&this.onend(),400); }
  abort(){ this._stopped=true; setTimeout(()=>this.onend&&this.onend(),50); }
};
