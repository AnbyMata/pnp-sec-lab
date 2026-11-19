// Reusable tool registry. Tools register as window.pnpTools['<name>'] = { mount(el, ctx) }.
window.pnpTools = window.pnpTools || {};

// Non-enumerable helper so lookups by tool name stay a pure map.
Object.defineProperty(window.pnpTools, 'mountTool', {
  configurable: true,
  value(name, el, ctx) {
    const tool = window.pnpTools[name];
    if (!tool || typeof tool.mount !== 'function' || !el) return false;
    tool.mount(el, ctx);
    return true;
  }
});
