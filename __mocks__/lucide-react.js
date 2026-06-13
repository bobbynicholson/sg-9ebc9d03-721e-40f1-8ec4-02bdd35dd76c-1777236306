/**
 * Test stub for lucide-react.
 *
 * lucide-react ships ESM (dist/esm/*.js) that Jest's transform doesn't
 * process by default, so any component test importing an icon failed
 * with "Jest encountered an unexpected token / import * as index".
 * Rather than fight transformIgnorePatterns, map the package to this
 * stub in jest.config (moduleNameMapper): every icon resolves to a
 * tiny <svg> that accepts the same props, which is all a render test
 * needs.
 */
const React = require("react");

module.exports = new Proxy(
  {},
  {
    get: (_target, name) => {
      if (name === "__esModule") return true;
      // A forwardRef-friendly stub so `<Icon ref=...>` usages don't warn.
      const Stub = React.forwardRef((props, ref) =>
        React.createElement("svg", { ref, "data-icon": String(name), ...props }),
      );
      Stub.displayName = String(name);
      return Stub;
    },
  },
);
