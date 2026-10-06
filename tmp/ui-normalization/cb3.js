const fs=require('fs');const p='src/components/ChatBot.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const rep=(a,b)=>{if(!s.includes(a))throw a.slice(0,80);s=s.replace(a,b);};
rep(`    onFinal: (text) => {
      setInputValue(\`\${voiceBaseRef.current}\${text}\`.trim());
    },
  });
  const startVoice = () => {
    const typed = inputValue.trim();
    voiceBaseRef.current = typed ? \`\${typed} \` : "";
    speech.start();
  };
  useEffect(() => {
    if (!isOpen) speech.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);`,`    onFinal: (text) => {
      setInputValue(\`\${voiceBaseRef.current}\${text}\`.trim());
      // Hand the box back for review: cursor at the end of the text.
      window.requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
    },
  });
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  useEffect(() => {
    if (speech.status !== "listening") return;
    setVoiceSeconds(0);
    const timer = window.setInterval(() => setVoiceSeconds((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [speech.status]);
  const startVoice = () => {
    const typed = inputValue.trim();
    voiceBaseRef.current = typed ? \`\${typed} \` : "";
    speech.clearError();
    speech.start();
  };
  /** Discard what was dictated and restore what was typed before. */
  const cancelVoice = () => {
    speech.cancel();
    setInputValue(voiceBaseRef.current.trim());
  };
  useEffect(() => {
    if (!isOpen && speech.listening) cancelVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);`);
// textarea: Esc stops listening
rep(`                  onKeyDown={(e) => {
                    if (e.key === "Enter"`,`                  onKeyDown={(e) => {
                    if (e.key === "Escape" && speech.listening) {
                      e.preventDefault();
                      e.stopPropagation();
                      speech.stop();
                      return;
                    }
                    if (e.key === "Enter"`);
rep(`placeholder={speech.listening ? "Listening... speak now" : "Ask about your workspace..."}`,`placeholder={speech.status === "starting" ? "Starting microphone..." : speech.listening ? "Speak now..." : "Ask about your workspace..."}`);
// button
rep(`                    disabled={isTyping}
                    onClick={() => {
                      speech.clearError();
                      if (speech.listening) speech.stop();
                      else startVoice();
                    }}
                    aria-label={speech.listening ? "Stop voice input" : "Speak your question"}
                    aria-pressed={speech.listening}
                    title={speech.listening ? "Stop listening" : "Speak your question"}
                    className={cn(
                      "relative h-9 w-9 shrink-0 rounded-xl p-0 transition",
                      speech.listening
                        ? "bg-rose-600 text-white hover:bg-rose-700"
                        : "text-slate-500 hover:bg-slate-200 hover:text-slate-900",
                    )}
                  >
                    {speech.listening && (
                      <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-xl bg-rose-500/40 motion-reduce:animate-none" />
                    )}
                    {speech.listening ? <MicOff className="relative h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>`,`                    disabled={isTyping || speech.status === "finishing"}
                    onClick={() => {
                      if (speech.listening) speech.stop();
                      else startVoice();
                    }}
                    aria-label={speech.listening ? "Stop listening" : "Speak your question"}
                    aria-pressed={speech.listening}
                    title={speech.listening ? "Stop listening (Esc)" : "Speak your question"}
                    className={cn(
                      "relative h-9 w-9 shrink-0 rounded-xl p-0 transition",
                      speech.status === "listening"
                        ? "bg-rose-600 text-white hover:bg-rose-700"
                        : speech.listening
                          ? "bg-slate-200 text-slate-600"
                          : "text-slate-500 hover:bg-slate-200 hover:text-slate-900",
                    )}
                  >
                    {/* One icon per state: mic = ready, stop square = recording,
                        spinner = mic opening or final words arriving. */}
                    {speech.status === "listening" && (
                      <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-xl bg-rose-500/30 motion-reduce:animate-none" />
                    )}
                    {speech.status === "listening" ? (
                      <Square className="relative h-3.5 w-3.5 fill-current" />
                    ) : speech.listening ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </Button>`);
// status bar above the form
rep(`              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}`,`              {speech.listening && (
                <div role="status" aria-live="polite" className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-[12px] text-rose-800">
                  <span className="flex items-center gap-2">
                    {speech.status === "listening" ? (
                      <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-rose-600 motion-reduce:animate-none" />
                    ) : (
                      <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
                    )}
                    {speech.status === "starting"
                      ? "Starting microphone..."
                      : speech.status === "finishing"
                        ? "Finishing..."
                        : \`Listening \${Math.floor(voiceSeconds / 60)}:\${String(voiceSeconds % 60).padStart(2, "0")} - tap stop when done\`}
                  </span>
                  {speech.status !== "finishing" && (
                    <button type="button" onClick={cancelVoice} className="font-semibold text-rose-700 underline-offset-2 hover:underline">
                      Cancel
                    </button>
                  )}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (speech.listening) return;
                  handleSendMessage();
                }}`);
rep(`{speech.listening ? "Listening - tap the mic when you finish, check the text, then press Send" : \`Trusted guidance`,`{speech.listening ? "Check the text after you stop, then press Send" : \`Trusted guidance`);
rep(`Loader2, Mic, MicOff } from "lucide-react";`,`Loader2, Mic, Square } from "lucide-react";`);
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
