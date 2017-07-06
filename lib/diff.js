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

    return unwrap
      ? out.join('\n')
      : `{\n${out.join('\n')}\n${pad}}`;
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
function buildSchema(reference, models, schema, source, prev) {
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

  function addAssociation(ref, prop, out, back) {
    const _ref = ref.$ref || (ref.items && ref.items.$ref);
    const _assoc = (models[_ref] && models[reference].associations[prop]) || {};

    const _prefix = _assoc.associationType
      ? ` ${_assoc.associationType}`
      : '';

    const _foreignKey = _assoc.foreignKey;
    const _tableName = _assoc.target.tableName;
    const _subtype = _assoc.target.attributes[_foreignKey].type.toString();

    if (back) {
      out.push(`${pad}() => queryInterface.addColumn('${_tableName}', '${_foreignKey}', dataTypes.${_subtype}),`);
      back.push(`${pad}() => queryInterface.removeColumn('${_tableName}', '${_foreignKey}'),`);
    } else {
      out.push(`${pad}  ${_assoc.foreignKey}: dataTypes.${_subtype}, //${_prefix} <${_ref}>`);
    }
  }

  function addColumn(prefix, field, prop, out) {
    /* istanbul ignore else */
    if ((field.items && typeof field.items.$ref === 'string')
      || typeof field.$ref === 'string') {
      addAssociation(field, prop, out);
      return;
    }

    const sub = util.getDefinition(field);
    const enumValues = field.enum || null;

    const suffix = enumValues
      ? `(${safeValue(enumValues, '', true)})`
      : '';

    out.push(`${prefix}type: dataTypes.${sub[0]}${suffix},`);

    /* istanbul ignore else */
    if (sub[1]) {
      const opts = types.dropTypes(sub[1]);

      Object.keys(opts).forEach(k => {
        /* istanbul ignore else */
        if (isValue(opts[k]) && k !== 'type') {
          out.push(`${prefix}${k}: ${safeValue(opts[k], prefix)},`);
        }
      });
    }
  }

  function addColumns(props, out) {
    Object.keys(props).forEach(prop => {
      const ref = props[prop].items || props[prop];

      /* istanbul ignore else */
      if (ref.virtual) {
        out.push(`${pad}  // ${prop} <${ref.type}>`);
        return;
      }

      /* istanbul ignore else */
      if (ref.$ref || (ref.items && ref.items.$ref)) {
        addAssociation(ref, prop, out);
        return;
      }

      out.push(`${pad}  ${prop}: {`);
      addColumn(`${pad}    `, props[prop], prop, out);
      out.push(`${pad}  },`);
    });
  }

  function addIndex(params, out) {
    const idx = getOptions(util.copy(params));
    const fields = safeValue(idx.fields);

    const suffix = Object.keys(idx.options).length
      ? `, ${safeValue(idx.options, pad)}`
      : '';

    out.push(`${pad}() => queryInterface.addIndex('${tableName}', ${fields}${suffix}),`);
  }

  function removeIndex(params, out) {
    const idx = getOptions(util.copy(params));
    const fields = safeValue(idx.name || idx.fields);

    out.push(`${pad}() => queryInterface.removeIndex('${tableName}', ${fields}),`);
  }

  function addTimestamp(k, out, back, single) {
    if (single) {
      out.push(`${pad}() => queryInterface.addColumn('${tableName}', '${k}', dataTypes.DATE),`);
    } else {
      out.push(`${pad}  ${k}: {\n${pad}    type: dataTypes.DATE,\n${pad}  },`);
    }

    back.unshift(`${pad}() => queryInterface.removeColumn('${tableName}', '${k}'),`);
  }

  walk(schema, source, prev, (key, type, value, previous, sourceObject) => {
    const opts = sourceObject.options && sourceObject.options.$type !== -1
      ? `, ${safeValue(getValues(sourceObject.options), pad)}`
      : '';

    /* istanbul ignore else */
    if (key[0] === 'id') {
      /* istanbul ignore else */
      if (type === CREATED) {
        const tmp = [];

        tmp.push(`${pad}() => queryInterface.createTable('${tableName}', {`);

        /* istanbul ignore else */
        if (sourceObject.properties && sourceObject.properties.$type === 1) {
          addColumns(getValues(sourceObject.properties), tmp);

          const options = getValues(sourceObject.options) || {};

          /* istanbul ignore else */
          if (options.paranoid !== false) {
            addTimestamp('deletedAt', tmp, down);
          }

          /* istanbul ignore else */
          if (options.timestamps !== false) {
            addTimestamp('createdAt', tmp, down);
            addTimestamp('updatedAt', tmp, down);
          }
        }

        tmp.push(`${pad}}${opts}),`);
        up.unshift(tmp.join('\n'));
        down.push(`${pad}() => queryInterface.dropTable('${tableName}'${opts}),`);
      }

      /* istanbul ignore else */
      if (type === DELETED) {
        // FIXME: adjust original name back...
        up.push(`${pad}() => queryInterface.dropTable('${previous}'${opts}),`);
        down.push(`${pad}() => queryInterface.createTable('${previous}', {`);
        addColumns(source.properties, down);
        down.push(`${pad}}),`);
      }

      /* istanbul ignore else */
      if (type === MODIFIED && value) {
        up.push(`${pad}() => queryInterface.renameTable('${previous}', '${value}'${opts}),`);
        down.push(`${pad}() => queryInterface.renameTable('${value}', '${previous}'${opts}),`);
      }
    }

    /* istanbul ignore else */
    if (key[0] === 'properties' && key[1] && type !== 0) {
      const prop = key[key.length - 1];

      const ref = (value && value.items && typeof value.items.$ref === 'string')
        || (value && typeof value.$ref === 'string');

      /* istanbul ignore else */
      if (ref) {
        /* istanbul ignore else */
        if (type === CREATED) {
          addAssociation(value, prop, up, down);
        }
        return;
      }

      /* istanbul ignore else */
      if (type === CREATED) {
        if (!key[2]) {
          up.push(`${pad}() => queryInterface.addColumn('${tableName}', '${prop}', {`);
          addColumn(`${pad}  `, value, prop, up);
          up.push(`${pad}}),`);
          down.unshift(`${pad}() => queryInterface.removeColumn('${tableName}', '${prop}'),`);
        } else {
          change.push(`${pad}() => queryInterface.changeColumn('${tableName}', '${key[1]}', {`);

          if (sourceObject.enum) {
            addColumn(`${pad}  `, getValues(sourceObject), prop, change);
          } else {
            addColumn(`${pad}  `, { type: sourceObject.type.$data }, prop, change);
            change.push(`${pad}  ${key[2]}: ${safeValue(value, `${pad}  `)},`);
          }

          change.push(`${pad}}),`);
        }
      }

      /* istanbul ignore else */
      if (type === RENAMED) {
        up.push(`${pad}() => queryInterface.renameColumn('${tableName}', '${sourceObject[prop].$prev}', '${prop}'),`);
        down.push(`${pad}() => queryInterface.renameColumn('${tableName}', '${prop}', '${sourceObject[prop].$prev}'),`);
      }

      /* istanbul ignore else */
      if (type === DELETED && !key[2]) {
        up.push(`${pad}() => queryInterface.removeColumn('${tableName}', '${prop}'),`);
        down.push(`${pad}() => queryInterface.addColumn('${tableName}', '${prop}', {`);
        addColumn(`${pad}  `, previous, prop, down);
        down.push(`${pad}}),`);
      }

      /* istanbul ignore else */
      if (type === MODIFIED && !sourceObject.enum) {
        change.push(`${pad}() => queryInterface.changeColumn('${tableName}', '${key[1]}', {`);
        addColumn(`${pad}  `, getValues(sourceObject), prop, change);
        change.push(`${pad}}),`);
      }
    }

    /* istanbul ignore else */
    if (key[0] === 'options') {
      /* istanbul ignore else */
      if (type === CREATED) {
        /* istanbul ignore else */
        if (key[1] === 'paranoid') {
          addTimestamp('deletedAt', up, down, true);
        }

        /* istanbul ignore else */
        if (key[1] === 'timestamps') {
          addTimestamp('createdAt', up, down, true);
          addTimestamp('updatedAt', up, down, true);
        }
      }
    }

    /* istanbul ignore else */
    if (key[0] === 'indexes') {
      if (type === CREATED) {
        (!Array.isArray(value) && value ? [value] : value || [])
          .forEach(params => {
            addIndex(params, up);
            removeIndex(params, down);
          });
      } else if (Array.isArray(sourceObject.indexes.$data)) {
        sourceObject.indexes.$data.forEach(index => {
          /* istanbul ignore else */
          if (index.$type === CREATED) {
            addIndex(index.$data, up);
          }

          /* istanbul ignore else */
          if (index.$type === DELETED) {
            removeIndex(index.$data, up);
          }
        });
      }
    }
  }, [], null);

  /* istanbul ignore else */
  if ((up.length + down.length + change.length) === 0) {
    return;
  }

  return [
    "'use strict';\n/* eslint-disable */\nmodule.exports = {\n",
    `  up: (queryInterface, dataTypes) => [\n${up.length ? `${up.join('\n')}\n` : ''}  ],\n`,
    `  down: (queryInterface, dataTypes) => [\n${down.length ? `${down.join('\n')}\n` : ''}  ],\n`,
    `  change: (queryInterface, dataTypes) => [\n${change.length ? `${change.join('\n')}\n` : ''}  ],\n`,
    '};\n',
  ].join('');
}

function shadowClone(a, b) {
  if (typeof b !== 'object' || !b) {
    return typeof a !== 'undefined' ? a : null;
  }

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

function doChanges(model, refs, from, to, m, p) {
  return buildSchema(model, refs, m, from, shadowClone(from, to), p);
}

module.exports = {
  build: doChanges,
  map: diffMap,
};
