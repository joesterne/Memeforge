const fs = require('fs');
let code = fs.readFileSync('src/pages/Editor.tsx', 'utf-8');

const targetRefs = `  const handleUndoRef = useRef(handleUndo);
  const handleRedoRef = useRef(handleRedo);
  const saveToFirebaseRef = useRef(saveToFirebase);

  useEffect(() => {
    exportMemeRef.current = exportMeme;
    handleUndoRef.current = handleUndo;
    handleRedoRef.current = handleRedo;
    saveToFirebaseRef.current = saveToFirebase;
  });`;

const replaceRefs = `  const handleUndoRef = useRef(handleUndo);
  const handleRedoRef = useRef(handleRedo);
  const saveToFirebaseRef = useRef(saveToFirebase);
  const deleteSelectedRef = useRef(deleteSelected);

  useEffect(() => {
    exportMemeRef.current = exportMeme;
    handleUndoRef.current = handleUndo;
    handleRedoRef.current = handleRedo;
    saveToFirebaseRef.current = saveToFirebase;
    deleteSelectedRef.current = deleteSelected;
  });`;

code = code.replace(targetRefs, replaceRefs);

const targetKeydown = `      if (cmdOrCtrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedoRef.current();
        } else {
          handleUndoRef.current();
        }
      } else if (cmdOrCtrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveToFirebaseRef.current();
      }`;

const replaceKeydown = `      if (cmdOrCtrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedoRef.current();
        } else {
          handleUndoRef.current();
        }
      } else if (cmdOrCtrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedoRef.current();
      } else if (cmdOrCtrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveToFirebaseRef.current();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelectedRef.current();
      }`;

code = code.replace(targetKeydown, replaceKeydown);
fs.writeFileSync('src/pages/Editor.tsx', code);
