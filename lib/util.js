'use strict';

let fakeSchema;
let schemaTypes;

const METHODS = ['hasOne', 'hasMany', 'belongsTo', 'belongsToMany'];
const PROPERTIES = ['sourceKey', 'targetKey', 'foreignKey', 'otherKey', 'constraints', 'scope', 'through', 'as'];

function id(ref) {
  return ref.match(/\/?([^/#]+)#?$/)[1];
}

function copy(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

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
      Object.keys(b).forEach(key => {
        /* istanbul ignore else */
        if (typeof a[key] === 'undefined') {
          a[key] = b[key];
        }
      });
    });

  return a;
}

function fixRefs(schema, prop) {
  /* istanbul ignore else */
  if (schema && typeof schema === 'object') {
    /* istanbul ignore else */
    if (Array.isArray(schema)) {
      return schema.map(x => fixRefs(x, prop));
    }

    /* istanbul ignore else */
    if (typeof schema.id === 'string' && prop) {
      const clone = { $ref: `#/definitions/${schema.id}` };

      Object.keys(schema).forEach(key => {
        /* istanbul ignore else */
        if (METHODS.indexOf(key) > -1 || PROPERTIES.indexOf(key) > -1) {
          clone[key] = schema[key];
        }
      });

      return clone;
    }

    Object.keys(schema).forEach(key => {
      schema[key] = fixRefs(schema[key], key);
    });
  }

  /* istanbul ignore else */
  if (typeof schema.id === 'string') {
    delete schema.id;
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

function makeModel($schema, model, conn) {
  // FIXME: avoid circular dependency
  fakeSchema = fakeSchema || require('./fake');
  schemaTypes = schemaTypes || require('./types');

  // TODO: oneOf support?
  const _modelName = id($schema.id);
  const _schema = schemaTypes.cleanSchema($schema);
  const _types = schemaTypes.convertSchema($schema);

  const _model = conn.define(_modelName, _types.props, model);

  /* istanbul ignore else */
  if (model.instanceMethods) {
    merge(_model.prototype, model.instanceMethods);
  }

  /* istanbul ignore else */
  if (model.classMethods) {
    merge(_model, model.classMethods);
  }

  _model.faked = fakeSchema(_schema);
  _model.refs = {};

  /* istanbul ignore else */
  if (_types.refs) {
    _types.refs.forEach(ref => {
      _model.refs[ref.params.as] = ref;
    });
  }

  return _model;
}

function makeRefs(a, refs) {
  Object.keys(a.refs).forEach(b => {
    b = a.refs[b];

    /* istanbul ignore else */
    if (typeof b.params.through === 'string' && refs[b.params.through]) {
      b.params.through = refs[b.params.through];
    }

    /* istanbul ignore else */
    if (typeof b.params.through === 'object'
      && typeof b.params.through.a === 'string' && refs[b.params.through.a]) {
      b.params.through.a = refs[b.params.through.a];
    }

    a.refs[b.params.as] = a[b.method](refs[b.target], b.params);
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
        if (prev.indexOf(cur) === -1) {
          prev.push(cur);
        }
        return prev;
      }, []);
  });

  Object.keys(tree).forEach(root => {
    if (!tree[root].length) {
      if (out.indexOf(root) === -1) {
        out.unshift(root);
      }
    } else {
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

  return out.map(x => map[x]);
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
