const fs = require('fs');
let code = fs.readFileSync('src/pages/Home.tsx', 'utf-8');

code = code.replace(
  `import { useVotes } from "../contexts/VotesContext";`,
  `import { useVotes } from "../contexts/VotesContext";\nimport { BOOKMARKS } from "../data/bookmarks";`
);

code = code.replace(
  `const [activeTab, setActiveTab] = useState<"still" | "gif">("still");`,
  `const [activeTab, setActiveTab] = useState<"still" | "gif" | "library">("still");`
);

fs.writeFileSync('src/pages/Home.tsx', code);
