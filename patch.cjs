const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /} catch \(error: any\) {\s*console\.error\("AI Chat-to-Meme error:", error\.message \|\| error, "Body:", req\.body\);\s*res\.status\(500\)\.json\({ success: false, error: error\.message \|\| "An unexpected error occurred during AI chat generation\. Please try again later\." }\);\s*}/g,
  `} catch (error: any) {
      const errMsg = error.message || error.toString() || "Unknown error";
      console.error("AI Chat-to-Meme error:", errMsg, "Body:", req.body);
      let userMsg = errMsg;
      if (typeof userMsg === 'string' && userMsg.includes("dunning decision")) {
        userMsg = "Your Google Cloud billing account is suspended (unpaid balance). Please check your billing settings.";
      }
      res.status(500).json({ success: false, error: userMsg });
    }`
);

code = code.replace(
  /} catch \(error: any\) {\s*console\.error\("AI Generation error:", error\.message \|\| error, "Body:", req\.body\);\s*res\.status\(500\)\.json\({ success: false, error: error\.message \|\| "An unexpected error occurred during AI generation\. Please try again later\." }\);\s*}/g,
  `} catch (error: any) {
      const errMsg = error.message || error.toString() || "Unknown error";
      console.error("AI Generation error:", errMsg, "Body:", req.body);
      let userMsg = errMsg;
      if (typeof userMsg === 'string' && userMsg.includes("dunning decision")) {
        userMsg = "Your Google Cloud billing account is suspended (unpaid balance). Please check your billing settings.";
      }
      res.status(500).json({ success: false, error: userMsg });
    }`
);

fs.writeFileSync('server.ts', code);
