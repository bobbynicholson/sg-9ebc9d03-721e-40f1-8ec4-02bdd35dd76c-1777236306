const fs=require('fs');const p='src/lib/importAi.ts';let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');
const a='        const response: any = await (client().messages.create as any)({\n          model: DEFAULT_MODEL,\n          max_tokens: 1024,\n          system: SYSTEM_PROMPT,\n          tools: [\n            {\n              name: "return_mapping",';
if(!s.includes(a)) throw 'a';
s=s.replace(a,'        // Output scales with the column count (~60 tokens per mapping) so\n        // wide sheets are not cut off; bounded so one call stays cheap.\n        const mappingParams: any = {\n          model: DEFAULT_MODEL,\n          max_tokens: Math.min(4096, 256 + args.headers.length * 64),\n          system: SYSTEM_PROMPT,\n          tools: [\n            {\n              name: "return_mapping",');
const b='          tool_choice: { type: "tool", name: "return_mapping" },\n          messages: [{ role: "user", content: userMessage }],\n        });\n        tokensIn = response?.usage?.input_tokens ?? 0;';
if(!s.includes(b)) throw 'b';
s=s.replace(b,`          tool_choice: { type: "tool", name: "return_mapping" },
          messages: [{ role: "user", content: userMessage }],
        };
        // Bounded so a slow provider can't hang the request (serverless limits).
        const requestOptions = { timeout: 25_000, maxRetries: 1 };
        let response: any;
        try {
          response = await (client().messages.create as any)(mappingParams, requestOptions);
        } catch (err: any) {
          // Newer models (Opus 5.5 / Sonnet 5.5 / Fable 5.1) reject forced
          // tool_choice with a 400. If ANTHROPIC_IMPORT_MODEL points at one,
          // retry once with auto + an explicit instruction to call the tool.
          const msg = String(err?.message || "");
          if (err?.status === 400 && /tool_choice/i.test(msg)) {
            response = await (client().messages.create as any)({
              ...mappingParams,
              tool_choice: { type: "auto" },
              system: \`\${SYSTEM_PROMPT}\n- Always answer by calling the return_mapping tool exactly once.\`,
            }, requestOptions);
          } else {
            throw err;
          }
        }
        if (response?.stop_reason === "max_tokens") {
          console.warn("[mapColumnsViaAI] output hit max_tokens; using the partial mapping");
        }
        tokensIn = response?.usage?.input_tokens ?? 0;`);
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);console.log('ok');
