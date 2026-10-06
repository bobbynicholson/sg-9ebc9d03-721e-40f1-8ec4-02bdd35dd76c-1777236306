const fs=require('fs');
let p='src/hooks/useSpeechToText.ts';let s=fs.readFileSync(p,'utf8');
const rep=(a,b)=>{if(!s.includes(a))throw a.slice(0,60);s=s.replace(a,b);};
rep(`type SpeechRecognitionLike = {
  lang: string;`,`type SpeechRecognitionLike = {
  lang: string;
  maxAlternatives: number;`);
rep(`    recognition.continuous = false;
    recognition.interimResults = true;`,`    // Keep listening through natural pauses; the person taps the mic
    // again to finish. Auto-stop mid-sentence produced half questions.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;`);
rep(`    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalTextRef.current += result[0].transcript;
        else interim += result[0].transcript;
      }
      onInterimRef.current?.(\`\${finalTextRef.current}\${interim}\`.trim());
    };`,`    recognition.onresult = (event) => {
      // Rebuild the whole transcript from every result each time.
      // Appending only new final chunks duplicated or dropped words
      // when the engine revised earlier phrases.
      let finalText = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const piece = result[0].transcript.trim();
        if (!piece) continue;
        if (result.isFinal) finalText += \`\${piece} \`;
        else interim += \`\${piece} \`;
      }
      finalTextRef.current = finalText.trim();
      onInterimRef.current?.(\`\${finalText}\${interim}\`.replace(/\s+/g, " ").trim());
    };`);
rep(`    recognition.onerror = (event) => {
      if (event.error === "aborted") return;`,`    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      if (event.error === "no-speech" && finalTextRef.current) return;`);
fs.writeFileSync(p,s);

p='src/components/ChatBot.tsx';s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
rep(`  // Voice input: speech is written into the box live, then sent as a
  // normal message when the person stops talking.
  const speech = useSpeechToText({
    onInterim: (text) => setInputValue(text),
    onFinal: (text) => {
      if (text) void handleSendMessage(text);
    },
  });`,`  // Voice input: speech is written into the box live and added after
  // anything already typed. It is NOT sent automatically - the person
  // reviews or corrects the words, then presses Send, so a misheard
  // word never becomes a wrong question.
  const voiceBaseRef = useRef("");
  const speech = useSpeechToText({
    onInterim: (text) => setInputValue(\`\${voiceBaseRef.current}\${text}\`),
    onFinal: (text) => {
      setInputValue(\`\${voiceBaseRef.current}\${text}\`.trim());
    },
  });
  const startVoice = () => {
    const typed = inputValue.trim();
    voiceBaseRef.current = typed ? \`\${typed} \` : "";
    speech.start();
  };`);
rep(`                      if (speech.listening) speech.stop();
                      else speech.start();`,`                      if (speech.listening) speech.stop();
                      else startVoice();`);
rep(`                    title={speech.listening ? "Stop and send" : "Speak your question"}`,`                    title={speech.listening ? "Stop listening" : "Speak your question"}`);
rep(`                  disabled={!inputValue.trim() || isTyping}`,`                  disabled={!inputValue.trim() || isTyping || speech.listening}`);
rep(`{speech.listening ? "Listening - stop talking or tap the mic to send" :`,`{speech.listening ? "Listening - tap the mic when you finish, check the text, then press Send" :`);
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
