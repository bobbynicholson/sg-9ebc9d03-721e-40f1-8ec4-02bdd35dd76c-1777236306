const fs=require('fs');const p='src/hooks/useSpeechToText.ts';let s=fs.readFileSync(p,'utf8');
const rep=(a,b)=>{if(!s.includes(a))throw a.slice(0,70);s=s.replace(a,b);};
rep(`  onend: (() => void) | null;`,`  onend: (() => void) | null;
  onstart: (() => void) | null;`);
rep(`export function useSpeechToText({`,`/** idle -> starting (waiting for mic permission) -> listening -> finishing -> idle */
export type SpeechStatus = "idle" | "starting" | "listening" | "finishing";

export function useSpeechToText({`);
rep(`  const [listening, setListening] = useState(false);`,`  const [status, setStatus] = useState<SpeechStatus>("idle");`);
rep(`    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);`,`    recognition.onstart = () => setStatus("listening");
    recognition.onend = () => {
      recognitionRef.current = null;
      setStatus("idle");`);
rep(`      recognition.start();
      setListening(true);`,`      recognition.start();
      setStatus("starting");`);
rep(`  const stop = useCallback(() => recognitionRef.current?.stop(), []);`,`  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    setStatus("finishing");
    recognitionRef.current.stop();
  }, []);`);
rep(`  return { supported, listening, error,`,`  // "listening" covers every state where the mic is (or is about to be) open.
  const listening = status !== "idle";
  return { supported, status, listening, error,`);
fs.writeFileSync(p,s);console.log('ok');
