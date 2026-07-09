require("@babel/register")({
  presets: ["@babel/preset-react", "@babel/preset-typescript"],
  extensions: [".tsx", ".ts", ".jsx", ".js"]
});
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const App = require("./src/App").default;

try {
  const html = ReactDOMServer.renderToString(React.createElement(App));
  console.log("Rendered successfully length:", html.length);
} catch (e) {
  console.error("Render failed:", e);
}
