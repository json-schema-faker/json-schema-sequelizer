'use strict';

const util = require('./util');

const UNCHANGED = 0;
const DELETED = -1;
const CREATED = 1;
const RENAMED = 2;
const MODIFIED = 3;

function typeOf(obj) {
  return Object.prototype.toString.call(obj);
}

function isObject(obj) {
  return typeOf(obj) === '[object Object]';
}

function isValue(obj) {
  return !Array.isArray(obj) && !isObject(obj);
}

function compareValues(value1, value2) {
  /* istanbul ignore else */
  if (value1 === value2) {
    return UNCHANGED;
  }

  /* istanbul ignore else */
  if (typeof value1 === 'undefined') {
    return CREATED;
  }

  /* istanbul ignore else */
  if (typeof value2 === 'undefined') {
    return DELETED;
  }

  /* istanbul ignore else */
  if (!(isValue(value1) || isValue(value2)) && (typeOf(value1) === typeOf(value2))) {
    const a = Object.keys(value1);
    const b = Object.keys(value2);

    /* istanbul ignore else */
    if (a.length !== b.length) {
      return MODIFIED;
    }

    a.sort();
    b.sort();

    for (let i = 0; i < a.length; i += 1) {
      /* istanbul ignore else */
      if (a[i] !== b[i]) {
        return MODIFIED;
      }
    }

    for (let i = 0; i < a.length; i += 1) {
      /* istanbul ignore else */
      if (compareValues(value1[a[i]], value2[b[i]])) {
        return MODIFIED;
      }
    }

    return UNCHANGED;
  }

  return MODIFIED;
}

function contains(obj, value) {
  for (let i = 0; i < obj.length; i += 1) {
    /* istanbul ignore else */
    if (!compareValues(obj[i], value)) {
      return true;
    }
  }

  return false;
}

function diffMap(from, to) {
  /* istanbul ignore else */
  if (Array.isArray(from) || Array.isArray(to)) {
    const a = !Array.isArray(from) && from ? [from] : from || [];
    const b = !Array.isArray(to) && to ? [to] : to || [];

    // deletions
    const c = a.reduce((prev, cur) => {
      prev.push([!contains(b, cur) ? -1 : 0, cur]);
      return prev;
    }, []);

    // additions
    const d = b.reduce((prev, cur) => {
      prev.push([!contains(a, cur) ? 1 : 0, cur]);
      return prev;
    }, []);

    // differences
    const e = c.concat(d).reduce((prev, cur) => {
      let found = false;

      for (let i = 0; i < prev.length; i += 1) {
        /* istanbul ignore else */
        if (!compareValues(prev[i], cur)) {
          found = true;
          break;
        }
      }

      /* istanbul ignore else */
      if (!found) {
        prev.push(cur);
      }

      return prev;
    }, []);

    return {
      $type: compareValues(from, to),
      $data: e.map(obj => ({
        $type: obj[0],
        $data: obj[1],
      })),
    };
  }

  /* istanbul ignore else */
  if (isValue(from) || isValue(to)) {
    return {
      $type: compareValues(from, to),
      $data: to,
    };
  }

  const diff = Array.isArray(to) ? [] : {};

  Object.keys(from).forEach(k => {
    diff[k] = diffMap(from[k], typeof to[k] !== 'undefined' ? to[k] : undefined);
  });

  Object.keys(to).forEach(k => {
    /* istanbul ignore else */
    if (typeof diff[k] === 'undefined') {
      diff[k] = diffMap(undefined, to[k]);
    }

    /* istanbul ignore else */
    if (!Array.isArray(diff[k].$data) && diff[k].$type === 1 && !isValue(to[k])) {
      const set = Object.keys(from).map(key => ({
        prop: key,
        diff: compareValues(to[k], from[key]),
      }));

      for (let i = 0; i < set.length; i += 1) {
        /* istanbul ignore else */
        if (set[i].diff === UNCHANGED) {
          delete diff[set[i].prop];

          diff[k] = diff[k] || {};
          diff[k].$type = RENAMED;
          diff[k].$prev = set[i].prop;
        }
      }
    }
  });

  return diff;
}

function safeValue(obj, pad, unwrap) {
  /* istanbul ignore else */
  if (typeof obj === 'object') {
    /* istanbul ignore else */
    if (Array.isArray(obj)) {
      return unwrap
        ? obj.map(x => safeValue(x, pad)).join(', ')
        : `[${obj.map(x => safeValue(x, pad)).join(', ')}]`;
    }

    const out = [];

    Object.keys(obj).forEach(k => {
      out.push(`${pad}  ${k}: ${safeValue(obj[k], `${pad}  `)},`);
    });

    /* istanbul ignore else */
    if (out.length === 0) {
      return '';
    }

    return unwrap
      ? out.join('\n')
      : `{\n${out.join('\n')}\n${pad}},`;
  }

  /* istanbul ignore else */
  if (typeof obj === 'string') {
    return `'${obj}'`;
  }

  return obj;
}

