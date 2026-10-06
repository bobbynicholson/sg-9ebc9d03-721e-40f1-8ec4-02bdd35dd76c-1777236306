const fs=require('fs');const p='src/components/ChatBot.tsx';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const rep=(a,b)=>{if(!s.includes(a))throw a.slice(0,70);s=s.replace(a,b);};
rep('className="flex items-center gap-2 rounded-[18px] border','className="flex items-end gap-2 rounded-[18px] border');
rep(`                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={speech.listening ? "Listening... speak now" : "Ask about your workspace..."}
                  readOnly={speech.listening}
                  className="h-9 flex-1 border-0 bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0"
                />`,`                {/* Grows with the question (up to ~7 lines, then scrolls) so
                    long or dictated questions stay fully visible. Enter
                    sends; Shift+Enter adds a new line. */}
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      if (inputValue.trim() && !isTyping && !speech.listening) void handleSendMessage();
                    }
                  }}
                  placeholder={speech.listening ? "Listening... speak now" : "Ask about your workspace..."}
                  readOnly={speech.listening}
                  aria-label="Message the assistant"
                  className="max-h-40 min-h-9 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-0 py-2 text-[13px] leading-5 text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />`);
rep(`  const messagesEndRef = useRef<HTMLDivElement>(null);`,`  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Auto-size the message box to its content.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = \`\${Math.min(el.scrollHeight, 160)}px\`;
    if (speech.listening) el.scrollTop = el.scrollHeight;
  }, [inputValue, isOpen, speech.listening]);`);
s=s.replace('import { Input } from "@/components/ui/input";\n','');
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
