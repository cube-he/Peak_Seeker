// CSS module mock —— Jest 跑测试时把 styles.xxx 替换为字符串 'xxx'
// 同时支持 default import 和 named import
const proxy = new Proxy(
  {},
  {
    get: (_target, prop) => {
      if (prop === '__esModule') return true;
      if (prop === 'default') return proxy;
      return typeof prop === 'string' ? prop : '';
    },
  }
);

module.exports = proxy;