function getValues(source) {
  /* istanbul ignore else */
  if (!source || typeof source !== 'object') {
    return source;
  }

  if (Array.isArray(source)) {
    return source.reduce((prev, cur) => {
      if (typeof cur.$type === 'number') {
        /* istanbul ignore else */
        if (cur.$type !== -1) {
          prev.push(getValues(cur.$data));
        }
      } else {
        prev.push(getValues(cur));
      }

      return prev;
    }, []);
  }

  /* istanbul ignore else */
  if (typeof source.$type === 'number') {
    return source.$type > -1
      ? source.$data
      : undefined;
  }

  const copy = {};

  Object.keys(source).forEach(key => {
    if (typeof source[key].$type === 'number') {
      /* istanbul ignore else */
      if (source[key].$type !== -1) {
        copy[key] = getValues(source[key].$data);
      }
    } else {
      copy[key] = getValues(source[key]);
    }
  });

  return copy;
}

function getOptions(index) {
  let _type;

  const name = !index.name && Array.isArray(index.fields)
    ? `${index.fields.join('_')}_idx`
    : index.name;

  const fields = index.fields;

  index.indexName = index.name || name;

  delete index.name;
  delete index.fields;

  ['unique', 'fulltext', 'spatial'].forEach(opt => {
    /* istanbul ignore else */
    if (index[opt] === true) {
      _type = opt.toUpperCase();
    }

    delete index[opt];
  });

  /* istanbul ignore else */
  if (_type) {
    index.indicesType = _type;
  }

  return { name, fields, options: index };
}

