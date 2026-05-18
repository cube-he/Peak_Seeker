// CSS module mock —— Jest 跑测试时把 styles.xxx 替换为字符串 'xxx'
module.exports = new Proxy(
  {},
  {
    get: (_target, prop) => (typeof prop === 'string' ? prop : ''),
  }
);
