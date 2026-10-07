// IndexedDB がどうしても開けないとき(端末の不調・古いタブが更新を止めている等)の代用品。
// db.js が使う分だけ IndexedDB と同じ形(transaction → objectStore → get/put… の
// リクエストに onsuccess を付ける)で真似る。中身はこの画面を開いている間だけ残る。
// その間もメモはクラウドへ送るので、開き直せばクラウドから戻る。

const clone = (v) => {
  if (v === undefined) return v;
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
};

// schema: { storeName: { keyPath, indexes: { indexName: fieldName } } }
export function createMemoryDB(schema) {
  const data = {};
  for (const name of Object.keys(schema)) data[name] = new Map();

  function transaction(storeNames) {
    const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
    let pending = 0;
    let finished = false;

    function maybeComplete() {
      setTimeout(() => {
        if (pending === 0 && !finished) {
          finished = true;
          tx.oncomplete && tx.oncomplete();
        }
      }, 0);
    }

    function request(run) {
      const req = { onsuccess: null, onerror: null, result: undefined, error: null };
      pending++;
      setTimeout(() => {
        if (finished) return;
        try {
          req.result = clone(run());
        } catch (e) {
          req.error = e;
          tx.error = e;
          finished = true;
          req.onerror && req.onerror({ target: req });
          tx.onerror && tx.onerror();
          tx.onabort && tx.onabort();
          return;
        }
        try {
          req.onsuccess && req.onsuccess({ target: req });
        } finally {
          pending--;
          maybeComplete();
        }
      }, 0);
      return req;
    }

    tx.objectStore = (name) => {
      if (![].concat(storeNames).includes(name)) throw new Error(`store ${name} is not in this transaction`);
      const map = data[name];
      const { keyPath, indexes = {} } = schema[name];
      return {
        get: (key) => request(() => map.get(key)),
        getAll: () => request(() => Array.from(map.values())),
        count: () => request(() => map.size),
        put: (value) => {
          const v = clone(value);
          return request(() => {
            map.set(v[keyPath], v);
            return v[keyPath];
          });
        },
        delete: (key) => request(() => {
          map.delete(key);
        }),
        clear: () => request(() => {
          map.clear();
        }),
        index: (indexName) => ({
          getAll: (key) => request(() =>
            Array.from(map.values()).filter((v) => v[indexes[indexName]] === key)
          ),
        }),
      };
    };

    // リクエストを1つも出さないトランザクションも完了させる
    maybeComplete();
    return tx;
  }

  return { isMemory: true, transaction, close() {} };
}
