'use strict';

let fakeSchema;
let schemaTypes;

const METHODS = ['hasOne', 'hasMany', 'belongsTo', 'belongsToMany'];
const PROPERTIES = ['sourceKey', 'targetKey', 'foreignKey', 'otherKey', 'constraints', 'scope', 'through', 'as'];

function id(ref) {
  return ref.match(/\/?([^/#]+)#?$/)[1];
}

function copy(obj) {
  /* istanbul ignore else */
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  /* istanbul ignore else */
  if (Array.isArray(obj)) {
    return obj.map(copy);
  }

  const clone = {};

  Object.keys(obj).forEach(key => {
    clone[key] = copy(obj[key]);
  });

  return clone;
}

function merge(a) {
  Array.prototype.slice.call(arguments, 1)
    .forEach(b => {
      /* istanbul ignore else */
      if (b) {
        Object.keys(b).forEach(key => {
          /* istanbul ignore else */
          if (typeof a[key] === 'undefined') {
            a[key] = b[key];
          }
        });
      }
    });

  return a;
}

function fixRefs(schema) {
  /* istanbul ignore else */
  if (schema && typeof schema === 'object') {
    /* istanbul ignore else */
    if (Array.isArray(schema)) {
      return schema.map(fixRefs);
    }

    /* istanbul ignore else */
    if (typeof schema.$ref === 'string') {
      schema.$ref = schema.$ref.indexOf('#/') > -1
        ? `#/definitions/${schema.$ref.split('#/definitions/').join('/')}`
        : `#/definitions/${schema.$ref}`;
    }

    Object.keys(schema).forEach(key => {
      schema[key] = fixRefs(schema[key]);
    });

    /* istanbul ignore else */
    if (typeof schema.id === 'string') {
      delete schema.id;
    }
  }

  return schema;
}

function getRefs(schema, type, key) {
  const _params = {};

  let _method;
  let _obj;

  for (let i = 0, c = METHODS.length; i < c; i += 1) {
    /* istanbul ignore else */
    if (schema[METHODS[i]]) {
      _method = METHODS[i];
      _obj = schema[METHODS[i]];
      break;
    }
  }

  PROPERTIES.forEach(prop => {
    const value = (_obj && _obj[prop]) || schema[prop];

    /* istanbul ignore else */
    if (value) {
      _params[prop] = value;
    }
  });

  _params.as = _params.as || key;

  return {
    target: id(schema.id || schema.$ref),
    method: _method || type,
    params: _params,
  };
}

function makeModel(ref, conn, model, schema) {
  // FIXME: avoid circular dependency
  fakeSchema = fakeSchema || require('./fake');
  schemaTypes = schemaTypes || require('./types');

  // TODO: oneOf support?
  const _schema = schemaTypes.cleanSchema(schema);
  const _types = schemaTypes.convertSchema(schema);

  const _model = conn.define(ref, _types.props, merge(model, schema.options));

  merge(_model.prototype, model.instanceMethods);
  merge(_model, model.classMethods);

  _model.faked = fakeSchema(_schema);
  _model.refs = {};

  // store connection identifier
  _model.use = conn.options.identifier;

  /* istanbul ignore else */
  if (_types.refs) {
    _types.refs.forEach(_ref => {
      _model.refs[_ref.params.as] = _ref;
    });
  }

  return _model;
}

function makeRefs(models) {
  Object.keys(models).forEach(model => {
    const a = models[model];

    Object.keys(a.refs).forEach(prop => {
      const b = a.refs[prop];

      a[b.method](models[b.target], b.params);
    });
  });
}

function sortModels(deps) {
  const tree = {};
  const map = {};
  const out = [];

  deps.forEach(model => {
    map[model.name] = model;
    tree[model.name] = Object.keys(model.refs)
      .map(ref => model.refs[ref].target.name)
      .reduce((prev, cur) => {
        /* istanbul ignore else */
        if (prev.indexOf(cur) === -1) {
          prev.push(cur);
        }

        return prev;
      }, []);
  });

  Object.keys(tree).forEach(root => {
    if (!tree[root].length) {
      /* istanbul ignore else */
      if (out.indexOf(root) === -1) {
        out.unshift(root);
      }
    } else {
      /* istanbul ignore else */
      if (out.indexOf(root) === -1) {
        out.push(root);
      }

      tree[root].forEach(sub => {
        if (out.indexOf(sub) === -1) {
          out.unshift(sub);
        } else {
          out.splice(out.indexOf(root), 1);
          out.push(root);
        }
      });
    }
  });

  return out
    .map(x => map[x])
    .filter(x => x);
}

module.exports = {
  id,
  copy,
  merge,
  fixRefs,
  getRefs,
  makeRefs,
  makeModel,
  sortModels,
};