// FIXME: http://docs.sequelizejs.com/manual/tutorial/models-definition.html#configuration
function buildSchema(reference, models, schema, source, prev, raw, op) {
  const modelOptions = util.merge(models[reference].options, op) || {};
  const modelAttrs = models[reference].attributes || {};
  const tableName = models[reference].tableName;

  const pad = '    ';

  // changes
  const up = [];
  const down = [];
  const change = [];

  // lazy-load
  const types = require('./types');

  function walk(props, copy, old, cb, p) {
    /* istanbul ignore else */
    if (!Array.isArray(props) && typeof props === 'object') {
      Object.keys(props).forEach(k => {
        if (typeof props[k].$type === 'number') {
          cb(p.concat(k), props[k].$type,
            getValues(props[k].$data), (old && old[k]) || (copy && copy[k]),
            props);
          return;
        }

        walk(props[k],
          copy && copy[k],
          old && old[k],
          cb, p.concat(k));
      });
    }
  }

  function addColumn(prefix, field, prop, out) {
    const sub = util.getDefinition(field);
    const enumValues = field.enum || null;

    const suffix = enumValues
      ? `(${safeValue(enumValues, '', true)})`
      : '';

    out.push(`${prefix}type: dataTypes.${sub[0]}${suffix},`);

    /* istanbul ignore else */
    if (sub[1]) {
      /* istanbul ignore else */
      if (modelAttrs[prop] && modelAttrs[prop].references) {
        sub[1].references = modelAttrs[prop].references;
        sub[1].onDelete = modelAttrs[prop].onDelete;
        sub[1].onUpdate = modelAttrs[prop].onUpdate;
      }

      const opts = types.dropTypes(sub[1]);

      Object.keys(opts).forEach(k => {
        /* istanbul ignore else */
        if (isValue(opts[k]) && k !== 'type' && k !== 'value') {
          out.push(`${prefix}${k}: ${safeValue(opts[k], prefix)},`);
        }

        /* istanbul ignore else */
        if (!Array.isArray(opts[k]) && typeof opts[k] === 'object' && opts[k]) {
          out.push(`${prefix}${k}: ${safeValue(opts[k], prefix)}`);
        }
      });
    }
  }

  function addColumns(props, out) {
    Object.keys(props).forEach(prop => {
      const ref = props[prop].items || props[prop];

      /* istanbul ignore else */
      if (ref.virtual === true) {
        out.push(`${pad}    // ${prop} <${ref.type}>`);
        return;
      }

      /* istanbul ignore else */
      if (ref.$ref || (ref.items && ref.items.$ref)) {
        out.push(`${pad}    // ${prop} <${(ref.$ref || ref.items.$ref).split('/').pop()}>`);
        return;
      }

      out.push(`${pad}    ${prop}: {`);
      addColumn(`${pad}      `, props[prop], prop, out);
      out.push(`${pad}    },`);
    });
  }

  function addIndex(params, out) {
    const idx = getOptions(util.copy(params));
    const fields = safeValue(idx.fields);

    const suffix = Object.keys(idx.options).length
      ? `, ${safeValue(idx.options, `${pad}  `)}`
      : '';

    out.push(`${pad}() =>\n${pad}  queryInterface.addIndex('${tableName}', ${fields}${suffix}),`);
  }

  function removeIndex(params, out) {
    const idx = getOptions(util.copy(params));
    const fields = safeValue(idx.name || idx.fields);

    out.unshift(`${pad}() =>\n${pad}  queryInterface.removeIndex('${tableName}', ${fields}),`);
  }

  function addTimestamp(k, out, back) {
    if (back) {
      out.push(`${pad}() =>\n${pad}  queryInterface.addColumn('${tableName}', '${k}', dataTypes.DATE),`);
      back.unshift(`${pad}() =>\n${pad}  queryInterface.removeColumn('${tableName}', '${k}'),`);
    } else {
      out.push(`${pad}    ${k}: {\n${pad}      type: dataTypes.DATE,\n${pad}    },`);
    }
  }

  const _idx = {
    up: [],
    down: [],
  };

  walk(schema, source, prev, (key, type, value, previous, sourceObject) => {
    const options = getValues(sourceObject.options) || {};

    const isUnderscored = modelOptions.underscored || options.underscored === true;
    const hasTimestamps = modelOptions.timestamps || options.timestamps === true;
    const isParanoid = modelOptions.paranoid || options.paranoid === true;

    delete options.freezeTableName;
    delete options.underscored;
    delete options.timestamps;
    delete options.paranoid;

    const opts = sourceObject.options && sourceObject.options.$type !== -1
      ? `, ${safeValue(options, `${pad}  `)}`.replace(/,\s*$/, '')
      : '';

    /* istanbul ignore else */
    if (key[0] === 'id') {
      /* istanbul ignore else */
      if (type === CREATED) {
        const tmp = [];

        tmp.push(`${pad}() =>\n${pad}  queryInterface.createTable('${tableName}', {`);

        /* istanbul ignore else */
        if (sourceObject.properties && sourceObject.properties.$type === 1) {
          addColumns(getValues(sourceObject.properties), tmp);

          /* istanbul ignore else */
          if (isParanoid !== false) {
            addTimestamp(util.normalizeProp('deleted', 'at', isUnderscored), tmp);
          }

          /* istanbul ignore else */
          if (hasTimestamps !== false) {
            addTimestamp(util.normalizeProp('created', 'at', isUnderscored), tmp);
            addTimestamp(util.normalizeProp('updated', 'at', isUnderscored), tmp);
          }
        }

        tmp.push(`${pad}  }${opts}),`);
        up.unshift(tmp.join('\n'));
        down.push(`${pad}() =>\n${pad}  queryInterface.dropTable('${tableName}'${opts}),`);
      }

      /* istanbul ignore else */
      if (type === DELETED) {
        // FIXME: adjust original name back...
        up.push(`${pad}() =>\n${pad}  queryInterface.dropTable('${previous}'${opts}),`);
        down.push(`${pad}() =>\n${pad}  queryInterface.createTable('${previous}', {`);
        addColumns(source.properties, down);
        down.push(`${pad}  }),`);
      }

      /* istanbul ignore else */
      if (type === MODIFIED && value) {
        up.push(`${pad}() =>\n${pad}  queryInterface.renameTable('${previous}', '${value}'${opts}),`);
        down.push(`${pad}() =>\n${pad}  queryInterface.renameTable('${value}', '${previous}'${opts}),`);
      }
    }

    const _value = getValues(sourceObject);

    const ref = (_value && _value.items && typeof _value.items.$ref === 'string')
      || (_value && typeof _value.$ref === 'string')
      || (previous && previous.items && typeof previous.items.$ref === 'string')
      || (previous && typeof previous.$ref === 'string')
      || (value && value.items && value.items.$ref)
      || (value && value.$ref)
      || key[2] === '$ref';

    /* istanbul ignore else */
    if (key[0] === 'properties' && key[1] && type !== 0 && !ref) {
      const prop = key[1];

      /* istanbul ignore else */
      if (type === CREATED) {
        if (!key[2]) {
          up.push(`${pad}() =>\n${pad}  queryInterface.addColumn('${tableName}', '${prop}', {`);
          addColumn(`${pad}    `, value, prop, up);
          up.push(`${pad}  }),`);
          down.unshift(`${pad}() =>\n${pad}  queryInterface.removeColumn('${tableName}', '${prop}'),`);
        } else {
          change.push(`${pad}() =>\n${pad}  queryInterface.changeColumn('${tableName}', '${prop}', {`);

          if (sourceObject.enum) {
            addColumn(`${pad}    `, getValues(sourceObject), prop, change);
          } else {
            addColumn(`${pad}    `, _value, prop, change);
          }

          change.push(`${pad}  }),`);
        }
      }

      /* istanbul ignore else */
      if (type === RENAMED && sourceObject[prop].$prev !== prop) {
        up.push(`${pad}() =>\n${pad}  queryInterface.renameColumn('${tableName}', '${sourceObject[prop].$prev}', '${prop}'),`);
        down.push(`${pad}() =>\n${pad}  queryInterface.renameColumn('${tableName}', '${prop}', '${sourceObject[prop].$prev}'),`);
      }

      /* istanbul ignore else */
      if (type === DELETED && !key[2]) {
        up.push(`${pad}() =>\n${pad}  queryInterface.removeColumn('${tableName}', '${prop}'),`);
        down.push(`${pad}() =>\n${pad}  queryInterface.addColumn('${tableName}', '${prop}', {`);
        addColumn(`${pad}    `, previous, prop, down);
        down.push(`${pad}  }),`);
      }

      /* istanbul ignore else */
      if (type === MODIFIED) {
        change.push(`${pad}() =>\n${pad}  queryInterface.changeColumn('${tableName}', '${prop}', {`);
        addColumn(`${pad}    `, getValues(sourceObject), prop, change);
        change.push(`${pad}  }),`);
      }
    }

    /* istanbul ignore else */
    if (key[0] === 'options') {
      /* istanbul ignore else */
      if (type === CREATED) {
        /* istanbul ignore else */
        if (key[1] === 'paranoid') {
          addTimestamp(util.normalizeProp('deleted', 'at', isUnderscored), up, down);
        }

        /* istanbul ignore else */
        if (key[1] === 'timestamps') {
          addTimestamp(util.normalizeProp('created', 'at', isUnderscored), up, down);
          addTimestamp(util.normalizeProp('updated', 'at', isUnderscored), up, down);
        }
      }
    }

    /* istanbul ignore else */
    if (key[0] === 'indexes') {
      if (type === CREATED) {
        (!Array.isArray(value) && value ? [value] : value || [])
          .forEach(params => {
            addIndex(params, _idx.up);
            removeIndex(params, _idx.down);
          });
      } else if (Array.isArray(sourceObject.indexes.$data)) {
        sourceObject.indexes.$data.forEach(index => {
          /* istanbul ignore else */
          if (index.$type === CREATED) {
            addIndex(index.$data, _idx.up);
            removeIndex(index.$data, _idx.down);
          }

          /* istanbul ignore else */
          if (index.$type === DELETED) {
            addIndex(index.$data, _idx.down);
            removeIndex(index.$data, _idx.up);
          }
        });
      }
    }
  }, []);

  Array.prototype.push.apply(up, _idx.up);
  Array.prototype.push.apply(down, _idx.down);

  /* istanbul ignore else */
  if ((up.length + down.length + change.length) === 0) {
    return;
  }

  /* istanbul ignore else */
  if (raw) {
    return {
      up, down, change, reference,
    };
  }

  return [
    "/* eslint-disable */\n'use strict';\nmodule.exports = {\n",
    `  up: (queryInterface, dataTypes) => [\n${up.length ? `${up.join('\n')}\n` : ''}  ],\n`,
    `  down: (queryInterface, dataTypes) => [\n${down.length ? `${down.join('\n')}\n` : ''}  ],\n`,
    `  change: (queryInterface, dataTypes) => [\n${change.length ? `${change.join('\n')}\n` : ''}  ],\n`,
    '};\n',
  ].join('');
}

function shadowClone(a, b) {
  /* istanbul ignore else */
  if (typeof b !== 'object' || !b) {
    return typeof a !== 'undefined' ? a : null;
  }

  /* istanbul ignore else */
  if (Array.isArray(b)) {
    const n = !Array.isArray(a) && a ? [a] : a || [];
    return b.map((x, i) => shadowClone(n[i], x));
  }

  const c = {};

  Object.keys(b).forEach(k => {
    c[k] = shadowClone(a ? a[k] : null, b[k]);
  });

  return c;
}

function doChanges(model, refs, from, to, m, p, o) {
  return buildSchema(model, refs, m, from, shadowClone(from, to), p, o || {});
}

module.exports = {
  build: doChanges,
  map: diffMap,
};
